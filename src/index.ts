import {VFile} from "vfile";
import assert from "assert";
import { basename } from "path";
import mdh2fn from "markdown-header-to-filename";

const fsPromises = require('fs').promises;

interface Node {
    type: string;
    children?: Node[]
    value?: string;
}

interface Link extends Node {
    title: string | null;
    url: string;
}
interface LinkWithHeader extends Link {
    header: HeaderType[];
}
interface LinkDef extends Node {
    title: string | null;
    identifier: string;
    url: string;
}
interface LinkRef extends Node {
    identifier: string;
    label: string;
}
interface LinkRefWithHeader extends LinkRef {
    header: HeaderType[];
}
interface Heading extends Node { depth: number;}

interface CollectedData {
    links: LinkWithHeader[];
    linkRefs: LinkRefWithHeader[];
    linkDefs: LinkDef[];
    headers: HeaderType[][];
}

function collectData(item: Node): CollectedData {

    let links: LinkWithHeader[] = [];
    let linkRefs: LinkRefWithHeader[] = [];
    let linkDefs: LinkDef[] = [];
    let headers: HeaderType[][] = [];
    let currentHeader : HeaderType[] = [];

    function record(item: Link | LinkDef | LinkRef | Heading) {
        if (item.type == 'heading') {
            currentHeader = headersReducer(currentHeader, item as Heading);
            headers.push(currentHeader);
        }
        if (item.type == 'link') {
            links.push({...item as Link, header: currentHeader});
        }
        if (item.type == 'linkReference') {
            linkRefs.push({...item as LinkRef, header: currentHeader});
        }
        if (item.type == 'definition') {linkDefs.push(item as LinkDef);}
        return item.children && item.children.length ?
            item.children :
            [];
    }

    let ar = [item];

    while (ar.length) {
        const items = record(ar.shift() as Link | LinkDef | LinkRef);
        ar = [...items, ...ar];
    }

    return {links, linkRefs, linkDefs, headers};
}

