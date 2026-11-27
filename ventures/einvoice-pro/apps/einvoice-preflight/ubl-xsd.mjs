// Structure and value checks for a UBL 2.1 Invoice or CreditNote against the OASIS
// UBL 2.1 schema, read by build-ubl-schema.mjs into ubl-xsd-data.mjs. Every receiving
// validator runs the schema before any business rule (KoSIT's XRechnung validator,
// Peppol access points, phive): a file that breaks it is refused whatever its Schematron
// result.
//   UBL-XSD-01 an element the schema does not allow here, or one too many
//   UBL-XSD-02 elements out of sequence, or content the schema's model cannot place
//   UBL-XSD-03 a required element missing
//   UBL-XSD-04 a value that is not of the element's type (a number, date, time,
//              true/false or base64 data the schema cannot read)
//   UBL-XSD-05 an attribute: a required one missing (currencyID on an amount, unitCode on
//              a measure, mimeCode on an attachment) or one the schema does not declare
//   UBL-XSD-06 an element in the wrong namespace (a cbc: element written with cac:, or the
//              root without the Invoice-2 / CreditNote-2 namespace)
//   UBL-XSD-07 the XML is not well formed (a cut-off file, a mismatched tag)
// Not checked: what sits inside a UBL extension (ExtensionContent is "lax": it must
// hold one element from another namespace, and that element is not looked into), and
// xsi:type. Messages name the element and the reason and never echo the value.
import schema from "./ubl-xsd-data.mjs";
import { wellFormed } from "./fatturapa-xsd.mjs";
import { makeSchemaChecker } from "./xsd-check.mjs";
import { stripXmlNoise } from "./xml-text.mjs";

const finding = (rule, message, fix, path) => ({ rule, message, fix, path });
const NS = schema.namespaces;
const ROOT_NS = { Invoice: NS.inv, CreditNote: NS.cn };
const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const XSI_OK = new Set(["schemaLocation", "noNamespaceSchemaLocation"]);
const codes = { extra: "UBL-XSD-01", order: "UBL-XSD-02", missing: "UBL-XSD-03", value: "UBL-XSD-04", attr: "UBL-XSD-05" };

const checkers = Object.fromEntries(Object.entries(schema.roots).map(([name, root]) => [name,
  makeSchemaChecker({ ...schema, root }, { codes, authority: "a validator that runs the UBL 2.1 schema", format: "UBL 2.1" })]));

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g, (m, hex, dec, named) =>
  named ? ENTITY[named] : String.fromCodePoint(hex ? parseInt(hex, 16) : Number(dec)));

/**
 * A tree of { name, ns, text, attrs, raw, children }: names are local, `ns` is the element's
 * namespace from the xmlns declarations in scope, `attrs` holds the unprefixed attributes
 * (the ones UBL declares), `raw` every attribute as [prefix, local, namespace].
 */
