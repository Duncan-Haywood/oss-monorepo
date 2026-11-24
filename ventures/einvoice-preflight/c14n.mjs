// A namespace-aware XML reader and Canonical XML 1.1 (inclusive, without comments)
// serializer, synchronous and dependency-free so it runs in the browser page as well
// as in Node. Written for ZATCA's invoice hash (zatca-stamp.mjs): ZATCA hashes the
// invoice with three subtrees taken out (ext:UBLExtensions, cac:Signature and the QR
// AdditionalDocumentReference) and the rest canonicalized with C14N 1.1.
//
// Scope, stated so nobody leans on it for more: no DTD or entity declarations (they
// are refused, as in ubl.mjs), no xml:base fix-up (C14N 1.1's one change from 1.0
// that matters only when an ancestor of the output is omitted, which a subtree
// removal never does), and processing instructions inside the root element are kept.

const XML_NS = "http://www.w3.org/XML/1998/namespace";

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, ref) => {
    if (ref[0] === "#") return codePointOr(ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[ref];
  });
}

// Attribute-value normalization (XML 1.0 section 3.3.3, CDATA type): a literal tab,
// newline or carriage return becomes a space; a character reference keeps its char.
function normalizeAttr(raw) {
  return decodeEntities(raw.replace(/[\t\n\r]/g, " "));
}

/**
 * Parse XML text into element nodes:
 * { type: "element", qname, prefix, local, ns, nsDecls: Map(prefix -> uri), attrs: [{qname, prefix, local, ns, value}], children, parent }
 * Text nodes are { type: "text", value } (CDATA folded in); comments are dropped;
 * PIs are { type: "pi", value: "<?...?>" }.
 */
export function parseXmlDom(source) {
  let text = typeof source === "string" ? source : new TextDecoder().decode(source);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) throw new Error("DTD and entity declarations are not supported");
  text = text.replace(/\r\n?/g, "\n");
  const tokens = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?(?:[^>"']|"[^"]*"|'[^']*')+>|[^<]+/g) || [];
  const doc = { type: "document", children: [], parent: null };
  let current = doc;
  const scope = (node, prefix) => {
    for (let n = node; n && n.type === "element"; n = n.parent) if (n.nsDecls.has(prefix)) return n.nsDecls.get(prefix);
    if (prefix === "xml") return XML_NS;
    return prefix === "" ? "" : null;
  };
  for (const token of tokens) {
    if (token.startsWith("<!--")) continue;
    if (token.startsWith("<![CDATA[")) {
      if (current !== doc) current.children.push({ type: "text", value: token.slice(9, -3) });
      continue;
    }
    if (token.startsWith("<?")) {
      if (/^<\?xml[\s?]/.test(token)) continue;
      current.children.push({ type: "pi", value: token });
      continue;
    }
    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim();
      if (current.type !== "element" || current.qname !== name) throw new Error(`Mismatched end tag </${name}>`);
      current = current.parent;
      continue;
    }
    if (token.startsWith("<")) {
      const selfClosing = token.endsWith("/>");
      const body = token.slice(1, selfClosing ? -2 : -1);
      const qname = body.match(/^[^\s/>]+/)[0];
      const node = { type: "element", qname, nsDecls: new Map(), attrs: [], children: [], parent: current };
      const attrPattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      const rest = body.slice(qname.length);
      let m;
      const raw = [];
      while ((m = attrPattern.exec(rest))) raw.push([m[1], normalizeAttr(m[2] !== undefined ? m[2] : m[3])]);
      for (const [name, value] of raw) {
        if (name === "xmlns") node.nsDecls.set("", value);
        else if (name.startsWith("xmlns:")) node.nsDecls.set(name.slice(6), value);
      }
      const colon = qname.indexOf(":");
      node.prefix = colon === -1 ? "" : qname.slice(0, colon);
      node.local = colon === -1 ? qname : qname.slice(colon + 1);
      node.ns = scope(node, node.prefix);
      if (node.ns === null) throw new Error(`Unbound prefix ${node.prefix} on <${qname}>`);
      for (const [name, value] of raw) {
        if (name === "xmlns" || name.startsWith("xmlns:")) continue;
        const c = name.indexOf(":");
        const prefix = c === -1 ? "" : name.slice(0, c);
        const ns = prefix === "" ? "" : scope(node, prefix);
        if (ns === null) throw new Error(`Unbound prefix ${prefix} on attribute ${name}`);
        node.attrs.push({ qname: name, prefix, local: c === -1 ? name : name.slice(c + 1), ns, value });
      }
      current.children.push(node);
      if (!selfClosing) current = node;
      continue;
    }
    if (current !== doc) current.children.push({ type: "text", value: decodeEntities(token) });
  }
  if (current !== doc) throw new Error(`Unclosed element <${current.qname}>`);
  const root = doc.children.find((c) => c.type === "element");
  if (!root) throw new Error("No root element");
  doc.root = root;
  return doc;
}

