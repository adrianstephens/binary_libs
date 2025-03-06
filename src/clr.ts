import * as binary from '@isopodlabs/binary';
import * as pe from './pe';

//-----------------------------------------------------------------------------
//	CLR
//-----------------------------------------------------------------------------

const HEAP = {
	String:			0,
	GUID:			1,
	Blob:			2,
	UserString:		3,
} as const;

const CLR_FLAGS = {
	FLAGS_ILONLY:				0x00000001,
	FLAGS_32BITREQUIRED:		0x00000002,
	FLAGS_IL_LIBRARY:			0x00000004,
	FLAGS_STRONGNAMESIGNED:		0x00000008,
	FLAGS_NATIVE_ENTRYPOINT:	0x00000010,
	FLAGS_TRACKDEBUGDATA:		0x00010000,
} as const;

const CLR_HEADER = {
	cb:							binary.UINT32_LE,
	MajorRuntimeVersion:		binary.UINT16_LE,
	MinorRuntimeVersion:		binary.UINT16_LE,
	MetaData:					pe.DATA_DIRECTORY,
	Flags:						binary.asFlags(binary.UINT32_LE, CLR_FLAGS),
	EntryPoint:					binary.UINT32_LE,
	Resources:					pe.DATA_DIRECTORY,
	StrongNameSignature:		pe.DATA_DIRECTORY,
	CodeManagerTable:			pe.DATA_DIRECTORY,
	VTableFixups:				pe.DATA_DIRECTORY,
	ExportAddressTableJumps:	pe.DATA_DIRECTORY,
	//ManagedNativeHeader:		pe.DATA_DIRECTORY,
};

const STREAM_HDR = {
	Offset:		binary.UINT32_LE,		// Memory offset to start of this stream from start of the metadata root (§II.24.2.1)
	Size:		binary.UINT32_LE,		// Size of this stream in bytes, shall be a multiple of 4.
	Name:		binary.NullTerminatedStringType,	// Name of the stream as null-terminated variable length array of ASCII characters, padded to the next 4-byte boundary with \0 characters. The name is limited to 32 characters.
	unused:		binary.AlignType(4),
};

const METADATA_ROOT = {
	Signature:    	binary.UINT32_LE,	//'BSJB'
	MajorVersion: 	binary.UINT16_LE,
	MinorVersion: 	binary.UINT16_LE,
	Reserved:     	binary.UINT32_LE,	// always 0
	Version:      	binary.StringType(binary.UINT32_LE, 'utf8', true),
	unknown: 		binary.UINT16_LE,
	Streams:		binary.ArrayType(binary.UINT16_LE, STREAM_HDR)
};

const CLR_TABLES = {
	Reserved:    	binary.UINT32_LE,	// Reserved, always 0 (§II.24.1).
	MajorVersion:	binary.UINT8,		// Major version of table schemata; shall be 2 (§II.24.1).
	MinorVersion:	binary.UINT8,		// Minor version of table schemata; shall be 0 (§II.24.1).
	HeapSizes:   	binary.UINT8,		// Bit vector for heap sizes.
	Reserved2:   	binary.UINT8,		// Reserved, always 1 (§II.24.1).
	Valid:  	 	binary.UINT64_LE,	// Bit vector of present tables, let n be the number of bits that are 1.
	Sorted: 	 	binary.UINT64_LE,	// Bit vector of sorted tables.
};

enum TABLE {
	Module						= 0x00,
	TypeRef						= 0x01,
	TypeDef						= 0x02,
	// Unused					= 0x03,
	Field						= 0x04,
	// Unused					= 0x05,
	MethodDef					= 0x06,
	// Unused					= 0x07,
	Param						= 0x08,
	InterfaceImpl				= 0x09,
	MemberRef					= 0x0a,
	Constant					= 0x0b,
	CustomAttribute				= 0x0c,
	FieldMarshal				= 0x0d,
	DeclSecurity				= 0x0e,
	ClassLayout					= 0x0f,

