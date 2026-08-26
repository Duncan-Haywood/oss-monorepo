// Offline IBAN shape and checksum observations.
// Typo catch only — not a bank lookup and not a claim that an account exists.

const LENGTHS = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16,
  BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28,
  CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24,
  FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18,
  GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23,
  IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32,
  LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24,
  ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15,
  PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  SA: 24, SE: 24, SI: 19, SK: 24, SM: 27, TN: 24, TR: 26,
  UA: 29, VA: 22, VG: 24, XK: 20,
};

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

export function normalizeIban(value) {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact || null;
}

function classify(compact) {
  if (compact.length < 15 || compact.length > 34) return "unknown";
  const country = compact.slice(0, 2);
  const check = compact.slice(2, 4);
  const bban = compact.slice(4);
  if (!/^[A-Z]{2}$/.test(country) || !/^\d{2}$/.test(check) || !/^[A-Z0-9]+$/.test(bban)) {
    return "unknown";
  }
  const expected = LENGTHS[country];
  if (expected === undefined) return "checksum";
  if (compact.length !== expected) return "bad-format";
  return "checksum";
}

function mod97Ok(compact) {
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let numeric = "";
  for (const char of rearranged) {
    numeric += parseInt(char, 36).toString(10);
  }
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function looksLikeCompleteIban(value) {
  const compact = normalizeIban(value);
  if (compact === null) return false;
  return classify(compact) === "checksum" || classify(compact) === "format";
}

function checkExplicit(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    return [finding(
      "INV-024",
      "Payment IBAN is empty or not text.",
      "Provide the IBAN as text, or omit payment.iban.",
      path,
    )];
  }
  const compact = normalizeIban(value);
  if (compact === null) {
    return [finding(
      "INV-024",
      "Payment IBAN is empty or not text.",
      "Provide the IBAN as text, or omit payment.iban.",
      path,
    )];
  }
  const kind = classify(compact);
  if (kind === "unknown") {
    return [finding(
      "INV-024",
      "Payment IBAN is not a country-prefixed account number.",
      "Use a two-letter country prefix, two check digits, and the national account number, or omit payment.iban.",
      path,
    )];
  }
  if (kind === "bad-format") {
    const country = compact.slice(0, 2);
    return [finding(
      "INV-024",
      `Payment IBAN does not match the published ${country} length.`,
      `Correct the ${country} IBAN length and characters, or omit payment.iban for an internal account id.`,
      path,
    )];
  }
  if (kind === "checksum" && !mod97Ok(compact)) {
    const country = compact.slice(0, 2);
    return [finding(
      "INV-025",
      `Payment IBAN fails the published ${country} checksum.`,
      `Correct the ${country} IBAN digits. This is a checksum typo check, not a bank lookup.`,
      path,
    )];
  }
  return [];
}

export function inspectPaymentIban(invoice) {
  const payment = invoice.payment;
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return [];
  const iban = payment.iban;
  if (iban === undefined || iban === null || iban === "") return [];
  return checkExplicit(iban, "/payment/iban");
}
