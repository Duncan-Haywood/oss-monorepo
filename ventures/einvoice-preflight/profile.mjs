// Opt-in country profile: the German XRechnung business rules (BR-DE-*) that
// sit on top of EN 16931. The core checks answer "is this invoice
// arithmetically and structurally sound"; this answers "will a German public
// buyer's portal accept it". Rule ids are XR-nnn and name the BR-DE rule they
// mirror. Findings never repeat a typed reference or address. This is an
// offline observation, not the KoSIT validator and not a legal opinion.

const XRECHNUNG_TYPE_CODES = new Set(["326", "380", "381", "384", "389", "875", "876", "877"]);
const XRECHNUNG_SPEC = /^urn:cen\.eu:en16931:2017#(?:compliant|conformant)#urn:xeinkauf\.de:kosit:(?:xrechnung_3\.\d+|extension:xrechnung_3\.\d+)/i;

function finding(rule, message, fix, path) {
  return { rule, message, fix, path };
}

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

/** Leitweg-ID: coarse address (2-12 digits), optional fine address (up to 30
 *  letters/digits), two check digits, joined by hyphens. */
const LEITWEG_SHAPE = /^\d{2,12}(?:-[A-Za-z0-9]{1,30})?-\d{2}$/;

/** ISO 7064 MOD 97-10 over the whole id with hyphens removed and letters
 *  mapped A=10..Z=35 (the same scheme as an IBAN); a valid id leaves 1.
 *  Verified against the published samples 991-12345-73 and 09-12345-15. */
export function leitwegCheckDigitsValid(id) {
  const compact = str(id).replace(/-/g, "").toUpperCase();
  if (!compact) return false;
  let digits = "";
  for (const ch of compact) {
    digits += /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
  }
  let remainder = 0;
  for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  return remainder === 1;
}

export function looksLikeLeitwegId(value) {
  return LEITWEG_SHAPE.test(str(value));
}

function emailOk(value) {
  const parts = value.split("@");
  return value === value.trim() && !/\s/.test(value) && parts.length === 2
    && Boolean(parts[0]) && parts[1].includes(".") && !parts[1].startsWith(".") && !parts[1].endsWith(".");
}

export const XRECHNUNG_RULES = {
  "XR-001": "Buyer reference (BR-DE-15) is missing.",
  "XR-002": "Buyer reference looks like a Leitweg-ID but its check digits are wrong.",
  "XR-003": "Payment instructions (BR-DE-1) are missing.",
  "XR-004": "Seller contact (BR-DE-2, -5, -6, -7) is incomplete.",
  "XR-005": "Seller city or postal code (BR-DE-3, -4) is missing.",
  "XR-006": "Buyer city or postal code (BR-DE-8, -9) is missing.",
  "XR-007": "Invoice type code is not one XRechnung allows (BR-DE-17).",
  "XR-008": "Specification identifier is not an XRechnung one (BR-DE-21).",
  "XR-009": "Seller has no VAT identifier or tax number (BR-DE-16).",
};

export function inspectXrechnungProfile(invoice) {
  if (!isObject(invoice)) return [];
  const findings = [];
  const supplier = isObject(invoice.supplier) ? invoice.supplier : {};
  const customer = isObject(invoice.customer) ? invoice.customer : {};

  const buyerRef = str(invoice.buyer_reference);
  if (!buyerRef) {
    findings.push(finding(
      "XR-001",
      "Buyer reference (BT-10) is missing; XRechnung requires it (BR-DE-15).",
      "Add buyer_reference: the Leitweg-ID the public body gave you, or the customer's own routing reference.",
      "/buyer_reference",
    ));
  } else if (looksLikeLeitwegId(buyerRef) && !leitwegCheckDigitsValid(buyerRef)) {
    findings.push(finding(
      "XR-002",
      "Buyer reference is shaped like a Leitweg-ID but its two check digits do not match.",
      "Copy the Leitweg-ID again from the buyer's request; a single mistyped character fails the check digits.",
      "/buyer_reference",
    ));
  }

  const payment = isObject(invoice.payment) ? invoice.payment : null;
  if (!payment || (!str(payment.means) && !str(payment.iban))) {
    findings.push(finding(
      "XR-003",
      "No payment instructions; XRechnung requires a payment means code (BR-DE-1).",
      "Add payment.means (for example 58 for SEPA credit transfer) and payment.iban.",
      "/payment",
    ));
  }

  const contact = isObject(supplier.contact) ? supplier.contact : {};
  const missing = ["name", "phone", "email"].filter((key) => !str(contact[key]));
  if (missing.length) {
    findings.push(finding(
      "XR-004",
      `Seller contact is missing its ${missing.join(", ")}.`,
      "Add supplier.contact with a name, a telephone number and an e-mail address.",
      "/supplier/contact",
    ));
  } else if (!emailOk(str(contact.email))) {
    findings.push(finding(
      "XR-004",
      "Seller contact e-mail is not shaped like an address.",
      "Use one plain address such as billing@example.com.",
      "/supplier/contact/email",
    ));
  }

  for (const [rule, role, party, code] of [["XR-005", "Seller", supplier, "3, -4"], ["XR-006", "Buyer", customer, "8, -9"]]) {
    const gaps = ["city", "postal_code"].filter((key) => !str(party[key]));
    if (gaps.length) {
      findings.push(finding(
        rule,
        `${role} ${gaps.map((g) => g.replace("_", " ")).join(" and ")} missing (BR-DE-${code}).`,
        `Add the ${role.toLowerCase()}'s city and postal code to the ${role === "Seller" ? "supplier" : "customer"} address.`,
        `/${role === "Seller" ? "supplier" : "customer"}`,
      ));
    }
  }

  const code = str(invoice.document_code);
  if (code && !XRECHNUNG_TYPE_CODES.has(code)) {
    findings.push(finding(
      "XR-007",
      `Invoice type code ${code} is not accepted by XRechnung.`,
      "Use 380 (invoice) or 381 (credit note); 326, 384, 389, 875, 876 and 877 are the other allowed codes.",
      "/document_code",
    ));
  }

  const spec = str(invoice.specification_id);
  if (spec && !XRECHNUNG_SPEC.test(spec)) {
    findings.push(finding(
      "XR-008",
      "Specification identifier (BT-24) does not name an XRechnung version.",
      "Set it to urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0. The older xoev-de identifier belongs to XRechnung 2.x.",
      "/specification_id",
    ));
  }

  if (!str(supplier.vat_id) && !str(supplier.tax_number)) {
    findings.push(finding(
      "XR-009",
      "Seller has neither a VAT identifier nor a tax number (BR-DE-16).",
      "Add supplier.vat_id (DE + 9 digits) or supplier.tax_number.",
      "/supplier/vat_id",
    ));
  }

  return findings;
}