	FieldLayout					= 0x10,
	StandAloneSig				= 0x11,
	EventMap					= 0x12,
	// Unused					= 0x13,
	Event						= 0x14,
	PropertyMap					= 0x15,
	// Unused					= 0x16,
	Property					= 0x17,
	MethodSemantics				= 0x18,
	MethodImpl					= 0x19,
	ModuleRef					= 0x1a,
	TypeSpec					= 0x1b,
	ImplMap						= 0x1c,
	FieldRVA					= 0x1d,
	// Unused					= 0x1e,
	// Unused					= 0x1f,

	Assembly					= 0x20,
	AssemblyProcessor			= 0x21,
	AssemblyOS					= 0x22,
	AssemblyRef					= 0x23,
	AssemblyRefProcessor		= 0x24,
	AssemblyRefOS				= 0x25,
	File						= 0x26,
	ExportedType				= 0x27,
	ManifestResource			= 0x28,
	NestedClass					= 0x29,
	GenericParam				= 0x2a,
	MethodSpec					= 0x2b,
	GenericParamConstraint		= 0x2c,
}

function bytesToGuid(bytes: Uint8Array) {
    // Convert each byte to a two-digit hexadecimal string
    const hexArray = Array.from(bytes, byte => ('0' + (byte & 0xFF).toString(16)).slice(-2));

    // Join the hex strings into the standard GUID format
    return hexArray.slice(0, 4).join('') + '-' +
           hexArray.slice(4, 6).join('') + '-' +
           hexArray.slice(6, 8).join('') + '-' +
           hexArray.slice(8, 10).join('') + '-' +
           hexArray.slice(10, 16).join('');
}

class clr_stream extends binary.stream {
	constructor(buffer: Uint8Array, public heaps:Uint8Array[], public heap_sizes: number, public table_counts: number[]) {
		super(buffer);
	}
	getOffset(big: boolean) {
		return (big ? binary.UINT32_LE : binary.UINT16_LE).get(this);
	}
	getHeap(heap:number) {
		return this.heaps[heap].subarray(this.getOffset(!!(this.heap_sizes & (1 << heap))));
	}
	getIndex(table:number) {
		return this.getOffset(this.table_counts[table] > 0xffff);
	}
	getCodedIndex(B: number, trans:number[]) {
		const	thresh = 0xffff >> B;
		for (const i of trans) {
			if (this.table_counts[i] > thresh)
				return binary.UINT32_LE.get(this);
		}
		return binary.UINT16_LE.get(this);
	}
	getString() {
		const mem	= this.getHeap(HEAP.String);
		const n		= mem.indexOf(0);
		return String.fromCharCode(...mem.subarray(0, n));
	}
	getGUID() {
		return bytesToGuid(this.getHeap(HEAP.GUID));
	}
	getBlob() {
		return this.getHeap(HEAP.Blob);
	}
}
class clr_dummy extends binary.dummy {
	constructor(public heap_sizes: number, public table_counts: number[]) {
		super();
	}
	getOffset(big: boolean) {
		return (big ? binary.UINT32_LE : binary.UINT16_LE).get(this);
	}
	getHeap(heap:number) {
		return this.getOffset(!!(this.heap_sizes & (1 << heap)));
	}
	getIndex(table:number) {
		return this.getOffset(this.table_counts[table] > 0xffff);
	}
	getCodedIndex(B: number, trans:number[]) {
		const	thresh = 0xffff >> B;
		for (const i of trans) {
			if (this.table_counts[i] > thresh)
				return binary.UINT32_LE.get(this);
		}
		return binary.UINT16_LE.get(this);
	}
	getString() { return this.getHeap(HEAP.String); }
	getGUID() 	{ return this.getHeap(HEAP.GUID); }
	getBlob() 	{ return this.getHeap(HEAP.Blob); }
}

