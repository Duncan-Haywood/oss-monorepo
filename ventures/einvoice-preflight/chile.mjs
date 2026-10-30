// Chile RUT helpers for the Chile page: shape and check digit (dígito verificador).
// Pure functions; the Chile page imports this file in the browser.
// The check digit is mod 11 over the body digits: weights 2 to 7 repeating from
// the rightmost digit; 11 minus the remainder gives the digit, 11 is 0 and 10 is K.
// Pinned in chile.test.mjs on RUTs I know (60.805.000-0, the tax authority SII's
// own; 11.111.111-1; 12.345.678-5; 76.086.428-5); it was not read from SII's
// specification. Nothing here looks a RUT up.

export function checkDigit(body) {
  let sum = 0, w = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * w;
    w = w === 7 ? 2 : w + 1;
  }
  const m = 11 - (sum % 11);
  return m === 11 ? "0" : m === 10 ? "K" : String(m);
}

// Returns { ok, rut, kind, problems }. kind: "company" (body from 50 million,
// the usual range for legal entities) or "person", only a hint from the number.
export function checkRut(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/[\s.]/g, "");
  const m = s.match(/^(\d{1,8})-?([0-9K])$/);
  if (!m) {
    return { ok: false, rut: s, kind: null, problems: ["A RUT is up to eight digits, a hyphen and a check digit (0 to 9 or K), for example 76.086.428-5."] };
  }
  const [, body, dv] = m;
  const want = checkDigit(body);
  const rut = `${body}-${dv}`;
  const kind = Number(body) >= 50000000 ? "company" : "person";
  if (dv !== want) {
    return { ok: false, rut, kind, problems: [`The check digit should be ${want}, not ${dv}.`] };
  }
  return { ok: true, rut, kind, problems: [] };
}
