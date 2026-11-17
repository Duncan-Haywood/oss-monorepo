// Values an XML processor cannot read as a number, date or boolean because of a
// space character that is not XML whitespace (INV-065, and the official-rules
// route's XML-VALUE-01). Added 2026-11-17.
//
// XML whitespace is space, tab, CR and LF (XML 1.0 S; XSD whiteSpace="collapse";
// F&O normalize-space). JavaScript's String.trim() and Python's str.strip() also
// take U+00A0 (no-break space), U+202F, U+3000, U+FEFF and the other Unicode
// spaces. So the built-in readers, which trim with them, read
// `<cbc:PayableAmount>238.00</cbc:PayableAmount>` with a literal U+00A0 after the 0 as
// 238, while every Saxon-based validator stops on the file: xs:decimal cannot
// be cast from it (FORG0001). A spreadsheet export or a copy from a PDF is the
// usual source. eval/nbsp-amounts-2026-11-17.md has the measurement.

// Unicode space separators, U+0085, U+FEFF and zero-width spaces: what JavaScript's trim()
// or \s takes (or a copy-paste leaves) and XML does not count as whitespace.
export const NON_XML_SPACE = /[\u0085\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;
// The leaf values a rule or receiver casts: a decimal, an ISO date, a CII 102 date, a
// boolean, an xs:time or xs:dateTime (ZATCA's IssueTime, FA(3) and NAV timestamps; added 2026-11-17).
export const CASTABLE = /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)|\d{4}-\d{2}-\d{2}|\d{8}|(?:\d{4}-\d{2}-\d{2}T)?\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?|true|false)$/;

const NAMES = {
  "\u00A0": "no-break space (U+00A0)",
  "\u202F": "narrow no-break space (U+202F)",
  "\uFEFF": "zero-width no-break space (U+FEFF)",
  "\u200B": "zero-width space (U+200B)",
  "\u3000": "ideographic space (U+3000)",
};
const hex = (c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
export const spaceName = (v) => {
  const c = String(v).match(NON_XML_SPACE)?.[0] ?? "";
  return c ? (NAMES[c] ?? `non-XML space (${hex(c)})`) : "";
};
export const visibleSpaces = (v) => String(v).replace(new RegExp(NON_XML_SPACE.source, "g"), (c) => `[${hex(c)}]`);

const XML_TRIM = /^[ \t\n\r]+|[ \t\n\r]+$/g;

// True when JavaScript's trim() makes the value castable and XML's trim does not.
export function unreadableValue(value) {
  if (typeof value !== "string" || !value || !NON_XML_SPACE.test(value)) return false;
  return CASTABLE.test(value.trim()) && !CASTABLE.test(value.replace(XML_TRIM, ""));
}

const XML_REF = /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g;
const NAMED_REF = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
// Character references and the five predefined entities, decoded as an XML processor does.
export function decodeXmlRefs(raw) {
  return raw.replace(XML_REF, (whole, ref) => {
    if (ref[0] !== "#") return NAMED_REF[ref];
    const code = ref[1] === "x" ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

// Every leaf element of a parseXmlTree() tree whose decoded text is unreadable,
// as { path, element, value }. The path is the plain route's: local names with
// 1-based positions among same-named siblings, e.g. /Invoice[1]/LegalMonetaryTotal[1]/PayableAmount[1].
// Attributes are not read: no EN 16931 attribute is a number or date.
export function unreadableLeaves(tree) {
  const out = [];
  const walk = (node, prefix) => {
    const counts = new Map();
    for (const child of node.children || []) {
      const index = (counts.get(child.name) || 0) + 1;
      counts.set(child.name, index);
      const path = `${prefix}/${child.name}[${index}]`;
      if (child.children && child.children.length) {
        walk(child, path);
        continue;
      }
      const value = decodeXmlRefs(typeof child.text === "string" ? child.text : "");
      if (unreadableValue(value)) out.push({ path, element: child.name, value });
    }
  };
  walk(tree, "");
  return out;
}

// One INV-065 finding for an unreadable leaf ({ path, element, value }).
export function xmlValueFinding(row, path) {
  const element = typeof row.element === "string" && row.element ? row.element : "A value";
  return {
    rule: "INV-065",
    message: `${element} "${visibleSpaces(row.value)}" holds a ${spaceName(row.value)}, so it is not a valid number, date or time in XML${row.path ? ` (${row.path})` : ""}. Software that trims it reads ${row.value.trim()}; a receiver's validator (Saxon) stops on the whole file instead and reports no rule.`,
    fix: "Write the value with no space characters other than an ordinary space, tab or line break at its ends (no no-break space, U+00A0, or similar). Spreadsheets and text copied from a PDF often add one.",
    path,
  };
}

// INV-065 findings for a mapped invoice whose reader kept `xml_values`.
export function inspectXmlValues(invoice) {
  const rows = invoice && Array.isArray(invoice.xml_values) ? invoice.xml_values : [];
  const findings = [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || typeof row.value !== "string") return;
    findings.push(xmlValueFinding(row, `/xml_values/${index}/value`));
  });
  return findings;
}

// INV-065 for the national readers that report straight from the tree
// (FatturaPA, FA(3), Facturae, NAV; added 2026-11-17): the finding's path is
// the leaf's own. `tree` is parseXmlTree()'s result or one element of it.
export function xmlValueFindings(tree) {
  return unreadableLeaves(tree).map((row) => xmlValueFinding(row, row.path));
}
