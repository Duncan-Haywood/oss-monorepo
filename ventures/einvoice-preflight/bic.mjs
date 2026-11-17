// Offline BIC or national clearing code shape, and IBAN-country / IBAN-bank-code observations.
// Typo catch only — not a SWIFT lookup and not a claim funds can be received.

import { looksLikeCompleteIban, normalizeIban } from "./iban.mjs";

function finding(rule, message, fix, path, severity) {
  return severity ? { rule, message, fix, path, severity } : { rule, message, fix, path };
}

export function normalizeBic(value) {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact || null;
}

function classify(compact) {
  if (compact.length !== 8 && compact.length !== 11) return "unknown";
  const bank = compact.slice(0, 4);
  const country = compact.slice(4, 6);
  const location = compact.slice(6, 8);
  const branch = compact.slice(8);
  if (!/^[A-Z]{4}$/.test(bank) || !/^[A-Z]{2}$/.test(country)) return "unknown";
  if (!/^[A-Z0-9]{2}$/.test(location)) return "unknown";
  if (branch && !/^[A-Z0-9]{3}$/.test(branch)) return "unknown";
  return "ok";
}

export function looksLikeCompleteBic(value) {
  const compact = normalizeBic(value);
  return compact !== null && classify(compact) === "ok";
}

// EN 16931 BT-86 (payment service provider identifier) names the bank where the account is
// held, and the standard admits a BIC or a national clearing code there (paraphrased from the
// semantic model; the spec page was not reachable from the session that wrote this, 2026-11-12,
// docs.peppol.eu unresolved). So a value that is
// not BIC-shaped is not automatically wrong: a UK sort code, a German BLZ, a US ABA routing
// number, an Australian BSB or an Indian IFSC are all legitimate there. Before 2026-11-12 every
// non-BIC value was INV-026, which falsely failed
// any UK or US supplier quoting a sort code or routing number. A clearing code is instead
// checked against the bank code inside the IBAN, which catches a typo a BIC check never could.

// Indian Financial System Code: four bank letters, a reserved zero, six branch characters (RBI).
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// Where the domestic bank (and branch) code sits inside each country's BBAN, from the SWIFT IBAN
// registry's "bank identifier" and "branch identifier" positions (0-based, end exclusive). A
// clearing code in BT-86 should equal one of these slices of the IBAN in BT-84. `pad` lets a
// shorter code match after left zero-padding (Swiss and Liechtenstein IIDs are written 3-5 digits).
const IBAN_CLEARING = {
  AT: [[0, 5]], BE: [[0, 3]], CH: [[0, 5]], CZ: [[0, 4]], DE: [[0, 8]], DK: [[0, 4]],
  ES: [[0, 4], [0, 8]], FO: [[0, 4]], FR: [[0, 5], [0, 10]], GB: [[4, 10]], GL: [[0, 4]],
  HR: [[0, 7]], HU: [[0, 3], [0, 7]], IE: [[4, 10]], IT: [[1, 6], [1, 11]], LI: [[0, 5]],
  MC: [[0, 5], [0, 10]], NO: [[0, 4]], PL: [[0, 8]], PT: [[0, 4], [0, 8]], SI: [[0, 5]],
  SK: [[0, 4]], SM: [[1, 6], [1, 11]],
};
const PAD_COUNTRIES = new Set(["CH", "LI"]);

// ABA routing number check digit: weights 3, 7, 1 repeating, sum divisible by 10.
export function abaChecksumOk(digits) {
  if (!/^\d{9}$/.test(digits)) return false;
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * w[i];
  return sum % 10 === 0;
}

// The first two digits of a US routing number name a Federal Reserve district (01-12), a thrift
// (21-32), an electronic transaction code (61-72), the US government (00) or traveller's
// cheques (80). Nine digits outside those are not an ABA number and are left as a clearing code.
function abaPrefix(digits) {
  const p = Number(digits.slice(0, 2));
  return p <= 12 || (p >= 21 && p <= 32) || (p >= 61 && p <= 72) || p === 80;
}

