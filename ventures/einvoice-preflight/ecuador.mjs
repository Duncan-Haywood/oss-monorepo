// Ecuador helpers for the Ecuador page: RUC check digit and the 49-digit
// clave de acceso. Pure functions; the page imports this file in the browser.
// RUC: 13 digits. The first 10 are a cédula (third digit 0-5, modulo 10) or a
// company number (third digit 6 public, modulo 11 on 8 digits, digit 9; third
// digit 9 private, modulo 11 on 9 digits, digit 10); the rest is the
// establishment number (0001 public, 001 otherwise, up to 9999/999).
// Clave de acceso: date(8) type(2) RUC(13) environment(1) series(6) sequence(9)
// numeric code(8) emission type(1) and a modulo 11 check digit with weights
// 2..7 from the right. Both rules are the ones open-source libraries and vendor
// guides describe; they were not read from the SRI's technical sheet, and
// ecuador.test.mjs pins them on numbers computed by hand. Nothing here looks a
// RUC or a key up.

const sum = (digits, weights) => digits.reduce((a, d, i) => a + d * weights[i], 0);
const nums = (s) => [...s].map(Number);

export function checkRuc(raw) {
  const s = String(raw || "").replace(/[\s.-]/g, "");
  if (!/^\d{13}$/.test(s)) return { ok: false, ruc: s, problems: ["An Ecuadorian RUC has 13 digits, for example 1790010937001."] };
  const d = nums(s);
  const prov = Number(s.slice(0, 2));
  const problems = [];
  if (!((prov >= 1 && prov <= 24) || prov === 30)) problems.push("The first two digits should be a province code (01 to 24, or 30).");
  const t = d[2];
  let kind;
  if (t <= 5) {
    kind = "person";
    const total = d.slice(0, 9).reduce((a, x, i) => { let p = x * (i % 2 === 0 ? 2 : 1); if (p > 9) p -= 9; return a + p; }, 0);
    const want = (10 - (total % 10)) % 10;
    if (d[9] !== want) problems.push(`The tenth digit should be ${want}, not ${d[9]}.`);
  } else if (t === 6 || t === 9) {
    kind = t === 6 ? "public body" : "private company";
    const w = t === 6 ? [3, 2, 7, 6, 5, 4, 3, 2] : [4, 3, 2, 7, 6, 5, 4, 3, 2];
    const n = w.length;
    const r = sum(d.slice(0, n), w) % 11;
    const want = r === 0 ? 0 : 11 - r;
    if (want === 10 || d[n] !== want) problems.push(want === 10 ? "No check digit fits these digits." : `Digit ${n + 1} should be ${want}, not ${d[n]}.`);
  } else {
    problems.push("The third digit should be 0 to 6 or 9.");
  }
  const est = Number(s.slice(t === 6 ? 9 : 10));
  if (est < 1) problems.push(`The establishment number (last ${t === 6 ? 4 : 3} digits) cannot be zero.`);
  return { ok: problems.length === 0, ruc: s, kind, problems };
}

export function accessKeyDigit(first48) {
  const d = nums(first48).reverse();
  const r = d.reduce((a, x, i) => a + x * (2 + (i % 6)), 0) % 11;
  const v = 11 - r;
  return String(v === 11 ? 0 : v === 10 ? 1 : v);
}

export function checkAccessKey(raw) {
  const s = String(raw || "").replace(/[\s-]/g, "");
  if (!/^\d{49}$/.test(s)) return { ok: false, problems: ["A clave de acceso has 49 digits."] };
  const problems = [];
  const dd = Number(s.slice(0, 2)), mm = Number(s.slice(2, 4)), yy = Number(s.slice(4, 8));
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (!(yy > 2000 && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd)) problems.push("The first eight digits are not a date (ddmmyyyy).");
  const env = s[23];
  if (env !== "1" && env !== "2") problems.push("The environment digit (24th) should be 1 (test) or 2 (production).");
  const want = accessKeyDigit(s.slice(0, 48));
  if (s[48] !== want) problems.push(`The last digit should be ${want}, not ${s[48]}.`);
  const ruc = checkRuc(s.slice(10, 23));
  if (!ruc.ok) problems.push("The RUC inside the key (digits 11 to 23) fails its own test: " + ruc.problems[0]);
  return { ok: problems.length === 0, problems, parts: { date: s.slice(0, 8), type: s.slice(8, 10), ruc: s.slice(10, 23), environment: env, series: s.slice(24, 30), sequence: s.slice(30, 39) } };
}