const clr_String = {
	get(s: clr_stream) 					{ return s.getString(); },
	put(_s: clr_stream, _v : number)	{}
};
const clr_GUID = {
	get(s: clr_stream) 					{ return s.getGUID(); },
	put(_s: clr_stream, _v : number)	{}
};
const clr_Blob = {
	get(s: clr_stream) 					{ return s.getBlob(); },
	put(_s: clr_stream, _v : number)	{}
};
const Signature 			= clr_Blob;
const CustomAttributeValue	= clr_Blob;

const clr_Code = binary.UINT32_LE;

class Indexed {
	constructor(public table:number)	{}
	get(s: clr_stream) 				{ return s.getIndex(this.table); }
}
class IndexedList extends Indexed {
	get(s: clr_stream) 				{ return s.getIndex(this.table); }
}
class CodedIndex {
	constructor(public trans:number[], public B:number)	{}
	get(s: clr_stream) 				{ return s.getCodedIndex(this.B, this.trans); }
}

const TypeDefOrRef			= new CodedIndex([TABLE.TypeDef, TABLE.TypeRef, TABLE.TypeSpec], 2);
const HasConstant			= new CodedIndex([TABLE.Field, TABLE.Param, TABLE.Property], 2);
const HasCustomAttribute	= new CodedIndex([
	TABLE.MethodDef, TABLE.Field, TABLE.TypeRef, TABLE.TypeDef, TABLE.Param, TABLE.InterfaceImpl, TABLE.MemberRef, TABLE.Module, TABLE.DeclSecurity, TABLE.Property, TABLE.Event, TABLE.StandAloneSig,
	TABLE.ModuleRef, TABLE.TypeSpec, TABLE.Assembly, TABLE.AssemblyRef, TABLE.File, TABLE.ExportedType, TABLE.ManifestResource, TABLE.GenericParam, TABLE.GenericParamConstraint, TABLE.MethodSpec,
], 5);
const HasFieldMarshall		= new CodedIndex([TABLE.Field, TABLE.Param], 1);
const HasDeclSecurity		= new CodedIndex([TABLE.TypeDef, TABLE.MethodDef, TABLE.Assembly], 2);
const MemberRefParent		= new CodedIndex([TABLE.TypeDef, TABLE.TypeRef, TABLE.ModuleRef, TABLE.MethodDef, TABLE.TypeSpec], 1);
const HasSemantics			= new CodedIndex([TABLE.Event, TABLE.Property], 1);
const MethodDefOrRef		= new CodedIndex([TABLE.MethodDef, TABLE.MemberRef], 1);
const MemberForwarded		= new CodedIndex([TABLE.Field, TABLE.MethodDef], 1);
const Implementation		= new CodedIndex([TABLE.File, TABLE.AssemblyRef, TABLE.ExportedType], 2);
const CustomAttributeType	= new CodedIndex([0, 0, TABLE.MethodDef, TABLE.MemberRef], 3);
const TypeOrMethodDef		= new CodedIndex([TABLE.TypeDef, TABLE.MethodDef], 1);
const ResolutionScope		= new CodedIndex([TABLE.Module, TABLE.ModuleRef, TABLE.AssemblyRef, TABLE.TypeRef], 2);

