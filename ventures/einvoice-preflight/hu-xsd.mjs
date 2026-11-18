// Structure and value checks for a Hungarian NAV Online Számla 3.0 InvoiceData
// document against NAV's own schema (invoiceData.xsd, invoiceBase.xsd and the
// NTCA common 1.0 common.xsd), read by build-hu-schema.mjs into hu-xsd-data.mjs.
// The interface specification (3.0, 2026.02.12, manageInvoice note 5) says the
// invoice data "must conform to the invoiceData.xsd schema"; a report that does not
// comes back from queryTransactionStatus as a technical validation message
// SCHEMA_VIOLATION (ERROR), and the invoice is ABORTED before any business rule.
//   HU-027 an element the schema does not allow here, or one too many
//   HU-028 elements out of sequence, or content the schema's model cannot place
//   HU-029 a required element missing
//   HU-030 a value outside its length / pattern / range / digits / code list
//   HU-031 a required attribute missing or a fixed one with another value
//   HU-032 an element written in the wrong namespace (base:taxpayerId written without
//          its base: prefix, or a data element given one); NAV's schema qualifies every
//          element, so to NAV it is a different element and the report is refused
// Messages name the element and the reason and never echo the value (tax numbers stay
// out of them).
import schema from "./hu-xsd-data.mjs";
import { makeSchemaChecker } from "./xsd-check.mjs";

const check = makeSchemaChecker(schema, {
  codes: { extra: "HU-027", order: "HU-028", missing: "HU-029", value: "HU-030", attr: "HU-031" },
  authority: "NAV", format: "invoiceData.xsd",
});

// Elements of the 2.0 schema that 3.0 dropped, with what replaced them. NAV's own
// API sample (sample/API sample/manageInvoice.xml) still carries privatePersonIndicator.
const RETIRED = {
  privatePersonIndicator: "Version 3.0 replaced privatePersonIndicator (2.0) with customerVatStatus, the first element of customerInfo: DOMESTIC, OTHER or PRIVATE_PERSON. For a private person give only customerVatStatus PRIVATE_PERSON.",
};

const NS_URI = {
  data: "http://schemas.nav.gov.hu/OSA/3.0/data",
  base: "http://schemas.nav.gov.hu/OSA/3.0/base",
  common: "http://schemas.nav.gov.hu/NTCA/1.0/common",
};
const NS_LABEL = Object.fromEntries(Object.entries(NS_URI).map(([k, v]) => [v, k]));

/** A tree of { name, ns, children } with each element's namespace resolved from xmlns declarations in scope. */
function namespacedTree(text) {
  const tokens = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>/g) || [];
  const root = { name: "#root", ns: "", children: [] };
  const stack = [{ node: root, scope: { xml: "http://www.w3.org/XML/1998/namespace" } }];
  for (const t of tokens) {
    if (t.startsWith("<?") || t.startsWith("<!")) continue;
    if (t.startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
    const scope = { ...stack[stack.length - 1].scope };
    for (const m of t.matchAll(/\sxmlns(?::([\w.-]+))?\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) scope[m[1] ?? ""] = m[2] ?? m[3];
    const qname = t.slice(1).match(/^[^\s/>]+/)[0];
    const i = qname.indexOf(":");
    const prefix = i < 0 ? "" : qname.slice(0, i);
    const node = { name: i < 0 ? qname : qname.slice(i + 1), ns: scope[prefix] ?? (prefix ? null : ""), prefix, children: [] };
    stack[stack.length - 1].node.children.push(node);
    if (!t.endsWith("/>")) stack.push({ node, scope });
  }
  return root;
}

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

const nsName = (uri) => (uri === null ? "an undeclared prefix" : uri === "" ? "no namespace" : Object.hasOwn(NS_LABEL, uri) ? `the ${NS_LABEL[uri]} namespace` : "a namespace NAV's schema does not use");

function checkNamespaces(text, path) {
  const out = [];
  const top = namespacedTree(text).children.find((c) => c.name === "InvoiceData");
  if (!top) return out;
  if (top.ns !== NS_URI.data) {
    out.push({ rule: "HU-032", message: `InvoiceData is in ${nsName(top.ns)}, not ${NS_URI.data} (NAV SCHEMA_VIOLATION).`,
      fix: `Declare xmlns="${NS_URI.data}" on InvoiceData (and xmlns:base and xmlns:common for the elements that use them).`, path });
    return out;
  }
  const walk = (node, type, at) => {
    const allowed = elements(type);
    const counts = new Map();
    for (const c of node.children) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    const seen = new Map();
    for (const c of node.children) {
      const n = (seen.get(c.name) ?? 0) + 1;
      seen.set(c.name, n);
      const where = counts.get(c.name) > 1 ? `${at}/${c.name}[${n}]` : `${at}/${c.name}`;
      const e = allowed.get(c.name);
      if (!e) continue; // HU-027 already names it
      const want = Object.hasOwn(NS_URI, e.ns) ? NS_URI[e.ns] : null;
      if (c.ns !== want) {
        const prefixHint = e.ns === "data" ? "the default namespace (no prefix)" : `the ${e.ns}: prefix (xmlns:${e.ns}="${want}")`;
        out.push({ rule: "HU-032", message: `${c.name} inside ${node.name} is in ${nsName(c.ns)}; NAV's schema puts it in the ${e.ns} namespace (NAV SCHEMA_VIOLATION).`,
          fix: `Write ${c.name} with ${prefixHint}.`, path: where });
        continue;
      }
      if (schema.complex[e.type]) walk(c, e.type, where);
    }
  };
  walk(top, schema.root, path);
  return out;
}

/**
 * @param root the InvoiceData node from parseXmlTree; findings carry NAV's code in the message.
 * @param text the document text, for the namespace check (HU-032); omitted, that check is skipped.
 */
export function checkAgainstNavSchema(root, path = "/InvoiceData", text = "") {
  const ns = text ? checkNamespaces(text, path) : [];
  return [...ns, ...check(root, path).map((f) => {
    const name = f.path.split("/").pop();
    const fix = f.rule === "HU-027" && Object.hasOwn(RETIRED, name) ? RETIRED[name] : f.fix;
    return { ...f, fix, message: `${f.message} (NAV SCHEMA_VIOLATION)` };
  })];
}

export const NAV_SCHEMA_SOURCE = schema.source;
