// Opt-in country profile: the German XRechnung business rules (BR-DE-*) that
// sit on top of EN 16931. The core checks answer "is this invoice
// arithmetically and structurally sound"; this answers "will a German public
// buyer's portal accept it". Rule ids are XR-nnn and name the BR-DE rule they
// mirror. Findings never repeat a typed reference or address. This is an
// offline observation, not the KoSIT validator and not a legal opinion.

const XRECHNUNG_TYPE_CODES = new Set(["326", "380", "381", "384", "389", "875", "876", "877"]);
const XRECHNUNG_SPEC = /^urn:cen\.eu:en16931:2017#(?:compliant|conformant)#urn:xeinkauf\.de:kosit:(?:xrechnung_3\.\d+|extension:xrechnung_3\.\d+)/i;

const PEPPOL_SPEC = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
const PEPPOL_PROCESS = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

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

export const PEPPOL_RULES = {
  "PP-001": "Business process (BT-23) is missing or is not the Peppol billing process (PEPPOL-EN16931-R001).",
  "PP-002": "Specification identifier is not Peppol BIS Billing 3.0 (PEPPOL-EN16931-R004).",
  "PP-003": "Seller electronic address (BT-34) is missing (PEPPOL-EN16931-R020).",
  "PP-004": "Buyer electronic address (BT-49) is missing (PEPPOL-EN16931-R010).",
  "PP-005": "Neither a buyer reference nor an order reference is present (PEPPOL-EN16931-R003).",
};

function hasEndpoint(party) {
  return isObject(party) && isObject(party.endpoint) && Boolean(str(party.endpoint.id));
}

/** Peppol BIS Billing 3.0 rules on top of EN 16931: what a Peppol access point
 *  rejects even when the invoice is arithmetically sound. Ids are PP-nnn and
 *  name the PEPPOL-EN16931-R rule they mirror. Offline observation only. */
export function inspectPeppolProfile(invoice) {
  if (!isObject(invoice)) return [];
  const findings = [];

  const process = str(invoice.profile_id);
  if (process !== PEPPOL_PROCESS) {
    findings.push(finding(
      "PP-001",
      process ? "Business process (BT-23) is not the Peppol billing process." : "Business process (BT-23) is missing.",
      `Set the business process to ${PEPPOL_PROCESS} (UBL cbc:ProfileID, CII BusinessProcessSpecifiedDocumentContextParameter).`,
      "/profile_id",
    ));
  }

  const spec = str(invoice.specification_id);
  if (spec !== PEPPOL_SPEC) {
    findings.push(finding(
      "PP-002",
      spec ? "Specification identifier (BT-24) does not name Peppol BIS Billing 3.0." : "Specification identifier (BT-24) is missing.",
      `Set it to ${PEPPOL_SPEC}. An XRechnung identifier is only right for German buyers.`,
      "/specification_id",
    ));
  }

  if (!hasEndpoint(invoice.supplier)) {
    findings.push(finding(
      "PP-003",
      "Seller electronic address (BT-34) is missing.",
      "Add supplier.endpoint with the scheme and the id registered on the Peppol network, e.g. scheme 0088 (GLN) or 0192.",
      "/supplier/endpoint",
    ));
  }
  if (!hasEndpoint(invoice.customer)) {
    findings.push(finding(
      "PP-004",
      "Buyer electronic address (BT-49) is missing.",
      "Add customer.endpoint with the buyer's Peppol scheme and id; the access point routes on it.",
      "/customer/endpoint",
    ));
  }

  if (!str(invoice.buyer_reference) && !str(invoice.order_reference)) {
    findings.push(finding(
      "PP-005",
      "Neither a buyer reference (BT-10) nor an order reference (BT-13) is present.",
      "Add buyer_reference (the buyer's routing reference) or order_reference (their purchase-order number).",
      "/buyer_reference",
    ));
  }

  return findings;
}

// ---------------------------------------------------------------------------
// French profile (FR-nnn): the identifier and mention rules behind France's
// e-invoicing reform (mandatory reception from 1 September 2026, issuing
// phased in after) and the Code de commerce payment mentions that a French
// B2B invoice has always carried. Offline observation of what a platform or a
// French buyer's accounts-payable would bounce; not a Plateforme Agréée's
// validator and not legal advice. Findings never repeat a typed identifier.

export const FRENCH_RULES = {
  "FR-001": "French seller has no SIREN or SIRET on the invoice.",
  "FR-002": "A SIREN or SIRET is the wrong length or fails its Luhn check digit.",
  "FR-003": "The SIREN inside the seller's French VAT number differs from the seller's SIREN or SIRET.",
  "FR-004": "French buyer has no SIREN or SIRET, so the invoice cannot be routed to them.",
  "FR-005": "Late-payment penalty rate mention is missing (Code de commerce L441-10).",
  "FR-006": "Fixed 40 euro recovery indemnity mention is missing (Code de commerce D441-5).",
  "FR-007": "Early-payment discount (escompte) mention is missing (Code de commerce L441-9).",
  "FR-008": "Category of the operation (goods, services or mixed) is not stated; the reform adds it to the mandatory invoice data.",
};

function digitsOnly(value) {
  return String(value ?? "").replace(/[\s.\-]/g, "");
}

