// Invoice creator: a plain "draft" (who, what, how much) in, a ready-to-send
// EN 16931 e-invoice out, as UBL 2.1 or UN/CEFACT CII, with the totals and the
// VAT breakdown computed for you. It is the other half of the preflight
// checker: whatever this writes is read straight back through the same readers
// and checks the checker applies, so a draft that would be rejected says so
// before you download it.
//
// Not a certified invoicing system and not tax advice. It writes the common
// B2B/B2G cases (standard, zero, exempt, reverse-charge, intra-EU, export, and
// out-of-scope VAT; invoices and credit notes). It does not sign, archive,
// transmit, or look up a Leitweg-ID or Peppol participant.
//
// Zero dependencies. Runs in Node 20+ and in the browser (create.html).

import { roundHalfUpToCents } from "./checks.mjs";

export const PROFILES = {
  xrechnung: {
    label: "XRechnung 3.0 (Germany, B2G and B2B)",
    customization: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
    profileId: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
  },
  peppol: {
    label: "Peppol BIS Billing 3.0",
    customization: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
    profileId: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
  },
  en16931: {
    label: "EN 16931 core",
    customization: "urn:cen.eu:en16931:2017",
    profileId: "",
  },
  hr: {
    label: "HR-CIUS 2025 with the HR extension (Croatia, Fiskalizacija 2.0)",
    customization: "urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0",
    profileId: "P1", // the business process (HR-BR-34); a draft's `process` replaces it
  },
};

// Croatia (HR-CIUS 2025). The OIB is 11 digits with an ISO 7064 MOD 11,10 check digit (HR-BR-53, -9).
export function oibOk(value) {
  const s = String(value ?? "").replace(/^HR/i, "");
  if (!/^\d{11}$/.test(s)) return false;
  let a = 10;
  for (const c of s.slice(0, 10)) { a = (a + +c) % 10 || 10; a = (a * 2) % 11; }
  return (11 - a) % 10 === +s[10];
}
// HR-TB-2 labels (HR-BR-CL-1) for the categories this creator writes. Standard rate: 25, 13 or 5 %.
const HR_LABEL = { Z: "HR:Z", E: "HR:E", AE: "HR:AE", K: "HR:K", G: "HR:G", O: "HR:O" };
const hrLabel = (category, percent) => category === "S" ? `HR:PDV${percent}` : HR_LABEL[category];
const HR_RATES = new Set([25, 13, 5]);
// HR-TB-2's out-of-scope labels: amounts outside the VAT base (a refundable deposit, consumption
// tax, the special tax on motor vehicles, other non-taxable fees such as the tourist tax). The
// Porezna uprava's own samples write each as category E in the EN layer, with the reason
// "#HR:<label>#<text>", and as category O with the label in the HR breakdown, under its own tax
// scheme (OTH, LOC, CAR; VAT for HR:N); the amount goes to OutOfScopeOfVATAmount (HR-BR-32) and
// leaves the HR tax base (HR-BR-27).
export const HR_OUT_OF_SCOPE = {
  POVNAK: { text: "Povratna naknada", scheme: "OTH" },
  PP: { text: "Porez na potrošnju", scheme: "LOC" },
  PPMV: { text: "Posebni porez na motorna vozila", scheme: "CAR" },
  N: { text: "Neoporeziva naknada", scheme: "VAT" },
};
const hrOutOfScope = (label) => (Object.hasOwn(HR_OUT_OF_SCOPE, label) ? HR_OUT_OF_SCOPE[label] : { text: "", scheme: "VAT" });
// Invoice type codes on which a line may go without a KPD class (HR-BR-25): advance invoices and credit notes.
const HR_NO_KPD = new Set(["386", "81", "83", "261", "262", "296", "308", "381", "396", "420", "458", "532"]);

const NEEDS_REASON = new Set(["E", "AE", "K", "G", "O"]);
const CATEGORIES = new Set(["S", "Z", ...NEEDS_REASON]);
const UNIT_CODES = new Set(["C62", "HUR", "DAY", "MON", "KGM", "LTR", "MTR", "MTK", "KMT", "WEE", "ANN", "SET", "PCE", "MTQ", "TNE"]);
const UNIT_ALIASES = {
  piece: "C62", pieces: "C62", pcs: "C62", unit: "C62", units: "C62", item: "C62",
  hour: "HUR", hours: "HUR", h: "HUR", hr: "HUR",
  day: "DAY", days: "DAY", month: "MON", months: "MON", week: "WEE", weeks: "WEE", year: "ANN",
  kg: "KGM", l: "LTR", m: "MTR", m2: "MTK", m3: "MTQ", t: "TNE", tonne: "TNE", km: "KMT", set: "SET", flat: "C62", "flat rate": "C62",
};

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const text = (value) => (typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim());
const cents = (value) => Math.round(roundHalfUpToCents(value) * 100);
const fixed = (centsValue) => (centsValue / 100).toFixed(2);

