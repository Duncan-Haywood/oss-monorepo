// Estimate maths in integer cents so totals never drift by a penny.
// Pure functions only: the page owns storage and rendering.

export function toCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9));
}

export function fromCents(cents) {
  return Math.round(cents) / 100;
}

export function formatMoney(cents, currency = "USD", locale = "en-US") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

// Round a percentage of an integer-cent amount half away from zero.
export function percentOf(cents, pct) {
  const raw = (cents * (Number(pct) || 0)) / 100;
  return Math.sign(raw) * Math.round(Math.abs(raw) + 1e-9);
}

export function lineAmount(line) {
  const qty = Number(line.qty);
  const rate = toCents(line.rate);
  if (!Number.isFinite(qty)) return 0;
  return Math.round(qty * rate + (qty * rate < 0 ? -1e-9 : 1e-9));
}

export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = parseDate(iso);
  if (!d) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function daysBetween(fromIso, toIso) {
  const a = parseDate(fromIso), b = parseDate(toIso);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}


// One option's totals. An option is a set of lines the client can pick instead
// of the others (good / better / best). Lines with optional:true are add-ons
// the client may tick; they are excluded from `total` and reported separately
// so the printed price is the one the client can accept without any add-on.
export function optionTotals(est, option) {
  const all = (option.lines || []).map((l) => ({ ...l, amount: lineAmount(l) }));
  const base = all.filter((l) => !l.optional);
  const addons = all.filter((l) => l.optional);
  const subtotal = base.reduce((s, l) => s + l.amount, 0);
  let discount = 0;
  if (est.discountType === "percent") discount = percentOf(subtotal, est.discountValue);
  else if (est.discountType === "amount") discount = toCents(est.discountValue);
  discount = Math.min(discount, Math.max(subtotal, 0));
  const taxableLines = base.filter((l) => l.taxable !== false).reduce((s, l) => s + l.amount, 0);
  const taxableBase = subtotal > 0 ? Math.max(0, taxableLines - Math.round((discount * taxableLines) / subtotal)) : 0;
  const tax = percentOf(taxableBase, est.taxRate);
  const total = subtotal - discount + tax;
  const addonTotal = addons.reduce((s, l) => s + l.amount + percentOf(l.taxable === false ? 0 : l.amount, est.taxRate), 0);
  return { lines: all, subtotal, discount, taxableBase, tax, total, addons, addonTotal, deposit: depositFor(est, total) };
}

// Deposit as a percentage of the option total, or a flat amount capped at it.
export function depositFor(est, total) {
  if (total <= 0) return 0;
  if (est.depositType === "percent") return Math.min(total, percentOf(total, est.depositValue));
  if (est.depositType === "amount") return Math.min(total, Math.max(0, toCents(est.depositValue)));
  return 0;
}

export function validUntil(issued, validDays) {
  return addDays(issued, Math.max(0, Math.floor(Number(validDays) || 0)));
}

// draft -> sent -> accepted | declined; a sent estimate past its valid-until
// date reads as expired so it stops counting as live pipeline.
export function status(est, today) {
  if (est.outcome === "accepted") return "accepted";
  if (est.outcome === "declined") return "declined";
  if (!est.sent) return "draft";
  if (est.validUntil && today && est.validUntil < today) return "expired";
  return "sent";
}

// The figure a sent estimate is worth: the option the client chose if known,
// otherwise the lowest-priced option, which is the one you can count on.
export function estimateValue(est) {
  const totals = (est.options || []).map((o) => optionTotals(est, o).total);
  if (!totals.length) return 0;
  if (est.outcome === "accepted" && Number.isInteger(est.acceptedOption) && totals[est.acceptedOption] !== undefined) return totals[est.acceptedOption];
  return Math.min(...totals);
}

export function nextNumber(items, prefix = "EST-") {
  let max = 0, width = 4;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  for (const i of items) {
    const m = re.exec(i.number || "");
    if (m) { max = Math.max(max, +m[1]); width = Math.max(width, m[1].length); }
  }
  return prefix + String(max + 1).padStart(width, "0");
}

