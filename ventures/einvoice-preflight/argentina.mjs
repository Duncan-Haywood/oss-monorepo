// Argentina CUIT helpers for the Argentina page: shape and check digit.
// Pure functions; the Argentina page imports this file in the browser.
// The check digit is mod 11 over the first ten digits with weights
// 5 4 3 2 7 6 5 4 3 2: 11 minus the remainder gives the digit, with 11 written
// as 0; a sum that gives 10 has no valid digit. Pinned in argentina.test.mjs on
// ARCA's own CUIT (33-69345023-9); it was not read from ARCA's specification.
// Nothing here looks a CUIT up.

const W = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

// Returns the digit, or null when the sum gives 10 (no CUIT is issued like that).
export function checkDigit(first10) {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(first10[i]) * W[i];
  const m = 11 - (sum % 11);
  return m === 11 ? "0" : m === 10 ? null : String(m);
}

// Returns { ok, cuit, note, problems }.
export function checkCuit(raw) {
  const s = String(raw || "").replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(s)) {
    return { ok: false, cuit: s, note: null, problems: ["A CUIT is eleven digits, for example 33-69345023-9."] };
  }
  const want = checkDigit(s);
  const cuit = `${s.slice(0, 2)}-${s.slice(2, 10)}-${s[10]}`;
  if (want === null) {
    return { ok: false, cuit, note: null, problems: ["The first ten digits give no valid check digit (the sum comes to 10), so no CUIT is issued with them."] };
  }
  if (s[10] !== want) {
    return { ok: false, cuit, note: null, problems: [`The check digit should be ${want}, not ${s[10]}.`] };
  }
  const p = s.slice(0, 2);
  const note = ["30", "33", "34"].includes(p) ? "a prefix in the usual company range" : ["20", "23", "24", "27"].includes(p) ? "a prefix in the usual person range" : `a number starting ${p}`;
  return { ok: true, cuit, note, problems: [] };
}