function num(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function dateOk(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function unitCode(raw) {
  const t = text(raw);
  if (!t) return "C62";
  if (UNIT_CODES.has(t.toUpperCase())) return t.toUpperCase();
  return UNIT_ALIASES[t.toLowerCase()] || "";
}

function normalizeParty(raw, role) {
  const p = raw && typeof raw === "object" ? raw : {};
  const endpoint = p.endpoint && typeof p.endpoint === "object" ? p.endpoint : null;
  const contact = p.contact && typeof p.contact === "object" ? p.contact : {};
  return {
    role,
    name: text(p.name),
    street: text(p.street),
    street2: text(p.street2),
    city: text(p.city),
    postal_code: text(p.postal_code),
    country: text(p.country).toUpperCase(),
    vat_id: text(p.vat_id).replace(/\s+/g, "").toUpperCase(),
    tax_number: text(p.tax_number),
    company_id: text(p.company_id),
    endpoint: endpoint && text(endpoint.id) ? { scheme: text(endpoint.scheme), id: text(endpoint.id) } : null,
    contact: { name: text(contact.name), phone: text(contact.phone), email: text(contact.email) },
  };
}

/** Validate and normalize a draft; compute every amount. Throws nothing:
 *  problems come back as `errors` (cannot write a usable document) and
 *  `warnings` (writable, but the chosen profile or a receiver will want more). */
export function buildInvoice(draft, { profile = "xrechnung" } = {}) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  const d = draft && typeof draft === "object" ? draft : {};
  if (!PROFILES[profile]) err("profile", `Unknown profile "${profile}". Use xrechnung, peppol, en16931 or hr.`);
  const hr = profile === "hr";

  const kind = /credit/i.test(text(d.document_type)) ? "credit_note" : "invoice";
  const currency = (text(d.currency) || "EUR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) err("currency", "Currency must be a 3-letter ISO 4217 code such as EUR.");
  const number = text(d.number);
  if (!number) err("number", "Invoice number is required.");
  const issue = text(d.issue_date);
  if (!dateOk(issue)) err("issue_date", "Issue date must be a real date as YYYY-MM-DD.");
  const due = text(d.due_date);
  if (due && !dateOk(due)) err("due_date", "Due date must be a real date as YYYY-MM-DD.");
  if (due && dateOk(due) && dateOk(issue) && due < issue) warn("due_date", "Due date is before the issue date.");

  const seller = normalizeParty(d.seller, "seller");
  const buyer = normalizeParty(d.buyer, "buyer");
  for (const p of [seller, buyer]) {
    const path = p.role;
    if (!p.name) err(`${path}.name`, `The ${p.role}'s name is required.`);
    if (!/^[A-Z]{2}$/.test(p.country)) err(`${path}.country`, `The ${p.role}'s country must be a 2-letter ISO code such as DE.`);
  }
  if (seller.name && !seller.city) err("seller.city", "The seller's city is required.");
  if (seller.name && !seller.vat_id && !seller.tax_number) {
    err("seller.vat_id", "The seller needs a VAT ID or a national tax number (EN 16931 rule BR-CO-9 / BT-31 or BT-32).");
  }
  if (seller.vat_id && !/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(seller.vat_id)) {
    err("seller.vat_id", "VAT ID should start with a 2-letter country prefix, e.g. DE136695976.");
  }

  if (profile === "xrechnung") {
    if (!text(d.buyer_reference)) {
      warn("buyer_reference", "XRechnung requires a buyer reference (BT-10): the Leitweg-ID for a public body, or the customer's own routing reference.");
    }
    const c = seller.contact;
    if (!c.name || !c.phone || !c.email) {
      warn("seller.contact", "XRechnung requires a seller contact with name, phone and email (BR-DE-2, -5, -6, -7).");
    }
    if (!seller.street || !seller.postal_code) warn("seller.street", "XRechnung requires the seller's street and postal code (BR-DE-3, BR-DE-4).");
    if (!text(d.payment && d.payment.iban) && !(d.payment && d.payment.means)) {
      warn("payment", "XRechnung requires payment instructions (BR-DE-1): add an IBAN or a payment means code.");
    }
  }
  if (profile === "peppol" && !text(d.buyer_reference) && !text(d.order_reference)) {
    warn("buyer_reference", "Peppol BIS requires a buyer reference or an order reference (PEPPOL-EN16931-R003).");
  }
  if (profile !== "en16931" && !hr && !seller.endpoint) {
    warn("seller.endpoint", "Peppol and XRechnung require the seller's electronic address (BT-34), e.g. {\"scheme\":\"EM\",\"id\":\"billing@you.example\"}.");
  }
  if (profile !== "en16931" && !hr && !buyer.endpoint) {
    warn("buyer.endpoint", "Peppol and XRechnung require the buyer's electronic address (BT-49), e.g. {\"scheme\":\"EM\",\"id\":\"ap@them.example\"}.");
  }

  const rawLines = Array.isArray(d.lines) ? d.lines : [];
  if (!rawLines.length) err("lines", "At least one line is required.");

  // The VAT side of a line, allowance or charge: category, rate, exemption reason, and in Croatia
  // an out-of-scope label (hr_label). Null when the rate cannot be read.
  const taxOf = (l, path) => {
    const percent = num(l.tax_percent ?? 0);
    if (percent === null || percent < 0 || percent > 100) err(`${path}.tax_percent`, "VAT percent must be a number from 0 to 100.");
    let category = text(l.tax_category).toUpperCase();
    let reason = text(l.tax_reason);
    let label = text(l.hr_label).toUpperCase().replace(/^HR:/, "");
    if (label && !hr) {
      err(`${path}.hr_label`, "hr_label is one of Croatia's out-of-scope labels (HR:POVNAK, HR:PP, HR:PPMV, HR:N): use the hr profile, or leave it out.");
      label = "";
    } else if (label && !Object.hasOwn(HR_OUT_OF_SCOPE, label)) {
      err(`${path}.hr_label`, `Unknown out-of-scope label "${text(l.hr_label)}". Use POVNAK (refundable deposit), PP (consumption tax), PPMV (special tax on motor vehicles) or N (other non-taxable fee, e.g. tourist tax) (HR-TB-2).`);
      label = "";
    } else if (label) {
      // The authority's samples: E at 0 % in the EN layer, O in the HR breakdown.
      if (category && category !== "E") err(`${path}.tax_category`, `An amount labelled HR:${label} is outside the VAT base: its EN category is E (the HR breakdown says O). Leave tax_category out or set it to E.`);
      if (percent > 0) err(`${path}.tax_percent`, `An amount labelled HR:${label} carries no VAT: set tax_percent to 0.`);
      category = "E";
      if (!reason) reason = hrOutOfScope(label).text;
    }
    if (!category) category = percent > 0 ? "S" : "Z";
    if (!CATEGORIES.has(category)) err(`${path}.tax_category`, `VAT category must be one of ${[...CATEGORIES].join(", ")}.`);
    if (category === "S" && percent === 0) err(`${path}.tax_percent`, "Standard-rated (S) needs a rate above 0. For 0% pick Z, E, AE, K, G or O.");
    if (category !== "S" && percent > 0 && !label) err(`${path}.tax_percent`, `Category ${category} is a 0% category; set tax_percent to 0.`);
    if (hr && category === "S" && percent !== null && percent > 0 && !HR_RATES.has(percent)) {
      err(`${path}.tax_percent`, "Croatia's standard-rate labels are HR:PDV25, HR:PDV13 and HR:PDV5 (HR-BR-CL-1): use 25, 13 or 5.");
    }
    if (NEEDS_REASON.has(category) && !reason) {
      err(`${path}.tax_reason`, `Category ${category} needs an exemption reason, e.g. "Reverse charge" (AE), "Intra-community supply" (K), "Kleinunternehmer § 19 UStG" (E).`);
    }
    if (percent === null) return null;
    const en_reason = label && !reason.startsWith("#HR:") ? `#HR:${label}#${reason}` : reason;
    return { category, percent: label ? 0 : percent, reason, en_reason, hr_label: label };
  };

  const lines = [];
  rawLines.forEach((raw, i) => {
    const path = `lines[${i}]`;
    const l = raw && typeof raw === "object" ? raw : {};
    const description = text(l.description);
    if (!description) err(`${path}.description`, "Line description is required.");
    const quantity = num(l.quantity ?? 1);
    if (quantity === null || quantity === 0) err(`${path}.quantity`, "Quantity must be a non-zero number.");
    const price = num(l.unit_price);
    if (price === null || price < 0) err(`${path}.unit_price`, "Unit price must be a number, 0 or more (use a credit note for refunds).");
    const unit = unitCode(l.unit);
    if (!unit) err(`${path}.unit`, `Unknown unit "${text(l.unit)}". Use a UN/ECE code (C62 piece, HUR hour, DAY, MON, KGM...) or hours/days/pieces.`);
    const tax = taxOf(l, path);
    if (hr && text(l.kpd) && !/^\d{2}\.\d{2}\.\d{2}$/.test(text(l.kpd))) {
      err(`${path}.kpd`, "KPD 2025 class as six digits in pairs, e.g. 62.20.30 (HR-BR-25, HR-BR-CL-2).");
    }
    // Allowances (BG-27) and charges (BG-28) on this line: a row discount ("Rabatt 10 %") or a
    // surcharge. Each needs a reason (BR-42, BR-44) and an amount above 0 (BR-41, BR-43). A percent
    // (BT-138, BT-143) is taken of quantity x price, the base (BT-137, BT-142), when no amount is
    // given; when both are given they must agree to the cent. The line net is quantity x price less
    // its allowances plus its charges (BT-131; PEPPOL-EN16931-R120). They take the line's VAT
    // category, so they carry none of their own.
    const adjustments = [];
    const gross = quantity === null || price === null ? null : cents(quantity * price);
    for (const [field, isCharge] of [["allowances", false], ["charges", true]]) {
      const raw = l[field];
      if (raw === undefined || raw === null || raw === "") continue;
      if (!Array.isArray(raw)) { err(`${path}.${field}`, `A line's ${field} must be a list of { reason, amount } or { reason, percent }.`); continue; }
      const what = isCharge ? "charge" : "discount";
      raw.forEach((r0, k) => {
        const p = `${path}.${field}[${k}]`;
        const a = r0 && typeof r0 === "object" ? r0 : {};
        const reason = text(a.reason);
        const given = (v) => v !== undefined && v !== null && v !== "";
        const percent = given(a.percent) ? num(a.percent) : null;
        const amount = given(a.amount) ? num(a.amount) : null;
        let ok = true;
        if (!reason) { ok = false; err(`${p}.reason`, `A line ${what} needs a reason, e.g. "${isCharge ? "Express surcharge" : "Rabatt"}" (${isCharge ? "BR-44" : "BR-42"}).`); }
        if (given(a.percent) && (percent === null || percent <= 0 || percent > 100)) { ok = false; err(`${p}.percent`, "The percent must be a number above 0 and at most 100."); }
        if (given(a.amount) && (amount === null || amount <= 0)) { ok = false; err(`${p}.amount`, `The ${what} amount must be a number above 0 (${isCharge ? "BR-43" : "BR-41"}).`); }
        if (!given(a.amount) && !given(a.percent)) { ok = false; err(`${p}.amount`, `Give the ${what}'s amount, or its percent of quantity x price.`); }
        if (!ok || gross === null) return;
        const fromPercent = percent !== null ? cents((gross / 100) * (percent / 100)) : null;
        if (amount !== null && fromPercent !== null && cents(amount) !== fromPercent) {
          err(`${p}.amount`, `${percent} % of ${fixed(gross)} is ${fixed(fromPercent)}, not ${fixed(cents(amount))}: correct the amount or the percent.`);
          return;
        }
        adjustments.push({ charge: isCharge, reason, amount: amount !== null ? cents(amount) : fromPercent, ...(percent !== null ? { percent, base: gross } : {}) });
      });
    }
    if (quantity === null || price === null || !tax) return;
    const net = gross + adjustments.reduce((s, a) => s + (a.charge ? a.amount : -a.amount), 0);
    if (adjustments.length && quantity > 0 && net < 0) err(`${path}.allowances`, `The line's discounts are larger than quantity x price (${fixed(gross)}): the line net would be negative.`);
    lines.push({
      id: String(i + 1), description, quantity, unit, unit_price: price, net,
      ...tax, note: text(l.note), kpd: text(l.kpd), adjustments,
    });
  });

  // Document-level allowances (BG-20) and charges (BG-21): a discount on the whole invoice, a
  // delivery charge, and in Croatia the out-of-scope fees the authority's samples carry as
  // charges (HR:PP, HR:PPMV, HR:N). Each has its own VAT category and counts in its row of the
  // VAT breakdown (BR-S-08 and the like).
  const adjustments = [];
  for (const [field, isCharge] of [["allowances", false], ["charges", true]]) {
    const raw = d[field];
    if (raw === undefined || raw === null || raw === "") continue;
    if (!Array.isArray(raw)) { err(field, `${field} must be a list of { reason, amount, tax_percent }.`); continue; }
    raw.forEach((r0, i) => {
      const path = `${field}[${i}]`;
      const a = r0 && typeof r0 === "object" ? r0 : {};
      const amount = num(a.amount);
      if (amount === null || amount <= 0) err(`${path}.amount`, `The ${isCharge ? "charge" : "allowance"} amount must be a number above 0.`);
      if (!isCharge && text(a.hr_label)) err(`${path}.hr_label`, "Croatia's out-of-scope labels (HR:POVNAK, HR:PP, HR:PPMV, HR:N) go on a line or a charge (HR-BR-30), not an allowance.");
      const tax = taxOf(isCharge ? a : { ...a, hr_label: "" }, path);
      let reason = text(a.reason);
      if (!reason && tax && tax.hr_label) reason = hrOutOfScope(tax.hr_label).text;
      if (!reason) err(`${path}.reason`, `A document-level ${isCharge ? "charge" : "allowance"} needs a reason, e.g. "${isCharge ? "Delivery" : "Early payment discount"}" (${isCharge ? "BR-38" : "BR-33"}).`);
      if (amount === null || amount <= 0 || !tax) return;
      if (tax.hr_label && !reason.startsWith("#HR:")) reason = `#HR:${tax.hr_label}#${reason}`;
      adjustments.push({ ...tax, charge: isCharge, charge_reason: reason, amount: cents(amount) });
    });
  }
  const allowances = adjustments.filter((a) => !a.charge);
  const charges = adjustments.filter((a) => a.charge);

  // Group into VAT breakdown rows by (category, percent): EN 16931 BG-23. Lines and charges add
  // to a row, allowances take from it. EN 16931 allows one row per category and rate (BR-E-01 and
  // the like), so an HR:E line and an HR:PP charge share the E row and its reasons are joined.
  const items = [
    ...lines.map((l) => ({ ...l, signed: l.net })),
    ...adjustments.map((a) => ({ ...a, signed: a.charge ? a.amount : -a.amount })),
  ];
  const groups = new Map();
  for (const it of items) {
    const key = `${it.category}|${it.percent}`;
    const g = groups.get(key) || { category: it.category, percent: it.percent, reasons: [], taxable: 0, tax: 0 };
    g.taxable += it.signed;
    if (it.en_reason && !g.reasons.includes(it.en_reason)) g.reasons.push(it.en_reason);
    groups.set(key, g);
  }
  const breakdown = [...groups.values()].map(({ reasons, ...g }) => ({
    ...g,
    reason: reasons.join("; "),
    tax: g.category === "S" ? cents((g.taxable / 100) * (g.percent / 100)) : 0,
  }));
  for (const g of breakdown) {
    if (g.taxable < 0) err("allowances", `The allowances in VAT category ${g.category} ${g.percent} % are larger than the lines and charges in it: the taxable amount would be negative.`);
  }

  const netTotal = lines.reduce((s, l) => s + l.net, 0);
  const allowanceTotal = allowances.reduce((s, a) => s + a.amount, 0);
  const chargeTotal = charges.reduce((s, a) => s + a.amount, 0);
  const taxBasis = netTotal - allowanceTotal + chargeTotal;
  const taxTotal = breakdown.reduce((s, g) => s + g.tax, 0);
  const gross = taxBasis + taxTotal;
  const prepaidNum = num(d.prepaid ?? 0);
  if (prepaidNum === null || prepaidNum < 0) err("prepaid", "Prepaid amount must be a number, 0 or more.");
  const prepaid = cents(prepaidNum || 0);
  if (prepaid > gross) warn("prepaid", "Prepaid amount is larger than the invoice total.");
  const due_amount = gross - prepaid;

  if (kind === "credit_note" && !text(d.original_invoice)) {
    warn("original_invoice", "A credit note should name the invoice it corrects (BT-25).");
  }
  const originalDate = text(d.original_invoice_date);
  if (originalDate && !dateOk(originalDate)) err("original_invoice_date", "The original invoice's date must be a real date as YYYY-MM-DD.");
  if (hr && text(d.original_invoice) && !originalDate) err("original_invoice_date", "Croatia requires the referenced invoice's issue date (BT-26, HR-BR-6).");
  const period = d.period && typeof d.period === "object" ? d.period : null;
  if (period && (period.start || period.end)) {
    if ((period.start && !dateOk(text(period.start))) || (period.end && !dateOk(text(period.end)))) {
      err("period", "Period start and end must be real dates as YYYY-MM-DD.");
    } else if (period.start && period.end && text(period.end) < text(period.start)) {
      err("period", "Period end is before its start.");
    }
  }
  const delivery = text(d.delivery_date);
  if (delivery && !dateOk(delivery)) err("delivery_date", "Delivery date must be a real date as YYYY-MM-DD.");
  if (profile === "xrechnung" && !delivery && !(period && (period.start || period.end))) {
    warn("delivery_date", "XRechnung asks for the date of supply: an actual delivery date (BT-72) or an invoicing period (BG-14) (BR-DE-TMP-32). German law (§14 (4) no. 6 UStG) also requires it on the invoice.");
  }

  // Not subject to VAT (O) stands alone: no other category (BR-O-11, -12) and no VAT IDs (BR-O-02).
  const hasO = items.some((l) => l.category === "O");
  if (hasO && items.some((l) => l.category !== "O")) err("lines", "A line not subject to VAT (O) cannot share an invoice with lines in other VAT categories (BR-O-11, BR-O-12): put them on separate invoices.");
  if (hasO && !hr) {
    for (const p of [seller, buyer]) if (p.vat_id) err(`${p.role}.vat_id`, `An invoice whose lines are not subject to VAT (O) must not carry the ${p.role}'s VAT ID (BR-O-02).${p.role === "seller" ? " Give a company registration number (company_id) instead." : ""}`);
    if (!seller.company_id) err("seller.company_id", "With no VAT ID (category O), identify the seller by a company registration or other seller identifier (company_id, BR-CO-26).");
  }
  // Intra-community supply (K) needs the date of supply and the country the goods go to (BR-IC-11, -12).
  const hasK = lines.some((l) => l.category === "K");
  const deliveryCountry = text(d.delivery_country).toUpperCase() || (hasK ? buyer.country : "");
  if (deliveryCountry && !/^[A-Z]{2}$/.test(deliveryCountry)) err("delivery_country", "Deliver-to country must be a 2-letter ISO code (BT-80).");
  if (hasK && !delivery && !(period && (period.start || period.end))) err("delivery_date", "An intra-community supply (K) needs the delivery date or the invoicing period (BR-IC-11).");

  // Croatia: the fields HR-CIUS 2025 makes compulsory, checked here so the file is not
  // written only to fail the Porezna uprava's rules, and the HR extension (HRFISK20Data).
  let hrData = null, time = "", hrProcess = "";
  if (hr) {
    time = text(d.issue_time);
    if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) err("issue_time", "Croatia requires the issue time as hh:mm:ss, e.g. 09:30:00 (HR-BR-2).");
    hrProcess = text(d.process) || "P1";
    if (!/^(P([1-9]|1[0-2])|P99:.+)$/.test(hrProcess)) err("process", "Business process P1 to P12, or P99:<your own id> (HR-BR-34). P1 is an invoice for goods or services under a contract.");
    if (dateOk(issue) && issue < "2026-01-01") err("issue_date", "HR-CIUS 2025 applies to invoices issued from 1 January 2026 (HR-BR-40).");
    if (kind === "invoice" && !due) err("due_date", "Croatia requires a due date on an invoice (HR-CIUS 2025, BT-9).");
    if (currency !== "EUR") warn("currency", "Croatia's rules assume EUR; an invoice in another currency also needs the VAT total in EUR (BT-6, BT-111), which this creator does not write.");
    const op = d.operator && typeof d.operator === "object" ? d.operator : {};
    const operator = { name: text(op.name), oib: text(op.oib).replace(/\s+/g, "") };
    if (!operator.name) err("operator.name", "Croatia requires the operator's name, the person issuing the invoice (HR-BR-37).");
    if (!oibOk(operator.oib) || /^HR/i.test(operator.oib)) err("operator.oib", "The operator's OIB: 11 digits with a valid check digit, no HR prefix (HR-BR-9).");
    for (const p of [seller, buyer]) {
      if (p.country === "HR" && p.vat_id && (!/^HR\d{11}$/.test(p.vat_id) || !oibOk(p.vat_id))) {
        err(`${p.role}.vat_id`, `The ${p.role}'s VAT ID must be HR plus a valid 11-digit OIB (HR-BR-53).`);
      }
      if (!p.endpoint && /^HR\d{11}$/.test(p.vat_id)) p.endpoint = { scheme: "9934", id: p.vat_id.slice(2) };
      if (!p.endpoint) err(`${p.role}.endpoint`, `Croatia requires the ${p.role}'s electronic address (BT-${p.role === "seller" ? 34 : 49}); with a Croatian VAT ID it defaults to scheme 9934 and the OIB.`);
    }
    if (seller.country === "HR" && !/^HR\d{11}$/.test(seller.vat_id)) err("seller.vat_id", "A Croatian seller needs its VAT ID as HR plus the OIB (HR-BR-53).");
    if (!buyer.vat_id && items.some((l) => ["S", "Z", "E", "AE"].includes(l.category))) {
      err("buyer.vat_id", "Croatia requires the buyer's VAT ID (BT-48) on an invoice with an S, Z, E or AE line, allowance or charge (HR-BR-S-1 to -AE-3).");
    }
    if (hasO) err("lines", "On a Croatian invoice use E with the reason (the Porezna uprava's own sample for a seller outside the VAT system writes E, HR:E, \"Nije u sustavu PDV-a\"): category O would forbid the VAT IDs that HR-CIUS requires (BR-O-02).");
    const typeCode = kind === "credit_note" ? "381" : "380";
    lines.forEach((l, i) => {
      if (!l.kpd && !HR_NO_KPD.has(typeCode)) err(`lines[${i}].kpd`, "Croatia requires a KPD 2025 class on every invoice line, e.g. 62.20.30 for IT services (HR-BR-25).");
    });
    // HRFISK20Data: compulsory when a line is exempt (HR-BR-26). Its breakdown carries the HR
    // labels; amounts outside the tax base (category O) go to OutOfScopeOfVATAmount (HR-BR-32)
    // and leave the HR tax base (HR-BR-27).
    // An out-of-scope label (E in the EN layer) gets an O row of its own, under its label and tax
    // scheme; every other row repeats the EN row with its HR label.
    if (items.some((l) => l.category === "E" || l.category === "O")) {
      const rows = new Map();
      for (const it of items) {
        const key = it.hr_label ? `O|${it.hr_label}` : `${it.category}|${it.percent}`;
        const g = rows.get(key) || (it.hr_label
          ? { category: "O", name: `HR:${it.hr_label}`, percent: 0, scheme: hrOutOfScope(it.hr_label).scheme, reasons: [], taxable: 0 }
          : { category: it.category, name: hrLabel(it.category, it.percent), percent: it.percent, scheme: "VAT", reasons: [], taxable: 0 });
        g.taxable += it.signed;
        if (!it.hr_label && it.reason && !g.reasons.includes(it.reason)) g.reasons.push(it.reason);
        rows.set(key, g);
      }
      const hrBreakdown = [...rows.values()].map(({ reasons, ...g }) => ({
        ...g, reason: reasons.join("; "),
        tax: g.category === "S" ? cents((g.taxable / 100) * (g.percent / 100)) : 0,
      }));
      const outOfScope = hrBreakdown.filter((g) => g.category === "O").reduce((s, g) => s + g.taxable, 0);
      hrData = { taxExclusive: taxBasis - outOfScope, outOfScope, breakdown: hrBreakdown };
    }
    seller.operator = operator;
  }

  const pay = d.payment && typeof d.payment === "object" ? d.payment : {};
  const iban = text(pay.iban).replace(/\s+/g, "").toUpperCase();
  const payment = {
    means: text(pay.means) || (iban ? "58" : ""),
    iban,
    bic: text(pay.bic).replace(/\s+/g, "").toUpperCase(),
    account_name: text(pay.account_name),
    reference: text(pay.reference) || (iban ? number : ""),
    terms: text(d.terms) || (text(pay.terms)),
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    doc: {
      profile, kind, number, issue_date: issue, due_date: due, currency,
      buyer_reference: text(d.buyer_reference), order_reference: text(d.order_reference),
      original_invoice: text(d.original_invoice), original_invoice_date: originalDate && dateOk(originalDate) ? originalDate : "", note: text(d.note),
      period: period && (period.start || period.end) ? { start: text(period.start), end: text(period.end) } : null,
      delivery_date: delivery && dateOk(delivery) ? delivery : "", delivery_country: deliveryCountry,
      seller, buyer, lines, allowances, charges, breakdown, payment,
      issue_time: time, process: hrProcess, hr_extension: hrData,
      totals: { net: netTotal, allowances: allowanceTotal, charges: chargeTotal, taxable: taxBasis, tax: taxTotal, gross, prepaid, due: due_amount },
    },
  };
}

// ---------------------------------------------------------------- UBL 2.1

function ublParty(p) {
  const x = [];
  if (p.endpoint) x.push(`      <cbc:EndpointID schemeID="${esc(p.endpoint.scheme)}">${esc(p.endpoint.id)}</cbc:EndpointID>`);
  if (p.company_id) x.push(`      <cac:PartyIdentification><cbc:ID>${esc(p.company_id)}</cbc:ID></cac:PartyIdentification>`);
  x.push(`      <cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>`);
  const addr = [];
  if (p.street) addr.push(`        <cbc:StreetName>${esc(p.street)}</cbc:StreetName>`);
  if (p.street2) addr.push(`        <cbc:AdditionalStreetName>${esc(p.street2)}</cbc:AdditionalStreetName>`);
  if (p.city) addr.push(`        <cbc:CityName>${esc(p.city)}</cbc:CityName>`);
  if (p.postal_code) addr.push(`        <cbc:PostalZone>${esc(p.postal_code)}</cbc:PostalZone>`);
  addr.push(`        <cac:Country><cbc:IdentificationCode>${esc(p.country)}</cbc:IdentificationCode></cac:Country>`);
  x.push(`      <cac:PostalAddress>\n${addr.join("\n")}\n      </cac:PostalAddress>`);
  if (p.vat_id) {
    x.push(`      <cac:PartyTaxScheme>\n        <cbc:CompanyID>${esc(p.vat_id)}</cbc:CompanyID>\n        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>\n      </cac:PartyTaxScheme>`);
  }
  if (p.tax_number) {
    x.push(`      <cac:PartyTaxScheme>\n        <cbc:CompanyID>${esc(p.tax_number)}</cbc:CompanyID>\n        <cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme>\n      </cac:PartyTaxScheme>`);
  }
  x.push(`      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName></cac:PartyLegalEntity>`);
  const c = p.contact;
  if (c.name || c.phone || c.email) {
    const parts = [];
    if (c.name) parts.push(`        <cbc:Name>${esc(c.name)}</cbc:Name>`);
    if (c.phone) parts.push(`        <cbc:Telephone>${esc(c.phone)}</cbc:Telephone>`);
    if (c.email) parts.push(`        <cbc:ElectronicMail>${esc(c.email)}</cbc:ElectronicMail>`);
    x.push(`      <cac:Contact>\n${parts.join("\n")}\n      </cac:Contact>`);
  }
  return x.join("\n");
}

const amt = (name, value, cur, indent = "    ") => `${indent}<cbc:${name} currencyID="${esc(cur)}">${fixed(value)}</cbc:${name}>`;

function taxCategoryXml(category, percent, reason, indent) {
  const lines = [`${indent}<cac:TaxCategory>`, `${indent}  <cbc:ID>${category}</cbc:ID>`];
  if (category !== "O") lines.push(`${indent}  <cbc:Percent>${percent}</cbc:Percent>`); // BR-O-05: no rate when not subject to VAT
  if (reason) lines.push(`${indent}  <cbc:TaxExemptionReason>${esc(reason)}</cbc:TaxExemptionReason>`);
  lines.push(`${indent}  <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`, `${indent}</cac:TaxCategory>`);
  return lines.join("\n");
}

// The HR extension (HRFISK20Data, HRExtensionAggregateComponents-1.xsd): the VAT breakdown
// again with the HR labels, and the HR totals. Element order follows the XSD.
function hrExtensionXml(doc) {
  const cur = doc.currency;
  const x = doc.hr_extension;
  const o = [`  <ext:UBLExtensions>`, `    <ext:UBLExtension>`, `      <ext:ExtensionContent>`, `        <hrextac:HRFISK20Data>`, `          <hrextac:HRTaxTotal>`];
  o.push(amt("TaxAmount", doc.totals.tax, cur, "            "));
  for (const g of x.breakdown) {
    o.push(`            <hrextac:HRTaxSubtotal>`);
    o.push(amt("TaxableAmount", g.taxable, cur, "              "));
    o.push(amt("TaxAmount", g.tax, cur, "              "));
    o.push(`              <hrextac:HRTaxCategory>`);
    o.push(`                <cbc:ID>${g.category}</cbc:ID>`);
    o.push(`                <cbc:Name>${g.name}</cbc:Name>`);
    o.push(`                <cbc:Percent>${g.percent}</cbc:Percent>`); // the authority's samples write 0 on an O row too
    if (g.reason) o.push(`                <cbc:TaxExemptionReason>${esc(g.reason)}</cbc:TaxExemptionReason>`);
    o.push(`                <hrextac:HRTaxScheme><cbc:ID>${g.scheme}</cbc:ID></hrextac:HRTaxScheme>`);
    o.push(`              </hrextac:HRTaxCategory>`);
    o.push(`            </hrextac:HRTaxSubtotal>`);
  }
  o.push(`          </hrextac:HRTaxTotal>`, `          <hrextac:HRLegalMonetaryTotal>`);
  o.push(amt("TaxExclusiveAmount", x.taxExclusive, cur, "            "));
  o.push(`            <hrextac:OutOfScopeOfVATAmount currencyID="${esc(cur)}">${fixed(x.outOfScope)}</hrextac:OutOfScopeOfVATAmount>`);
  o.push(`          </hrextac:HRLegalMonetaryTotal>`, `        </hrextac:HRFISK20Data>`, `      </ext:ExtensionContent>`, `    </ext:UBLExtension>`, `  </ext:UBLExtensions>`);
  return o.join("\n");
}

export function toUbl(doc) {
  const credit = doc.kind === "credit_note";
  const root = credit ? "CreditNote" : "Invoice";
  const prof = PROFILES[doc.profile];
  const cur = doc.currency;
  const o = [];
  o.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  o.push(`<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2"`);
  o.push(`    xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"`);
  const hr = doc.profile === "hr";
  const ext = hr && doc.hr_extension;
  if (ext) {
    o.push(`    xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"`);
    o.push(`    xmlns:hrextac="urn:mfin.gov.hr:schema:xsd:HRExtensionAggregateComponents-1"`);
  }
  o.push(`    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`);
  if (ext) o.push(hrExtensionXml(doc));
  o.push(`  <cbc:CustomizationID>${esc(prof.customization)}</cbc:CustomizationID>`);
  const profileId = hr ? doc.process : prof.profileId;
  if (profileId) o.push(`  <cbc:ProfileID>${esc(profileId)}</cbc:ProfileID>`);
  o.push(`  <cbc:ID>${esc(doc.number)}</cbc:ID>`);
  o.push(`  <cbc:IssueDate>${doc.issue_date}</cbc:IssueDate>`);
  if (hr && doc.issue_time) o.push(`  <cbc:IssueTime>${doc.issue_time}</cbc:IssueTime>`);
  if (!credit && doc.due_date) o.push(`  <cbc:DueDate>${doc.due_date}</cbc:DueDate>`);
  o.push(`  <cbc:${credit ? "CreditNoteTypeCode>381</cbc:CreditNoteTypeCode" : "InvoiceTypeCode>380</cbc:InvoiceTypeCode"}>`);
  if (doc.note) o.push(`  <cbc:Note>${esc(doc.note)}</cbc:Note>`);
  o.push(`  <cbc:DocumentCurrencyCode>${esc(cur)}</cbc:DocumentCurrencyCode>`);
  if (doc.buyer_reference) o.push(`  <cbc:BuyerReference>${esc(doc.buyer_reference)}</cbc:BuyerReference>`);
  if (doc.period) {
    o.push(`  <cac:InvoicePeriod>`);
    if (doc.period.start) o.push(`    <cbc:StartDate>${doc.period.start}</cbc:StartDate>`);
    if (doc.period.end) o.push(`    <cbc:EndDate>${doc.period.end}</cbc:EndDate>`);
    o.push(`  </cac:InvoicePeriod>`);
  }
  if (doc.order_reference) o.push(`  <cac:OrderReference><cbc:ID>${esc(doc.order_reference)}</cbc:ID></cac:OrderReference>`);
  if (doc.original_invoice) {
    const when = doc.original_invoice_date ? `<cbc:IssueDate>${doc.original_invoice_date}</cbc:IssueDate>` : "";
    o.push(`  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(doc.original_invoice)}</cbc:ID>${when}</cac:InvoiceDocumentReference></cac:BillingReference>`);
  }
  const operator = hr && doc.seller.operator
    ? `\n    <cac:SellerContact>\n      <cbc:ID>${esc(doc.seller.operator.oib)}</cbc:ID>\n      <cbc:Name>${esc(doc.seller.operator.name)}</cbc:Name>\n    </cac:SellerContact>`
    : "";
  o.push(`  <cac:AccountingSupplierParty>\n    <cac:Party>\n${ublParty(doc.seller)}\n    </cac:Party>${operator}\n  </cac:AccountingSupplierParty>`);
  o.push(`  <cac:AccountingCustomerParty>\n    <cac:Party>\n${ublParty(doc.buyer)}\n    </cac:Party>\n  </cac:AccountingCustomerParty>`);
  if (doc.delivery_date || doc.delivery_country) {
    const when = doc.delivery_date ? `<cbc:ActualDeliveryDate>${doc.delivery_date}</cbc:ActualDeliveryDate>` : "";
    const where = doc.delivery_country ? `<cac:DeliveryLocation><cac:Address><cac:Country><cbc:IdentificationCode>${esc(doc.delivery_country)}</cbc:IdentificationCode></cac:Country></cac:Address></cac:DeliveryLocation>` : "";
    o.push(`  <cac:Delivery>${when}${where}</cac:Delivery>`);
  }

  const p = doc.payment;
  if (p.means) {
    o.push(`  <cac:PaymentMeans>`);
    o.push(`    <cbc:PaymentMeansCode>${esc(p.means)}</cbc:PaymentMeansCode>`);
    if (p.reference) o.push(`    <cbc:PaymentID>${esc(p.reference)}</cbc:PaymentID>`);
    if (p.iban) {
      o.push(`    <cac:PayeeFinancialAccount>`);
      o.push(`      <cbc:ID>${esc(p.iban)}</cbc:ID>`);
      if (p.account_name) o.push(`      <cbc:Name>${esc(p.account_name)}</cbc:Name>`);
      if (p.bic) o.push(`      <cac:FinancialInstitutionBranch><cbc:ID>${esc(p.bic)}</cbc:ID></cac:FinancialInstitutionBranch>`);
      o.push(`    </cac:PayeeFinancialAccount>`);
    }
    o.push(`  </cac:PaymentMeans>`);
  }
  if (p.terms) o.push(`  <cac:PaymentTerms><cbc:Note>${esc(p.terms)}</cbc:Note></cac:PaymentTerms>`);
  for (const a of [...doc.allowances, ...doc.charges]) {
    o.push(`  <cac:AllowanceCharge>`);
    o.push(`    <cbc:ChargeIndicator>${a.charge}</cbc:ChargeIndicator>`);
    o.push(`    <cbc:AllowanceChargeReason>${esc(a.charge_reason)}</cbc:AllowanceChargeReason>`);
    o.push(amt("Amount", a.amount, cur));
    o.push(`    <cac:TaxCategory>`);
    o.push(`      <cbc:ID>${a.category}</cbc:ID>`);
    // Croatia wants the HR label and, for E and O, the reason on a charge too (HR-BR-11, -13).
    if (hr) o.push(`      <cbc:Name>${a.hr_label ? `HR:${a.hr_label}` : hrLabel(a.category, a.percent)}</cbc:Name>`);
    if (a.category !== "O") o.push(`      <cbc:Percent>${a.percent}</cbc:Percent>`);
    if (hr && a.reason) o.push(`      <cbc:TaxExemptionReason>${esc(a.reason)}</cbc:TaxExemptionReason>`);
    o.push(`      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`);
    o.push(`    </cac:TaxCategory>`);
    o.push(`  </cac:AllowanceCharge>`);
  }

  o.push(`  <cac:TaxTotal>`);
  o.push(amt("TaxAmount", doc.totals.tax, cur));
  for (const g of doc.breakdown) {
    o.push(`    <cac:TaxSubtotal>`);
    o.push(amt("TaxableAmount", g.taxable, cur, "      "));
    o.push(amt("TaxAmount", g.tax, cur, "      "));
    o.push(taxCategoryXml(g.category, g.percent, g.reason, "      "));
    o.push(`    </cac:TaxSubtotal>`);
  }
  o.push(`  </cac:TaxTotal>`);

  const t = doc.totals;
  o.push(`  <cac:LegalMonetaryTotal>`);
  o.push(amt("LineExtensionAmount", t.net, cur));
  o.push(amt("TaxExclusiveAmount", t.taxable, cur));
  o.push(amt("TaxInclusiveAmount", t.gross, cur));
  if (doc.allowances.length) o.push(amt("AllowanceTotalAmount", t.allowances, cur));
  if (doc.charges.length) o.push(amt("ChargeTotalAmount", t.charges, cur));
  if (t.prepaid) o.push(amt("PrepaidAmount", t.prepaid, cur));
  o.push(amt("PayableAmount", t.due, cur));
  o.push(`  </cac:LegalMonetaryTotal>`);

  for (const l of doc.lines) {
    const qtyTag = credit ? "CreditedQuantity" : "InvoicedQuantity";
    o.push(`  <cac:${credit ? "CreditNoteLine" : "InvoiceLine"}>`);
    o.push(`    <cbc:ID>${l.id}</cbc:ID>`);
    if (l.note) o.push(`    <cbc:Note>${esc(l.note)}</cbc:Note>`);
    o.push(`    <cbc:${qtyTag} unitCode="${l.unit}">${l.quantity}</cbc:${qtyTag}>`);
    o.push(amt("LineExtensionAmount", l.net, cur));
    for (const a of l.adjustments) {
      o.push(`    <cac:AllowanceCharge>`);
      o.push(`      <cbc:ChargeIndicator>${a.charge}</cbc:ChargeIndicator>`);
      o.push(`      <cbc:AllowanceChargeReason>${esc(a.reason)}</cbc:AllowanceChargeReason>`);
      if (a.percent !== undefined) o.push(`      <cbc:MultiplierFactorNumeric>${a.percent}</cbc:MultiplierFactorNumeric>`);
      o.push(amt("Amount", a.amount, cur, "      "));
      if (a.percent !== undefined) o.push(amt("BaseAmount", a.base, cur, "      "));
      o.push(`    </cac:AllowanceCharge>`);
    }
    o.push(`    <cac:Item>`);
    o.push(`      <cbc:Name>${esc(l.description)}</cbc:Name>`);
    if (hr && l.kpd) o.push(`      <cac:CommodityClassification><cbc:ItemClassificationCode listID="CG">${esc(l.kpd)}</cbc:ItemClassificationCode></cac:CommodityClassification>`);
    o.push(`      <cac:ClassifiedTaxCategory>`);
    o.push(`        <cbc:ID>${l.category}</cbc:ID>`);
    if (hr) o.push(`        <cbc:Name>${l.hr_label ? `HR:${l.hr_label}` : hrLabel(l.category, l.percent)}</cbc:Name>`);
    if (l.category !== "O") o.push(`        <cbc:Percent>${l.percent}</cbc:Percent>`);
    if (hr && l.en_reason) o.push(`        <cbc:TaxExemptionReason>${esc(l.en_reason)}</cbc:TaxExemptionReason>`);
    o.push(`        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`);
    o.push(`      </cac:ClassifiedTaxCategory>`);
    o.push(`    </cac:Item>`);
    o.push(`    <cac:Price><cbc:PriceAmount currencyID="${esc(cur)}">${l.unit_price}</cbc:PriceAmount></cac:Price>`);
    o.push(`  </cac:${credit ? "CreditNoteLine" : "InvoiceLine"}>`);
  }
  o.push(`</${root}>`);
  return o.join("\n") + "\n";
}

// ---------------------------------------------------------------- CII

const ciiDate = (iso) => `      <udt:DateTimeString format="102">${iso.replace(/-/g, "")}</udt:DateTimeString>`;

function ciiParty(tag, p) {
  const o = [`      <ram:${tag}>`];
  if (p.company_id) o.push(`        <ram:ID>${esc(p.company_id)}</ram:ID>`);
  o.push(`        <ram:Name>${esc(p.name)}</ram:Name>`);
  const c = p.contact;
  if (c.name || c.phone || c.email) {
    o.push(`        <ram:DefinedTradeContact>`);
    if (c.name) o.push(`          <ram:PersonName>${esc(c.name)}</ram:PersonName>`);
    if (c.phone) o.push(`          <ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(c.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>`);
    if (c.email) o.push(`          <ram:EmailURIUniversalCommunication><ram:URIID>${esc(c.email)}</ram:URIID></ram:EmailURIUniversalCommunication>`);
    o.push(`        </ram:DefinedTradeContact>`);
  }
  o.push(`        <ram:PostalTradeAddress>`);
  if (p.postal_code) o.push(`          <ram:PostcodeCode>${esc(p.postal_code)}</ram:PostcodeCode>`);
  if (p.street) o.push(`          <ram:LineOne>${esc(p.street)}</ram:LineOne>`);
  if (p.street2) o.push(`          <ram:LineTwo>${esc(p.street2)}</ram:LineTwo>`);
  if (p.city) o.push(`          <ram:CityName>${esc(p.city)}</ram:CityName>`);
  o.push(`          <ram:CountryID>${esc(p.country)}</ram:CountryID>`);
  o.push(`        </ram:PostalTradeAddress>`);
  if (p.endpoint) o.push(`        <ram:URIUniversalCommunication><ram:URIID schemeID="${esc(p.endpoint.scheme)}">${esc(p.endpoint.id)}</ram:URIID></ram:URIUniversalCommunication>`);
  if (p.vat_id) o.push(`        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vat_id)}</ram:ID></ram:SpecifiedTaxRegistration>`);
  if (p.tax_number) o.push(`        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(p.tax_number)}</ram:ID></ram:SpecifiedTaxRegistration>`);
  o.push(`      </ram:${tag}>`);
  return o.join("\n");
}

export function toCii(doc) {
  const prof = PROFILES[doc.profile];
  const cur = doc.currency;
  const o = [];
  o.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  o.push(`<rsm:CrossIndustryInvoice`);
  o.push(`    xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"`);
  o.push(`    xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"`);
  o.push(`    xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">`);
  o.push(`  <rsm:ExchangedDocumentContext>`);
  if (prof.profileId) o.push(`    <ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${esc(prof.profileId)}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>`);
  o.push(`    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${esc(prof.customization)}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>`);
  o.push(`  </rsm:ExchangedDocumentContext>`);
  o.push(`  <rsm:ExchangedDocument>`);
  o.push(`    <ram:ID>${esc(doc.number)}</ram:ID>`);
  o.push(`    <ram:TypeCode>${doc.kind === "credit_note" ? 381 : 380}</ram:TypeCode>`);
  o.push(`    <ram:IssueDateTime>\n${ciiDate(doc.issue_date)}\n    </ram:IssueDateTime>`);
  if (doc.note) o.push(`    <ram:IncludedNote><ram:Content>${esc(doc.note)}</ram:Content></ram:IncludedNote>`);
  o.push(`  </rsm:ExchangedDocument>`);
  o.push(`  <rsm:SupplyChainTradeTransaction>`);
  for (const l of doc.lines) {
    o.push(`    <ram:IncludedSupplyChainTradeLineItem>`);
    o.push(`      <ram:AssociatedDocumentLineDocument><ram:LineID>${l.id}</ram:LineID></ram:AssociatedDocumentLineDocument>`);
    o.push(`      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.description)}</ram:Name></ram:SpecifiedTradeProduct>`);
    o.push(`      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${l.unit_price}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`);
    o.push(`      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${l.unit}">${l.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>`);
    o.push(`      <ram:SpecifiedLineTradeSettlement>`);
    o.push(`        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${l.category}</ram:CategoryCode>${l.category === "O" ? "" : `<ram:RateApplicablePercent>${l.percent}</ram:RateApplicablePercent>`}</ram:ApplicableTradeTax>`);
    for (const a of l.adjustments) {
      o.push(`        <ram:SpecifiedTradeAllowanceCharge>`);
      o.push(`          <ram:ChargeIndicator><udt:Indicator>${a.charge}</udt:Indicator></ram:ChargeIndicator>`);
      if (a.percent !== undefined) o.push(`          <ram:CalculationPercent>${a.percent}</ram:CalculationPercent>`);
      if (a.percent !== undefined) o.push(`          <ram:BasisAmount>${fixed(a.base)}</ram:BasisAmount>`);
      o.push(`          <ram:ActualAmount>${fixed(a.amount)}</ram:ActualAmount>`);
      o.push(`          <ram:Reason>${esc(a.reason)}</ram:Reason>`);
      o.push(`        </ram:SpecifiedTradeAllowanceCharge>`);
    }
    o.push(`        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${fixed(l.net)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>`);
    o.push(`      </ram:SpecifiedLineTradeSettlement>`);
    o.push(`    </ram:IncludedSupplyChainTradeLineItem>`);
  }
  o.push(`    <ram:ApplicableHeaderTradeAgreement>`);
  if (doc.buyer_reference) o.push(`      <ram:BuyerReference>${esc(doc.buyer_reference)}</ram:BuyerReference>`);
  o.push(ciiParty("SellerTradeParty", doc.seller));
  o.push(ciiParty("BuyerTradeParty", doc.buyer));
  if (doc.order_reference) o.push(`      <ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${esc(doc.order_reference)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>`);
  o.push(`    </ram:ApplicableHeaderTradeAgreement>`);
  // ApplicableHeaderTradeDelivery is mandatory in the CII schema; empty only when
  // there is nothing to put in it (PEPPOL-EN16931-R008 then warns, as Mustang does).
  if (doc.delivery_date || doc.delivery_country) {
    o.push(`    <ram:ApplicableHeaderTradeDelivery>`);
    if (doc.delivery_country) o.push(`      <ram:ShipToTradeParty><ram:PostalTradeAddress><ram:CountryID>${esc(doc.delivery_country)}</ram:CountryID></ram:PostalTradeAddress></ram:ShipToTradeParty>`);
    if (doc.delivery_date) o.push(`      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>\n  ${ciiDate(doc.delivery_date)}\n      </ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>`);
    o.push(`    </ram:ApplicableHeaderTradeDelivery>`);
  } else {
    o.push(`    <ram:ApplicableHeaderTradeDelivery/>`);
  }
  o.push(`    <ram:ApplicableHeaderTradeSettlement>`);
  const p = doc.payment;
  if (p.reference) o.push(`      <ram:PaymentReference>${esc(p.reference)}</ram:PaymentReference>`);
  o.push(`      <ram:InvoiceCurrencyCode>${esc(cur)}</ram:InvoiceCurrencyCode>`);
  if (p.means) {
    o.push(`      <ram:SpecifiedTradeSettlementPaymentMeans>`);
    o.push(`        <ram:TypeCode>${esc(p.means)}</ram:TypeCode>`);
    if (p.iban) {
      o.push(`        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(p.iban)}</ram:IBANID>${p.account_name ? `<ram:AccountName>${esc(p.account_name)}</ram:AccountName>` : ""}</ram:PayeePartyCreditorFinancialAccount>`);
      if (p.bic) o.push(`        <ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(p.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>`);
    }
    o.push(`      </ram:SpecifiedTradeSettlementPaymentMeans>`);
  }
  for (const g of doc.breakdown) {
    o.push(`      <ram:ApplicableTradeTax>`);
    o.push(`        <ram:CalculatedAmount>${fixed(g.tax)}</ram:CalculatedAmount>`);
    o.push(`        <ram:TypeCode>VAT</ram:TypeCode>`);
    if (g.reason) o.push(`        <ram:ExemptionReason>${esc(g.reason)}</ram:ExemptionReason>`);
    o.push(`        <ram:BasisAmount>${fixed(g.taxable)}</ram:BasisAmount>`);
    o.push(`        <ram:CategoryCode>${g.category}</ram:CategoryCode>`);
    if (g.category !== "O") o.push(`        <ram:RateApplicablePercent>${g.percent}</ram:RateApplicablePercent>`);
    o.push(`      </ram:ApplicableTradeTax>`);
  }
  if (doc.period) {
    o.push(`      <ram:BillingSpecifiedPeriod>`);
    if (doc.period.start) o.push(`        <ram:StartDateTime>\n  ${ciiDate(doc.period.start)}\n        </ram:StartDateTime>`);
    if (doc.period.end) o.push(`        <ram:EndDateTime>\n  ${ciiDate(doc.period.end)}\n        </ram:EndDateTime>`);
    o.push(`      </ram:BillingSpecifiedPeriod>`);
  }
  for (const a of [...doc.allowances, ...doc.charges]) {
    o.push(`      <ram:SpecifiedTradeAllowanceCharge>`);
    o.push(`        <ram:ChargeIndicator><udt:Indicator>${a.charge}</udt:Indicator></ram:ChargeIndicator>`);
    o.push(`        <ram:ActualAmount>${fixed(a.amount)}</ram:ActualAmount>`);
    o.push(`        <ram:Reason>${esc(a.charge_reason)}</ram:Reason>`);
    o.push(`        <ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${a.category}</ram:CategoryCode>${a.category === "O" ? "" : `<ram:RateApplicablePercent>${a.percent}</ram:RateApplicablePercent>`}</ram:CategoryTradeTax>`);
    o.push(`      </ram:SpecifiedTradeAllowanceCharge>`);
  }
  if (p.terms || (doc.kind !== "credit_note" && doc.due_date)) {
    o.push(`      <ram:SpecifiedTradePaymentTerms>`);
    if (p.terms) o.push(`        <ram:Description>${esc(p.terms)}</ram:Description>`);
    if (doc.kind !== "credit_note" && doc.due_date) o.push(`        <ram:DueDateDateTime>\n  ${ciiDate(doc.due_date)}\n        </ram:DueDateDateTime>`);
    o.push(`      </ram:SpecifiedTradePaymentTerms>`);
  }
  const t = doc.totals;
  o.push(`      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>`);
  o.push(`        <ram:LineTotalAmount>${fixed(t.net)}</ram:LineTotalAmount>`);
  if (doc.charges.length) o.push(`        <ram:ChargeTotalAmount>${fixed(t.charges)}</ram:ChargeTotalAmount>`);
  if (doc.allowances.length) o.push(`        <ram:AllowanceTotalAmount>${fixed(t.allowances)}</ram:AllowanceTotalAmount>`);
  o.push(`        <ram:TaxBasisTotalAmount>${fixed(t.taxable)}</ram:TaxBasisTotalAmount>`);
  o.push(`        <ram:TaxTotalAmount currencyID="${esc(cur)}">${fixed(t.tax)}</ram:TaxTotalAmount>`);
  o.push(`        <ram:GrandTotalAmount>${fixed(t.gross)}</ram:GrandTotalAmount>`);
  if (t.prepaid) o.push(`        <ram:TotalPrepaidAmount>${fixed(t.prepaid)}</ram:TotalPrepaidAmount>`);
  o.push(`        <ram:DuePayableAmount>${fixed(t.due)}</ram:DuePayableAmount>`);
  o.push(`      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>`);
  if (doc.original_invoice) o.push(`      <ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(doc.original_invoice)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>`);
  o.push(`    </ram:ApplicableHeaderTradeSettlement>`);
  o.push(`  </rsm:SupplyChainTradeTransaction>`);
  o.push(`</rsm:CrossIndustryInvoice>`);
  return o.join("\n") + "\n";
}

/** Draft -> { ok, errors, warnings, totals, xml, format, filename }. */
export function generateInvoice(draft, { format = "ubl", profile = "xrechnung" } = {}) {
  const built = buildInvoice(draft, { profile });
  const result = { ok: built.ok, errors: built.errors, warnings: built.warnings, format };
  if (format !== "ubl" && format !== "cii") {
    result.ok = false;
    result.errors = [...result.errors, { path: "format", message: 'Format must be "ubl" or "cii".' }];
  }
  if (profile === "hr" && format !== "ubl") {
    result.ok = false;
    result.errors = [...result.errors, { path: "format", message: "HR-CIUS 2025 is published for UBL 2.1 only: pick UBL." }];
  }
  if (!result.ok) return result;
  const t = built.doc.totals;
  result.totals = { net: t.net / 100, tax: t.tax / 100, gross: t.gross / 100, prepaid: t.prepaid / 100, due: t.due / 100 };
  if (built.doc.allowances.length) result.totals.allowances = t.allowances / 100;
  if (built.doc.charges.length) result.totals.charges = t.charges / 100;
  if (built.doc.allowances.length || built.doc.charges.length) result.totals.taxable = t.taxable / 100;
  result.xml = format === "cii" ? toCii(built.doc) : toUbl(built.doc);
  result.filename = `${built.doc.number.replace(/[^\w.-]+/g, "_")}.xml`;
  return result;
}