export function duplicateNumbers(items) {
  const seen = new Map();
  for (const i of items) if (i.number) seen.set(i.number, (seen.get(i.number) || 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

// Sales view: how many of the estimates you sent turned into work, what live
// pipeline is worth, and which sent estimates have gone quiet. Win rate counts
// decided estimates only (accepted / (accepted + declined + expired)) so a
// draft or a still-open quote cannot flatter or sink it.
export function pipeline(estimates, today, { followUpDays = 3 } = {}) {
  let sent = 0, accepted = 0, declined = 0, expired = 0, open = 0, openValue = 0, wonValue = 0;
  const followUp = [];
  for (const e of estimates) {
    const st = status(e, today);
    if (st === "draft") continue;
    sent++;
    const v = estimateValue(e);
    if (st === "accepted") { accepted++; wonValue += v; }
    else if (st === "declined") declined++;
    else if (st === "expired") expired++;
    else {
      open++; openValue += v;
      const age = daysBetween(e.sentOn || e.issued, today);
      if (age >= followUpDays) followUp.push({ number: e.number, client: e.clientName, daysSinceSent: age, value: v, validUntil: e.validUntil });
    }
  }
  const decided = accepted + declined + expired;
  followUp.sort((a, b) => b.value - a.value);
  return { sent, accepted, declined, expired, open, openValue, wonValue, winRate: decided ? accepted / decided : null, avgWon: accepted ? Math.round(wonValue / accepted) : 0, followUp };
}

// A won estimate as a draft invoice in Invoice Maker's own schema, so the
// "Download as invoice" file restores straight into that tool. The deposit is
// left as an amount already paid only if the user says it was collected.
export function toInvoiceDraft(est, { depositPaid = false, issued = "" } = {}) {
  const idx = Number.isInteger(est.acceptedOption) ? est.acceptedOption : 0;
  const option = (est.options || [])[idx] || { lines: [] };
  const t = optionTotals(est, option);
  const chosen = (option.lines || []).filter((l) => !l.optional || est.acceptedAddons?.includes(l.desc));
  return {
    id: "from-" + String(est.id || est.number),
    number: String(est.number || "").replace(/^EST-/, "INV-"),
    clientName: est.clientName || "", clientEmail: est.clientEmail || "", clientAddr: est.clientAddr || "",
    fromName: est.fromName || "", fromEmail: est.fromEmail || "", fromAddr: est.fromAddr || "", fromTaxId: est.fromTaxId || "",
    issued, terms: "net30", due: issued ? addDays(issued, 30) : "", currency: est.currency || "USD",
    sent: false, void: false, taxRate: est.taxRate || "", discountType: est.discountType || "none", discountValue: est.discountValue || "",
    shipping: "", paid: depositPaid ? (t.deposit / 100).toFixed(2) : "",
    lines: chosen.map((l) => ({ desc: l.desc, qty: l.qty, rate: l.rate, taxable: l.taxable !== false })),
    payInstructions: est.payInstructions || "", notes: `Per accepted estimate ${est.number || ""}`.trim(),
  };
}

export function estimatesToCsv(estimates, today) {
  const head = ["Number", "Client", "Issued", "Valid until", "Status", "Options", "Lowest total", "Highest total", "Accepted option", "Accepted total"];
  const rows = estimates.map((e) => {
    const totals = (e.options || []).map((o) => optionTotals(e, o).total);
    const acc = e.outcome === "accepted" && totals[e.acceptedOption] !== undefined ? totals[e.acceptedOption] : null;
    return [e.number, e.clientName, e.issued, e.validUntil, status(e, today), totals.length, ...[Math.min(...totals), Math.max(...totals)].map((c) => (Number.isFinite(c) ? (c / 100).toFixed(2) : "")), acc === null ? "" : (e.options[e.acceptedOption].name || `Option ${e.acceptedOption + 1}`), acc === null ? "" : (acc / 100).toFixed(2)];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// Plain-language acceptance sentence printed above the signature block.
export function acceptanceSentence(est, deposit) {
  const parts = [`This estimate is valid until ${est.validUntil || "the date shown"}; prices may change after that.`];
  if (deposit > 0) parts.push(`A deposit of ${formatMoney(deposit, est.currency)} is due to book the work.`);
  parts.push("It is an estimate of the work described, not a fixed-price contract, unless you agree otherwise in writing.");
  return parts.join(" ");
}

export function validate(est) {
  const out = [];
  if (!est.number) out.push("Add an estimate number so the client can quote it back to you.");
  if (!est.clientName) out.push("Add the client name.");
  if (!est.issued) out.push("Add the issue date.");
  if (!est.fromName) out.push("Add your business name.");
  const options = est.options || [];
  if (!options.length || !options.some((o) => (o.lines || []).some((l) => String(l.desc || "").trim() && lineAmount(l) !== 0))) out.push("Add at least one line item with a description and an amount.");
  if (!est.validUntil) out.push("Add how long the price is good for: an estimate with no expiry can be held against you after your costs move.");
  if (est.issued && est.validUntil && est.validUntil < est.issued) out.push("The valid-until date is before the issue date.");
  if (!String(est.scope || "").trim()) out.push("Describe the scope (what is included and what is not): most disputes about an estimate are about scope.");
  if (Number(est.taxRate) < 0 || Number(est.taxRate) > 100) out.push("Tax rate should be between 0 and 100.");
  if (est.depositType === "percent" && (Number(est.depositValue) < 0 || Number(est.depositValue) > 100)) out.push("Deposit percentage should be between 0 and 100.");
  if (options.length > 1 && options.some((o) => !String(o.name || "").trim())) out.push("Name each option (for example Basic, Standard, Premium) so the client can say which one they pick.");
  return out;
}

function csvCell(v) {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // spreadsheet formula injection
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

