// Ecuador helpers for the Ecuador page: RUC check digit and access-key (clave
// de acceso) check digit. Pure functions; the page imports this file in the
// browser. Rules as open-source implementations and vendor guides describe
// them; they were not read from the SRI's technical sheet, so ecuador.test.mjs
// pins them on numbers whose sums are worked by hand. Nothing here looks a RUC
// or an authorisation up.
//
// RUC: 13 digits. Digits 1-2 are the province (01-24, or 30 for Ecuadorians
// abroad). Digit 3 says the kind: 0-5 a person (the first 10 digits are a
// cédula, modulus 10, weights 2,1,2,1,..., a product over 9 loses 9; the
// establishment is the last 3), 6 a public body (modulus 11, weights
// 3,2,7,6,5,4,3,2, check digit is digit 9, establishment the last 4), 9 a
// private company (modulus 11, weights 4,3,2,7,6,5,4,3,2, check digit is
// digit 10, establishment the last 3).
// Access key: 49 digits; the last is modulus 11 over the first 48 with
// weights 2..7 repeating from the right (11 gives 0, 10 gives 1).

const sum = (digits, weights, f = (p) => p) =>
  digits.reduce((a, d, i) => a + f(Number(d) * weights[i]), 0);

export function mod11Digit(digits, weights) {
  const r = 11 - (sum([...digits], weights) % 11);
  return r === 11 ? 0 : r; // 10 is returned as 10: no valid digit
}

export function mod10Digit(digits9) {
  const s = sum([...digits9], [2, 1, 2, 1, 2, 1, 2, 1, 2], (p) => (p > 9 ? p - 9 : p));
  return (10 - (s % 10)) % 10;
}

export function checkRuc(raw) {
  const s = String(raw || "").replace(/[\s.-]/g, "");
  if (!/^\d{10}(\d{3})?$/.test(s)) {
    return { ok: false, ruc: s, kind: null, problems: ["A cédula has 10 digits and a RUC has 13."] };
  }
  const prov = Number(s.slice(0, 2));
  if (!((prov >= 1 && prov <= 24) || prov === 30)) {
    return { ok: false, ruc: s, kind: null, problems: [`The first two digits (${s.slice(0, 2)}) are not a province (01 to 24, or 30).`] };
  }
  const t = Number(s[2]);
  const problems = [];
  let kind;
  if (t <= 5) {
    kind = "person";
    const want = mod10Digit(s.slice(0, 9));
    if (Number(s[9]) !== want) problems.push(`The check digit (digit 10) should be ${want}, not ${s[9]}.`);
    if (s.length === 13 && s.slice(10) === "000") problems.push("The establishment number (last 3 digits) cannot be 000.");
  } else if (t === 6) {
    kind = "public body";
    if (s.length !== 13) problems.push("A public body's RUC has 13 digits.");
    else {
      const want = mod11Digit(s.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]);
      if (Number(s[8]) !== want) problems.push(`The check digit (digit 9) should be ${want}, not ${s[8]}.`);
      if (s.slice(9) === "0000") problems.push("The establishment number (last 4 digits) cannot be 0000.");
    }
  } else if (t === 9) {
    kind = "private company";
    if (s.length !== 13) problems.push("A company's RUC has 13 digits.");
    else {
      const want = mod11Digit(s.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]);
      if (Number(s[9]) !== want) problems.push(`The check digit (digit 10) should be ${want}, not ${s[9]}.`);
      if (s.slice(10) === "000") problems.push("The establishment number (last 3 digits) cannot be 000.");
    }
  } else {
    return { ok: false, ruc: s, kind: null, problems: [`The third digit (${t}) is not 0 to 6 or 9, so the kind of taxpayer is unknown.`] };
  }
  return { ok: problems.length === 0, ruc: s, kind, problems };
}

export function accessKeyDigit(first48) {
  const d = [...first48].reverse();
  const s = d.reduce((a, c, i) => a + Number(c) * (2 + (i % 6)), 0);
  const r = 11 - (s % 11);
  return r === 11 ? 0 : r === 10 ? 1 : r;
}

export function checkAccessKey(raw) {
  const s = String(raw || "").replace(/[\s.-]/g, "");
  if (!/^\d{49}$/.test(s)) return { ok: false, key: s, problems: ["An access key has 49 digits."] };
  const want = accessKeyDigit(s.slice(0, 48));
  const problems = [];
  if (Number(s[48]) !== want) problems.push(`The last digit should be ${want}, not ${s[48]}.`);
  const dd = Number(s.slice(0, 2)), mm = Number(s.slice(2, 4));
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) problems.push("The first 8 digits should be an issue date, ddmmyyyy.");
  const ruc = checkRuc(s.slice(10, 23));
  if (!ruc.ok || s.slice(10, 23).length !== 13) problems.push("Digits 11 to 23 should be the issuer's 13-digit RUC, and that RUC does not check.");
  return { ok: problems.length === 0, key: s, problems };
}
