// A small XML reader, enough for IDS files: elements, attributes, text, CDATA,
// comments, processing instructions and the five predefined entities plus
// numeric character references. Namespace prefixes are kept in `name` and
// stripped in `local`. No DTD support (IDS files have none).
//
// parseXml(text) -> root node {name, local, attrs, children, text}
// parseXml(text, { onClose, spans }): onClose(node, stack) is called as each
//   element closes, with its open ancestors (stack[0] is the document); when
//   it returns true the element is dropped from its parent, so a caller that
//   reads each subtree as it closes never holds the whole tree (the ifcXML
//   reader, eval/lazy-ifcxml-2026-11-18.md). With spans: true each node gets
//   `at` and `end`, its start and end offsets in text, plus `base` when the
//   text is a slice of a larger one (eval/ifc4-layout-scale-2026-11-18.md).
//
// White space between elements is not kept: once an element has a child
// element, a text run of only XML white space (space, tab, CR, LF) in it is
// skipped without being decoded, and white space it held before its first
// child is dropped. An element with no child element keeps its text exactly,
// so <Name> </Name> is still one space. Text with anything else in it, CDATA
// and character references (&#32;) are kept as written. Mixed content (text
// and elements side by side) loses only the white-space-only runs between
// elements, which neither IDS nor ifcXML uses (eval/xml-whitespace-2026-11-18.md).

// True when text[from..to) is only XML white space.
function wsOnly(text, from, to) {
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i);
    if (c !== 32 && c !== 10 && c !== 13 && c !== 9) return false;
  }
  return true;
}
const allWs = (s) => wsOnly(s, 0, s.length);

const ENT = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (all, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? all;
  });
}

