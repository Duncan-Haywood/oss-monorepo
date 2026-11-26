// Paraguay RUC helpers for the Paraguay page: shape and check digit.
// Pure functions; the Paraguay page imports this file in the browser.
// A RUC is a base number (a cédula for people, 8 digits starting 80 for
// companies) and one check digit after a hyphen. Digits of the base are taken
// from the right and weighted 2,3,...,11 (back to 2 after 11); with s the sum,
// r = s mod 11, the check digit is 11 - r when r > 1 and 0 otherwise. That is
// the rule open-source implementations (Groovy, FoxPro, plpgsql) and vendor
// validators describe; it was not read from DNIT's specification, and no real
// RUC with a confirmed digit was reachable, so paraguay.test.mjs pins it on a
// hand-computed number, not a registered one. Nothing here looks a RUC up.

export function checkDigit(base) {
  let s = 0;
  for (let i = 0; i < base.length; i++) s += Number(base[base.length - 1 - i]) * (2 + (i % 10));
  const r = s % 11;
  return r > 1 ? String(11 - r) : "0";
}

export function checkRuc(raw) {
  const s = String(raw || "").replace(/[\s.-]/g, "");
  if (!/^\d{6,10}$/.test(s)) {
    return { ok: false, ruc: s, problems: ["A RUC is a number of 5 to 9 digits and a check digit, usually written 80016875-5."] };
  }
  const base = s.slice(0, -1);
  const want = checkDigit(base);
  if (s[s.length - 1] !== want) return { ok: false, ruc: s, problems: [`The check digit should be ${want}, not ${s[s.length - 1]}.`] };
  return { ok: true, ruc: s, problems: [] };
}
