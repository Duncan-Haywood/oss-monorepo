// Peru RUC helpers for the Peru page: shape and check digit.
// Pure functions; the Peru page imports this file in the browser.
// The check digit is mod 11 over the first ten digits with weights
// 5 4 3 2 7 6 5 4 3 2: 11 minus the remainder gives the digit, with 10 written
// as 0 and 11 as 1. Pinned in peru.test.mjs on SUNAT's own RUC (20131312955);
// it was not read from SUNAT's specification. Nothing here looks a RUC up.

const W = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function checkDigit(first10) {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(first10[i]) * W[i];
  const m = 11 - (sum % 11);
  return String(m === 10 ? 0 : m === 11 ? 1 : m);
}

// Returns { ok, ruc, note, problems }. The first two digits are only a hint:
// 10 natural person, 20 company (the common ones), 15, 16, 17 other person kinds.
export function checkRuc(raw) {
  const s = String(raw || "").replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(s)) {
    return { ok: false, ruc: s, note: null, problems: ["A RUC is eleven digits, for example 20131312955."] };
  }
  const want = checkDigit(s);
  if (s[10] !== want) {
    return { ok: false, ruc: s, note: null, problems: [`The check digit should be ${want}, not ${s[10]}.`] };
  }
  const p = s.slice(0, 2);
  const note = p === "20" ? "a number starting 20, the usual company range" : p === "10" ? "a number starting 10, the usual natural-person range" : `a number starting ${p}`;
  return { ok: true, ruc: s, note, problems: [] };
}