const ENTRY_Module = {
	generation:	binary.UINT16_LE,
	name:		clr_String,
	mvid:		clr_GUID,
	encid:		clr_GUID,
	encbaseid:	clr_GUID,
};
const ENTRY_TypeRef = {
	scope:		ResolutionScope,
	name:		clr_String,
	namespce:	clr_String,
};
const ENTRY_TypeDef = {
	flags:		binary.UINT32_LE,
	name:		clr_String,
	namespce:	clr_String,
	extends:	TypeDefOrRef,
	fields:		new IndexedList(TABLE.Field),
	methods:	new IndexedList(TABLE.MethodDef),
};
const ENTRY_Field = {
	flags:		binary.UINT16_LE,
	name:		clr_String,
	signature:	Signature,
};
const ENTRY_MethodDef = {
	code:		clr_Code,
	implflags:	binary.UINT16_LE,
	flags:		binary.UINT16_LE,
	name:		clr_String,
	signature:	Signature,
	paramlist:	new IndexedList(TABLE.Param),
};
const ENTRY_Param = {
	flags:		binary.UINT16_LE,
	sequence:	binary.UINT16_LE,
	name:		clr_String,
};
const ENTRY_InterfaceImpl = {
	clss:		new Indexed(TABLE.TypeDef),
	interfce:	TypeDefOrRef,
};
const ENTRY_MemberRef = {
	clss:		MemberRefParent,
	name:		clr_String,
	signature:	Signature,
};
const ENTRY_Constant = {
	type:	binary.UINT16_LE,
	parent:	HasConstant,
	value:	clr_Blob,
};
const ENTRY_CustomAttribute = {
	parent:	HasCustomAttribute,
	type:	CustomAttributeType,
	value:	CustomAttributeValue,
};
const ENTRY_FieldMarshal = {
	parent:	HasFieldMarshall,
	native_type:	clr_Blob,
};
const ENTRY_DeclSecurity = {
	action:	binary.UINT16_LE,
	parent:	HasDeclSecurity,
	permission_set:	clr_Blob,
};
const ENTRY_ClassLayout = {
	packing_size:	binary.UINT16_LE,
	class_size:		binary.UINT32_LE,
	parent:			new Indexed(TABLE.TypeDef),
};
const ENTRY_FieldLayout = {
	offset:	binary.UINT32_LE,
	field:	new Indexed(TABLE.Field),
};
const ENTRY_StandAloneSig = {
	signature:	Signature,
};
const ENTRY_EventMap = {
	parent:	new Indexed(TABLE.TypeDef),
	event_list:	new IndexedList(TABLE.Event),
};
const ENTRY_Event = {
	flags:	binary.UINT16_LE,
	name:	clr_String,
	event_type:	TypeDefOrRef,
};
const ENTRY_PropertyMap = {
	parent:	new Indexed(TABLE.TypeDef),
	property_list:	new IndexedList(TABLE.Property),
};
const ENTRY_Property = {
	flags:	binary.UINT16_LE,
	name:	clr_String,
	type:	Signature,
};
const ENTRY_MethodSemantics = {
	flags:			binary.UINT16_LE,
	method:			new Indexed(TABLE.MethodDef),
	association:	HasSemantics,
};
const ENTRY_MethodImpl = {
	clss:			new Indexed(TABLE.TypeDef),
	method_body:	MethodDefOrRef,
	method_declaration:	MethodDefOrRef,
};
const ENTRY_ModuleRef = {
	name:		clr_String,
};
const ENTRY_TypeSpec = {
	signature:	clr_Blob,
};
const ENTRY_ImplMap = {
	flags:		binary.UINT16_LE,
	member_forwarded:	MemberForwarded,
	name:		clr_String,
	scope:		new Indexed(TABLE.ModuleRef),
};
const ENTRY_FieldRVA = {
	rva:	binary.UINT32_LE,
	field:	new Indexed(TABLE.Field),
};
const ENTRY_Assembly = {
	hashalg:	binary.UINT32_LE,
	major:		binary.UINT16_LE,
	minor:		binary.UINT16_LE,
	build:		binary.UINT16_LE,
	rev:		binary.UINT16_LE,
	flags:		binary.UINT32_LE,
	publickey:	clr_Blob,
	name:		clr_String,
	culture:	clr_String,
};
const ENTRY_AssemblyProcessor = {
	processor:	binary.UINT32_LE,
};
const ENTRY_AssemblyOS = {
	platform:	binary.UINT32_LE,
	minor:		binary.UINT32_LE,
	major:		binary.UINT32_LE,
};
const ENTRY_AssemblyRef = {
	major:		binary.UINT16_LE,
	minor:		binary.UINT16_LE,
	build:		binary.UINT16_LE,
	rev:		binary.UINT16_LE,
	flags:		binary.UINT32_LE,
	publickey:	clr_Blob,
	name:		clr_String,
	culture:	clr_String,
	hashvalue:	clr_Blob,
};
const ENTRY_AssemblyRefProcessor = {
	processor:	binary.UINT32_LE,
	assembly:	new Indexed(TABLE.AssemblyRef),
};
const ENTRY_AssemblyRefOS = {
	platform:	binary.UINT32_LE,
	major:		binary.UINT32_LE,
	minor:		binary.UINT32_LE,
	assembly:	new Indexed(TABLE.AssemblyRef),
};
const ENTRY_File = {
	flags:		binary.UINT32_LE,
	name:		clr_String,
	hash:		clr_Blob,
};
const ENTRY_ExportedType = {
	flags:		binary.UINT32_LE,
	typedef_id:	binary.UINT32_LE,//(a 4-byte index into a TypeDef table of another module in this Assembly).
	name:		clr_String,
	namespce:	clr_String,
	implementation:	Implementation,
};
const ENTRY_ManifestResource = {
	data:	binary.UINT32_LE,
	flags:	binary.UINT32_LE,
	name:	clr_String,
	implementation:	Implementation,
};
const ENTRY_NestedClass = {
	nested_class:		new Indexed(TABLE.TypeDef),
	enclosing_class:	new Indexed(TABLE.TypeDef),
};
const ENTRY_GenericParam = {
	number:	binary.UINT16_LE,
	flags:	binary.UINT16_LE,
	owner:	TypeOrMethodDef,
	name:	clr_String,
};
const ENTRY_MethodSpec = {
	method:			MethodDefOrRef,
	instantiation:	Signature,
};
const ENTRY_GenericParamConstraint = {
	owner:			new Indexed(TABLE.GenericParam),
	constraint:		TypeDefOrRef,
};

