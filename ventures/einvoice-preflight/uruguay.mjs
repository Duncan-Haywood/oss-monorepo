// Uruguay RUT helpers for the Uruguay page: shape and check digit.
// Pure functions; the Uruguay page imports this file in the browser.
// A RUT is 12 digits (2-digit office, 6-digit number, 3-digit branch, check
// digit). The first eleven, weighted 4,3,2,9,8,7,6,5,4,3,2, sum to s; the check
// digit is 11 - s mod 11, with 11 read as 0. A remainder giving 10 has no digit:
// such a number is treated as not issued (sources do not say what DGI does).
// Pinned in uruguay.test.mjs on one RUT, Antel's 21-100342-001-7, which a
// public forum thread and a vendor validator give; the rule was not read from
// DGI's specification. Nothing here looks a RUT up or says it is active.

const W = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

// Returns the digit, or null when the sum leaves no valid digit.
export function checkDigit(first11) {
  let s = 0;
  for (let i = 0; i < 11; i++) s += Number(first11[i]) * W[i];
  const m = 11 - (s % 11);
  return m === 11 ? "0" : m === 10 ? null : String(m);
}

export function checkRut(raw) {
  const s = String(raw || "").replace(/[\s.-]/g, "");
  if (!/^\d{12}$/.test(s)) {
    return { ok: false, rut: s, problems: ["A RUT is 12 digits, usually written 21 100342 001 7."] };
  }
  const want = checkDigit(s);
  if (want === null) return { ok: false, rut: s, problems: ["The first eleven digits leave no valid check digit, so this number is treated as not issued."] };
  if (s[11] !== want) return { ok: false, rut: s, problems: [`The check digit should be ${want}, not ${s[11]}.`] };
  return { ok: true, rut: s, problems: [] };
}
