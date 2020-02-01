"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fsPromises = require('fs').promises;
function collectData(item) {
    let links = [];
    let linkRefs = [];
    let linkDefs = [];
    let headers = [];
    function record(item) {
        if (item.type == 'heading') {
            headers.push(item);
        }
        if (item.type == 'link') {
            links.push(item);
        }
        if (item.type == 'linkReference') {
            linkRefs.push(item);
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
        ar = [...ar, ...items];
    }
    return { links, linkRefs, linkDefs, headers };
}
function getWords(item) {
    let words = [];
    function record(item) {
        if (item.value) {
            words.push(item.value);
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
    return words.join("");
}
function processData({ headers, links, linkRefs, linkDefs }) {
    function normalizeUrl(url) {
        return url.replace(/^\.\//, '');
    }
    function sanitizeWord(w) {
        return w.toLowerCase().trim();
    }
    function pushInto(m, url, text) {
        const u = normalizeUrl(url);
        if (!m.hasOwnProperty(u)) {
            m[u] = {};
        }
        if (text.length) {
            m[u][text] = (m[u][text] || 0) + 1;
        }
    }
    let lnks = {};
    let orphanLinks = {};
    let identifierToUrl = new Map();
    links.forEach((item) => {
        item.title ? pushInto(lnks, item.url, item.title) : 0;
        pushInto(lnks, item.url, getWords(item));
    });
    linkDefs.forEach((ld) => {
        identifierToUrl.set(ld.identifier, ld.url);
        ld.title ? pushInto(lnks, ld.url, ld.title) : 0;
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
        headers: headers.map((h) => ({ depth: h.depth, text: getWords(h) }))
    };
}
var NodeType;
(function (NodeType) {
    NodeType["Link"] = "link";
    NodeType["Header"] = "header";
    NodeType["OrphanLink"] = "orphanLink";
})(NodeType || (NodeType = {}));
function outputLinkType(k, linkType) {
    let parents = [];
    for (const k in linkType) {
        if (!linkType.hasOwnProperty(k)) {
            continue;
        }
        let children = [];
        for (const kk in linkType[k] || {}) {
            children.push({ type: "text", text: kk || "", count: linkType[k][kk] || 0 });
        }
        parents.push({ type: NodeType.Link, href: k, children });
    }
    return parents;
}
function outputOrphanLinkRefs(orphanLinkRefs) {
    let parents = [];
    for (const k in orphanLinkRefs) {
        if (!orphanLinkRefs.hasOwnProperty(k)) {
            continue;
        }
        let children = [];
        for (const kk in orphanLinkRefs[k] || {}) {
            children.push({ type: "text", text: kk || "", count: orphanLinkRefs[k][kk] || 0 });
        }
        parents.push({ type: NodeType.OrphanLink, identifier: k, children });
    }
    return parents;
}
function organizeHeaders(headers) {
    let d = [];
    let h = [];
    function isLessEqual(depth) {
        return d.length == 0 ?
            false :
            depth <= d[d.length - 1];
    }
    return headers.map((header) => {
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
    });
}
assert_1.default.deepEqual([
    { type: "header", depth: 1, text: ["Main 1"] },
    { type: "header", depth: 2, text: ["Main 1", "Sub 1 1"] },
    { type: "header", depth: 1, text: ["Main 2"] },
    { type: "header", depth: 2, text: ["Main 2", "Sub 2 1"] },
    { type: "header", depth: 4, text: ["Main 2", "Sub 2 1", "Sub Sub 2 1 1 1"] },
    { type: "header", depth: 3, text: ["Main 2", "Sub 2 1", "Sub Sub 2 1 2"] }
], organizeHeaders([
    { depth: 1, text: "Main 1" },
    { depth: 2, text: "Sub 1 1" },
    { depth: 1, text: "Main 2" },
    { depth: 2, text: "Sub 2 1" },
    { depth: 4, text: "Sub Sub 2 1 1 1" },
    { depth: 3, text: "Sub Sub 2 1 2" },
]));
function collectRemarkWikiMetadata(_options) {
    return transformer;
    function headerMapper(headers) {
        return {
            type: "header",
            text: headers,
        };
    }
    function transformer(tree, vfile) {
        const r = processData(collectData(tree));
        // const theFile = path.resolve(vfile.path as string);
        let children = [];
        children = children
            .concat(outputLinkType("links", r.links))
            .concat(organizeHeaders(r.headers))
            .concat(outputOrphanLinkRefs(r.orphanLinkRefs));
        return { type: "root", children };
    }
}
exports.collectRemarkWikiMetadata = collectRemarkWikiMetadata;
function writeRemarkWikiMetadata(_config) {
    this.Compiler = compiler;
    function compiler(tree) {
        const children = tree.children;
        const childLinks = ((children || [])
            .filter(({ type }) => type == NodeType.Link));
        const childHeaders = ((children || [])
            .filter(({ type }) => type == NodeType.Header));
        const childOrphanLinks = ((children || [])
            .filter(({ type }) => type == NodeType.OrphanLink));
        const links = childLinks.map(({ href, children }) => {
            return {
                href,
                text: children.map(({ text, count }) => ({ text, count }))
            };
        });
        const orphanLinkRefs = childOrphanLinks.map(({ identifier, children }) => {
            return {
                identifier,
                text: children.map(({ text, count }) => ({ text, count }))
            };
        });
        const headers = childHeaders.map(({ text, depth }) => {
            return { text, depth };
        });
        return JSON.stringify({ links, orphanLinkRefs, headers });
    }
}
exports.writeRemarkWikiMetadata = writeRemarkWikiMetadata;