const TableReaders = {
	[TABLE.Module]:					ENTRY_Module,
	[TABLE.TypeRef]:				ENTRY_TypeRef,
	[TABLE.TypeDef]:				ENTRY_TypeDef,
	[TABLE.Field]:					ENTRY_Field,
	[TABLE.MethodDef]:				ENTRY_MethodDef,
	[TABLE.Param]:					ENTRY_Param,
	[TABLE.InterfaceImpl]:			ENTRY_InterfaceImpl,
	[TABLE.MemberRef]:				ENTRY_MemberRef,
	[TABLE.Constant]:				ENTRY_Constant,
	[TABLE.CustomAttribute]:		ENTRY_CustomAttribute,
	[TABLE.FieldMarshal]:			ENTRY_FieldMarshal,
	[TABLE.DeclSecurity]:			ENTRY_DeclSecurity,
	[TABLE.ClassLayout]:			ENTRY_ClassLayout,
	[TABLE.FieldLayout]:			ENTRY_FieldLayout,
	[TABLE.StandAloneSig]:			ENTRY_StandAloneSig,
	[TABLE.EventMap]:				ENTRY_EventMap,
	[TABLE.Event]:					ENTRY_Event,
	[TABLE.PropertyMap]:			ENTRY_PropertyMap,
	[TABLE.Property]:				ENTRY_Property,
	[TABLE.MethodSemantics]:		ENTRY_MethodSemantics,
	[TABLE.MethodImpl]:				ENTRY_MethodImpl,
	[TABLE.ModuleRef]:				ENTRY_ModuleRef,
	[TABLE.TypeSpec]:				ENTRY_TypeSpec,
	[TABLE.ImplMap]:				ENTRY_ImplMap,
	[TABLE.FieldRVA]:				ENTRY_FieldRVA,
	[TABLE.Assembly]:				ENTRY_Assembly,
	[TABLE.AssemblyProcessor]:		ENTRY_AssemblyProcessor,
	[TABLE.AssemblyOS]:				ENTRY_AssemblyOS,
	[TABLE.AssemblyRef]:			ENTRY_AssemblyRef,
	[TABLE.AssemblyRefProcessor]:	ENTRY_AssemblyRefProcessor,
	[TABLE.AssemblyRefOS]:			ENTRY_AssemblyRefOS,
	[TABLE.File]:					ENTRY_File,
	[TABLE.ExportedType]:			ENTRY_ExportedType,
	[TABLE.ManifestResource]:		ENTRY_ManifestResource,
	[TABLE.NestedClass]:			ENTRY_NestedClass,
	[TABLE.GenericParam]:			ENTRY_GenericParam,
	[TABLE.MethodSpec]:				ENTRY_MethodSpec,
	[TABLE.GenericParamConstraint]:	ENTRY_GenericParamConstraint,
};

