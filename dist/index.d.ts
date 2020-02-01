import { VFile } from "vfile";
interface Node {
    type: string;
    children?: Node[];
    value?: string;
}
interface OutputLinkTypeChildren {
    text: string;
    count: number;
    type: "text";
}
declare enum NodeType {
    Link = "link",
    Header = "header",
    OrphanLink = "orphanLink"
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
    depth: number;
}
export declare function collectRemarkWikiMetadata(_options: any): (tree: Node, vfile: VFile) => {
    type: string;
    children: (OutputLinkType | OutputOrphanLinkRef | OutputHeader)[];
};
interface HasCompiler {
    Compiler: (tree: Node) => void;
}
export declare function writeRemarkWikiMetadata(this: HasCompiler, _config: any): void;
export {};
//# sourceMappingURL=index.d.ts.map