// Argentina CUIT helpers for the Argentina page: shape and check digit.
// Pure functions; the Argentina page imports this file in the browser.
// A CUIT is 11 digits (2-digit type, 8-digit number, check digit). The first ten,
// weighted 5,4,3,2,7,6,5,4,3,2, sum to s; the check digit is 11 - s mod 11,
// with 11 read as 0. A remainder giving 10 has no digit: such a number is not
// issued. Pinned in argentina.test.mjs on the tax authority's own CUIT
// (33-69345023-9); the rule was not read from ARCA's specification.
// Nothing here looks a CUIT up or says it is active.

const W = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

// Returns the digit, or null when the sum leaves no valid digit.
export function checkDigit(first10) {
  let s = 0;
  for (let i = 0; i < 10; i++) s += Number(first10[i]) * W[i];
  const m = 11 - (s % 11);
  return m === 11 ? "0" : m === 10 ? null : String(m);
}

// kind is only a hint from the prefix: 20, 23, 24, 27 person; 30, 33, 34 company.
export function checkCuit(raw) {
  const s = String(raw || "").replace(/[\s.-]/g, "");
  if (!/^\d{11}$/.test(s)) {
    return { ok: false, cuit: s, kind: null, problems: ["A CUIT is 11 digits, usually written 33-69345023-9."] };
  }
  const p = s.slice(0, 2);
  const kind = ["20", "23", "24", "27"].includes(p) ? "person" : ["30", "33", "34"].includes(p) ? "company" : null;
  const want = checkDigit(s);
  if (want === null) return { ok: false, cuit: s, kind, problems: ["The first ten digits leave no valid check digit, so this number is not issued."] };
  if (s[10] !== want) return { ok: false, cuit: s, kind, problems: [`The check digit should be ${want}, not ${s[10]}.`] };
  if (!kind) return { ok: false, cuit: s, kind, problems: ["The check digit fits, but the prefix is not one of 20, 23, 24, 27, 30, 33 or 34."] };
  return { ok: true, cuit: s, kind, problems: [] };
}