const ResourceManagerHeader = {
	magic:		binary.UINT32_LE,
	version:	binary.UINT32_LE,
	skip:		binary.UINT32_LE,
};

const ResourceManager = {
	reader: 		binary.StringType(binary.UINT8),// Class name of IResourceReader to parse this file
	set:			binary.StringType(binary.UINT8),// Class name of ResourceSet to parse this file
	version:		binary.UINT32_LE,
	num_resources:	binary.UINT32_LE,
	types: 			binary.ArrayType(binary.UINT32_LE, binary.StringType(binary.UINT8)),
};

const ResourceEntry = {
	name:		binary.StringType(binary.UINT8, 'utf16le', false, 1),
	offset:		binary.UINT32_LE,
};

interface Table { count: number, size: number, offset: number }

export class CLR {
	header:		any;
	table_info:	any;
	heaps:		Uint8Array[] = [];
	tables!:	Record<TABLE, Table>;
	raw?:		Uint8Array;
	Resources?:	Uint8Array;
/*
	static async load(dll: string) {
		const p = await pe.PE.load(dll);
		if (p) {
			const clr_data = p.GetDataDir(p.opt.DataDirectory.CLR_DESCRIPTOR);
			if (clr_data)
				return new CLR(p, clr_data);
		}
	}
*/
	constructor(pe: pe.PE, clr_data: Uint8Array) {
		this.header		= binary.read(new binary.stream(clr_data), CLR_HEADER);
		const meta_data	= pe.GetDataDir(this.header.MetaData);
		const meta_root	= meta_data && binary.read(new binary.stream(meta_data.data), METADATA_ROOT);

		if (meta_root?.Signature != binary.utils.stringCode('BSJB'))
			throw new Error("Invalid CLR");

		let 	table_data;

		for (const h of meta_root!.Streams) {
			const	mem = meta_data!.data.subarray(h.Offset, h.Offset + h.Size);
			switch (h.Name) {
				case "#~":			table_data					= mem; break;
				case "#Strings":	this.heaps[HEAP.String]		= mem; break;
				case "#US":			this.heaps[HEAP.UserString]	= mem; break;
				case "#GUID":		this.heaps[HEAP.GUID]		= mem; break;
				case "#Blob":		this.heaps[HEAP.Blob]		= mem; break;
			}
		}

		if (table_data) {
			const stream	= new binary.stream(table_data);
			this.table_info	= binary.read(stream, CLR_TABLES);
			const table_counts: number[] = [];

			//read counts
			for (let b = this.table_info.Valid; b; b = binary.utils.clearLowest(b)) {
				const i = binary.utils.lowestSetIndex(b);
				table_counts[i] = binary.UINT32_LE.get(stream);
			}

			this.raw 		= stream.remainder();
			const stream1 	= new clr_dummy(this.table_info.HeapSizes, table_counts);
			let offset 		= 0;

			for (let b = this.table_info.Valid; b; b = binary.utils.clearLowest(b)) {
				const i = binary.utils.lowestSetIndex(b) as TABLE;
				stream1.seek(0);
				binary.read(stream1, TableReaders[i]);
				this.tables[i] = {offset, count: table_counts[i], size: stream1.tell()};
				offset	+= this.tables[i]!.size * this.tables[i]!.count;
			}

			this.Resources = pe.GetDataDir(this.header.Resources)?.data;
		}
	}

	getEntry(t: TABLE, i: number) : any {
		const table = this.tables[t];
		if (table) {
			const stream2 = new clr_stream(this.raw!, this.heaps, this.table_info.HeapSizes, Object.values(this.tables).map(i => i.count));
			stream2.seek(table.offset + i * table.size);
			return binary.read(stream2, TableReaders[t]);
		}
	}

