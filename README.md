# Binary Libs

This package provides readers for various library formats, using the @isopodlabs/binary binary file loading library


## Supported File Types

### elf
ELF
```typescript
class ELFFile {
    segments: [string, any][];
    sections: [string, any][];
    symbols?: [string, any][];
    dynamic_symbols?: [string, any][];
    header: any;
    static check(data: Uint8Array): boolean;
    constructor(data: Uint8Array);
    getSymbols(type: binary.Type, data: Uint8Array, names: Uint8Array): [string, any][];
}

```

### pe
Portable Executable
```typescript
class PE {
    static check(data: Uint8Array): boolean;
    constructor(data: Uint8Array);
    get directories(): {
        [k: string]: any;
    } | undefined;
    FindSectionRVA(rva: number): Section | undefined;
    FindSectionRaw(addr: number): Section | undefined;
    GetDataRVA(rva: number, size?: number): binary.utils.MappedMemory | undefined;
    GetDataRaw(addr: number, size: number): Uint8Array | undefined;
    GetDataDir(dir: { VirtualAddress: number; Size: number; } & {}): binary.utils.MappedMemory | undefined;
    ReadDirectory(name: string): any;
}
```

### clr
Common Language Runtime (embedded in pe files)
```typescript
class CLR {
    header: any;
    table_info: any;
    heaps: Uint8Array[];
    tables: Record<TABLE, Table>;
    raw?: Uint8Array;
    Resources?: Uint8Array;
    constructor(pe: pe.PE, clr_data: Uint8Array);
    getEntry(t: TABLE, i: number): any;
    getTable(t: TABLE.Module): ({ generation: number; name: string; mvid: string; encid: string; encbaseid: string; } & {})[];
    getTable(t: TABLE.TypeRef): ({ scope: number; name: string; namespce: string; } & {})[];
    getTable(t: TABLE.TypeDef): ({ flags: number; name: string; namespce: string; extends: number; fields: number; methods: number; } & {})[];
    getTable(t: TABLE.Field): ({ flags: number; name: string; signature: Uint8Array; } & {})[];
    getTable(t: TABLE.MethodDef): ({ code: number; implflags: number; flags: number; name: string; signature: Uint8Array; paramlist: number; } & {})[];
    getTable(t: TABLE.Param): ({ flags: number; sequence: number; name: string; } & {})[];
    getTable(t: TABLE.InterfaceImpl): ({ clss: number; interfce: number; } & {})[];
    getTable(t: TABLE.MemberRef): ({ clss: number; name: string; signature: Uint8Array; } & {})[];
    getTable(t: TABLE.Constant): ({ type: number; parent: number; value: Uint8Array; } & {})[];
    getTable(t: TABLE.CustomAttribute): ({ parent: number; type: number; value: Uint8Array; } & {})[];
    getTable(t: TABLE.FieldMarshal): ({ parent: number; native_type: Uint8Array; } & {})[];
    getTable(t: TABLE.DeclSecurity): ({ action: number; parent: number; permission_set: Uint8Array; } & {})[];
    getTable(t: TABLE.ClassLayout): ({ packing_size: number; class_size: number; parent: number; } & {})[];
    getTable(t: TABLE.FieldLayout): ({ offset: number; field: number; } & {})[];
    getTable(t: TABLE.StandAloneSig): ({ signature: Uint8Array; } & {})[];
    getTable(t: TABLE.EventMap): ({ parent: number; event_list: number; } & {})[];
    getTable(t: TABLE.Event): ({ flags: number; name: string; event_type: number; } & {})[];
    getTable(t: TABLE.PropertyMap): ({ parent: number; property_list: number; } & {})[];
    getTable(t: TABLE.Property): ({ flags: number; name: string; type: Uint8Array; } & {})[];
    getTable(t: TABLE.MethodSemantics): ({ flags: number; method: number; association: number; } & {})[];
    getTable(t: TABLE.MethodImpl): ({ clss: number; method_body: number; method_declaration: number; } & {})[];
    getTable(t: TABLE.ModuleRef): ({ name: string; } & {})[];
    getTable(t: TABLE.TypeSpec): ({ signature: Uint8Array; } & {})[];
    getTable(t: TABLE.ImplMap): ({ flags: number; member_forwarded: number; name: string; scope: number; } & {})[];
    getTable(t: TABLE.FieldRVA): ({ rva: number; field: number; } & {})[];
    getTable(t: TABLE.Assembly): ({ hashalg: number; major: number; minor: number; build: number; rev: number; flags: number; publickey: Uint8Array; name: string; culture: string; } & {})[];
    getTable(t: TABLE.AssemblyProcessor): ({ processor: number; } & {})[];
    getTable(t: TABLE.AssemblyOS): ({ platform: number; minor: number; major: number; } & {})[];
    getTable(t: TABLE.AssemblyRef): ({ major: number; minor: number; build: number; rev: number; flags: number; publickey: Uint8Array; name: string; culture: string; hashvalue: Uint8Array; } & {})[];
    getTable(t: TABLE.AssemblyRefProcessor): ({ processor: number; assembly: number; } & {})[];
    getTable(t: TABLE.AssemblyRefOS): ({ platform: number; major: number; minor: number; assembly: number; } & {})[];
    getTable(t: TABLE.File): ({ flags: number; name: string; hash: Uint8Array; } & {})[];
    getTable(t: TABLE.ExportedType): ({ flags: number; typedef_id: number; name: string; namespce: string; implementation: number; } & {})[];
    getTable(t: TABLE.ManifestResource): ({ data: number; flags: number; name: string; implementation: number; } & {})[];
    getTable(t: TABLE.NestedClass): ({ nested_class: number; enclosing_class: number; } & {})[];
    getTable(t: TABLE.GenericParam): ({ number: number; flags: number; owner: number; name: string; } & {})[];
    getTable(t: TABLE.MethodSpec): ({ method: number; instantiation: Uint8Array; } & {})[];
    getTable(t: TABLE.GenericParamConstraint): ({ owner: number; constraint: number; } & {})[];
    getResources(block: string): Record<string, any> | undefined;
    getResource(block: string, name: string): any;
    allResources(): {} | undefined;
}
```
### mach
Apple libraries
```typescript
declare function segment(bits: 32 | 64): {
    get(s: mach_stream): Promise<{
        data: binary.utils.MappedMemory | undefined;
        segname: string;
        vmaddr: number | bigint;
        vmsize: number | bigint;
        fileoff: number | bigint;
        filesize: number | bigint;
        maxprot: number;
        initprot: number;
        nsects: number;
        flags: Record<string, bigint | boolean> | Record<string, number | boolean>;
        sections: Record<string, any> | undefined;
    } & {}>;
};
export declare class MachFile {
    header: any;
    commands: { cmd: CMD; data: any; }[];
    ready: Promise<void>;
    static check(data: Uint8Array): boolean;
    constructor(data: Uint8Array, mem?: binary.utils.memory);
    load(data: Uint8Array, be: boolean, bits: 32 | 64, mem?: binary.utils.memory): Promise<void>;
    getCommand(cmd: number): any;
    getSegment(name: string): Promise<{ data: binary.utils.MappedMemory | undefined; segname: string; vmaddr: number | bigint; vmsize: number | bigint; fileoff: number | bigint; filesize: number | bigint; maxprot: number; initprot: number; nsects: number; flags: Record<string, bigint | boolean> | Record<string, number | boolean>; sections: Record<string, any> | undefined; } & {}> | undefined;
}
class FATMachFile {
    archs: ({ cputype: string; cpusubtype: string | number; offset: number; size: number; align: number; contents: MachFile | undefined; } & {})[];
    static check(data: Uint8Array): boolean;
    constructor(data: Uint8Array, mem?: binary.utils.memory);
    load(file: binary.stream_endian, mem?: binary.utils.memory): void;
}
```

### arch
Archive files for static linking

```typescript
type HEADER = {
    name: string;
    date: number;
    uid: number;
    gid: number;
    mode: number;
    size: number;
    fmag: string;
    contents: any;
};
declare class ArchFile {
    members: HEADER[];
    static check(data: Uint8Array): boolean;
    constructor(data: Uint8Array);
}
```

### CompoundDocument
Not a library format at all, but useful for loading some related files
```typescript
class Reader {
    entries: DirEntry[];
    private entry_chain;
    constructor(sectors: Uint8Array, header: Header);
    find(name: string, i?: number): DirEntry | undefined;
    read(e: DirEntry): Uint8Array;
    write(e: DirEntry, data: Uint8Array): void;
}
```
## License

This project is licensed under the MIT License. See the LICENSE file for more details.