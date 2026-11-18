// One reading of a typed or parsed amount, shared by every check. Mirrors
// src/einvoice_preflight/numbers.py, so the web page and the CLI agree on a file.
//
// A number is an optional sign, ASCII digits with an optional decimal point, and an
// optional exponent. JavaScript's Number() alone also reads "0x64" as 100, "0b11" as 3
// and "0o7" as 7, so a UBL or CII file with a hex amount passed the page clean while
// a receiver (xs:decimal) rejects it and the CLI flagged it. A magnitude of 1e15 or
// more is not read either: a double cannot hold it to the cent.
export const DECIMAL_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
export const MAX_MAGNITUDE = 1e15;

// A finite number, or null. Numbers pass through when finite and in range; strings
// must be a plain decimal after trimming.
export function parseDecimal(value) {
  if (value === undefined || value === null || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) < MAX_MAGNITUDE ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!DECIMAL_TEXT.test(text)) return null;
  const result = Number(text);
  return Number.isFinite(result) && Math.abs(result) < MAX_MAGNITUDE ? result : null;
}