	getTable(t: TABLE.Module):					binary.ReadType<typeof TableReaders[TABLE.Module]>[];
	getTable(t: TABLE.TypeRef):					binary.ReadType<typeof TableReaders[TABLE.TypeRef]>[];
	getTable(t: TABLE.TypeDef):					binary.ReadType<typeof TableReaders[TABLE.TypeDef]>[];
	getTable(t: TABLE.Field):					binary.ReadType<typeof TableReaders[TABLE.Field]>[];
	getTable(t: TABLE.MethodDef):				binary.ReadType<typeof TableReaders[TABLE.MethodDef]>[];
	getTable(t: TABLE.Param):					binary.ReadType<typeof TableReaders[TABLE.Param]>[];
	getTable(t: TABLE.InterfaceImpl):			binary.ReadType<typeof TableReaders[TABLE.InterfaceImpl]>[];
	getTable(t: TABLE.MemberRef):				binary.ReadType<typeof TableReaders[TABLE.MemberRef]>[];
	getTable(t: TABLE.Constant):				binary.ReadType<typeof TableReaders[TABLE.Constant]>[];
	getTable(t: TABLE.CustomAttribute):			binary.ReadType<typeof TableReaders[TABLE.CustomAttribute]>[];
	getTable(t: TABLE.FieldMarshal):			binary.ReadType<typeof TableReaders[TABLE.FieldMarshal]>[];
	getTable(t: TABLE.DeclSecurity):			binary.ReadType<typeof TableReaders[TABLE.DeclSecurity]>[];
	getTable(t: TABLE.ClassLayout):				binary.ReadType<typeof TableReaders[TABLE.ClassLayout]>[];
	getTable(t: TABLE.FieldLayout):				binary.ReadType<typeof TableReaders[TABLE.FieldLayout]>[];
	getTable(t: TABLE.StandAloneSig):			binary.ReadType<typeof TableReaders[TABLE.StandAloneSig]>[];
	getTable(t: TABLE.EventMap):				binary.ReadType<typeof TableReaders[TABLE.EventMap]>[];
	getTable(t: TABLE.Event):					binary.ReadType<typeof TableReaders[TABLE.Event]>[];
	getTable(t: TABLE.PropertyMap):				binary.ReadType<typeof TableReaders[TABLE.PropertyMap]>[];
	getTable(t: TABLE.Property):				binary.ReadType<typeof TableReaders[TABLE.Property]>[];
	getTable(t: TABLE.MethodSemantics):			binary.ReadType<typeof TableReaders[TABLE.MethodSemantics]>[];
	getTable(t: TABLE.MethodImpl):				binary.ReadType<typeof TableReaders[TABLE.MethodImpl]>[];
	getTable(t: TABLE.ModuleRef):				binary.ReadType<typeof TableReaders[TABLE.ModuleRef]>[];
	getTable(t: TABLE.TypeSpec):				binary.ReadType<typeof TableReaders[TABLE.TypeSpec]>[];
	getTable(t: TABLE.ImplMap):					binary.ReadType<typeof TableReaders[TABLE.ImplMap]>[];
	getTable(t: TABLE.FieldRVA):				binary.ReadType<typeof TableReaders[TABLE.FieldRVA]>[];
	getTable(t: TABLE.Assembly):				binary.ReadType<typeof TableReaders[TABLE.Assembly]>[];
	getTable(t: TABLE.AssemblyProcessor):		binary.ReadType<typeof TableReaders[TABLE.AssemblyProcessor]>[];
	getTable(t: TABLE.AssemblyOS):				binary.ReadType<typeof TableReaders[TABLE.AssemblyOS]>[];
	getTable(t: TABLE.AssemblyRef):				binary.ReadType<typeof TableReaders[TABLE.AssemblyRef]>[];
	getTable(t: TABLE.AssemblyRefProcessor):	binary.ReadType<typeof TableReaders[TABLE.AssemblyRefProcessor]>[];
	getTable(t: TABLE.AssemblyRefOS):			binary.ReadType<typeof TableReaders[TABLE.AssemblyRefOS]>[];
	getTable(t: TABLE.File):					binary.ReadType<typeof TableReaders[TABLE.File]>[];
	getTable(t: TABLE.ExportedType):			binary.ReadType<typeof TableReaders[TABLE.ExportedType]>[];
	getTable(t: TABLE.ManifestResource):		binary.ReadType<typeof TableReaders[TABLE.ManifestResource]>[];
	getTable(t: TABLE.NestedClass):				binary.ReadType<typeof TableReaders[TABLE.NestedClass]>[];
	getTable(t: TABLE.GenericParam):			binary.ReadType<typeof TableReaders[TABLE.GenericParam]>[];
	getTable(t: TABLE.MethodSpec):				binary.ReadType<typeof TableReaders[TABLE.MethodSpec]>[];
	getTable(t: TABLE.GenericParamConstraint):	binary.ReadType<typeof TableReaders[TABLE.GenericParamConstraint]>[];
//	getTable<T extends TABLE> (t: T):			binary.ReadType<typeof TableReaders[T]>[];
	getTable(t: TABLE) {
		const table = this.tables[t];
		if (table) {
			const stream2 = new clr_stream(this.raw!, this.heaps, this.table_info.HeapSizes, Object.values(this.tables).map(i => i.count));
			stream2.seek(table.offset);
			const result: any[] = [];
			for (let i = 0; i < table.count; i++)
				result.push(binary.read(stream2, TableReaders[t]));
			return result;
		}
	}

