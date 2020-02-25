"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const path_1 = require("path");
const markdown_header_to_filename_1 = __importDefault(require("markdown-header-to-filename"));
const fsPromises = require('fs').promises;
function collectData(item) {
    let links = [];
    let linkRefs = [];
    let linkDefs = [];
    let headers = [];
    let currentHeader = [];
    function record(item) {
        if (item.type == 'heading') {
            currentHeader = headersReducer(currentHeader, item);
            headers.push(currentHeader);
        }
        if (item.type == 'link') {
            links.push({ ...item, header: currentHeader });
        }
        if (item.type == 'linkReference') {
            linkRefs.push({ ...item, header: currentHeader });
        }
        if (item.type == 'definition') {
            linkDefs.push(item);
        }
        return item.children && item.children.length ?
            item.children :
            [];
    }
    let ar = [item];
    while (ar.length) {
        const items = record(ar.shift());
        ar = [...items, ...ar];
    }
    return { links, linkRefs, linkDefs, headers };
}
function getChildWords(item) {
    let words = [];
    function record(item) {
        if (item.value && item.value.trim().length) {
            words.push(item.value.trim());
        }
        return item.children && item.children.length ?
            item.children :
            [];
    }
    let ar = [item];
    while (ar.length) {
        const items = record(ar.shift());
        ar = [...ar, ...items];
    }
    return words.join(" ");
}
function processData({ headers, links, linkRefs, linkDefs }) {
    // links.forEach((l) => console.log("L: ", l));
    // linkRefs.forEach((l) => console.log("R: ", l));
    // linkDefs.forEach((l) => console.log("D: ", l));
    // headers.forEach((l) => console.log("H: ", l));
    function normalizeUrl(url) {
        return url.replace(/^\.\//, '');
    }
    function uniq(ar) {
        return ar.reduce((acc, item) => {
            return acc.indexOf(item) == -1 ?
                [...acc, item] :
                acc;
        }, []);
    }
    function pushInto(m, url, text, header) {
        const u = normalizeUrl(url);
        if (!m.hasOwnProperty(u)) {
            m[u] = [];
        }
        m[u].push({
            text: uniq(text).map((t) => t.trim()).filter((t) => t.length),
            header
        });
    }
    let lnks = {};
    let orphanLinks = {};
    let identifierToDef = new Map();
    links.forEach((item) => {
        let words = [];
        item.title && words.push(item.title);
        if (item.children && item.children.length) {
            words.push(getChildWords(item));
        }
        pushInto(lnks, item.url, words, item.header.map(({ text }) => text));
    });
    linkDefs.forEach((ld) => {
        identifierToDef.set(ld.identifier, { url: ld.url, title: ld.title ? ld.title : '' });
    });
    linkRefs.forEach((item) => {
        let words = [];
        const def = identifierToDef.get(item.identifier);
        if (def) {
            if (item.children && item.children.length) {
                words.push(getChildWords(item));
            }
            item.label && words.push(item.label);
            def.title && words.push(def.title);
            return pushInto(lnks, def.url, words, item.header.map(({ text }) => text));
        }
        words = [getChildWords(item)];
        item.label && words.push(item.label);
        pushInto(orphanLinks, item.identifier, words, item.header.map(({ text }) => text));
    });
    return {
        links: lnks,
        orphanLinkRefs: orphanLinks,
        headers,
    };
}
assert_1.default.deepEqual(processData({
    headers: [],
    links: [
        {
            type: "link",
            title: "Hello",
            url: "Greeting",
            value: "Hello",
            header: [{ depth: 1, text: "h1" }]
        }
    ],
    linkRefs: [],
    linkDefs: []
}), {
    headers: [],
    links: {
        Greeting: [
            { text: ["Hello"], header: ["h1"] }
        ]
    },
    orphanLinkRefs: {}
});
var NodeType;
(function (NodeType) {
    NodeType["WarningHeaderToFilename"] = "bad_head";
    NodeType["Root"] = "root";
    NodeType["Link"] = "link";
    NodeType["Header"] = "head";
    NodeType["OrphanLink"] = "bad_link";
})(NodeType || (NodeType = {}));
function outputLinkType(knownAs, linkType) {
    let parents = [];
    for (const k in linkType) {
        if (!linkType.hasOwnProperty(k)) {
            continue;
        }
        let children = [];
        linkType[k].map((lt) => {
            children.push({ type: "description", ...lt });
        });
        if (knownAs == NodeType.Link) {
            parents.push({ type: NodeType.Link, href: k, children });
        }
        else {
            parents.push({ type: NodeType.OrphanLink, identifier: k, children });
        }
    }
    return parents;
}
function organizeHeaders(headers) {
    const texts = headers.map((hdrs) => hdrs.map(({ text }) => text));
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
function headersReducer(acc, header) {
    let newAcc = [...acc];
    function isLessEqual(depth) {
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
assert_1.default.deepEqual(headersReducer([], { type: "A", value: "Main", depth: 1 }), [{ text: "Main", depth: 1 }]);
assert_1.default.deepEqual(headersReducer([{ text: "Main", depth: 1 }], { type: "A", value: "Sub", depth: 2 }), [
    { text: "Main", depth: 1 },
    { text: "Sub", depth: 2 }
]);
assert_1.default.deepEqual(headersReducer([
    { text: "Main", depth: 1 },
    { text: "Sub A", depth: 2 }
], { type: "A", value: "Sub B", depth: 2 }), [{ text: "Main", depth: 1 }, { text: "Sub B", depth: 2 }]);
function collectRemarkWikiMetadata(_options) {
    return transformer;
    function transformer(tree, vfile) {
        const r = processData(collectData(tree));
        // const theFile = path.resolve(vfile.path as string);
        let children = [];
        children = children
            .concat(outputLinkType(NodeType.Link, r.links))
            .concat(organizeHeaders(r.headers))
            .concat(outputLinkType(NodeType.OrphanLink, r.orphanLinkRefs));
        // console.log("VFILE: ", vfile.path)
        return { type: NodeType.Root, children, filename: path_1.basename(vfile.path) };
    }
}
exports.collectRemarkWikiMetadata = collectRemarkWikiMetadata;
function getHashes(n) {
    let s = '';
    for (let i = 0; i < n; i++) {
        s = s + ':';
    }
    return s;
}
function serializeHeader(header) {
    let depth = 1;
    return header.reduce((acc, h) => {
        acc = acc.length ? (acc + ' ' + getHashes(depth++)) : (acc + getHashes(depth++));
        acc = acc + '' + h;
        // console.log(">>>", acc);
        return acc;
    }, '');
}
function linkReducer(acc, item) {
    // interface CT { text: string; header: string[]; }
    // type CTHeader = string;
    // type CTString = string;
    // type CT = Map<CTHeader, CTString>;
    const toAdd = item.children.reduce((childAcc, child) => {
        const childToAdd = child.text.map((txts) => {
            return item.type + ' ' + serializeHeader(child.header.concat([txts].concat(item.href)));
        });
        return [...childAcc, ...childToAdd];
    }, []);
    return [
        ...acc,
        ...toAdd.map((ta) => ta)
    ];
}
function writeRemarkWikiMetadata(_config) {
    this.Compiler = compiler;
    function orphanToOutput(o) {
        return {
            href: o.identifier,
            type: NodeType.OrphanLink,
            children: o.children,
        };
    }
    function removeExtension(filename) {
        return filename.replace(/\.[^\.]+$/, '');
    }
    function headerToOutput(o) {
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
    // function getNewRootHeader(filename: string, rootHeader: string): string {
    //     if (!rootHeader) { rootHeader = removeExtension(filename); }
    //     if (mdh2fn(rootHeader) != removeExtension(filename)) {
    //         rootHeader = removeExtension(filename)
    //     }
    //     return rootHeader;
    // }
    function getNewRootHeader(filename, rootHeader) {
        let changed = false;
        if (!rootHeader) {
            rootHeader = removeExtension(filename);
            changed = true;
        }
        if (markdown_header_to_filename_1.default(rootHeader) != removeExtension(filename)) {
            changed = true;
            rootHeader = removeExtension(filename);
        }
        return [changed, rootHeader];
    }
    function headerHeaderReducer(filename, acc, header) {
        let h = header.text.slice(1);
        const [changed, newHeader] = getNewRootHeader(filename, header.text[0]);
        if (changed) {
            const warning = {
                type: NodeType.WarningHeaderToFilename,
                href: newHeader,
                children: [{ text: [header.text[0]], header: [], type: 'description' }]
            };
            acc = [...acc, warning];
        }
        h.unshift(newHeader);
        const o = { ...header, text: h };
        return [...acc,
            {
                href: o.text[o.text.length - 1],
                type: NodeType.Header,
                children: [{
                        type: 'description',
                        header: [],
                        text: o.text.slice(0, o.text.length - 1)
                    }]
            }
        ];
    }
    function linkHeaderMapper(filename, output) {
        const children = output.children.map((child) => {
            let h = child.header.slice(1);
            const [_, newHeader] = getNewRootHeader(filename, child.header[0]);
            h.unshift(newHeader);
            return { ...child, header: h };
        });
        return { ...output, children };
    }
    function compiler(tree) {
        const children = tree.children;
        const links = ((children || [])
            .filter(({ type }) => type == NodeType.Link));
        const headers = ((children || [])
            .filter(({ type }) => type == NodeType.Header));
        const orphanLinkRefs = ((children || [])
            .filter(({ type }) => type == NodeType.OrphanLink));
        let toReduce = [
            ...headers.reduce(headerHeaderReducer.bind(null, tree.filename), []),
            ...links.map(linkHeaderMapper.bind(null, tree.filename)),
            ...orphanLinkRefs.map(orphanToOutput).map(linkHeaderMapper.bind(null, tree.filename))
        ];
        const warnings = toReduce
            .filter((tr) => tr.type == NodeType.WarningHeaderToFilename)
            .map((warn) => {
            const text = warn.children.map((c) => c.text.join(", ")).join(",, ");
            return `WARNING: FILE: ${tree.filename}: BAD HEADING: ${text}`;
        });
        warnings.forEach((warn) => { process.stderr.write(warn + "\n"); });
        return toReduce
            .filter((tr) => tr.type != NodeType.WarningHeaderToFilename)
            .reduce(linkReducer, []).join("\n");
    }
}
exports.writeRemarkWikiMetadata = writeRemarkWikiMetadata;
