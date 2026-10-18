// EU B2B e-invoicing mandates: for a business in one Member State, when must it
// receive and when must it issue structured e-invoices, over which format, and is
// its current invoicing method enough. Pure functions, no I/O. Bad input is
// rejected with a message, never clamped. Dates and thresholds were written from
// memory of the published laws and tax-authority announcements WITHOUT network
// access in the building session; countries move these dates often (Spain's is
// still tied to an implementing regulation). Every row carries a `verify` source
// to check before the answer is quoted or relied on.

export const VIDA_DATE = "2030-07-01";

const PDF_NOTE = "A PDF or paper invoice is not an e-invoice under these rules.";

export const COUNTRIES = {
  DE: {
    name: "Germany",
    bandLabel: "Prior-year turnover",
    bands: [{ id: "over800k", label: "Over EUR 800,000" }, { id: "upto800k", label: "EUR 800,000 or less" }],
    receive: "2025-01-01",
    issue: { over800k: "2027-01-01", upto800k: "2028-01-01" },
    format: "XRechnung or ZUGFeRD/Factur-X (EN 16931). A plain PDF does not count.",
    transition: "Until the issue date, paper and PDF invoices remain allowed for domestic B2B with the recipient's agreement.",
    penalty: "Loss of input-VAT deduction risk for non-compliant invoices; fines set by the tax office.",
    verify: "Wachstumschancengesetz (2024) and the BMF letter of 15 October 2024 on e-invoicing",
  },
  FR: {
    name: "France",
    bandLabel: "Company size",
    bands: [{ id: "large", label: "Large company or mid-size (ETI)" }, { id: "sme", label: "SME or micro-business" }],
    receive: "2026-09-01",
    issue: { large: "2026-09-01", sme: "2027-09-01" },
    format: "Factur-X, UBL or CII (EN 16931) sent through a certified platform (plateforme agréée), plus e-reporting of B2C and international sales.",
    transition: "Every business must be able to receive e-invoices from the first date, whatever its size.",
    penalty: "Fine of EUR 15 per non-compliant invoice, capped at EUR 15,000 a year, plus EUR 500 per missed e-reporting transmission.",
    verify: "Loi de finances 2024 art. 26 and the impots.gouv.fr facturation électronique pages",
  },
  BE: {
    name: "Belgium",
    bandLabel: "VAT status",
    bands: [{ id: "vat", label: "Belgian VAT-registered business" }],
    receive: "2026-01-01",
    issue: { vat: "2026-01-01" },
    format: "Structured Peppol BIS Billing 3.0 invoice sent over the Peppol network.",
    transition: "A tolerance period without fines ran for the first quarter of 2026.",
    penalty: "Fines of EUR 1,500, then EUR 3,000, then EUR 5,000 for a first, second and third or later offence in a calendar year.",
    verify: "Law of 6 February 2024 and the FPS Finance e-invoicing guidance",
  },
  PL: {
    name: "Poland",
    bandLabel: "Sales size",
    bands: [{ id: "large", label: "2024 sales over PLN 200 million (incl. VAT)" }, { id: "other", label: "Other taxpayer" }, { id: "tiny", label: "Monthly invoiced sales up to PLN 10,000" }],
    receive: "2026-02-01",
    issue: { large: "2026-02-01", other: "2026-04-01", tiny: "2027-01-01" },
    format: "FA(3) structured invoice issued through the National e-Invoice System (KSeF).",
    transition: "Penalties for KSeF breaches start on 1 January 2027; 2026 is a no-penalty ramp-up.",
    penalty: "Financial penalties of up to 100% of the VAT on the invoice from 2027.",
    verify: "Ministry of Finance KSeF pages and the 2025 VAT Act amendment",
  },
  HR: {
    name: "Croatia",
    bandLabel: "VAT status",
    bands: [{ id: "vat", label: "Croatian VAT-registered business" }],
    receive: "2026-01-01",
    issue: { vat: "2026-01-01" },
    format: "EN 16931 e-invoice (UBL or CII) through an information intermediary, with real-time reporting to the Tax Administration (Fiscalization 2.0).",
    transition: "B2G e-invoicing has applied for years; the 2026 change extends it to domestic B2B.",
    penalty: "Fines under the Fiscalization Act; amounts depend on the breach.",
    verify: "Croatian Tax Administration Fiscalization 2.0 pages",
  },
  GR: {
    name: "Greece",
    bandLabel: "Prior-year turnover",
    bands: [{ id: "over1m", label: "Over EUR 1 million" }, { id: "upto1m", label: "EUR 1 million or less" }],
    receive: "2026-02-02",
    issue: { over1m: "2026-02-02", upto1m: "2026-10-01" },
    format: "Structured invoice (Peppol BIS) sent through a certified provider and transmitted to the myDATA platform.",
    transition: "Phased by turnover; the second phase date has been moved before, so check the AADE announcement.",
    penalty: "Fines under the Greek Tax Procedure Code per non-compliant invoice.",
    verify: "AADE myDATA e-invoicing announcements and Law 5073/2023",
  },
  IT: {
    name: "Italy",
    bandLabel: "Business type",
    bands: [{ id: "all", label: "Any VAT-registered business or flat-rate taxpayer" }],
    receive: "2019-01-01",
    issue: { all: "2019-01-01" },
    format: "FatturaPA XML through the Sistema di Interscambio (SdI).",
    transition: "Flat-rate (forfettari) taxpayers were brought in progressively and are covered from 2024.",
    penalty: "Fine of 70% to 100% of the VAT on a missing or non-SdI invoice (minimum EUR 500).",
    verify: "Agenzia delle Entrate fatturazione elettronica pages",
  },
  ES: {
    name: "Spain",
    bandLabel: "Annual turnover",
    bands: [{ id: "over8m", label: "Over EUR 8 million" }, { id: "upto8m", label: "EUR 8 million or less" }],
    receive: null,
    issue: { over8m: null, upto8m: null },
    format: "Structured invoice in a format to be set by the implementing regulation, through a platform connected to the public solution.",
    transition: "The Crea y Crece law sets the obligation 12 months (over EUR 8 million) or 24 months (others) after its implementing regulation takes effect. Check whether that regulation has been approved.",
    penalty: "Not yet applicable.",
    verify: "Ley 18/2022 (Crea y Crece) and Agencia Tributaria / Ministerio de Asuntos Económicos announcements. VeriFactu billing-software rules are a separate regime.",
  },
};