	getResources(block: string) {
		if (this.Resources) {
			for (const i of this.getTable(TABLE.ManifestResource)!) {
				if (i.name == block) {
					const data0 	= new binary.stream(this.Resources.subarray(i.data));
					const size 		= binary.UINT32_LE.get(data0);
					return getResources(data0.read_buffer(size));
				}
			}
		}
	}

	getResource(block: string, name: string) {
		return this.getResources(block)?.[name];
	}

	allResources() {
		if (this.Resources) {
			const result = {};
			for (const i of this.getTable(TABLE.ManifestResource)!) {
				const data0 	= new binary.stream(this.Resources.subarray(i.data));
				const size 		= binary.UINT32_LE.get(data0);
				const resources = getResources(data0.read_buffer(size));
				if (resources)
					Object.assign(result, resources);
			}
			return result;
		}
	}
}

function getResources(data: Uint8Array) {
	const stream	= new binary.stream(data); 
	const manager0 	= binary.read(stream, ResourceManagerHeader);
	if (manager0.magic == 0xBEEFCACE) {
		const manager	= binary.read_more(stream, ResourceManager, manager0);
		stream.align(8);
		const hashes 	= binary.readn(stream, binary.UINT32_LE, manager.num_resources);
		const offsets	= binary.readn(stream, binary.UINT32_LE, manager.num_resources);
		const start		= binary.UINT32_LE.get(stream);
		const entries 	= binary.readn(stream, ResourceEntry, manager.num_resources);

		const resources : Record<string, any> = {};
		const decoder	= new TextDecoder('utf-8');
		for (let j = 0; j < manager.num_resources; j++) {
			const from	= start + entries[j].offset;
			resources[entries[j].name] = data[from] == 1
				? decoder.decode(data.subarray(from + 2, from + 2 + data[from + 1]))
				: data.subarray(from, j < manager.num_resources - 1 ? start + entries[j + 1].offset : data.length);
		}
		return resources;
	}
}

// hook into PE reader

pe.DIRECTORIES.CLR_DESCRIPTOR.read = (pe: pe.PE, data: binary.MappedMemory) => {
	function fix_names(table: any[]) {
		if ('name' in table[0])
			return Object.fromEntries(table.map(i => [i.name, i]));
		return table;
	}
	const clr = new CLR(pe, data.data);
	return Object.fromEntries(Object.entries(clr.tables).map(([k, v]) => [TABLE[+k], fix_names(clr.getTable(+k)!)]));
};