// "bic", "clearing" (a national clearing code), "bad-routing" (nine digits that read as a US
// routing number but fail its check digit), "maybe-routing" (the same, but with a leading 0,
// which Canada's EFT form and Russia's BIK also have), or "unknown".
export function classifyProviderId(value) {
  const compact = normalizeBic(value);
  if (compact === null) return "unknown";
  if (classify(compact) === "ok") return "bic";
  if (IFSC_RE.test(compact)) return "clearing";
  if (/^\d{3,11}$/.test(compact)) {
    // Nine digits with a district prefix read as a US ABA routing number, which carries a
    // check digit. A leading 0 is also Canada's EFT form (0 + institution + transit) and
    // Russia's BIK, so a failed check there is only a note.
    if (compact.length === 9 && abaPrefix(compact) && !abaChecksumOk(compact)) {
      return compact[0] === "0" ? "maybe-routing" : "bad-routing";
    }
    return "clearing";
  }
  return "unknown";
}

function checkExplicit(value, path) {
  if (typeof value !== "string" || !value.trim() || normalizeBic(value) === null) {
    return [finding(
      "INV-026",
      "Payment BIC is empty or not text.",
      "Provide the BIC as text, or omit payment.bic.",
      path,
    )];
  }
  const kind = classifyProviderId(value);
  if (kind === "bad-routing") {
    return [finding(
      "INV-026",
      "Payment provider id has nine digits like a US ABA routing number, but its check digit does not add up.",
      "Copy the routing number again from the bank's documents, or give the BIC instead.",
      path,
    )];
  }
  if (kind === "maybe-routing") {
    return [finding(
      "INV-026",
      "Payment provider id has nine digits like a US ABA routing number, but its check digit does not add up (fine if it is a Canadian EFT routing number or a Russian BIK).",
      "If it is a US routing number, copy it again from the bank's documents.",
      path,
      "note",
    )];
  }
  if (kind === "unknown") {
    return [finding(
      "INV-026",
      "Payment BIC is not an 8- or 11-character bank identifier, nor a national clearing code (3 to 11 digits, or an Indian IFSC).",
      "Use four letters, a two-letter country, a two-character location, and an optional three-character branch; or the bank's national clearing code (sort code, BLZ, routing number); or omit payment.bic.",
      path,
    )];
  }
  return [];
}

function countryMismatch(payment) {
  const compactBic = normalizeBic(payment.bic);
  const compactIban = normalizeIban(payment.iban);
  if (compactBic === null || compactIban === null) return [];
  if (!looksLikeCompleteBic(compactBic) || !looksLikeCompleteIban(compactIban)) return [];
  const bicCountry = compactBic.slice(4, 6);
  const ibanCountry = compactIban.slice(0, 2);
  if (bicCountry === ibanCountry) return [];
  return [finding(
    "INV-027",
    "Payment BIC country does not match the payment IBAN country.",
    "Correct the BIC or the IBAN so both use the same country, or omit payment.bic.",
    "/payment/bic",
  )];
}

function clearingMismatch(payment) {
  const compact = normalizeBic(payment.bic);
  const compactIban = normalizeIban(payment.iban);
  if (compact === null || compactIban === null || !/^\d+$/.test(compact)) return [];
  if (!looksLikeCompleteIban(compactIban)) return [];
  const country = compactIban.slice(0, 2);
  const slices = IBAN_CLEARING[country];
  if (!slices) return [];
  const bban = compactIban.slice(4);
  const matches = slices.some(([a, b]) => {
    const part = bban.slice(a, b);
    if (part === compact) return true;
    return PAD_COUNTRIES.has(country) && compact.length < part.length && compact.padStart(part.length, "0") === part;
  });
  if (matches) return [];
  return [finding(
    "INV-027",
    "Payment clearing code does not match the bank code inside the payment IBAN.",
    "Correct the clearing code or the IBAN so they name the same bank, or omit payment.bic.",
    "/payment/bic",
  )];
}

export function inspectPaymentBic(invoice) {
  const payment = invoice.payment;
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return [];
  const bic = payment.bic;
  if (bic === undefined || bic === null || bic === "") return [];
  const findings = checkExplicit(bic, "/payment/bic");
  if (findings.length) return findings;
  if (classifyProviderId(bic) === "clearing") return clearingMismatch(payment);
  return countryMismatch(payment);
}
