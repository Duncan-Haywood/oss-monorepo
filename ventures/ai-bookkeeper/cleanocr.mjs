// Repairs the digit look-alikes OCR leaves in amounts and dates. No Node imports, so
// the page can load it (receipts.mjs uses it); ocr.mjs holds the file readers.
// Inside a token that is mostly digits, O/o -> 0, l/I/| -> 1, S -> 5, B -> 8, Z -> 2.
// Words are left alone: only tokens that already hold two or more digits (or a
// money/date shape) are touched.
const LOOK = { O: "0", o: "0", D: "0", l: "1", I: "1", "|": "1", S: "5", s: "5", B: "8", Z: "2", z: "2" };
// "Suototal", "Subtota", "Sudtotal", "ubtotal": one letter from "subtotal" (or its cut
// "subtota"), seven letters or more, is the subtotal. Two letters is not taken: the SRD
// photo 1133 total line reads "SOSTOTAL".
const lev1 = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  const tail = (x, y) => x.slice(i + (x.length >= y.length ? 1 : 0)) === y.slice(i + (y.length >= x.length ? 1 : 0));
  return tail(a, b);
};
const subtotalWord = (w) => { const l = w.toLowerCase(); return l.length >= 7 && l !== "subtotal" && l !== "subtotals" && (lev1(l, "subtotal") || lev1(l, "subtota")); };
export function cleanOcr(text) {
  return text.split(/\r?\n/).map((line) => line
    // "US$12.50", "EC$161.04", "S$8.40", and the same with the $ read as S ("USS12.50",
    // "ECS161.04"): a dollar with its country letters is a dollar. Left alone, the
    // token pass below reads the S (and US's S) as 5, so US$12.50 became 5512.50
    // (WildReceipt, eval/wildreceipt-train1-2026-11-17.md).
    .replace(/(^|[^A-Za-z])(?:US|EC|HK|NZ|AU|SG|NT|CA|BZ|TT|JM|BB|BS|FJ|A|C|S)(?:\$|S(?=\s?\d+[.,]\d{2}(?!\d)))\s?(?=\d)/g, "$1$$")
    .replace(/(^|\s)S(?=\d+[.,]\d{2}(?!\d))/g, "$1$$") // "S10.62" -> "$10.62"
    .replace(/(\d)\s+([.,])(\d{2})(?!\d)/g, "$1$2$3") // "5 .50" -> "5.50"
    .replace(/(\d[.,])\s+(\d{2})(?!\d)/g, "$1$2")
    .replace(/(^|[\s$€£])([OoIl|])(?=[.,]\d{2}(?!\d))/g, (m, p, c) => p + LOOK[c]) // "O.87" -> "0.87"
    .replace(/(\d)\.\.(\d{2})(?!\d)/g, "$1.$2") // "146..57" -> "146.57": a doubled decimal point
    .replace(/[A-Za-z]{7,9}/g, (w) => (subtotalWord(w) ? "Subtotal" : w))
    .replace(/(\d{1,3}[.,]\s?)([Oo0]{3})(?![\w.,])/g, (m, a, z) => a + "000") // "26, OOO" -> "26, 000": a whole-unit group read as letters (CORD train-87)
    .replace(/\b(TOTA|Tota|tota)(?=\s*[:.]?\s*(?:Rp\.?\s*)?\d)/g, (m, w) => w + (w === "TOTA" ? "L" : "l")) // "TOTA 24.000": the L lost
    .replace(/\b(sub)\s*[.,]\s*(total)\b/gi, "$1 $2") // "SUB. TOTAL", "SUB, TOTAL" -> "SUB TOTAL" (CORD train-59)
    .replace(/\b((?:sub\s*-?\s*)?tota)[\]|](?=[\s:]|$)/gi, (m, w) => w + (w.endsWith("A") ? "L" : "l")) // "Tota]" / "Subtota|" -> "Total" / "Subtotal"
    .replace(/[\w$€£|.,\/-]+/g, (tok) => {
    if (/^\d+[.,]\d{2}(?:SR|ZR|TX|ES|RS)$/.test(tok)) return tok; // "7.50ZR": a price and its tax code (Malaysian SR/ZR), not 7.5025
    const digits = (tok.match(/\d/g) || []).length;
    const letters = (tok.match(/[A-Za-z|]/g) || []).length;
    if (digits < 2 || letters === 0 || letters > digits) return tok; // a word, or no anchor
    if (/[a-z]{3,}/i.test(tok.replace(/[OolIDSsBZz|]/g, ""))) return tok; // real letters left over: a word
    return tok.replace(/[OoDlI|SsBZz]/g, (c) => LOOK[c]);
  })).join("\n");
}
