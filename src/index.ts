import {VFile} from "vfile";
import * as path from "path";
import assert from "assert";

const fsPromises = require('fs').promises;

interface Node {
    type: string;
    children?: Node[]
    value?: string;
}

interface Link extends Node {title: string | null; url: string;}
interface LinkDef extends Node {title: string | null; identifier: string; url: string;}
interface LinkRef extends Node {identifier: string; label: string}
interface Heading extends Node { depth: number;}

interface CollectedData {
    links: Link[];
    linkRefs: LinkRef[];
    linkDefs: LinkDef[];
    headers: Heading[];
}

function collectData(item: Node): CollectedData {

    let links: Link[] = [];
    let linkRefs: LinkRef[] = [];
    let linkDefs: LinkDef[] = [];
    let headers: Heading[] = [];

    function record(item: Link | LinkDef | LinkRef | Heading) {
        if (item.type == 'heading') {headers.push(item as Heading);}
        if (item.type == 'link') {links.push(item as Link);}
        if (item.type == 'linkReference') {linkRefs.push(item as LinkRef);}
        if (item.type == 'definition') {linkDefs.push(item as LinkDef);}
        return item.children && item.children.length ?
            item.children :
            [];
    }

    let ar = [item];

    while (ar.length) {
        const items = record(ar.shift() as Link | LinkDef | LinkRef);
        ar = [...ar, ...items];
    }

    return {links, linkRefs, linkDefs, headers};
}

function getWords(item: Node) {

    let words: string[] = [];

    function record(item: Node) {
        if (item.value) {
            words.push(item.value);
        }
        return item.children && item.children.length ?
            item.children :
            [];
    }

    let ar = [item];

    while (ar.length) {
        const items = record(ar.shift() as Node);
        ar = [...ar, ...items];
    }

    return words.join("");
}

interface LinkType {
    [knownAs: string]: {[text: string]: number;};
}

interface HeaderType {
    depth: number;
    text: string;
}

interface ProcessedData {
    links: LinkType;
    orphanLinkRefs: LinkType;
    headers: HeaderType[];
}

