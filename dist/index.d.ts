import { VFile } from "vfile";
interface Node {
    type: string;
    children?: Node[];
    value?: string;
}
declare enum NodeType {
    WarningHeaderToFilename = "bad_head",
    Root = "root",
    Link = "link",
    Header = "head",
    OrphanLink = "bad_link"
}
interface OutputLinkTypeChildren {
    text: string[];
    header: string[];
    type: "description";
}
interface OutputLinkType {
    type: NodeType.Link;
    href: string;
    children: OutputLinkTypeChildren[];
}
interface OutputOrphanLinkRef {
    type: NodeType.OrphanLink;
    identifier: string;
    children: OutputLinkTypeChildren[];
}
interface OutputHeader {
    type: NodeType.Header;
    text: string[];
}
declare type WMTransformerChild = (OutputOrphanLinkRef | OutputLinkType | OutputHeader)[];
interface WMTransformed {
    type: NodeType.Root;
    filename: string;
    children: WMTransformerChild;
}
export declare function collectRemarkWikiMetadata(_options: any): (tree: Node, vfile: VFile) => WMTransformed;
interface HasCompiler {
    Compiler: (tree: WMTransformed) => void;
}
export declare function writeRemarkWikiMetadata(this: HasCompiler, _config: any): void;
export {};
//# sourceMappingURL=index.d.ts.map