// Reads France's e-reporting file (Flux 10): what an approved platform (PA) sends the PPF
// for the sales that are not domestic B2B e-invoices, under the 2026 reform. Four kinds share
// one root, Report > ReportDocument, with either a TransactionsReport or a PaymentsReport:
//   10.1  invoices to or from businesses outside France (TransactionsReport/Invoice)
//   10.3  B2C and other non-invoiced sales, summed per day, category and rate (TransactionsReport/Transactions)
//   10.2  payments received on 10.1 invoices for services (PaymentsReport/Invoice)
//   10.4  payments received on 10.3 sales of services (PaymentsReport/Transactions)
// Element names and meanings are from the PPF's XSD as FNFE-MPE publishes it
// (github.com/fnfempe/France_RFE commit 97ba0f3, FNFE_RFE_INVOICE/Flux10/xsd).
//
// What it does, all offline:
// - names the kind, the declarant, the period and the totals per VAT rate (FR-F10-100);
// - catches what the official Flux 10 set (FNFE-MPE's Annexe 7 v1.8 controls, run beside this on
//   the plain route as plain/flux10-fr.json) does not look at, measured in
//   eval/flux10-crosscheck-2026-11-17.md: an impossible calendar date (the set checks the shape
//   YYYYMMDD and the year only), VAT that is not base x rate, a SIREN or French VAT number with a
//   wrong check key, a day or payment outside the report's period, one rate given twice.
//
// It reads a file; it is not a platform, does not send anything to the PPF, and is not tax advice.
import { parseXmlTree } from "./ubl.mjs";
import { frenchXmlValueFindings } from "./xmlvalues.mjs";

const local = (name) => String(name).replace(/^.*:/, "");
const kid = (node, name) => node?.children?.find((c) => local(c.name) === name);
const kids = (node, name) => (node?.children || []).filter((c) => local(c.name) === name);
const text = (node) => (node ? node.text.trim() : "");
const path = (node, ...names) => names.reduce((n, name) => kid(n, name), node);

// Root element Report whose first child is ReportDocument (comments and the prolog allowed before).
export const looksLikeFlux10 = (source) =>
  /^(?:\uFEFF)?\s*(?:<(?:\?[^?]*(?:\?(?!>)[^?]*)*\?>|!--[^-]*(?:-(?!->)[^-]*)*-->)\s*)*<Report\b[^>]*>\s*(?:<!--[^-]*(?:-(?!->)[^-]*)*-->\s*)*<ReportDocument\b/.test(String(source).slice(0, 8192));

const num = (s) => (s === "" || s == null || !/^-?\d+(?:\.\d+)?$/.test(String(s).trim()) ? null : Number(s));
const party = (p) => p && { id: text(kid(p, "Id")), scheme: kid(p, "Id")?.attrs?.schemeId || "", name: text(kid(p, "Name")), role: text(kid(p, "RoleCode")) };
const company = (p) => p && {
  id: text(kid(p, "CompanyId")),
  scheme: kid(p, "CompanyId")?.attrs?.schemeId || "",
  vat: text(kid(p, "TaxRegistrationId")),
  country: text(path(p, "PostalAddress", "CountryId")),
};
const subtotals = (node, rateName, baseName, taxName) => kids(node, rateName === "TaxCategory/Percent" ? "TaxSubTotal" : "TaxSubtotal").map((s) => ({
  rate: rateName === "TaxCategory/Percent" ? text(path(s, "TaxCategory", "Percent")) : text(kid(s, rateName)),
  category: rateName === "TaxCategory/Percent" ? text(path(s, "TaxCategory", "Code")) : "",
  base: text(kid(s, baseName)),
  tax: text(kid(s, taxName)),
}));
const payment = (node) => {
  const p = kid(node, "Payment");
  return { date: text(kid(p, "Date")), subtotals: kids(p, "SubTotals").map((s) => ({ rate: text(kid(s, "TaxPercent")), currency: text(kid(s, "CurrencyCode")), amount: text(kid(s, "Amount")) })) };
};