function processData({headers, links, linkRefs, linkDefs}: CollectedData): ProcessedData {

    function normalizeUrl(url: string) {
        return url.replace(/^\.\//, '');
    }

    function sanitizeWord(w: string) {
        return w.toLowerCase().trim();
    }

    function pushInto(m: { [k: string]: {[kk: string]: number}}, url: string, text: string) {
        const u = normalizeUrl(url);
        if (!m.hasOwnProperty(u)) {
            m[u] = {};
        }
        if (text.length) {
            m[u][text] = (m[u][text] || 0) + 1;
        }
    }

    let lnks: {[url: string]: {[alias: string]: number}} = {};
    let orphanLinks: {[knownAs: string]: {[alias: string]: number}} = {};
    let identifierToUrl: Map<string, string> = new Map();

    links.forEach((item: Link) => {
        item.title ? pushInto(lnks, item.url, item.title) : 0;
        pushInto(lnks, item.url, getWords(item));
    });

    linkDefs.forEach((ld) => {
        identifierToUrl.set(ld.identifier, ld.url);
        ld.title ? pushInto(lnks, ld.url, ld.title) : 0
    });

    linkRefs.forEach((lr) => {
        const url = identifierToUrl.get(lr.identifier);
        if (url) {
            pushInto(lnks, url, lr.label);
            return pushInto(lnks, url, getWords(lr));
        }
        pushInto(orphanLinks, lr.identifier, lr.label);
        pushInto(orphanLinks, lr.identifier, getWords(lr));
    });

    return {
        links: lnks,
        orphanLinkRefs: orphanLinks,
        headers: headers.map((h) => ({ depth: h.depth, text: getWords(h)}))
    };
}

interface OutputLinkTypeChildren {
    text: string;
    count: number;
    type: "text";
}

enum NodeType {
    Link = "link",
    Header = "header",
    OrphanLink = "orphanLink",
}

interface OutputLinkType {
    type: NodeType.Link
    href: string;
    children: OutputLinkTypeChildren[]
}

function outputLinkType(k: string, linkType: LinkType): OutputLinkType[] {

    let parents: OutputLinkType[] = [];
    for (const k in linkType) {
        if (!linkType.hasOwnProperty(k)) {
            continue;
        }
        let children: OutputLinkTypeChildren[] = [];
        for (const kk in linkType[k] || {}) {
            children.push({type: "text", text: kk || "", count: linkType[k][kk] || 0});
        }
        parents.push({type: NodeType.Link, href: k, children});
    }
    return parents;

}

interface OutputOrphanLinkRef {
    type: NodeType.OrphanLink
    identifier: string;
    children: OutputLinkTypeChildren[]
}

function outputOrphanLinkRefs(orphanLinkRefs: LinkType): OutputOrphanLinkRef[] {
    let parents: OutputOrphanLinkRef[] = [];
    for (const k in orphanLinkRefs) {
        if (!orphanLinkRefs.hasOwnProperty(k)) {
            continue;
        }
        let children: OutputLinkTypeChildren[] = [];
        for (const kk in orphanLinkRefs[k] || {}) {
            children.push({type: "text", text: kk || "", count: orphanLinkRefs[k][kk] || 0});
        }
        parents.push({type: NodeType.OrphanLink, identifier: k, children});
    }
    return parents;
}

interface OutputHeader {
    type: NodeType.Header
    text: string[];
    depth: number;
}


function organizeHeaders(headers: HeaderType[]): OutputHeader[] {
    let d: number[] = [];
    let h: string[] = [];

    function isLessEqual(depth: number) {
        return d.length == 0 ?
            false :
            depth <= d[d.length - 1];
    }


    return headers.map(
        (header) => {
            while (isLessEqual(header.depth)) {
                    h.pop();
                    d.pop();
            }
            h = [...h, header.text];
            d = [...d, header.depth];
            return {
                depth: header.depth,
                type: NodeType.Header,
                text: [...h]
            };
        }
    );
}


assert.deepEqual(
    [
        {type: "header", depth: 1, text: ["Main 1"] },
        {type: "header", depth: 2, text: ["Main 1", "Sub 1 1"]},
        {type: "header", depth: 1, text: ["Main 2"] },
        {type: "header", depth: 2, text: ["Main 2", "Sub 2 1"]},
        {type: "header", depth: 4, text: ["Main 2", "Sub 2 1", "Sub Sub 2 1 1 1"] },
        {type: "header", depth: 3, text: ["Main 2", "Sub 2 1", "Sub Sub 2 1 2"]}
    ],
    organizeHeaders([
        {depth: 1, text: "Main 1"},
        {depth: 2, text: "Sub 1 1"},
        {depth: 1, text: "Main 2"},
        {depth: 2, text: "Sub 2 1"},
        {depth: 4, text: "Sub Sub 2 1 1 1"},
        {depth: 3, text: "Sub Sub 2 1 2"},
    ])
)


export function collectRemarkWikiMetadata(_options: any) {

    return transformer;

    function headerMapper(headers: string[]) {
        return {
            type: "header",
            text: headers,
        }
    }

    function transformer(tree: Node, vfile: VFile) {
        const r = processData(collectData(tree));
        // const theFile = path.resolve(vfile.path as string);

        let children: (OutputOrphanLinkRef | OutputLinkType | OutputHeader)[] = [];

        children = children
            .concat(outputLinkType("links", r.links))
            .concat(organizeHeaders(r.headers))
            .concat(outputOrphanLinkRefs(r.orphanLinkRefs));

        return {type: "root", children};

    }
}

interface HasCompiler {
    Compiler: (tree: Node) => void
}

export function writeRemarkWikiMetadata(this: HasCompiler, _config: any) {

    this.Compiler = compiler

    function compiler(tree: any) {

        const children: (OutputOrphanLinkRef | OutputLinkType | OutputHeader)[] = tree.children;

        const childLinks: OutputLinkType[] = ((children || [])
            .filter(({type}) => type == NodeType.Link)) as OutputLinkType[];

        const childHeaders: OutputHeader[] = ((children || [])
            .filter(({type}) => type == NodeType.Header)) as OutputHeader[];

        const childOrphanLinks: OutputOrphanLinkRef[] = ((children || [])
            .filter(({type}) => type == NodeType.OrphanLink)) as OutputOrphanLinkRef[];


        const links = childLinks.map(({href, children}: OutputLinkType) => {
            return {
                href,
                text: children.map(({text, count}) => ({text, count}))
            }
        });

        const orphanLinkRefs = childOrphanLinks.map(({identifier, children}: OutputOrphanLinkRef) => {
            return {
                identifier,
                text: children.map(({text, count}) => ({text, count}))
            }
        });

        const headers = childHeaders.map(({text, depth}: OutputHeader) => {
            return {text, depth};
        });

        return JSON.stringify({links, orphanLinkRefs, headers});
    }
}
