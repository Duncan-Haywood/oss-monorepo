// A small XML reader for CFDI: keeps namespaces and non-ASCII attribute names (CFDI 4.0
// has `Año`), decodes the five entities and numeric references, rejects DTDs.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e]);
}

/** A small XML reader that keeps namespaces and non-ASCII attribute names (CFDI has
 * `Año`). Rejects DTDs and entity declarations. Returns {root, error}. Each node:
 * {name (local), prefix, ns, attrs, children, text}. */
export function parseCfdiXml(source) {
  const text = String(source).replace(/^﻿/, "");
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) throw new Error("DTD and entity declarations are not supported");
  const tokens = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[^>]+>|[^<]+/g) || [];
  const top = { name: "#root", children: [], text: "", nsmap: {} };
  const stack = [top];
  const attrRe = /([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  for (const tok of tokens) {
    if (tok.startsWith("<?") || tok.startsWith("<!--")) continue;
    const parent = stack[stack.length - 1];
    if (tok.startsWith("<![CDATA[")) { parent.text += tok.slice(9, -3); continue; }
    if (tok.startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
    if (tok.startsWith("<")) {
      const self = /\/\s*>$/.test(tok);
      const qname = tok.slice(1).split(/[\s/>]/, 1)[0];
      const raw = {};
      for (const m of tok.slice(1 + qname.length).matchAll(attrRe)) raw[m[1]] = decode(m[2] ?? m[3]);
      const nsmap = { ...parent.nsmap };
      const attrs = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k === "xmlns") nsmap[""] = v;
        else if (k.startsWith("xmlns:")) nsmap[k.slice(6)] = v;
      }
      for (const [k, v] of Object.entries(raw)) {
        if (k === "xmlns" || k.startsWith("xmlns:")) continue;
        attrs[k.includes(":") ? `${k.slice(0, k.indexOf(":"))}:${k.slice(k.indexOf(":") + 1)}` : k] = v;
      }
      const prefix = qname.includes(":") ? qname.slice(0, qname.indexOf(":")) : "";
      const node = { name: qname.slice(prefix ? prefix.length + 1 : 0), prefix, ns: nsmap[prefix] ?? "", attrs, children: [], text: "", nsmap };
      parent.children.push(node);
      if (!self) stack.push(node);
      continue;
    }
    parent.text += decode(tok);
  }
  const root = top.children.find((c) => c.name);
  return { root };
}