export function parseXml(text, opts = {}) {
  if (text instanceof Uint8Array) return parseXmlBytes(text, opts);
  const { onClose, spans } = opts;
  const base = opts.base || 0;
  // Every construct must be closed: a truncated file (an upload cut short, a
  // half-written commit) once sent indexOf's -1 back to the start and looped
  // forever, freezing the page or hanging a CI job.
  const upTo = (what, from, label) => {
    const i = text.indexOf(what, from);
    if (i < 0) throw new Error(`unterminated ${label} at character ${from}`);
    return i;
  };
  let p = 0;
  if (text.charCodeAt(0) === 0xfeff) p = 1;
  const root = { name: "#document", local: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  // had[d]: the open element at depth d has had a child element (onClose may
  // have dropped it since, so children.length cannot say).
  const had = [false];
  const top = () => stack[stack.length - 1];
  while (p < text.length) {
    const lt = text.indexOf("<", p);
    if (lt < 0) break;
    if (lt > p && !(had[stack.length - 1] && wsOnly(text, p, lt))) top().text += decodeEntities(text.slice(p, lt));
    if (text.startsWith("<!--", lt)) { p = upTo("-->", lt + 4, "comment") + 3; continue; }
    if (text.startsWith("<![CDATA[", lt)) {
      const e = upTo("]]>", lt + 9, "CDATA section");
      top().text += text.slice(lt + 9, e);
      p = e + 3;
      continue;
    }
    if (text.startsWith("<?", lt)) { p = upTo("?>", lt + 2, "processing instruction") + 2; continue; }
    if (text.startsWith("<!", lt)) { p = upTo(">", lt + 2, "declaration") + 1; continue; }
    if (text[lt + 1] === "/") {
      const e = upTo(">", lt, "end tag");
      const name = text.slice(lt + 2, e).trim();
      const node = stack.pop();
      had.pop();
      if (!node || node.name !== name || !stack.length) throw new Error(`mismatched </${name}>`);
      p = e + 1;
      if (spans) node.end = p + base;
      if (onClose && onClose(node, stack)) top().children.pop();
      continue;
    }
    const tag = /<([^\s/>]+)/y;
    tag.lastIndex = lt;
    const tm = tag.exec(text);
    if (!tm) throw new Error(`a "<" with no element name at character ${lt}`);
    const name = tm[1];
    let q = tag.lastIndex;
    const attrs = {};
    const attr = /\s*([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/y;
    for (;;) {
      attr.lastIndex = q;
      const am = attr.exec(text);
      if (!am) break;
      attrs[am[1]] = decodeEntities(am[3] ?? am[4]);
      q = attr.lastIndex;
    }
    const close = upTo(">", q, `<${name}> start tag`);
    const selfClosing = text[close - 1] === "/";
    const node = { name, local: name.includes(":") ? name.slice(name.indexOf(":") + 1) : name, attrs, children: [], text: "" };
    const parent = top();
    if (!had[stack.length - 1]) { had[stack.length - 1] = true; if (parent.text && allWs(parent.text)) parent.text = ""; }
    parent.children.push(node);
    p = close + 1;
    if (spans) { node.at = lt + base; node.end = p + base; }
    if (!selfClosing) { stack.push(node); had.push(false); }
    else if (onClose && onClose(node, stack)) top().children.pop();
  }
  if (stack.length !== 1) throw new Error(`unclosed <${top().name}>`);
  const el = root.children.find((c) => c.local);
  if (!el) throw new Error("no root element");
  return el;
}

// parseXmlBytes(bytes, opts): the same reader over a Uint8Array (a Node
// Buffer, or a browser File's arrayBuffer), so a large ifcXML model is never
// one string on the heap (eval/ifcxml-bytes-2026-11-18.md). Every byte the
// reader looks for (<, >, /, =, quotes, !, ?, ASCII white space) is ASCII,
// which never occurs inside a UTF-8 multi-byte character, so each name,
// attribute value and text run is decoded alone and holds the same
// characters as the whole file decoded and sliced. Offsets (`at`, `end`,
// error positions) are byte offsets. White space is ASCII white space; the
// string reader's \s also takes Unicode spaces inside a start tag, which no
// XML name may hold.
const LT = 60, GT = 62, SLASH = 47, EQ = 61, DQ = 34, SQ = 39, BANG = 33, QM = 63;
const isWs = (c) => c === 32 || (c >= 9 && c <= 13);
const enc = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
const B_COMMENT = enc("<!--"), B_COMMENT_END = enc("-->"), B_CDATA = enc("<![CDATA["), B_CDATA_END = enc("]]>"), B_PI_END = enc("?>");

function bytesDecoder(b) {
  if (typeof b.utf8Slice === "function") return (s, e) => b.utf8Slice(s, e); // Node Buffer
  if (typeof globalThis.Buffer === "function") {
    const nb = globalThis.Buffer.from(b.buffer, b.byteOffset, b.length);
    return (s, e) => nb.utf8Slice(s, e);
  }
  const td = new TextDecoder();
  return (s, e) => td.decode(b.subarray(s, e));
}

function wsBytes(b, from, to) {
  for (let i = from; i < to; i++) {
    const c = b[i];
    if (c !== 32 && c !== 10 && c !== 13 && c !== 9) return false;
  }
  return true;
}

function startsAt(b, i, seq) {
  if (i + seq.length > b.length) return false;
  for (let k = 0; k < seq.length; k++) if (b[i + k] !== seq[k]) return false;
  return true;
}

function seqIndex(b, seq, from) {
  for (let i = from; ; i++) {
    i = b.indexOf(seq[0], i);
    if (i < 0) return -1;
    if (startsAt(b, i, seq)) return i;
  }
}

export function parseXmlBytes(b, opts = {}) {
  const { onClose, spans } = opts;
  const base = opts.base || 0;
  const dec = bytesDecoder(b);
  const n = b.length;
  const upTo = (what, from, label) => {
    const i = typeof what === "number" ? b.indexOf(what, from) : seqIndex(b, what, from);
    if (i < 0) throw new Error(`unterminated ${label} at byte ${from}`);
    return i;
  };
  let p = 0;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) p = 3;
  const root = { name: "#document", local: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  const had = [false]; // as in parseXml
  const top = () => stack[stack.length - 1];
  while (p < n) {
    const lt = b.indexOf(LT, p);
    if (lt < 0) break;
    if (lt > p && !(had[stack.length - 1] && wsBytes(b, p, lt))) top().text += decodeEntities(dec(p, lt));
    const c1 = b[lt + 1];
    if (c1 === BANG) {
      if (startsAt(b, lt, B_COMMENT)) { p = upTo(B_COMMENT_END, lt + 4, "comment") + 3; continue; }
      if (startsAt(b, lt, B_CDATA)) {
        const e = upTo(B_CDATA_END, lt + 9, "CDATA section");
        top().text += dec(lt + 9, e);
        p = e + 3;
        continue;
      }
      p = upTo(GT, lt + 2, "declaration") + 1;
      continue;
    }
    if (c1 === QM) { p = upTo(B_PI_END, lt + 2, "processing instruction") + 2; continue; }
    if (c1 === SLASH) {
      const e = upTo(GT, lt, "end tag");
      const name = dec(lt + 2, e).trim();
      const node = stack.pop();
      had.pop();
      if (!node || node.name !== name || !stack.length) throw new Error(`mismatched </${name}>`);
      p = e + 1;
      if (spans) node.end = p + base;
      if (onClose && onClose(node, stack)) top().children.pop();
      continue;
    }
    let q = lt + 1;
    while (q < n) { const c = b[q]; if (isWs(c) || c === SLASH || c === GT) break; q++; }
    if (q === lt + 1) throw new Error(`a "<" with no element name at byte ${lt}`);
    const name = dec(lt + 1, q);
    const attrs = {};
    for (;;) {
      let i = q;
      while (i < n && isWs(b[i])) i++;
      const ns = i;
      while (i < n) { const c = b[i]; if (isWs(c) || c === EQ || c === SLASH || c === GT) break; i++; }
      if (i === ns) break;
      const ne = i;
      while (i < n && isWs(b[i])) i++;
      if (b[i] !== EQ) break;
      i++;
      while (i < n && isWs(b[i])) i++;
      const quote = b[i];
      if (quote !== DQ && quote !== SQ) break;
      const ve = b.indexOf(quote, i + 1);
      if (ve < 0) break;
      attrs[dec(ns, ne)] = decodeEntities(dec(i + 1, ve));
      q = ve + 1;
    }
    const close = upTo(GT, q, `<${name}> start tag`);
    const selfClosing = b[close - 1] === SLASH;
    const node = { name, local: name.includes(":") ? name.slice(name.indexOf(":") + 1) : name, attrs, children: [], text: "" };
    const parent = top();
    if (!had[stack.length - 1]) { had[stack.length - 1] = true; if (parent.text && allWs(parent.text)) parent.text = ""; }
    parent.children.push(node);
    p = close + 1;
    if (spans) { node.at = lt + base; node.end = p + base; }
    if (!selfClosing) { stack.push(node); had.push(false); }
    else if (onClose && onClose(node, stack)) top().children.pop();
  }
  if (stack.length !== 1) throw new Error(`unclosed <${top().name}>`);
  const el = root.children.find((c) => c.local);
  if (!el) throw new Error("no root element");
  return el;
}

export const kids = (node, local) => (node ? node.children.filter((c) => c.local === local) : []);
export const kid = (node, local) => (node ? node.children.find((c) => c.local === local) : undefined);
