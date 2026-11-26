// @ts-check
// Small, exact scanners over invoice XML text, shared by rules.mjs and fixes.mjs.
// FSL-1.1-MIT (see ../LICENSE, part 2). Offsets are into the original string, so edits made from
// them change nothing but the bytes they name.

/** @typedef {{ name: string, prefix: string, start: number, end: number, valueStart: number, valueEnd: number, value: string, attrs: string }} Leaf */

/**
 * Every leaf element (no child elements) whose local name matches `local`.
 * @param {string} xml @param {string} name regex source for the local name, e.g. "(?:IssueDate|DueDate)"
 * @returns {Leaf[]}
 */
export function leaves(xml, name) {
  const re = new RegExp(`<((?:([\\w.-]+):)?(${name}))(\\s[^>]*)?>([^<]*)</\\1>`, "g");
  /** @type {Leaf[]} */
  const out = [];
  for (const m of xml.matchAll(re)) {
    const start = m.index ?? 0;
    const openLen = m[0].indexOf(">") + 1;
    const valueStart = start + openLen;
    out.push({
      name: m[3],
      prefix: m[2] ?? "",
      start,
      end: start + m[0].length,
      valueStart,
      valueEnd: valueStart + m[5].length,
      value: m[5],
      attrs: m[4] ?? "",
    });
  }
  return out;
}

/**
 * Character ranges of every element named `local` (any prefix), to exclude nested content.
 * @param {string} xml @param {string} localPattern regex source for the local name
 * @returns {Array<[number, number]>}
 */
export function blockRanges(xml, localPattern) {
  const re = new RegExp(`<((?:[\\w.-]+:)?(?:${localPattern}))(?:\\s[^>]*)?>[\\s\\S]*?</\\1>`, "g");
  return [...xml.matchAll(re)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
}

/** @param {number} pos @param {Array<[number, number]>} ranges */
export const inside = (pos, ranges) => ranges.some(([a, b]) => pos >= a && pos < b);

/** @param {string} xml @returns {"ubl" | "cii" | ""} */
export function syntaxOf(xml) {
  const head = xml.slice(0, 4096);
  if (/<(?:[\w.-]+:)?CrossIndustryInvoice[\s>]/.test(head)) return "cii";
  if (/<(?:[\w.-]+:)?(?:Invoice|CreditNote)[\s>]/.test(head) && /oasis:names:specification:ubl/.test(head)) return "ubl";
  return "";
}

/** @param {string} line */
export const indentOf = (line) => /^[ \t]*/.exec(line)?.[0] ?? "";

/** The full line that contains offset `pos`. @param {string} xml @param {number} pos */
export function lineAt(xml, pos) {
  const a = xml.lastIndexOf("\n", pos - 1) + 1;
  const b = xml.indexOf("\n", pos);
  return xml.slice(a, b === -1 ? xml.length : b);
}

// Monetary amounts limited to two decimals by EN 16931 (BR-DEC-*): every *Amount leaf except
// prices (BT-146/147/148, unrestricted) and the CII price blocks around them.
const UBL_PRICE_BLOCK = "Price";
const CII_PRICE_BLOCK = "(?:Net|Gross)PriceProductTradePrice";

/** @param {string} xml @returns {Leaf[]} */
export function restrictedAmounts(xml) {
  const syntax = syntaxOf(xml);
  if (!syntax) return [];
  const excluded = blockRanges(xml, syntax === "ubl" ? UBL_PRICE_BLOCK : CII_PRICE_BLOCK);
  return leaves(xml, "[A-Za-z]*Amount").filter(
    (l) => l.name !== "PriceAmount" && !inside(l.start, excluded) && /^\s*-?\d+(\.\d+)?\s*$/.test(l.value),
  );
}

/** @param {string} value */
export const decimalsOf = (value) => {
  const m = /\.(\d+)\s*$/.exec(value);
  return m ? m[1].length : 0;
};

// Date leaves checked for the xs:date lexical form (UBL) or format 102 (CII).
const UBL_DATES = "(?:IssueDate|DueDate|TaxPointDate|StartDate|EndDate|ActualDeliveryDate|PaymentDueDate)";

/** @param {string} xml @returns {Array<Leaf & { want: "iso" | "102" }>} */
export function dateLeaves(xml) {
  const syntax = syntaxOf(xml);
  if (syntax === "ubl") return leaves(xml, UBL_DATES).map((l) => ({ ...l, want: /** @type {const} */ ("iso") }));
  if (syntax === "cii")
    return leaves(xml, "DateTimeString")
      .filter((l) => /format\s*=\s*["']102["']/.test(l.attrs))
      .map((l) => ({ ...l, want: /** @type {const} */ ("102") }));
  return [];
}

/** @param {number} y @param {number} m @param {number} d */
export function realDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days && y >= 1900 && y <= 2999;
}

/** @param {string} value @param {"iso" | "102"} want */
export function dateIsWellFormed(value, want) {
  const m = want === "iso" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  return Boolean(m && realDate(Number(m[1]), Number(m[2]), Number(m[3])));
}
