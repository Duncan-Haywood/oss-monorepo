// Repairs the digit look-alikes OCR leaves in amounts and dates. No Node imports, so
// the page can load it (receipts.mjs uses it); ocr.mjs holds the file readers.
// Inside a token that is mostly digits, O/o -> 0, l/I/| -> 1, S -> 5, B -> 8, Z -> 2.
// Words are left alone: only tokens that already hold two or more digits (or a
// money/date shape) are touched.
const LOOK = { O: "0", o: "0", D: "0", l: "1", I: "1", "|": "1", S: "5", s: "5", B: "8", Z: "2", z: "2" };
export function cleanOcr(text) {
  return text.split(/\r?\n/).map((line) => line
    .replace(/(^|\s)S(?=\d+[.,]\d{2}(?!\d))/g, "$1$$") // "S10.62" -> "$10.62"
    .replace(/(\d)\s+([.,])(\d{2})(?!\d)/g, "$1$2$3") // "5 .50" -> "5.50"
    .replace(/(\d[.,])\s+(\d{2})(?!\d)/g, "$1$2")
    .replace(/(^|[\s$€£])([OoIl|])(?=[.,]\d{2}(?!\d))/g, (m, p, c) => p + LOOK[c]) // "O.87" -> "0.87"
    .replace(/[\w$€£|.,\/-]+/g, (tok) => {
    if (/^\d+[.,]\d{2}(?:SR|ZR|TX|ES|RS)$/.test(tok)) return tok; // "7.50ZR": a price and its tax code (Malaysian SR/ZR), not 7.5025
    const digits = (tok.match(/\d/g) || []).length;
    const letters = (tok.match(/[A-Za-z|]/g) || []).length;
    if (digits < 2 || letters === 0 || letters > digits) return tok; // a word, or no anchor
    if (/[a-z]{3,}/i.test(tok.replace(/[OolIDSsBZz|]/g, ""))) return tok; // real letters left over: a word
    return tok.replace(/[OoDlI|SsBZz]/g, (c) => LOOK[c]);
  })).join("\n");
}