function getChildWords(item: Node) {

    let words: string[] = [];

    function record(item: Node) {
        if (item.value && item.value.trim().length) {
            words.push(item.value.trim());
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

    return words.join(" ");
}

interface LinkType {
    [knownAs: string]: { text: string[]; header: string[] }[]
}

interface HeaderType {
    depth: number;
    text: string;
}

interface ProcessedData {
    links: LinkType;
    orphanLinkRefs: LinkType;
    headers: HeaderType[][];
}

function processData({headers, links, linkRefs, linkDefs}: CollectedData): ProcessedData {

    // links.forEach((l) => console.log("L: ", l));
    // linkRefs.forEach((l) => console.log("R: ", l));
    // linkDefs.forEach((l) => console.log("D: ", l));
    // headers.forEach((l) => console.log("H: ", l));
    function normalizeUrl(url: string) {
        return url.replace(/^\.\//, '');
    }

    function uniq(ar: string[]): string[] {
        return ar.reduce(
            (acc: string[], item: string) => {
                return acc.indexOf(item) == -1 ?
                    [...acc, item] :
                    acc
            },
            []
        );
    }

    function pushInto(m: LinkType, url: string, text: string[], header: string[]) {
        const u = normalizeUrl(url);
        if (!m.hasOwnProperty(u)) {
            m[u] = [];
        }
        m[u].push({
            text: uniq(text).map((t) => t.trim()).filter((t) => t.length),
            header
        });
    }

    let lnks: LinkType = {};
    let orphanLinks: LinkType = {};
    let identifierToDef: Map<string, { url: string, title: string }> = new Map();

    links.forEach((item: LinkWithHeader) => {
        let words: string[] = [];
        item.title && words.push(item.title);
        if (item.children && item.children.length) {
            words.push(getChildWords(item));
        }
        pushInto(
            lnks,
            item.url,
            words,
            item.header.map(({text}) => text)
        )
    });

    linkDefs.forEach((ld) => {
        identifierToDef.set(
            ld.identifier,
            { url: ld.url, title: ld.title ? ld.title : '' }
        );
    });

    linkRefs.forEach((item) => {
        let words: string[] = [];
        const def = identifierToDef.get(item.identifier);
        if (def) {
            if (item.children && item.children.length) {
                words.push(getChildWords(item));
            }
            item.label && words.push(item.label)
            def.title && words.push(def.title)
            return pushInto(
                lnks,
                def.url,
                words,
                item.header.map(({text}) => text)
            )
        }
        words = [getChildWords(item)];
        item.label && words.push(item.label);
        pushInto(orphanLinks, item.identifier, words, item.header.map(({text}) => text));
    });

    return {
        links: lnks,
        orphanLinkRefs: orphanLinks,
        headers,
    };
}


assert.deepEqual(
    processData({
        headers: [],
        links: [
            {
                type: "link",
                title: "Hello",
                url: "Greeting",
                value: "Hello",
                header: [{ depth: 1, text: "h1"}]
            }
        ],
        linkRefs: [],
        linkDefs: []
    }),
    {
        headers: [],
        links: {
            Greeting: [
                { text: ["Hello"], header: ["h1"] }
            ]
        },
        orphanLinkRefs: {}
    }
);

enum NodeType {
    Root = "root",
    Link = "link",
    Header = "header",
    OrphanLink = "orphanLink",
}

interface OutputLinkTypeChildren {
    text: string[];
    header: string[];
    type: "description";
}

interface OutputLinkType {
    type: NodeType.Link;
    href: string;
    children: OutputLinkTypeChildren[]
}

interface Output {
    type: NodeType;
    href: string;
    children: OutputLinkTypeChildren[]
}

function outputLinkType(knownAs: NodeType, linkType: LinkType): (OutputLinkType|OutputOrphanLinkRef)[] {

    let parents: (OutputLinkType|OutputOrphanLinkRef)[] = [];
    for (const k in linkType) {
        if (!linkType.hasOwnProperty(k)) {
            continue;
        }
        let children: OutputLinkTypeChildren[] = [];
        linkType[k].map((lt) => {
            children.push({type: "description", ...lt});
        });
        if (knownAs == NodeType.Link) {
            parents.push({ type: NodeType.Link, href: k, children });
        } else {
            parents.push({ type: NodeType.OrphanLink, identifier: k, children });
        }
    }
    return parents;

}

interface OutputOrphanLinkRef {
    type: NodeType.OrphanLink
    identifier: string;
    children: OutputLinkTypeChildren[]
}


interface OutputHeader {
    type: NodeType.Header
    text: string[];
}


function organizeHeaders(headers: HeaderType[][]): OutputHeader[] {
    const texts = headers.map((hdrs) => hdrs.map(({text}) => text))
    return texts.map((s) => ({ text: s, type: NodeType.Header }));
//     let d: number[] = [];
//     let h: string[] = [];

//     function isLessEqual(depth: number) {
//         return d.length == 0 ?
//             false :
//             depth <= d[d.length - 1];
//     }


//     return headers.map(
//         (header) => {
//             while (isLessEqual(header.depth)) {
//                     h.pop();
//                     d.pop();
//             }
//             h = [...h, header.text];
//             d = [...d, header.depth];
//             return {
//                 depth: header.depth,
//                 type: NodeType.Header,
//                 text: [...h]
//             };
//         }
//     );
}


// assert.deepEqual(
//     organizeHeaders([
//         {depth: 1, text: "Main 1"},
//         {depth: 2, text: "Sub 1 1"},
//         {depth: 1, text: "Main 2"},
//         {depth: 2, text: "Sub 2 1"},
//         {depth: 4, text: "Sub Sub 2 1 1 1"},
//         {depth: 3, text: "Sub Sub 2 1 2"},
//     ]),
//     [
//         {type: "header", depth: 1, text: ["Main 1"] },
//         {type: "header", depth: 2, text: ["Main 1", "Sub 1 1"]},
//         {type: "header", depth: 1, text: ["Main 2"] },
//         {type: "header", depth: 2, text: ["Main 2", "Sub 2 1"]},
//         {type: "header", depth: 4, text: ["Main 2", "Sub 2 1", "Sub Sub 2 1 1 1"] },
//         {type: "header", depth: 3, text: ["Main 2", "Sub 2 1", "Sub Sub 2 1 2"]}
//     ],
// )


function headersReducer(acc: HeaderType[], header: Heading): HeaderType[] {

    let newAcc = [...acc];

    function isLessEqual(depth: number) {
        return newAcc.length == 0 ?
            false :
            depth <= newAcc[newAcc.length - 1].depth;
    }

    while (isLessEqual(header.depth)) {
        newAcc.pop();
    }

    let text = getChildWords(header);
    return [
        ...newAcc,
        { depth: header.depth, text }
    ];
}


assert.deepEqual(
    headersReducer([], { type: "A", value: "Main", depth: 1 }),
    [{ text: "Main", depth: 1 }]
);

assert.deepEqual(
    headersReducer(
        [{ text: "Main", depth: 1 }],
        { type: "A", value: "Sub", depth: 2 }
    ),
    [
        { text: "Main", depth: 1 },
        { text: "Sub", depth: 2 }
    ]
);

assert.deepEqual(
    headersReducer(
        [
            { text: "Main", depth: 1 },
            { text: "Sub A", depth: 2 }
        ],
        { type: "A", value: "Sub B", depth: 2 }
    ),
    [{ text: "Main", depth: 1 }, { text: "Sub B", depth: 2 }]
);

type WMTransformerChild = (OutputOrphanLinkRef | OutputLinkType | OutputHeader)[]

interface WMTransformed {
    type: NodeType.Root;
    filename: string;
    children: WMTransformerChild;
}


export function collectRemarkWikiMetadata(_options: any) {

    return transformer;

    function transformer(tree: Node, vfile: VFile): WMTransformed {
        const r = processData(collectData(tree));
        // const theFile = path.resolve(vfile.path as string);

        let children: (OutputOrphanLinkRef | OutputLinkType | OutputHeader)[] = [];

        children = children
            .concat(outputLinkType(NodeType.Link, r.links))
            .concat(organizeHeaders(r.headers))
            .concat(outputLinkType(NodeType.OrphanLink, r.orphanLinkRefs));

        // console.log("VFILE: ", vfile.path)
        return { type: NodeType.Root, children, filename: basename(<string>vfile.path) };

    }
}

interface HasCompiler {
    Compiler: (tree: WMTransformed) => void
}

function getHashes(n: number) {
    let s = '';
    for (let i = 0; i < n; i++) {
        s = s + ':';
    }
    return s;
}

function serializeHeader(header: string[]) {

    let depth = 1;

    return header.reduce(
        (acc: string, h: string) => {
            acc = acc.length ? (acc + ' ' + getHashes(depth++)) : (acc + getHashes(depth++));
            acc = acc + '' + h;
            // console.log(">>>", acc);
            return acc;
        },
        ''
    );
}

function linkReducer(acc: string[], item: Output): string[] {

    // interface CT { text: string; header: string[]; }
    // type CTHeader = string;
    // type CTString = string;

    // type CT = Map<CTHeader, CTString>;

    const toAdd = item.children.reduce(
        (childAcc: string[], child: Output["children"][0]) => {
            const childToAdd = child.text.map((txts) => {
                return item.type + ' ' + serializeHeader(child.header.concat([txts].concat(item.href)));
            });

            return [...childAcc, ...childToAdd];
        },
        []
    )

    return [
        ...acc,
        ...toAdd.map(
            (ta) => ta
        )
    ];

}

export function writeRemarkWikiMetadata(this: HasCompiler, _config: any) {

    this.Compiler = compiler;

    function orphanToOutput(o: OutputOrphanLinkRef): Output {
        return {
            href: o.identifier,
            type: NodeType.OrphanLink,
            children: o.children,
        }
    }


    function removeExtension(filename: string) {
        return filename.replace(/\.[^\.]+$/, '')
    }


    function headerToOutput(o: OutputHeader): Output {
        return {
            href: o.text[o.text.length - 1],
            type: NodeType.Header,
            children: [{
                type: 'description',
                header: [],
                text: o.text.slice(0, o.text.length - 1)
            }]
        };
    }


    function getNewRootHeader(filename: string, rootHeader: string): string {
        if (!rootHeader) { rootHeader = removeExtension(filename); }
        if (mdh2fn(rootHeader) != removeExtension(filename)) {
            rootHeader = removeExtension(filename)
        }
        return rootHeader;
    }

    function headerHeaderMapper(filename: string, header: OutputHeader): OutputHeader {
        let h = header.text.slice(1);
        h.unshift(getNewRootHeader(filename, header.text[0]));
        return { ...header, text: h };
    }

    function linkHeaderMapper(filename: string, output: Output): Output {
        const children: OutputLinkTypeChildren[] = output.children.map(
            (child) => {
                let h = child.header.slice(1);
                h.unshift(getNewRootHeader(filename, child.header[0]));
                return { ...child, header: h };
            }
        );
        return { ...output, children };
    }

    function compiler(tree: WMTransformed) {

        const children: (OutputOrphanLinkRef | OutputLinkType | OutputHeader)[] = tree.children;

        const links: OutputLinkType[] = ((children || [])
            .filter(({type}) => type == NodeType.Link)) as OutputLinkType[];

        const headers: OutputHeader[] = ((children || [])
            .filter(({type}) => type == NodeType.Header)) as OutputHeader[];

        const orphanLinkRefs: OutputOrphanLinkRef[] = ((children || [])
            .filter(({type}) => type == NodeType.OrphanLink)) as OutputOrphanLinkRef[];

        let toReduce: Output[] = [
            ...headers.map(headerHeaderMapper.bind(null, tree.filename)).map(headerToOutput),
            ...links.map(linkHeaderMapper.bind(null, tree.filename)),
            ...orphanLinkRefs.map(orphanToOutput).map(linkHeaderMapper.bind(null, tree.filename))
        ];

        // toReduce.forEach((tr) => console.log('J: ', JSON.stringify(tr)));
        // links.forEach((tr) => console.log('L: ', JSON.stringify(tr)));
        // headers.forEach((tr) => console.log('H: ', JSON.stringify(tr)));
        // console.log(toReduce.reduce(linkReducer, [] as string[]));
        return toReduce.reduce(linkReducer, [] as string[]).join("\n");
        // return JSON.stringify(tree);

    }
}