export const OTHER_NOTE = `No national B2B e-invoicing mandate is built into this tool for that country. EU-wide, the ViDA package makes structured e-invoicing mandatory for intra-EU B2B supplies from ${VIDA_DATE}, and each Member State may bring in a domestic mandate sooner. Ask your tax authority.`;

export const METHODS = [
  { id: "paper", label: "Paper or scanned image" },
  { id: "pdf", label: "PDF sent by email" },
  { id: "structured", label: "Structured XML, Factur-X or Peppol already" },
  { id: "unsure", label: "Not sure" },
];

const DAY = 86400000;
function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmt(iso) {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "not fixed";
}
// Days until `iso` from `today` (negative once passed).
export function daysUntil(iso, today) {
  const d = parseDate(iso), t = parseDate(today);
  if (!d || !t) return null;
  return Math.round((d - t) / DAY);
}
export function statusOf(iso, today) {
  if (!iso) return { state: "pending", text: "No date fixed yet" };
  const n = daysUntil(iso, today);
  if (n <= 0) return { state: "inforce", text: `In force since ${fmt(iso)}` };
  return { state: n <= 365 ? "soon" : "later", text: `From ${fmt(iso)} (${n} day${n === 1 ? "" : "s"} away)` };
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const country = String(i.country || "").toUpperCase();
  const known = country === "OTHER" || country in COUNTRIES;
  if (!known) errors.push("Choose the country your business invoices from.");
  let band = i.band || "";
  if (known && country !== "OTHER" && !COUNTRIES[country].bands.some((b) => b.id === band)) errors.push(`Choose your ${COUNTRIES[country].bandLabel.toLowerCase()}.`);
  const method = METHODS.some((m) => m.id === i.method) ? i.method : "unsure";
  const today = i.today && parseDate(i.today) ? i.today : new Date().toISOString().slice(0, 10);
  return { errors, country, band, method, today };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const findings = [];
  if (p.country === "OTHER") {
    findings.push({ severity: "info", title: OTHER_NOTE });
    return { errors: [], input: p, country: null, receive: statusOf(null, p.today), issue: statusOf(null, p.today), findings, nextDate: null };
  }
  const c = COUNTRIES[p.country];
  const issueDate = c.issue[p.band];
  const receive = statusOf(c.receive, p.today);
  const issue = statusOf(issueDate, p.today);
  const weak = p.method === "paper" || p.method === "pdf" || p.method === "unsure";
  const dates = [c.receive, issueDate].filter(Boolean).sort();
  const nextDate = dates.find((d) => daysUntil(d, p.today) > 0) || null;

  findings.push({ severity: receive.state === "inforce" ? "high" : "medium", title: `Receiving: ${receive.text}.` });
  findings.push({ severity: issue.state === "inforce" ? "high" : issue.state === "soon" ? "high" : "medium", title: `Issuing: ${issue.text}.` });
  findings.push({ severity: "info", title: `Format: ${c.format}` });
  findings.push({ severity: "info", title: c.transition });
  findings.push({ severity: "info", title: `Penalties: ${c.penalty}` });
  if (weak && (receive.state === "inforce" || issue.state === "inforce" || issue.state === "soon" || receive.state === "soon")) {
    findings.push({ severity: "high", title: p.method === "unsure" ? "You are not sure how you invoice today. Find out: if it is paper or PDF it must change before the dates above." : `${PDF_NOTE} Move to structured invoices before the dates above.` });
  } else if (p.method === "structured" && issue.state !== "pending") {
    findings.push({ severity: "info", title: "Structured invoicing already in place. Confirm the format matches the national profile above and that your software can also receive." });
  }
  findings.push({ severity: "info", title: `Cross-border: EU-wide ViDA e-invoicing for intra-EU B2B supplies starts ${fmt(VIDA_DATE)}.` });
  return { errors: [], input: p, country: c, receive, issue, findings, nextDate };
}

export const SAMPLE = { country: "DE", band: "over800k", method: "pdf", today: "2026-10-13" };

export function summaryText(r) {
  if (!r.country) return ["EU e-invoicing mandate check (first read, not legal advice)", OTHER_NOTE].join("\n");
  return [
    "EU e-invoicing mandate check (first read, not legal advice)",
    `Country: ${r.country.name}`,
    `Receiving: ${r.receive.text}`,
    `Issuing: ${r.issue.text}`,
    `Format: ${r.country.format}`,
    `Penalties: ${r.country.penalty}`,
    `Verify against: ${r.country.verify}`,
    "",
    "Confirm with your tax authority or adviser.",
  ].join("\n");
}
