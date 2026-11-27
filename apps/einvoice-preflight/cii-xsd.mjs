// Structure and value checks for a UN/CEFACT Cross Industry Invoice (XRechnung
// CII, Factur-X / ZUGFeRD EN 16931 and BASIC) against the D16B schema subset
// that CEN publishes with EN 16931, read by build-cii-schema.mjs. The XSD is the
// first gate a validator applies (the KoSIT validator for XRechnung, the
// Factur-X checker, a Peppol or Chorus Pro platform): a file that fails it is
// refused before any business rule runs.
//   CII-001 an element the schema does not allow here, or one too many
//   CII-002 elements out of sequence
//   CII-003 a required element missing
//   CII-004 a value outside its type (a number, a date, a true/false, a length)
//   CII-005 an attribute with a fixed value written with another one
//   CII-006 the XML is not well formed (a cut-off file, a mismatched tag)
//   CII-007 an element in the wrong namespace (udt:DateTimeString where the
//           schema wants qdt:DateTimeString, BT-26's classic slip)
// Messages name the element and the reason and never echo the value.
//
// What it does not check: code lists (the uncoupled
// schema leaves them to the EN 16931 Schematron), and files declared as
// EXTENDED, MINIMUM or BASIC WL, or as an extension ("#conformant#"): those
// profiles have their own schemas, and the EN 16931 subset would wrongly refuse
// an EXTENDED file's extra elements. schemaApplies() says which files it takes.
import schema from "./cii-xsd-data.mjs";
import { wellFormed } from "./fatturapa-xsd.mjs";
import { parseXmlTree } from "./ubl.mjs";
import { makeSchemaChecker } from "./xsd-check.mjs";

export const CII_SCHEMA_RULES = ["CII-001", "CII-002", "CII-003", "CII-004", "CII-005", "CII-006", "CII-007"];

const PREFIX_OF = new Map(Object.entries(schema.namespaces).map(([k, uri]) => [uri, k]));
const NAMESPACE_NAMES = Object.fromEntries(Object.entries(schema.namespaces).map(([k, uri]) => [k, `${k} (${uri})`]));

const finding = (rule, message, fix, path) => ({ rule, message, fix, path, source: "xsd" });

const checkCii = makeSchemaChecker(schema, {
  codes: { extra: "CII-001", order: "CII-002", missing: "CII-003", value: "CII-004", attr: "CII-005", ns: "CII-007" },
  namespaceNames: NAMESPACE_NAMES,
  authority: "a validator checking the EN 16931 CII schema (KoSIT for XRechnung, a Factur-X or Chorus Pro check)",
  format: "the CII D16B schema",
});

/**
 * Whether the EN 16931 subset schema governs a file with this specification identifier (BT-24).
 * EN 16931 itself and its CIUSes ("#compliant#": XRechnung, Factur-X BASIC, national CIUSes) are
 * restrictions of the subset, so a file valid for them is valid here. Extensions ("#conformant#",
 * Factur-X EXTENDED, the XRechnung extension) and the profiles below EN 16931 (MINIMUM, BASIC WL)
 * are judged by their own schemas, not this one.
 */
export function schemaApplies(specificationId) {
  const id = String(specificationId ?? "").trim();
  return id === "urn:cen.eu:en16931:2017" || id.startsWith("urn:cen.eu:en16931:2017#compliant#");
}

/**
 * Gives every element node of parseXmlTree's tree its namespace: the key in schema.namespaces
 * (rsm, ram, qdt, udt) or, for any other namespace, its URI ("" for none). parseXmlTree drops
 * prefixes, so the start tags are read again in the same order, with xmlns declarations scoped
 * to the element that makes them.
 */
function annotateNamespaces(tree, text) {
  const tags = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>/g) || [];
  const order = [];
  (function walk(n) { for (const c of n.children) { order.push(c); walk(c); } })(tree);
  const scopes = [{}];
  const open = [];
  let i = 0;
  for (const tag of tags) {
    if (tag.startsWith("<?") || tag.startsWith("<!")) continue;
    if (tag.startsWith("</")) { if (open.pop()) scopes.pop(); continue; }
    const scope = { ...scopes[scopes.length - 1] };
    for (const [, prefix, dq, sq] of tag.matchAll(/\sxmlns(?::([\w.-]+))?\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) scope[prefix ?? ""] = dq ?? sq;
    const raw = tag.slice(1).match(/^[^\s/>]+/)?.[0] ?? "";
    const prefix = raw.includes(":") ? raw.slice(0, raw.indexOf(":")) : "";
    const node = order[i++];
    if (!node) break;
    const uri = scope[prefix] ?? "";
    node.ns = PREFIX_OF.get(uri) ?? uri;
    const selfClosing = /\/>$/.test(tag);
    if (!selfClosing) { scopes.push(scope); open.push(true); }
  }
}

/**
 * @param {string} text the CII XML
 * @returns {{ applied: boolean, specification: string, findings: Array<{rule: string, message: string, fix: string, path: string, source: string}> }}
 */
export function checkAgainstCiiSchema(text) {
  const out = [];
  if (!wellFormed(text)) {
    out.push(finding("CII-006", "The XML is not well formed: a tag is never closed or closes out of order, which is what a cut-off file looks like.",
      "Re-export the file; if it was edited by hand, close every tag in the order it was opened.", "/CrossIndustryInvoice"));
    return { applied: true, specification: "", findings: out };
  }
  const tree = parseXmlTree(text);
  const root = tree.children.find((n) => n.name === "CrossIndustryInvoice");
  if (!root) return { applied: false, specification: "", findings: out };
  const context = root.children.find((n) => n.name === "ExchangedDocumentContext");
  const guideline = context?.children.find((n) => n.name === "GuidelineSpecifiedDocumentContextParameter");
  const specification = (guideline?.children.find((n) => n.name === "ID")?.text ?? "").trim();
  if (!schemaApplies(specification)) return { applied: false, specification, findings: out };
  annotateNamespaces(tree, text);
  if (root.ns !== "rsm") {
    out.push(finding("CII-007", `CrossIndustryInvoice is in the ${NAMESPACE_NAMES[root.ns] ?? (root.ns || "no")} namespace; the schema puts it in ${NAMESPACE_NAMES.rsm}.`,
      "Bind the root element's prefix to the CrossIndustryInvoice namespace exactly as written in the schema.", "/CrossIndustryInvoice"));
    return { applied: true, specification, findings: out };
  }
  out.push(...checkCii(root, "/CrossIndustryInvoice"));
  return { applied: true, specification, findings: out };
}