export function readFlux10(source) {
  const raw = (typeof source === "string" ? source : new TextDecoder().decode(source)).replace(/^\uFEFF/, "");
  const tree = parseXmlTree(raw);
  const root = tree.children.find((c) => local(c.name) === "Report");
  if (!root || !kid(root, "ReportDocument")) throw new Error("not a Flux 10 e-reporting file (Report > ReportDocument)");
  const doc = kid(root, "ReportDocument");
  const tr = kid(root, "TransactionsReport");
  const pr = kid(root, "PaymentsReport");
  const rep = tr || pr;
  return {
    // INV-065 (2026-11-17): a number or date holding a no-break space or another space XML
    // does not trim (frenchXmlValueFindings in xmlvalues.mjs says which leaves count).
    xmlValues: frenchXmlValueFindings(tree, "flux10"),
    id: text(kid(doc, "Id")),
    name: text(kid(doc, "Name")),
    createdAt: text(path(doc, "IssueDateTime", "DateTimeString")),
    typeCode: text(kid(doc, "TypeCode")),
    sender: party(kid(doc, "Sender")),
    issuer: party(kid(doc, "Issuer")),
    kind: tr && pr ? "both" : tr ? "transactions" : pr ? "payments" : "",
    period: { start: text(path(rep, "ReportPeriod", "StartDate")), end: text(path(rep, "ReportPeriod", "EndDate")) },
    invoices: tr ? kids(tr, "Invoice").map((inv) => ({
      id: text(kid(inv, "ID")),
      issueDate: text(kid(inv, "IssueDate")),
      typeCode: text(kid(inv, "TypeCode")),
      currency: text(kid(inv, "CurrencyCode")),
      dueDate: text(kid(inv, "DueDate")),
      process: text(path(inv, "BusinessProcess", "ID")),
      refs: kids(inv, "ReferencedDocument").map((r) => ({ id: text(kid(r, "ID")), issueDate: text(kid(r, "IssueDate")) })),
      seller: company(kid(inv, "Seller")),
      buyer: company(kid(inv, "Buyer")),
      deliveryDates: kids(inv, "Delivery").map((d) => text(kid(d, "Date"))).filter(Boolean),
      periodStart: text(path(inv, "InvoicePeriod", "StartDate")),
      periodEnd: text(path(inv, "InvoicePeriod", "EndDate")),
      totalNet: text(path(inv, "MonetaryTotal", "TaxExclusiveAmount")),
      totalTax: text(path(inv, "MonetaryTotal", "TaxAmount")),
      subtotals: subtotals(inv, "TaxCategory/Percent", "TaxableAmount", "TaxAmount"),
      lines: kids(inv, "Line").length,
    })) : pr ? kids(pr, "Invoice").map((inv) => ({ id: text(kid(inv, "InvoiceID")), issueDate: text(kid(inv, "IssueDate")), payment: payment(inv) })) : [],
    transactions: tr ? kids(tr, "Transactions").map((t) => ({
      date: text(kid(t, "Date")),
      currency: text(kid(t, "TransactionsCurrency")),
      category: text(kid(t, "CategoryCode")),
      totalNet: text(kid(t, "TaxExclusiveAmount")),
      totalTax: text(kid(t, "TaxTotal")),
      count: text(kid(t, "TransactionsCount")),
      subtotals: subtotals(t, "TaxPercent", "TaxableAmount", "TaxTotal"),
    })) : pr ? kids(pr, "Transactions").map((t) => ({ payment: payment(t) })) : [],
  };
}

// The four Flux 10 kinds, by what the file carries.
export function flux10Kinds(rep) {
  const out = [];
  if (rep.kind === "transactions") {
    if (rep.invoices.length) out.push("10.1 invoices (international B2B)");
    if (rep.transactions.length) out.push("10.3 transactions (B2C and other sales without an e-invoice)");
  } else if (rep.kind === "payments") {
    if (rep.invoices.length) out.push("10.2 payments on invoices");
    if (rep.transactions.length) out.push("10.4 payments on transactions");
  }
  return out;
}

