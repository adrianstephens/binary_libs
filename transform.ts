import ts, { factory } from "typescript";

function isExported(node: ts.Declaration): boolean {
	return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
}

export function kind(node: ts.Node): string {
	return ts.SyntaxKind[node.kind];
}

function resolveTypesTransformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> | undefined {
	console.log("TRANSFORM!");
	const typeChecker = program.getTypeChecker();

	return (context: ts.TransformationContext) => {
		return (sourceFile: ts.SourceFile) => {
			//TO DISABLE:
			//return sourceFile;

			let typeformatflags = ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope|ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.MultilineObjectLiterals;
			let exported 	= false;
			let ref: string;
			let depth = 0;
			let declaration: ts.Declaration | undefined;
			const inherited: ts.ExpressionWithTypeArguments[] = [];
			
			// Create a cache for module resolution
			const moduleResolutionCache = ts.createModuleResolutionCache(
				process.cwd(), 			// Current working directory
				fileName => fileName	// Normalize file names
			);

			const moduleMap: Record<string, string> = {};

			function serializeNode(node: ts.Node): string {
				const printer = ts.createPrinter();
				const result = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
				return result;
			}

			function print(x: string) {
				console.log('  '.repeat(depth), x);
			}

			//look for refs
			function visitSubType(node: ts.Node): ts.Node {
				print(kind(node));

				if (ts.isQualifiedName(node))
					return node;

				if (ts.isIdentifier(node)) {
					const symbol = (node as any).symbol;
					if (symbol) {
						const declarations = symbol.getDeclarations();
						if (declarations && declarations.length > 0) {
							const prefex = moduleMap[declarations[0].getSourceFile().fileName];
							if (prefex)
								return factory.createQualifiedName(factory.createIdentifier(prefex), node.text);
						}
					}
				}
		
				++depth;
				node = ts.visitEachChild(node, visitSubType, context);
				--depth;

				if (ts.isIntersectionTypeNode(node)) {
					const filtered = node.types.filter(n => !ts.isTypeLiteralNode(n) || n.members.length);
					if (filtered.length === 1)
						return filtered[0];
					return ts.factory.updateIntersectionTypeNode(node, ts.factory.createNodeArray(filtered));
		  		}

				if (ts.isParenthesizedTypeNode(node)) {
					if (ts.isTypeLiteralNode(node.type))
						return node.type;
				}

				if (ref) {
					if (ts.isArrayTypeNode(node))
						ref = ref + '[]';
					else
						ref = '';
				}
				return node;
			}
			
			//finds types
			function visitType(node: ts.Node): ts.Node | undefined {
				if (ts.isTypeNode(node)) {
					const type		= typeChecker.getTypeAtLocation(node);
					const typetext	= typeChecker.typeToString(type, declaration);
					print('"'+typetext+'"');

					if (typetext !== 'any') {
						let node1 = typeChecker.typeToTypeNode(type, declaration, typeformatflags);
		
						if (node1 && !ts.isTypeReferenceNode(node1)) {
							node1 = visitSubType(node1) as ts.TypeNode;
							const text2 = serializeNode(node1);
							console.log("**AFTER**" + text2);
							if (text2 !== 'any')
								return node1;
						}
					}

					return node;
				}
				return ts.visitEachChild(node, visitType, context);
			}

			function fixTypes(node: ts.Declaration) {
				const save = declaration;
				declaration = node;
				node = ts.visitEachChild(node, visitType, context);
				declaration = save;
				return node;
			}

			//	VISIT
			function visit(node: ts.Node): ts.Node | undefined {
				if (ts.isSourceFile(node)) {
					//check for inheriting consts
					ts.visitEachChild(node, (node: ts.Node) => {
						if (ts.isClassDeclaration(node)) {
							const heritageClauses = node.heritageClauses;
							if (heritageClauses) {
								for (const i of heritageClauses) {
									if (i.token === ts.SyntaxKind.ExtendsKeyword)
										inherited.push(...i.types);
								}
							}

						} else if (ts.isImportDeclaration(node)) {
							const importClause = node.importClause;
							if (importClause && importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
								const module = node.moduleSpecifier;
								if (ts.isStringLiteral(module)) {
									// Resolve the module name to its file path
									const resolved = ts.resolveModuleName(
										module.text,
										sourceFile.fileName, // Containing file
										program.getCompilerOptions(), // Compiler options
										{
											fileExists: ts.sys.fileExists, // File system methods
											readFile: ts.sys.readFile,
										},
										moduleResolutionCache // Module resolution cache
									);
					
									if (resolved.resolvedModule)
										moduleMap[resolved.resolvedModule.resolvedFileName] = importClause.namedBindings.name.text;
								}
							}
						}

						return node;
					}, context);
				}

				if (ts.isVariableDeclaration(node)) {
					if (isExported(node)) {
						exported = true;
						return node;
					}
					for (const i of inherited) {
						if (i.expression === node.name) {
							declaration	= node;
							exported	= true;
							//return node;
							return fixTypes(node);
						}
					}
					return undefined; // Remove the node
				}

				if (ts.isVariableStatement(node)) {
					exported	= false;
					node		= ts.visitEachChild(node, visit, context);
					if (!exported)
						return undefined; // Remove the node
					return node;
				}

				if (ts.isTypeAliasDeclaration(node)) {
					declaration = node;
					print("++TYPEDEF");
					++depth;
					const save = typeformatflags;
					typeformatflags = (typeformatflags & ~ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope) | ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.MultilineObjectLiterals;
					node = fixTypes(node);
					typeformatflags = save;
					--depth;
					print("--TYPEDEF");
					return node;

				}
/*
				if (ts.isClassDeclaration(node)) {
					const save = declaration;
					declaration = node;
					node = ts.visitEachChild(node, visit, context);
					declaration = save;
					return node;
				}
*/

				if (/*ts.isTypeAliasDeclaration(node)
				||	*/ts.isPropertyDeclaration(node)
				||	ts.isMethodDeclaration(node)
				) {
					//return ts.visitEachChild(node, visitType, context);
					return fixTypes(node);
				}

				return ts.visitEachChild(node, visit, context);
			}
			
			return ts.visitNode(sourceFile, visit) as ts.SourceFile;
		};
	};
}

export function getContainerNode(node: ts.Node): ts.Declaration | undefined {
    while (true) {
        node = node.parent;
        if (!node) {
            return undefined;
        }
        switch (node.kind) {
            case ts.SyntaxKind.SourceFile:
            case ts.SyntaxKind.MethodDeclaration:
            case ts.SyntaxKind.MethodSignature:
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.GetAccessor:
            case ts.SyntaxKind.SetAccessor:
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.InterfaceDeclaration:
            case ts.SyntaxKind.EnumDeclaration:
            case ts.SyntaxKind.ModuleDeclaration:
			case ts.SyntaxKind.TypeAliasDeclaration:
                return node as ts.Declaration;
        }
    }
}
export default resolveTypesTransformer;