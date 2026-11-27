// Peru RUC helpers for the Peru page: shape and check digit.
// Pure functions; the Peru page imports this file in the browser.
// A RUC is 11 digits: the first ten, weighted 5,4,3,2,7,6,5,4,3,2, sum to s;
// the last digit is (11 - s mod 11) mod 10. Pinned in peru.test.mjs on the tax
// authority SUNAT's own RUC (20131312955); the rule was not read from SUNAT's
// specification. Nothing here looks a RUC up or says it is active.

const W = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function checkDigit(first10) {
  let s = 0;
  for (let i = 0; i < 10; i++) s += Number(first10[i]) * W[i];
  return String((11 - (s % 11)) % 10);
}

// kind is only a hint from the prefix: 10 person, 20 company, 15 or 17 other.
export function checkRuc(raw) {
  const s = String(raw || "").replace(/[\s.-]/g, "");
  if (!/^\d{11}$/.test(s)) {
    return { ok: false, ruc: s, kind: null, problems: ["A RUC is 11 digits, for example 20131312955."] };
  }
  const p = s.slice(0, 2);
  const kind = p === "10" ? "person" : p === "20" ? "company" : p === "15" || p === "17" ? "other" : null;
  const want = checkDigit(s);
  if (s[10] !== want) return { ok: false, ruc: s, kind, problems: [`The check digit should be ${want}, not ${s[10]}.`] };
  if (!kind) return { ok: false, ruc: s, kind, problems: ["The check digit fits, but the prefix is not one of 10, 15, 17 or 20."] };
  return { ok: true, ruc: s, kind, problems: [] };
}
