// Readable view of an e-invoice, in German, for xrechnung-anzeigen.html.
//
// Takes the invoice model ubl.mjs / cii.mjs already produce (the same one the
// checker reads) and returns an HTML string. Every value from the file is
// escaped: an invoice is untrusted input. Amounts are formatted from their
// decimal text, never through floating point, so 0.1 + 0.2 stays out of it and
// a unit price with four decimals keeps them.
//
// It shows what the file says. It does not recompute or judge anything; the
// checker (index.html) does that.

import { decodeXmlRefs } from "./xmlvalues.mjs";

// The readers keep text as written in the XML, references included, so
// "Müller &amp; Söhne" is decoded once (one pass: `&amp;lt;` shows as `&lt;`)
// and then escaped for HTML.
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function esc(value) {
  return decodeXmlRefs(String(value ?? "")).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// UNTDID 1001, the codes EN 16931 allows most often (BT-3).
export const DOCUMENT_TYPES = {
  "380": "Rechnung",
  "381": "Gutschrift (Rechnungskorrektur mit negativem Betrag)",
  "383": "Belastungsanzeige",
  "384": "Rechnungskorrektur",
  "386": "Vorauszahlungsrechnung",
  "389": "Selbst ausgestellte Rechnung (Gutschriftsverfahren)",
  "326": "Teilrechnung",
  // KoSIT BR-DE-17: 875 Partial construction invoice, 876 Partial final construction invoice.
  "875": "Abschlagsrechnung (Bau)",
  "876": "Teilschlussrechnung (Bau)",
  "877": "Schlussrechnung (Bau)",
};

// UNTDID 4461 (BT-81), the codes German invoices use.
export const PAYMENT_MEANS = {
  "1": "nicht angegeben",
  "10": "Barzahlung",
  "20": "Scheck",
  "30": "Überweisung",
  "31": "Überweisung (Auslandszahlung)",
  "42": "Zahlung auf Bankkonto",
  "48": "Bankkarte",
  "49": "Lastschrift",
  "54": "Kreditkarte",
  "55": "Debitkarte",
  "57": "Dauerauftrag",
  "58": "SEPA-Überweisung",
  "59": "SEPA-Lastschrift",
  "97": "Verrechnung",
  "ZZZ": "vereinbart (andere Zahlungsart)",
};

// UNCL 5305 as EN 16931 uses it (BT-118 / BT-151).
export const TAX_CATEGORIES = {
  S: "Normalsatz oder ermäßigter Satz",
  Z: "Nullsatz",
  E: "steuerbefreit",
  AE: "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)",
  K: "innergemeinschaftliche Lieferung",
  G: "Ausfuhr außerhalb der EU",
  O: "nicht steuerbar",
  L: "IGIC (Kanarische Inseln)",
  M: "IPSI (Ceuta und Melilla)",
};

// "1234.5" -> "1.234,50" (at least `minDecimals`, never fewer than the file gave).
export function formatDecimal(value, minDecimals = 2) {
  if (value === null || value === undefined || value === "") return "";
  let text = String(value).trim();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return esc(text);
    // Numbers arrive from parseDecimal; toString gives the shortest exact form.
    text = value.toString();
    if (/e/i.test(text)) text = value.toFixed(Math.max(minDecimals, 0));
  }
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) return esc(text);
  const [, sign, intRaw, fracRaw = ""] = match;
  const intPart = (intRaw.replace(/^0+(?=\d)/, "") || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let frac = fracRaw;
  while (frac.length < minDecimals) frac += "0";
  const negative = sign === "-" && /[1-9]/.test(intRaw + fracRaw);
  return `${negative ? "−" : ""}${intPart}${frac ? `,${frac}` : ""}`;
}

export function formatMoney(value, currency) {
  const number = formatDecimal(value, 2);
  if (!number) return "";
  return currency ? `${number} ${esc(currency)}` : number;
}

// "2026-08-24" -> "24.08.2026"; anything else is shown as written.
export function formatDate(value) {
  const text = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : esc(text);
}