const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");

/**
 * Canonical XML 1.1 (no comments) of the document, leaving out every element for which
 * `omit(node)` is true together with its subtree. Text beside an omitted element stays,
 * as it does under an XPath filter transform. With `exclusive`, `inclusivePrefixes`
 * is the InclusiveNamespaces PrefixList ("" for #default).
 */
export function canonicalize(doc, omit = () => false, { exclusive = false, selfClose = false, inclusivePrefixes = [] } = {}) {
  const out = [];
  // In-scope namespaces of the nearest output ancestor, as rendered.
  const walk = (node, rendered) => {
    if (node.type === "text") { out.push(escText(node.value)); return; }
    if (node.type === "pi") { out.push(node.value); return; }
    if (omit(node)) return;
    // In-scope namespace declarations at this element.
    const inScope = new Map(rendered.inScope);
    for (const [p, uri] of node.nsDecls) inScope.set(p, uri);
    const emit = [];
    // Exclusive C14N renders only the prefixes this element and its attributes use.
    // An InclusiveNamespaces PrefixList names prefixes rendered as inclusive C14N would.
    const used = exclusive ? new Set([node.prefix, ...node.attrs.filter((a) => a.prefix).map((a) => a.prefix), ...inclusivePrefixes]) : null;
    for (const [p, uri] of inScope) {
      if (used && !used.has(p)) continue;
      if (p === "xml") continue;
      const before = rendered.out.has(p) ? rendered.out.get(p) : (p === "" ? "" : undefined);
      if (before === uri) continue;
      if (p === "" && uri === "" && before === undefined) continue;
      emit.push([p, uri]);
    }
    emit.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const attrs = node.attrs.slice().sort((a, b) => (a.ns !== b.ns ? (a.ns < b.ns ? -1 : 1) : a.local < b.local ? -1 : a.local > b.local ? 1 : 0));
    let s = `<${node.qname}`;
    for (const [p, uri] of emit) s += p === "" ? ` xmlns="${escAttr(uri)}"` : ` xmlns:${p}="${escAttr(uri)}"`;
    for (const a of attrs) s += ` ${a.qname}="${escAttr(a.value)}"`;
    // selfClose is not C14N: ZATCA's SDK digests SignedProperties with empty
    // elements written <x/>, and it is offered only for that comparison.
    if (selfClose && !node.children.length) { out.push(s + "/>"); return; }
    out.push(s + ">");
    const outNs = new Map(rendered.out);
    for (const [p, uri] of emit) outNs.set(p, uri);
    for (const child of node.children) walk(child, { inScope, out: outNs });
    out.push(`</${node.qname}>`);
  };
  const parts = [];
  for (const child of doc.children) {
    if (child.type === "element") { out.length = 0; walk(child, { inScope: new Map(), out: new Map() }); parts.push(out.join("")); }
    else if (child.type === "pi") parts.push(child.value);
  }
  return parts.join("\n");
}

/** C14N of one element's subtree (no ancestors), inclusive with the namespaces in scope
 * at it, or exclusive (only the prefixes each element visibly uses). */
export function canonicalizeElement(node, { exclusive = false, selfClose = false } = {}) {
  const inherited = new Map();
  for (let n = node.parent; n && n.type === "element"; n = n.parent) for (const [p, uri] of n.nsDecls) if (!inherited.has(p)) inherited.set(p, uri);
  const copy = { ...node, nsDecls: new Map([...inherited, ...node.nsDecls]), parent: null };
  return canonicalize({ type: "document", children: [copy] }, () => false, { exclusive, selfClose });
}

export function childElements(node, ns, local) {
  return node.children.filter((c) => c.type === "element" && (local === undefined || c.local === local) && (ns === undefined || c.ns === ns));
}

export function textOf(node) {
  if (!node) return "";
  if (node.type === "text") return node.value;
  return node.children.map(textOf).join("");
}

// A character reference or escape past U+10FFFF (or not a number) becomes U+FFFD,
// as HTML parsers do, instead of throwing a RangeError on a stranger's input.
function codePointOr(n) { return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\uFFFD"; }
