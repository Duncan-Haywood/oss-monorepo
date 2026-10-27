// Colombia NIT helpers for the Colombia page: shape and check digit (dígito de verificación, DV).
// Pure functions; the Colombia page imports this file in the browser.
// The DV is mod 11 over the NIT digits: weights 3, 7, 13, 17, 19, 23, 29, 37, 41,
// 43, 47, 53, 59, 67, 71 from the rightmost digit; remainder 0 or 1 is the DV
// itself, otherwise 11 minus the remainder. Pinned in colombia.test.mjs on NITs I
// know (800.197.268-4, the tax authority DIAN's own; 890.903.938-8; 899.999.068-1;
// 860.034.313-7); it was not read from DIAN's specification. Nothing here looks a
// NIT up.

const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function checkDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * WEIGHTS[i];
  const r = sum % 11;
  return String(r > 1 ? 11 - r : r);
}

// Returns { ok, nit, problems }. Accepts 9 to 10 digits plus the DV, with dots,
// spaces or a hyphen between; a NIT given without its DV is reported with the
// DV it would need, not accepted.
export function checkNit(raw) {
  const s = String(raw || "").trim().replace(/[\s.]/g, "");
  const m = s.match(/^(\d{8,10})-(\d)$/);
  if (!m) {
    if (/^\d{8,10}$/.test(s)) {
      return { ok: false, nit: s, problems: [`No check digit given; with a hyphen it would be ${s}-${checkDigit(s)} if this NIT is right.`] };
    }
    return { ok: false, nit: s, problems: ["A NIT is eight to ten digits, a hyphen and a check digit, for example 800.197.268-4."] };
  }
  const [, body, dv] = m;
  const want = checkDigit(body);
  const nit = `${body}-${dv}`;
  if (dv !== want) return { ok: false, nit, problems: [`The check digit should be ${want}, not ${dv}.`] };
  return { ok: true, nit, problems: [] };
}