// "DE02120300000000202051" -> "DE02 1203 0000 0000 2020 51"
export function formatIban(value) {
  const compact = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  return esc(compact.replace(/(.{4})(?=.)/g, "$1 "));
}

// Own entries only: a file's code "constructor" or "toString" must not reach Object.prototype.
function ownLabel(table, key) {
  if (Object.hasOwn(table, key.toUpperCase())) return table[key.toUpperCase()];
  if (Object.hasOwn(table, key)) return table[key];
  return "";
}

function codeLabel(table, code) {
  const key = String(code ?? "").trim();
  if (!key) return "";
  const label = ownLabel(table, key);
  return label ? `${esc(label)} <span class="code">(${esc(key)})</span>` : `<span class="code">Code ${esc(key)}</span>`;
}

export function documentTitle(invoice) {
  const code = String(invoice.document_code ?? "").trim();
  const label = code ? ownLabel(DOCUMENT_TYPES, code) : "";
  if (label) return label.replace(/ \(.*\)$/, "");
  if (invoice.document_type === "credit_note") return "Gutschrift";
  return "Rechnung";
}

function partyBlock(title, party) {
  if (!party || typeof party !== "object") return "";
  const rows = [];
  if (party.name) rows.push(`<strong>${esc(party.name)}</strong>`);
  if (party.street) rows.push(esc(party.street));
  const place = [party.postal_code, party.city].filter(Boolean).map(esc).join(" ");
  if (place || party.country) rows.push([place, party.country ? esc(party.country) : ""].filter(Boolean).join(", "));
  const facts = [];
  if (party.vat_id) facts.push(["USt-IdNr.", esc(party.vat_id)]);
  if (party.tax_number) facts.push(["Steuernummer", esc(party.tax_number)]);
  if (party.endpoint && party.endpoint.id) {
    facts.push(["Elektronische Adresse", `${esc(party.endpoint.id)}${party.endpoint.scheme ? ` <span class="code">(${esc(party.endpoint.scheme)})</span>` : ""}`]);
  }
  const contact = party.contact || {};
  if (contact.name) facts.push(["Kontakt", esc(contact.name)]);
  if (contact.phone) facts.push(["Telefon", esc(contact.phone)]);
  if (contact.email) facts.push(["E-Mail", esc(contact.email)]);
  return `<div class="party"><h3>${esc(title)}</h3><p>${rows.join("<br>") || "<em>nicht angegeben</em>"}</p>${facts.length ? `<dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>` : ""}</div>`;
}

function taxCell(line) {
  const percent = line.tax_percent === "" || line.tax_percent === undefined ? "" : `${formatDecimal(line.tax_percent, 0)} %`;
  const category = line.tax_category && line.tax_category !== "S" ? ` <span class="code">${esc(line.tax_category)}</span>` : "";
  return `${percent}${category}`;
}

function adjustmentLabel(row) {
  const kind = row.kind === "charge" ? "Zuschlag" : "Nachlass";
  const reason = row.reason ? `: ${esc(row.reason)}` : "";
  const percent = row.percent !== undefined && row.percent !== "" ? ` (${formatDecimal(row.percent, 0)} %${row.base !== undefined ? ` von ${formatDecimal(row.base)}` : ""})` : "";
  return `${kind}${reason}${percent}`;
}

