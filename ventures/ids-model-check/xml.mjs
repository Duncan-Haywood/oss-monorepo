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
  let p = 0;
  if (text.charCodeAt(0) === 0xfeff) p = 1;
  const root = { name: "#document", local: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  while (p < text.length) {
    const lt = text.indexOf("<", p);
    if (lt < 0) break;
    if (lt > p) top().text += decodeEntities(text.slice(p, lt));
    if (text.startsWith("<!--", lt)) { p = text.indexOf("-->", lt) + 3; continue; }
    if (text.startsWith("<![CDATA[", lt)) {
      const e = text.indexOf("]]>", lt);
      top().text += text.slice(lt + 9, e);
      p = e + 3;
      continue;
    }
    if (text.startsWith("<?", lt)) { p = text.indexOf("?>", lt) + 2; continue; }
    if (text.startsWith("<!", lt)) { p = text.indexOf(">", lt) + 1; continue; }
    if (text[lt + 1] === "/") {
      const e = text.indexOf(">", lt);
      const name = text.slice(lt + 2, e).trim();
      const node = stack.pop();
      if (!node || node.name !== name) throw new Error(`mismatched </${name}>`);
      p = e + 1;
      continue;
    }
    const tag = /<([^\s/>]+)/y;
    tag.lastIndex = lt;
    const tm = tag.exec(text);
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
    const close = text.indexOf(">", q);
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
