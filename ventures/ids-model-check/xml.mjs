// A small XML reader, enough for IDS files: elements, attributes, text, CDATA,
// comments, processing instructions and the five predefined entities plus
// numeric character references. Namespace prefixes are kept in `name` and
// stripped in `local`. No DTD support (IDS files have none).
//
// parseXml(text) -> root node {name, local, attrs, children, text}

const ENT = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (all, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? all;
  });
}

export function parseXml(text) {
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
  const top = () => stack[stack.length - 1];
  while (p < text.length) {
    const lt = text.indexOf("<", p);
    if (lt < 0) break;
    if (lt > p) top().text += decodeEntities(text.slice(p, lt));
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
      if (!node || node.name !== name) throw new Error(`mismatched </${name}>`);
      p = e + 1;
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
    top().children.push(node);
    if (!selfClosing) stack.push(node);
    p = close + 1;
  }
  if (stack.length !== 1) throw new Error(`unclosed <${top().name}>`);
  const el = root.children.find((c) => c.local);
  if (!el) throw new Error("no root element");
  return el;
}

export const kids = (node, local) => (node ? node.children.filter((c) => c.local === local) : []);
export const kid = (node, local) => (node ? node.children.find((c) => c.local === local) : undefined);
