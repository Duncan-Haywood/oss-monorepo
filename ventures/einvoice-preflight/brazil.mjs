// Brazil CNPJ and CPF helpers for the NF-e page: shape and check digits.
// Pure functions; the Brazil page imports this file in the browser.
// CNPJ: 14 characters, the first 12 digits or capital letters (alphanumeric
// format for new registrations, announced for July 2026), the last two numeric
// check digits. Each character's value is its ASCII code minus 48 (digits 0-9,
// letters A=17 ... Z=42); weights run 2 to 9 from the right, repeating; the
// digit is 0 when the sum mod 11 is below 2, else 11 minus it. The second digit
// repeats this over the first 13 characters. All-digit CNPJs give the classic
// result. Pinned in brazil.test.mjs on 11.222.333/0001-81 and 12.ABC.345/01DE-35
// as I remember them; not read from the Receita Federal's specification.
// CPF: 11 digits, two check digits, weights 10..2 then 11..2, same mod 11 rule.

const val = (c) => c.charCodeAt(0) - 48;

function cnpjDigit(chars) {
  let sum = 0, w = 2;
  for (let i = chars.length - 1; i >= 0; i--) {
    sum += val(chars[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export function cnpjCheckDigits(first12) {
  const d1 = cnpjDigit(first12);
  const d2 = cnpjDigit(first12 + d1);
  return `${d1}${d2}`;
}

function cpfDigit(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += +digits[i] * (digits.length + 1 - i);
  const r = (sum * 10) % 11;
  return r === 10 ? 0 : r;
}

// Returns { ok, id, kind, problems }. kind: "cnpj", "cnpj-alphanumeric", "cpf" or null.
export function checkBrazilId(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/[\s./-]/g, "");
  if (s.length === 11 && /^\d{11}$/.test(s)) {
    if (/^(\d)\1{10}$/.test(s)) return { ok: false, id: s, kind: "cpf", problems: ["All eleven digits are the same; this passes the arithmetic but is not issued as a CPF."] };
    const want = `${cpfDigit(s.slice(0, 9))}${cpfDigit(s.slice(0, 9) + cpfDigit(s.slice(0, 9)))}`;
    if (want !== s.slice(9)) return { ok: false, id: s, kind: "cpf", problems: [`The CPF check digits should be ${want}, not ${s.slice(9)}: a digit is probably mistyped.`] };
    return { ok: true, id: s, kind: "cpf", problems: [] };
  }
  if (s.length !== 14) return { ok: false, id: s, kind: null, problems: [`A CNPJ has 14 characters and a CPF 11 digits; this has ${s.length}.`] };
  if (!/^[0-9A-Z]{12}\d{2}$/.test(s)) return { ok: false, id: s, kind: null, problems: ["The first 12 characters of a CNPJ are digits or capital letters A to Z and the last two are digits."] };
  const alpha = /[A-Z]/.test(s.slice(0, 12));
  if (/^(\d)\1{13}$/.test(s)) return { ok: false, id: s, kind: "cnpj", problems: ["All fourteen digits are the same; this passes the arithmetic but is not issued as a CNPJ."] };
  const want = cnpjCheckDigits(s.slice(0, 12));
  const kind = alpha ? "cnpj-alphanumeric" : "cnpj";
  if (want !== s.slice(12)) return { ok: false, id: s, kind, problems: [`The CNPJ check digits should be ${want}, not ${s.slice(12)}: a character is probably mistyped.`] };
  return { ok: true, id: s, kind, problems: [] };
}