// The whole readable invoice. `source` names where it came from
// ("XRechnung (UBL)", "ZUGFeRD-PDF, eingebettete CII-XML"), shown in the header.
export function renderInvoiceHtml(invoice, { source = "" } = {}) {
  if (!invoice || typeof invoice !== "object") throw new Error("Keine Rechnung zum Anzeigen.");
  const cur = invoice.currency || "";
  const parts = [];
  const title = documentTitle(invoice);
  parts.push(`<header class="inv-head"><div><p class="inv-kind">${esc(title)}</p><h2>Nr. ${esc(invoice.invoice_number || "—")}</h2>${source ? `<p class="fine">${esc(source)}</p>` : ""}</div>`);
  const meta = [["Rechnungsdatum", formatDate(invoice.issue_date)]];
  if (invoice.due_date) meta.push(["Fällig am", formatDate(invoice.due_date)]);
  if (invoice.period && (invoice.period.start || invoice.period.end)) {
    meta.push(["Leistungszeitraum", `${formatDate(invoice.period.start || "")} – ${formatDate(invoice.period.end || "")}`]);
  }
  if (invoice.buyer_reference) meta.push(["Käuferreferenz (Leitweg-ID)", esc(invoice.buyer_reference)]);
  if (invoice.order_reference) meta.push(["Bestellnummer", esc(invoice.order_reference)]);
  if (invoice.original_invoice) meta.push(["Bezieht sich auf Rechnung", esc(invoice.original_invoice)]);
  if (invoice.document_code) meta.push(["Rechnungsart", codeLabel(DOCUMENT_TYPES, invoice.document_code)]);
  if (cur) meta.push(["Währung", esc(cur)]);
  parts.push(`<dl class="inv-meta">${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></header>`);

  parts.push(`<div class="parties">${partyBlock("Rechnungssteller (Verkäufer)", invoice.supplier)}${partyBlock("Rechnungsempfänger (Käufer)", invoice.customer)}</div>`);
  if (invoice.payee_party && invoice.payee_party.name) parts.push(`<p class="fine">Zahlungsempfänger, abweichend vom Verkäufer: ${esc(invoice.payee_party.name)}</p>`);

  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const lineRows = lines.map((line, i) => {
    const adj = Array.isArray(line.adjustments) && line.adjustments.length
      ? `<div class="fine">${line.adjustments.map((a) => `${a.kind === "charge" ? "Zuschlag" : "Nachlass"} ${formatMoney(a.amount, cur)}`).join("; ")}</div>` : "";
    const reason = line.tax_reason ? `<div class="fine">${esc(line.tax_reason)}</div>` : "";
    const base = line.price_base_quantity !== undefined && String(line.price_base_quantity) !== "1" ? ` <span class="fine">je ${formatDecimal(line.price_base_quantity, 0)}</span>` : "";
    return `<tr><td>${i + 1}</td><td>${esc(line.description || "")}${adj}${reason}</td><td class="num">${formatDecimal(line.quantity, 0)}</td><td class="num">${formatDecimal(line.unit_price)}${base}</td><td class="num">${taxCell(line)}</td><td class="num">${formatDecimal(line.net)}</td></tr>`;
  }).join("");
  parts.push(`<div class="table-wrap"><table class="lines"><caption>Positionen (${lines.length})</caption><thead><tr><th scope="col">Pos.</th><th scope="col">Bezeichnung</th><th scope="col" class="num">Menge</th><th scope="col" class="num">Einzelpreis</th><th scope="col" class="num">USt</th><th scope="col" class="num">Netto${cur ? ` (${esc(cur)})` : ""}</th></tr></thead><tbody>${lineRows || `<tr><td colspan="6"><em>Keine Positionen in der Datei.</em></td></tr>`}</tbody></table></div>`);

  const totals = invoice.totals || {};
  const sums = [];
  for (const row of Array.isArray(invoice.adjustments) ? invoice.adjustments : []) {
    sums.push([adjustmentLabel(row), formatMoney(row.kind === "charge" ? row.amount : `-${String(row.amount ?? "").replace(/^-/, "")}`, cur)]);
  }
  if (totals.net !== undefined && totals.net !== "") sums.push(["Summe netto", formatMoney(totals.net, cur)]);
  for (const row of Array.isArray(invoice.tax_breakdown) ? invoice.tax_breakdown : []) {
    const rate = row.tax_percent !== undefined && row.tax_percent !== "" ? `${formatDecimal(row.tax_percent, 0)} %` : "";
    const cat = row.tax_category && row.tax_category !== "S" ? ` ${codeLabel(TAX_CATEGORIES, row.tax_category)}` : "";
    const base = row.taxable !== undefined ? ` auf ${formatMoney(row.taxable, cur)}` : "";
    sums.push([`Umsatzsteuer ${rate}${cat}${base}`, formatMoney(row.tax ?? "", cur)]);
  }
  if (!(invoice.tax_breakdown || []).length && totals.tax !== undefined && totals.tax !== "") sums.push(["Umsatzsteuer", formatMoney(totals.tax, cur)]);
  if (totals.gross !== undefined && totals.gross !== "") sums.push(["Gesamtbetrag brutto", formatMoney(totals.gross, cur)]);
  if (totals.prepaid !== undefined && totals.prepaid !== "" && Number(totals.prepaid) !== 0) sums.push(["bereits gezahlt", formatMoney(`-${String(totals.prepaid).replace(/^-/, "")}`, cur)]);
  if (totals.rounding !== undefined && totals.rounding !== "" && Number(totals.rounding) !== 0) sums.push(["Rundung", formatMoney(totals.rounding, cur)]);
  const payable = totals.payable !== undefined && totals.payable !== "" ? totals.payable : totals.due;
  const sumRows = sums.map(([k, v]) => `<tr><th scope="row">${k}</th><td class="num">${v}</td></tr>`).join("");
  const payableRow = payable !== undefined && payable !== "" ? `<tr class="payable"><th scope="row">Zahlbetrag</th><td class="num">${formatMoney(payable, cur)}</td></tr>` : "";
  parts.push(`<table class="sums">${sumRows}${payableRow}</table>`);
  if (invoice.tax_exemption_reason) parts.push(`<p class="fine">Steuerbefreiungsgrund laut Datei: ${esc(invoice.tax_exemption_reason)}</p>`);

  const pay = invoice.payment || {};
  const payFacts = [];
  if (pay.means) payFacts.push(["Zahlungsart", codeLabel(PAYMENT_MEANS, pay.means)]);
  if (pay.iban) payFacts.push(["IBAN", formatIban(pay.iban)]);
  if (pay.bic) payFacts.push(["BIC", esc(pay.bic)]);
  if (pay.remittance) payFacts.push(["Verwendungszweck", esc(pay.remittance)]);
  if (pay.mandate) payFacts.push(["Mandatsreferenz", esc(pay.mandate)]);
  if (pay.terms_days) payFacts.push(["Zahlungsziel", `${esc(pay.terms_days)} Tage`]);
  if (payFacts.length) parts.push(`<div class="pay"><h3>Zahlung</h3><dl>${payFacts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></div>`);

  const notes = Array.isArray(invoice.notes) ? invoice.notes.filter(Boolean) : [];
  if (notes.length) parts.push(`<div class="notes"><h3>Bemerkungen</h3>${notes.map((n) => `<p>${esc(n)}</p>`).join("")}</div>`);

  const spec = invoice.specification_id ? String(invoice.specification_id) : "";
  if (spec) parts.push(`<p class="fine">Spezifikation: <span class="code">${esc(spec)}</span>${/xrechnung/i.test(spec) ? " (XRechnung)" : ""}</p>`);
  return parts.join("\n");
}

// Which standard a file follows, in words, from its specification id (BT-24).
export function describeSpecification(spec) {
  const text = String(spec || "");
  if (/xrechnung/i.test(text)) {
    const version = /xrechnung_(\d+\.\d+)/i.exec(text);
    return `XRechnung${version ? ` ${version[1]}` : ""}`;
  }
  if (/factur-x\.eu:1p0:extended|zugferd.*extended/i.test(text)) return "ZUGFeRD / Factur-X EXTENDED";
  if (/basicwl/i.test(text)) return "ZUGFeRD / Factur-X BASIC WL";
  if (/factur-x\.eu:1p0:minimum/i.test(text)) return "ZUGFeRD / Factur-X MINIMUM";
  if (/peppol/i.test(text)) return "Peppol BIS Billing 3.0";
  if (/en16931/i.test(text)) return "EN 16931";
  return "";
}