function luhnValid(digits) {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** SIREN: 9 digits, Luhn. SIRET: 14 digits, Luhn, except La Poste's SIREN
 *  356000000, whose establishments only need a digit sum divisible by 5. */
export function sirenValid(value) {
  const d = digitsOnly(value);
  return d.length === 9 && luhnValid(d);
}

export function siretValid(value) {
  const d = digitsOnly(value);
  if (d.length !== 14 || !/^\d+$/.test(d)) return false;
  if (d.startsWith("356000000")) return [...d].reduce((s, c) => s + Number(c), 0) % 5 === 0;
  return luhnValid(d);
}

function legalIdOf(party) {
  if (!isObject(party)) return "";
  const raw = party.legal_id;
  const id = isObject(raw) ? raw.id : raw;
  return digitsOnly(typeof id === "string" || typeof id === "number" ? id : "");
}

function isFrench(party) {
  if (!isObject(party)) return false;
  return str(party.country).toUpperCase() === "FR" || /^FR/i.test(str(party.vat_id));
}

function noteText(invoice) {
  const notes = Array.isArray(invoice.notes) ? invoice.notes : [];
  const payment = isObject(invoice.payment) ? invoice.payment : {};
  return [...notes, payment.terms_text].filter((n) => typeof n === "string").join("\n");
}

export function inspectFrenchProfile(invoice) {
  if (!isObject(invoice)) return [];
  const findings = [];
  const supplier = isObject(invoice.supplier) ? invoice.supplier : {};
  const customer = isObject(invoice.customer) ? invoice.customer : {};

  const sellerId = legalIdOf(supplier);
  const buyerId = legalIdOf(customer);
  const sellerFrench = isFrench(supplier);

  if (sellerFrench && !sellerId) {
    findings.push(finding(
      "FR-001",
      "French seller has no SIREN or SIRET (legal registration identifier, BT-30).",
      "Add supplier.legal_id with the 9-digit SIREN or 14-digit SIRET (scheme 0002). The reform's directory routes on it.",
      "/supplier/legal_id",
    ));
  }
  if (isFrench(customer) && !buyerId) {
    findings.push(finding(
      "FR-004",
      "French buyer has no SIREN or SIRET (BT-47), so a platform cannot route the invoice to them.",
      "Add customer.legal_id with the buyer's SIREN or SIRET (scheme 0002); ask them for it, it is on their Kbis.",
      "/customer/legal_id",
    ));
  }

  for (const [role, id, path] of [["Seller", sellerId, "/supplier/legal_id"], ["Buyer", buyerId, "/customer/legal_id"]]) {
    if (id && !(sirenValid(id) || siretValid(id))) {
      findings.push(finding(
        "FR-002",
        `${role} SIREN/SIRET is not 9 or 14 digits or fails its Luhn check digit.`,
        "Copy the number again from the Kbis or the INSEE avis de situation; one wrong digit fails the check.",
        path,
      ));
    }
  }

  const vat = digitsOnly(str(supplier.vat_id).replace(/^FR/i, ""));
  if (/^FR/i.test(str(supplier.vat_id)) && sellerId && vat.length === 11 && (sirenValid(sellerId) || siretValid(sellerId))) {
    if (vat.slice(2) !== sellerId.slice(0, 9)) {
      findings.push(finding(
        "FR-003",
        "The SIREN inside the seller's French VAT number is not the seller's SIREN.",
        "A French VAT number is FR, two key digits, then the SIREN. Check that VAT number and legal_id belong to the same company.",
        "/supplier/vat_id",
      ));
    }
  }

  const isCredit = str(invoice.document_type) === "credit_note";
  if (sellerFrench && !isCredit) {
    const text = noteText(invoice);
    if (!/#PMD#|p[eé]nalit|late[- ]payment|taux d'int[eé]r[eê]t/i.test(text)) {
      findings.push(finding(
        "FR-005",
        "No late-payment penalty rate is stated (L441-10).",
        "Add a note such as: Pénalités de retard : taux BCE + 10 points (minimum three times the legal interest rate). Factur-X uses subject code PMD.",
        "/notes",
      ));
    }
    if (!/#PMT#|recouvrement|indemnit|recovery/i.test(text)) {
      findings.push(finding(
        "FR-006",
        "No fixed recovery indemnity is stated (D441-5).",
        "Add a note such as: Indemnité forfaitaire pour frais de recouvrement : 40 €. Factur-X uses subject code PMT.",
        "/notes",
      ));
    }
    if (!/#AAB#|escompte|early[- ]payment|discount/i.test(text)) {
      findings.push(finding(
        "FR-007",
        "No early-payment discount (escompte) condition is stated (L441-9).",
        "Add a note such as: Pas d'escompte pour paiement anticipé (or the rate you grant). Factur-X uses subject code AAB.",
        "/notes",
      ));
    }
    if (!/livraisons? de biens|prestations? de services?|op[eé]ration mixte|\bgoods\b|\bservices\b|\bmixed\b/i.test(text)) {
      findings.push(finding(
        "FR-008",
        "No category of operation (goods, services or mixed) is stated in the notes.",
        "Add a note such as: Catégorie d'opération : prestation de services (or livraison de biens, or opération mixte). The reform lists it among the invoice data; confirm with your platform whether it wants it as a structured field.",
        "/notes",
      ));
    }
  }
  return findings;
}