const CREDIT_TYPES = new Set(["261", "381", "396", "502", "503"]);
const CATEGORIES = { TLB1: "goods (livraisons de biens)", TPS1: "services (prestations de services)", TNT1: "not taxable in France", TMA1: "margin scheme" };
const day = (s) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s || "(none)");

// A real calendar date (YYYYMMDD) or date-time (YYYYMMDDHHMMSS); the shape is the official set's job.
export function realDate(s) {
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?$/);
  if (!m) return true;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1] && (m[4] === undefined || (+m[4] < 24 && +m[5] < 60 && +m[6] < 60));
}

// SIREN: 9 digits with a Luhn key, except La Poste's 356000000.
export function sirenKeyOk(siren) {
  if (!/^\d{9}$/.test(siren)) return true; // the shape is G6.26 / G2.19's job
  if (siren === "356000000") return true; // La Poste: its SIREN breaks the key (its SIRETs use a digit sum divisible by 5)
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = +siren[8 - i];
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

// French VAT number FR + 2-digit key + SIREN, key = (12 + 3 x (SIREN mod 97)) mod 97. Older
// alphanumeric keys exist; only the numeric form is checked.
export function frVatKeyOk(vat) {
  const m = String(vat).replace(/\s/g, "").match(/^FR(\d{2})(\d{9})$/);
  if (!m) return true;
  return +m[1] === (12 + 3 * (Number(m[2]) % 97)) % 97;
}

const fault = (rule, message, fix, severity = "error") => ({ rule, message, fix, severity, source: "flux10" });
const sumOf = (xs) => xs.reduce((a, x) => a + (num(x) ?? 0), 0);
const cents = (x) => Math.round(x * 100);

export function flux10Findings(rep) {
  const out = [];
  out.push(...(rep.xmlValues || []));
  const kinds = flux10Kinds(rep);
  out.push({ rule: "FR-F10-100", severity: "information", source: "flux10", fix: "",
    message: `France e-reporting (Flux 10) ${rep.typeCode === "RE" ? "corrective (RE)" : rep.typeCode === "IN" ? "initial (IN)" : `type ${rep.typeCode || "(none)"}`} transmission ${rep.id || "(no id)"}: ${kinds.join(" and ") || "no invoices, transactions or payments"}, period ${day(rep.period.start)} to ${day(rep.period.end)}, declarant ${rep.issuer?.id || "(none)"}${rep.issuer?.role === "SE" ? " (seller)" : rep.issuer?.role === "BY" ? " (buyer)" : ""}.` });

  // FR-F10-101: impossible calendar dates. The official set tests ^\d{8}$ and the year range only.
  const dates = [["transmission date-time (TT-3)", rep.createdAt], ["period start", rep.period.start], ["period end", rep.period.end]];
  rep.invoices.forEach((inv) => {
    const who = `invoice ${inv.id || "(no number)"}`;
    dates.push([`${who} issue date`, inv.issueDate]);
    if (rep.kind === "payments") dates.push([`${who} payment date`, inv.payment.date]);
    else {
      dates.push([`${who} due date`, inv.dueDate], [`${who} billing period start`, inv.periodStart], [`${who} billing period end`, inv.periodEnd]);
      inv.refs.forEach((r) => dates.push([`${who} earlier invoice ${r.id} date`, r.issueDate]));
      inv.deliveryDates.forEach((d) => dates.push([`${who} delivery date`, d]));
    }
  });
  rep.transactions.forEach((t, i) => dates.push([`transactions block ${i + 1} ${rep.kind === "payments" ? "payment " : ""}date`, rep.kind === "payments" ? t.payment.date : t.date]));
  for (const [what, value] of dates) {
    if (value && !realDate(value)) out.push(fault("FR-F10-101", `The ${what} "${value}" is not a real calendar date. The official Flux 10 controls (G1.09, G1.36, G7.53) check its shape and year only, so it passes them.`, "Write a real date as YYYYMMDD (date-time YYYYMMDDHHMMSS)."));
  }

  // FR-F10-102: VAT per rate is base x rate. No official control compares them.
  const rateCheck = (label, s, tolerance) => {
    const base = num(s.base), tax = num(s.tax), rate = num(s.rate);
    if (base === null || tax === null || rate === null) return;
    const expected = (base * rate) / 100;
    if (Math.abs(cents(expected) - cents(tax)) > cents(tolerance)) {
      out.push(fault("FR-F10-102", `${label}: VAT ${s.tax} at ${s.rate}% on a base of ${s.base} should be about ${expected.toFixed(2)}. No official Flux 10 control compares VAT with base x rate; the totals rule (G1.53) only adds the subtotals up.`, "Recompute the VAT at this rate from the base, or move the amount to the rate it was charged at.", "warning"));
    }
  };
  rep.invoices.forEach((inv) => {
    if (rep.kind !== "transactions") return;
    inv.subtotals.forEach((s) => rateCheck(`Invoice ${inv.id || "(no number)"}, rate ${s.rate}%`, s, 0.01));
  });
  rep.transactions.forEach((t, i) => {
    if (rep.kind !== "transactions") return;
    // Each sale is rounded on its own receipt: allow half a cent per sale counted, at least a cent.
    const n = num(t.count);
    const tolerance = Math.max(0.01, n && n > 0 ? n * 0.005 : 0.01);
    t.subtotals.forEach((s) => rateCheck(`Transactions on ${day(t.date)} (${t.category}), rate ${s.rate}%`, s, tolerance));
    const rates = t.subtotals.map((s) => num(s.rate)).filter((r) => r !== null);
    const twice = rates.filter((r, k) => rates.indexOf(r) !== k);
    if (twice.length) out.push(fault("FR-F10-106", `Transactions on ${day(t.date)} (${t.category}, block ${i + 1}) give the rate ${[...new Set(twice)].join("%, ")}% more than once. The VAT breakdown is one subtotal per rate.`, "Merge the subtotals that share a rate.", "warning"));
    // G1.53 runs only when the currency is EUR; check the sums the same way otherwise.
    if (t.currency && t.currency !== "EUR" && num(t.totalNet) !== null) {
      const tol = 0.01 * t.subtotals.length;
      if (Math.abs(num(t.totalNet) - sumOf(t.subtotals.map((s) => s.base))) > tol + 1e-9 || Math.abs((num(t.totalTax) ?? 0) - sumOf(t.subtotals.map((s) => s.tax))) > tol + 1e-9) {
        out.push(fault("FR-F10-107", `Transactions on ${day(t.date)} in ${t.currency}: the totals are not the sum of the subtotals. The official totals rule (G1.53) is written for EUR blocks only, so it did not run.`, "Make TaxExclusiveAmount and TaxTotal the sums of the subtotals' TaxableAmount and TaxTotal."));
      }
    }
  });

  // FR-F10-103: a day or payment outside the report's period.
  const { start, end } = rep.period;
  if (/^\d{8}$/.test(start) && /^\d{8}$/.test(end)) {
    const outside = (d) => /^\d{8}$/.test(d) && realDate(d) && (d < start || d > end);
    rep.transactions.forEach((t, i) => {
      const d = rep.kind === "payments" ? t.payment.date : t.date;
      if (outside(d)) out.push(fault("FR-F10-103", `Transactions block ${i + 1} is dated ${day(d)}, outside the report's period ${day(start)} to ${day(end)}. No official control compares them.`, "Report the day in the transmission for its own period, or correct the period.", "warning"));
    });
    if (rep.kind === "payments") rep.invoices.forEach((inv) => {
      if (outside(inv.payment.date)) out.push(fault("FR-F10-103", `The payment on invoice ${inv.id || "(no number)"} is dated ${day(inv.payment.date)}, outside the report's period ${day(start)} to ${day(end)}. No official control compares them.`, "Report the payment in the transmission for its own period, or correct the period.", "warning"));
    });
  }

  // FR-F10-104: SIREN keys; FR-F10-105: French VAT number keys and their SIREN.
  const sirens = [["declarant (Issuer)", rep.issuer?.scheme === "0002" ? rep.issuer.id : ""]];
  rep.invoices.forEach((inv) => {
    if (rep.kind !== "transactions") return;
    for (const [role, p] of [["seller", inv.seller], ["buyer", inv.buyer]]) {
      if (!p) continue;
      const who = `Invoice ${inv.id || "(no number)"}: the ${role}`;
      if (p.scheme === "0002") sirens.push([`${role} on invoice ${inv.id || "(no number)"}`, p.id]);
      if (!frVatKeyOk(p.vat)) out.push(fault("FR-F10-105", `${who}'s French VAT number has the wrong check key (FR + key + SIREN, key = (12 + 3 x (SIREN mod 97)) mod 97). No official Flux 10 control checks it.`, "Copy the VAT number again from the business's records or the VIES service."));
      const m = String(p.vat).replace(/\s/g, "").match(/^FR\w{2}(\d{9})$/);
      if (m && p.scheme === "0002" && /^\d{9}$/.test(p.id) && m[1] !== p.id) out.push(fault("FR-F10-105", `${who}'s French VAT number is built on SIREN ${m[1]}, but its company id is SIREN ${p.id}.`, "A French VAT number carries the company's own SIREN: correct one of the two."));
    }
  });
  for (const [who, siren] of sirens) {
    if (siren && !sirenKeyOk(siren)) out.push(fault("FR-F10-104", `The ${who} SIREN ${siren} fails its check key (Luhn). The official controls check that it has nine digits only.`, "Copy the SIREN again from the business's Kbis or the INSEE register."));
  }
  return out;
}

export function flux10Envelope(rep) {
  const kinds = flux10Kinds(rep);
  const money = rep.kind === "transactions"
    ? (() => {
      const byRate = new Map();
      const add = (s, sign = 1) => { const k = String(num(s.rate) ?? s.rate); const v = byRate.get(k) || { base: 0, tax: 0 }; v.base += sign * (num(s.base) ?? 0); v.tax += sign * (num(s.tax) ?? 0); byRate.set(k, v); };
      // Credit notes (261, 381, 396, 502, 503) carry positive amounts; they reduce the totals.
      rep.invoices.forEach((i) => i.subtotals.forEach((s) => add(s, CREDIT_TYPES.has(i.typeCode) ? -1 : 1)));
      rep.transactions.forEach((t) => t.subtotals.forEach((s) => add(s)));
      return byRate.size ? `; per rate: ${[...byRate].map(([r, v]) => `${r}% base ${v.base.toFixed(2)} VAT ${v.tax.toFixed(2)}`).join(", ")}` : "";
    })()
    : (() => {
      const byRate = new Map();
      const add = (s) => byRate.set(String(num(s.rate) ?? s.rate), (byRate.get(String(num(s.rate) ?? s.rate)) || 0) + (num(s.amount) ?? 0));
      rep.invoices.forEach((i) => i.payment.subtotals.forEach(add));
      rep.transactions.forEach((t) => t.payment.subtotals.forEach(add));
      return byRate.size ? `; received per rate: ${[...byRate].map(([r, v]) => `${r}% ${v.toFixed(2)}`).join(", ")}` : "";
    })();
  const cats = [...new Set(rep.transactions.map((t) => t.category).filter(Boolean))].map((c) => `${c} ${Object.hasOwn(CATEGORIES, c) ? CATEGORIES[c] : "(unknown category)"}`);
  return `France e-reporting (Flux 10): ${kinds.join(" and ") || "empty report"}, ${day(rep.period.start)} to ${day(rep.period.end)}${rep.invoices.length ? `, ${rep.invoices.length} invoice(s)` : ""}${rep.transactions.length ? `, ${rep.transactions.length} transactions block(s)` : ""}${cats.length ? ` (${cats.join(", ")})` : ""}${money}. Official Flux 10 controls (FNFE-MPE, PPF Annexe 7 v1.8) run on the official-rules route.`;
}
