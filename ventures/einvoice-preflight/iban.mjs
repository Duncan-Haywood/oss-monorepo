// Offline IBAN shape and checksum observations.
// Typo catch only — not a bank lookup and not a claim that an account exists.

// BBAN structure per country, in the SWIFT IBAN registry notation (n digits, a capital letters,
// c letters or digits; "4!n" is exactly four digits). Registry v101 as carried in python-stdnum 2.2,
// the oracle eval/iban-differential.py checks this table against. The length of an IBAN is 4 plus the
// sum of the counts. National check digits inside the BBAN are not verified here.
const BBAN_FORMATS = {
  AD: "4!n4!n12!c", AE: "3!n16!n", AL: "8!n16!c", AT: "5!n11!n", AZ: "4!a20!c",
  BA: "3!n3!n8!n2!n", BE: "3!n7!n2!n", BG: "4!a4!n2!n8!c", BH: "4!a14!c", BI: "5!n5!n11!n2!n",
  BR: "8!n5!n10!n1!a1!c", BY: "4!c4!n16!c", CH: "5!n12!c", CR: "4!n14!n", CY: "3!n5!n16!c",
  CZ: "4!n16!n", DE: "8!n10!n", DJ: "5!n5!n11!n2!n", DK: "4!n9!n1!n", DO: "4!c20!n",
  EE: "2!n14!n", EG: "4!n4!n17!n", ES: "4!n4!n1!n1!n10!n", FI: "3!n11!n", FK: "2!a12!n",
  FO: "4!n9!n1!n", FR: "5!n5!n11!c2!n", GB: "4!a6!n8!n", GE: "2!a16!n", GI: "4!a15!c",
  GL: "4!n9!n1!n", GR: "3!n4!n16!c", GT: "4!c20!c", HN: "4!a20!n", HR: "7!n10!n",
  HU: "3!n4!n1!n15!n1!n", IE: "4!a6!n8!n", IL: "3!n3!n13!n", IQ: "4!a3!n12!n",
  IS: "4!n2!n6!n10!n", IT: "1!a5!n5!n12!c", JO: "4!a4!n18!c", KW: "4!a22!c", KZ: "3!n13!c",
  LB: "4!n20!c", LC: "4!a24!c", LI: "5!n12!c", LT: "5!n11!n", LU: "3!n13!c", LV: "4!a13!c",
  LY: "3!n3!n15!n", MC: "5!n5!n11!c2!n", MD: "2!c18!c", ME: "3!n13!n2!n", MK: "3!n10!c2!n",
  MN: "4!n12!n", MR: "5!n5!n11!n2!n", MT: "4!a5!n18!c", MU: "4!a2!n2!n12!n3!n3!a",
  NI: "4!a20!n", NL: "4!a10!n", NO: "4!n6!n1!n", OM: "3!n16!c", PK: "4!a16!c", PL: "8!n16!n",
  PS: "4!a21!c", PT: "4!n4!n11!n2!n", QA: "4!a21!c", RO: "4!a16!c", RS: "3!n13!n2!n",
  RU: "9!n5!n15!c", SA: "2!n18!c", SC: "4!a2!n2!n16!n3!a", SD: "2!n12!n", SE: "3!n16!n1!n",
  SI: "5!n8!n2!n", SK: "4!n6!n10!n", SM: "1!a5!n5!n12!c", SO: "4!n3!n12!n",
  ST: "4!n4!n11!n2!n", SV: "4!a20!n", TL: "3!n14!n2!n", TN: "2!n3!n13!n2!n", TR: "5!n1!n16!c",
  UA: "6!n19!c", VA: "3!n15!n", VG: "4!a16!n", XK: "4!n10!n2!n", YE: "4!a4!n18!c",
};
const CLASS_RE = { n: "[0-9]", a: "[A-Z]", c: "[A-Z0-9]" };
const LENGTHS = {};
const BBAN_RES = {};
for (const [country, format] of Object.entries(BBAN_FORMATS)) {
  let length = 4;
  let source = "^";
  for (const [, count, cls] of format.matchAll(/(\d+)!([nac])/g)) {
    length += Number(count);
    source += `${CLASS_RE[cls]}{${count}}`;
  }
  LENGTHS[country] = length;
  BBAN_RES[country] = new RegExp(`${source}$`);
}

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
  if (!BBAN_RES[country].test(bban)) return "bad-format";
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

// National check digits inside the BBAN, for the four countries python-stdnum 2.2 checks for IBANs
// (BE, ES, ME, NO); the IBAN's own mod-97 does not cover them. A failure reads as a checksum typo.
function nationalCheckOk(country, bban) {
  const digits = (text) => [...text].map(Number);
  if (country === "BE") {
    const rest = Number(bban.slice(0, 10)) % 97;
    return Number(bban.slice(10)) === (rest === 0 ? 97 : rest);
  }
  if (country === "ME") {
    let remainder = 0;
    for (const d of bban) remainder = (remainder * 10 + Number(d)) % 97;
    return remainder === 1;
  }
  if (country === "NO") {
    const weights = [6, 7, 8, 9, 4, 5, 6, 7, 8, 9];
    const sum = digits(bban.slice(0, 10)).reduce((acc, d, i) => acc + d * weights[i], 0);
    return String(sum % 11) === bban[10];
  }
  if (country === "ES") {
    const check = (part) => {
      const sum = digits(part).reduce((acc, d, i) => acc + d * 2 ** i, 0) % 11;
      return String(sum < 2 ? sum : 11 - sum);
    };
    return bban.slice(8, 10) === check("00" + bban.slice(0, 8)) + check(bban.slice(10));
  }
  return true;
}

export function looksLikeCompleteIban(value) {
  const compact = normalizeIban(value);
  if (compact === null) return false;
  // "checksum" is a known-length (or unknown-country) shape ready for the
  // mod-97 check; "bad-format" is a known country whose length is wrong.
  // Both are IBAN-shaped enough for the cross-field checks that gate on this
  // (BIC country match, remittance-missing, payment-means-needs-IBAN) --
  // only "unknown" (no country-shaped prefix at all, e.g. an internal
  // account id) should read as "there is no IBAN here". This used to check
  // for a classify() result of "format", which classify() never returns, so
  // every wrong-length IBAN silently read as "not an IBAN" and skipped those
  // checks instead of surfacing them alongside the length finding.
  const kind = classify(compact);
  return kind === "checksum" || kind === "bad-format";
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
  if (kind === "checksum" && (!mod97Ok(compact) || !nationalCheckOk(compact.slice(0, 2), compact.slice(4)))) {
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
  if (!invoice || typeof invoice !== "object") return [];
  const payment = invoice.payment;
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return [];
  const iban = payment.iban;
  if (iban === undefined || iban === null || iban === "") return [];
  return checkExplicit(iban, "/payment/iban");
}