export function namespacedTree(text) {
  const tokens = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?[^>]+>|[^<]+/g) || [];
  const root = { name: "#root", ns: "", text: "", attrs: {}, raw: [], children: [] };
  const stack = [{ node: root, scope: { xml: "http://www.w3.org/XML/1998/namespace" } }];
  for (const t of tokens) {
    const top = stack[stack.length - 1];
    if (t.startsWith("<![CDATA[")) { top.node.text += t.slice(9, -3); continue; }
    if (t.startsWith("<?") || t.startsWith("<!")) continue;
    if (!t.startsWith("<")) { top.node.text += decode(t); continue; }
    if (t.startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
    const scope = { ...top.scope };
    const pairs = [...t.matchAll(/\s([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], decode(m[2] ?? m[3])]);
    for (const [k, v] of pairs) {
      if (k === "xmlns") scope[""] = v;
      else if (k.startsWith("xmlns:")) scope[k.slice(6)] = v;
    }
    const qname = t.slice(1).match(/^[^\s/>]+/)[0];
    const i = qname.indexOf(":");
    const prefix = i < 0 ? "" : qname.slice(0, i);
    const node = { name: i < 0 ? qname : qname.slice(i + 1), ns: scope[prefix] ?? (prefix ? null : ""), text: "", attrs: {}, raw: [], children: [] };
    for (const [k, v] of pairs) {
      if (k === "xmlns" || k.startsWith("xmlns:")) continue;
      const j = k.indexOf(":");
      if (j < 0) { node.attrs[k] = v; node.raw.push(["", k, ""]); }
      else node.raw.push([k.slice(0, j), k.slice(j + 1), scope[k.slice(0, j)] ?? null]);
    }
    top.node.children.push(node);
    if (!t.endsWith("/>")) stack.push({ node, scope });
  }
  return root;
}

const nsName = (uri) => {
  if (uri === null) return "an undeclared prefix";
  if (uri === "") return "no namespace";
  const key = Object.keys(NS).find((k) => NS[k] === uri);
  return key ? `the ${key}: namespace` : "a namespace UBL does not use";
};

const elementsOf = new Map();
function elements(type) {
  let m = elementsOf.get(type);
  if (m) return m;
  m = new Map();
  const walk = (p) => { if (!p) return; if (p.k === "e") { if (!m.has(p.name)) m.set(p.name, p); } else p.items.forEach(walk); };
  walk(schema.complex[type]?.model);
  elementsOf.set(type, m);
  return m;
}

/** UBL-XSD-05 (undeclared attributes) and UBL-XSD-06 (namespaces): what the local-name checker cannot see. */
function namespaceAndAttributeFindings(top, type, path) {
  const out = [];
  const attrsOk = (node, t, at) => {
    const declared = new Set((schema.complex[t]?.attrs ?? []).map((a) => a.name));
    for (const [prefix, local, uri] of node.raw) {
      if (!prefix && declared.has(local)) continue;
      if (prefix && uri === XSI && XSI_OK.has(local)) continue;
      if (prefix && uri === XSI && local === "type") continue; // not modelled; see the header
      const shown = prefix ? `${prefix}:${local}` : local;
      out.push(finding("UBL-XSD-05", `${node.name} has an attribute ${shown} that the UBL 2.1 schema does not declare on it.`,
        declared.size ? `Remove ${shown}; ${node.name} takes only ${[...declared].join(", ")}.` : `Remove ${shown}; ${node.name} takes no attributes.`, at));
    }
  };
  const walk = (node, t, at) => {
    attrsOk(node, t, at);
    const def = schema.complex[t];
    if (def?.any) {
      for (const c of node.children) {
        if (c.ns === NS.ext || c.ns === "" || c.ns === null) {
          out.push(finding("UBL-XSD-06", `The content of ${node.name} is in ${nsName(c.ns)}; an extension's content must be in its own namespace.`,
            `Give ${c.name} the extension's own namespace (declared with xmlns on it).`, `${at}/${c.name}`));
        }
      }
      return;
    }
    const allowed = elements(t);
    const counts = new Map();
    for (const c of node.children) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    const seen = new Map();
    for (const c of node.children) {
      const n = (seen.get(c.name) ?? 0) + 1;
      seen.set(c.name, n);
      const where = counts.get(c.name) > 1 ? `${at}/${c.name}[${n}]` : `${at}/${c.name}`;
      const e = allowed.get(c.name);
      if (!e) continue; // UBL-XSD-01 names it
      const want = NS[e.ns];
      if (c.ns !== want) {
        out.push(finding("UBL-XSD-06", `${c.name} inside ${node.name} is in ${nsName(c.ns)}; UBL 2.1 puts it in the ${e.ns}: namespace.`,
          `Write it as ${e.ns}:${c.name}, with xmlns:${e.ns}="${want}" declared.`, where));
        continue;
      }
      walk(c, e.type, where);
    }
  };
  walk(top, type, path);
  return out;
}

/** The UBL root of a document: Invoice or CreditNote, or null when the file is something else. */
export function ublRoot(text) {
  const m = /<(?:[\w.-]+:)?(Invoice|CreditNote)[\s>/]/.exec(stripXmlNoise(text, { pi: true }));
  if (!m) return null;
  const top = namespacedTree(text).children[0];
  if (!top || !Object.hasOwn(ROOT_NS, top.name)) return null;
  return top;
}

/** True when the document's root is a UBL 2.1 Invoice or CreditNote in its own namespace. */
export function looksLikeUblDocument(text) {
  const top = ublRoot(text);
  return Boolean(top && top.ns === ROOT_NS[top.name]);
}

/**
 * Checks a UBL Invoice or CreditNote document's text against the UBL 2.1 schema.
 * @returns findings, or [] when the root is not Invoice or CreditNote.
 */
export function checkAgainstUblSchema(text) {
  const top = ublRoot(text);
  if (!top) return [];
  const path = `/${top.name}`;
  if (!wellFormed(text)) {
    return [finding("UBL-XSD-07", "The XML is not well formed: a tag is never closed or closes out of order, which is what a cut-off file looks like.",
      "Re-export the file; if it was edited by hand, close every tag in the order it was opened.", path)];
  }
  if (top.ns !== ROOT_NS[top.name]) {
    return [finding("UBL-XSD-06", `${top.name} is in ${nsName(top.ns)}, not ${ROOT_NS[top.name]}, so no UBL validator reads it as a UBL ${top.name}.`,
      `Declare xmlns="${ROOT_NS[top.name]}" on ${top.name}.`, path)];
  }
  const type = schema.roots[top.name];
  return [...namespaceAndAttributeFindings(top, type, path), ...checkers[top.name](top, path)];
}

export const UBL_SCHEMA_SOURCE = schema.source;
