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
// The leaf values a rule or receiver casts: a decimal, a CII 102 date (eight digits, castable
// as a decimal too), a boolean, an xs:date, xs:time or xs:dateTime (ZATCA's IssueTime, FA(3) and
// NAV timestamps, FatturaPA's DataOraConsegna; added 2026-11-17). Since 2026-11-18 the date
// forms take an optional timezone (`2024-01-31+01:00`, what JAXB's XMLGregorianCalendar writes
// for a date) and a signed or five-digit year, and a date or time that XSD's ranges refuse
// (month 13, 30 February, 25:00, a +15:00 zone) is not castable, so INV-065 never blames a space
// for a value Saxon would refuse anyway. Checked against SaxonC-HE on every leaf of the corpus and
// a lexical sweep (eval/datetime-leaves-2026-11-18.md). `CASTABLE.test(v)` as before.
const PLAIN = /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)|true|false)$/;
const TZ = "(Z|[+-](\\d{2}):(\\d{2}))?";
const DATE = "(-?)([1-9]\\d{4,}|\\d{4})-(\\d{2})-(\\d{2})";
const TIME = "(\\d{2}):(\\d{2}):(\\d{2})(\\.\\d+)?";
const DATE_RE = new RegExp(`^${DATE}${TZ}$`);
const TIME_RE = new RegExp(`^${TIME}${TZ}$`);
const DATETIME_RE = new RegExp(`^${DATE}T${TIME}${TZ}$`);
// Proleptic Gregorian with a year 0000 (1 BCE), as XSD 1.1 and Saxon count it.
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dateOk = (sign, year, month, day) => {
  const y = Number(sign + year), m = Number(month), d = Number(day);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= [31, leap(Math.abs(y)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
};
const timeOk = (h, mi, s, frac) => {
  if (h === "24") return mi === "00" && s === "00" && !/[1-9]/.test(frac || "");
  return Number(h) < 24 && Number(mi) < 60 && Number(s) < 60;
};
const tzOk = (z, h, m) => !z || z === "Z" || (Number(m) < 60 && (Number(h) < 14 || (h === "14" && m === "00")));
export const CASTABLE = {
  test(value) {
    if (PLAIN.test(value)) return true;
    let m;
    if ((m = DATE_RE.exec(value))) return dateOk(m[1], m[2], m[3], m[4]) && tzOk(m[5], m[6], m[7]);
    if ((m = TIME_RE.exec(value))) return timeOk(m[1], m[2], m[3], m[4]) && tzOk(m[5], m[6], m[7]);
    if ((m = DATETIME_RE.exec(value))) {
      return dateOk(m[1], m[2], m[3], m[4]) && timeOk(m[5], m[6], m[7], m[8]) && tzOk(m[9], m[10], m[11]);
    }
    return false;
  },
};

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

// INV-065 for France's Flux 10 e-reporting and CDAR status files (added 2026-11-17). Measured
// against FNFE-MPE's compiled rules on SaxonC-HE (eval/french-whitespace-2026-11-17.md): a
// no-break space in a Flux 10 amount stops Saxon on the whole file, while a space in an
// identifier (GlobalID, URIID: string types in the schemas) or in CDAR's DateTimeString
// (udt's string type, format 204) is read by no rule as a number, so those leaves are left
// out. The message says what France's rules may do, not that Saxon always stops.
const FRENCH_SKIP = { flux10: /(?:ID|Id)$/, cdar: /(?:ID|Id|DateTimeString)$/ };
export function frenchXmlValueFindings(tree, format) {
  const skip = FRENCH_SKIP[format];
  return unreadableLeaves(tree)
    .filter((row) => !skip.test(String(row.element).replace(/^.*:/, "")))
    .map((row) => {
      const f = xmlValueFinding(row, row.path);
      return {
        ...f,
        message: f.message.replace(/ a receiver's validator \(Saxon\) stops on the whole file instead and reports no rule\.$/,
          " XML does not trim this space, so an XML schema check, or France's official rules run on Saxon, may stop on the whole file or reject the value, without naming the space."),
        source: format,
      };
    });
}
