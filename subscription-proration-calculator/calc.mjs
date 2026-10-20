// Subscription proration maths: mid-cycle upgrades, downgrades, seat changes and cancellations.
// Pure functions, no DOM, no network. Works in integer cents. Every figure is the user's own input.

export const SAMPLE = {
  mode: "prorate",
  periodStart: "2026-01-01", periodEnd: "2026-02-01",
  startAmount: "100",
  changes: "2026-01-17, 150",
  taxPct: "0",
};

const MS = 86400000;
export const dollars = (cents) => (cents < 0 ? "-" : "") + "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
export const iso = (t) => new Date(t).toISOString().slice(0, 10);
const toCents = (v) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "" || !/^-?\d*\.?\d+$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
};
// Round half up on the cent. Integer inputs keep this exact enough: amount * days / periodDays.
const prorate = (cents, days, total) => Math.round((cents * days) / total);

export function parse(raw) {
  const errors = [];
  const mode = raw.mode === "reset" ? "reset" : "prorate";
  const start = parseDate(raw.periodStart), end = parseDate(raw.periodEnd);
  if (Number.isNaN(start)) errors.push("Enter the billing period start as YYYY-MM-DD.");
  if (Number.isNaN(end)) errors.push("Enter the billing period end (the renewal date) as YYYY-MM-DD.");
  if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) errors.push("The period must end after it starts.");
  if (!Number.isNaN(start) && !Number.isNaN(end) && (end - start) / MS > 400) errors.push("Billing periods longer than 400 days are not supported.");
  const startAmount = toCents(raw.startAmount);
  if (!(startAmount >= 0)) errors.push("Enter the amount already billed for this period (0 or more).");
  const taxText = String(raw.taxPct ?? "").trim();
  const taxPct = taxText === "" ? 0 : Number(taxText.replace("%", ""));
  if (!(taxPct >= 0 && taxPct <= 50)) errors.push("Tax rate must be from 0 to 50 percent.");
  const changes = [];
  const lines = String(raw.changes ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) errors.push("Add at least one change: a date and the new amount per period, e.g. 2026-01-17, 150.");
  lines.forEach((line, i) => {
    // Split on the first separator only, so an amount like 1,200.50 keeps its thousands comma.
    const m = /^(\d{4}-\d{2}-\d{2})\s*[,;\t]\s*(.+)$/.exec(line);
    const t = m ? parseDate(m[1]) : NaN, amt = m ? toCents(m[2]) : NaN;
    if (!m || Number.isNaN(t)) { errors.push(`Change ${i + 1}: write it as date, new amount (2026-01-17, 150).`); return; }
    if (!(amt >= 0)) { errors.push(`Change ${i + 1}: the new amount must be 0 or more (0 means cancelled).`); return; }
    changes.push({ t, amount: amt, line: i + 1 });
  });
  if (!errors.length) {
    changes.sort((a, b) => a.t - b.t);
    for (let i = 0; i < changes.length; i++) {
      if (changes[i].t < start || changes[i].t >= end) errors.push(`Change on ${iso(changes[i].t)} falls outside the period (${iso(start)} up to, not including, ${iso(end)}).`);
      if (i && changes[i].t === changes[i - 1].t) errors.push(`Two changes share the date ${iso(changes[i].t)}; keep one.`);
    }
    if (mode === "reset" && changes.length > 1) errors.push("Reset mode handles one change; use prorate mode for a series of changes.");
  }
  return { errors, mode, start, end, startAmount, taxPct, changes };
}

function priceOneChange(p, change) {
  // Net balance for a single change on a date, used by the sweep table.
  const total = (p.end - p.start) / MS;
  const before = Math.round((change.t - p.start) / MS);
  if (p.mode === "reset") {
    const unused = total - before;
    const credit = prorate(p.startAmount, unused, total);
    return { credit, charge: change.amount, net: change.amount - credit };
  }
  const oldPart = prorate(p.startAmount, before, total);
  const newPart = prorate(change.amount, total - before, total);
  return { credit: p.startAmount - oldPart, charge: newPart, net: oldPart + newPart - p.startAmount };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const totalDays = (p.end - p.start) / MS;
  const findings = [];
  let segments = [], net, creditUnused = null, chargeNew = null, nextRenewal = null, nextAmount;
  if (p.mode === "prorate") {
    let cursor = p.start, amount = p.startAmount;
    const cuts = [...p.changes.map((c) => ({ t: c.t, amount: c.amount })), { t: p.end, amount: null }];
    for (const cut of cuts) {
      const days = Math.round((cut.t - cursor) / MS);
      if (days > 0) segments.push({ from: cursor, to: cut.t, days, amount, charge: prorate(amount, days, totalDays) });
      cursor = cut.t;
      if (cut.amount !== null) amount = cut.amount;
    }
    const owed = segments.reduce((s, x) => s + x.charge, 0);
    net = owed - p.startAmount;
    nextAmount = p.changes[p.changes.length - 1].amount;
    nextRenewal = p.end;
    segments.owed = owed;
  } else {
    const c = p.changes[0];
    const unused = Math.round((p.end - c.t) / MS);
    creditUnused = prorate(p.startAmount, unused, totalDays);
    chargeNew = c.amount;
    net = chargeNew - creditUnused;
    nextRenewal = c.t + totalDays * MS;
    nextAmount = c.amount;
    segments = [
      { from: p.start, to: c.t, days: totalDays - unused, amount: p.startAmount, charge: p.startAmount - creditUnused },
      { from: c.t, to: nextRenewal, days: totalDays, amount: c.amount, charge: c.amount },
    ];
  }
  const tax = Math.round((net * p.taxPct) / 100);
  const invoice = net + tax;
  if (net > 0) findings.push({ severity: "info", title: `The customer owes ${dollars(net)} more now${tax ? ` (${dollars(invoice)} with tax)` : ""}.` });
  else if (net < 0) findings.push({ severity: "medium", title: `The customer is owed ${dollars(-net)}: issue it as a credit on the next invoice or a refund, whichever your terms promise.` });
  else findings.push({ severity: "info", title: "Nothing changes this period." });
  if (p.changes.some((c) => c.amount === 0)) findings.push({ severity: "medium", title: "A change to 0 is treated as a cancellation: the unused part of what was billed is credited." });
  if (p.changes.some((c) => c.t === p.start)) findings.push({ severity: "info", title: "A change on the first day of the period is a full-period change; nothing is prorated for the old amount." });
  if (p.mode === "prorate" && p.changes.length > 1) findings.push({ severity: "info", title: `${p.changes.length} changes are priced as ${segments.length} segments; rounding is per segment, so the total can differ by a cent from rounding once.` });
  // Sweep: net balance for the first change at other dates through the period.
  const sweep = [];
  const first = p.changes[0];
  const steps = Math.min(8, totalDays - 1);
  for (let i = 0; i <= steps; i++) {
    const t = p.start + Math.round((i / steps) * (totalDays - 1)) * MS;
    const r = priceOneChange(p, { t, amount: first.amount });
    sweep.push({ date: t, ...r });
  }
  return { errors: [], mode: p.mode, start: p.start, end: p.end, totalDays, startAmount: p.startAmount, segments, creditUnused, chargeNew, net, tax, invoice, taxPct: p.taxPct, nextRenewal, nextAmount, findings, sweep };
}

export function summaryText(r) {
  const L = [];
  L.push(`Proration summary (${r.mode === "reset" ? "restart the period on the change date" : "keep the renewal date"})`);
  L.push(`Period: ${iso(r.start)} to ${iso(r.end)} (${r.totalDays} days). Already billed: ${dollars(r.startAmount)}.`);
  for (const s of r.segments) L.push(`  ${iso(s.from)} to ${iso(s.to)}  ${String(s.days).padStart(3)} days  at ${dollars(s.amount)}  =  ${dollars(s.charge)}`);
  if (r.mode === "reset") L.push(`Credit for unused time: ${dollars(r.creditUnused)}. New charge: ${dollars(r.chargeNew)}.`);
  L.push(`Balance now: ${r.net >= 0 ? "charge " : "credit "}${dollars(Math.abs(r.net))}${r.taxPct ? `, tax ${dollars(r.tax)}, total ${dollars(r.invoice)}` : ""}.`);
  L.push(`Next renewal: ${iso(r.nextRenewal)} at ${dollars(r.nextAmount)}.`);
  L.push("Day-count proration, rounded half up per line. Check it against your billing provider's own setting before relying on it.");
  return L.join("\n");
}

export function sweepCsv(r) {
  const rows = [["change_date", "credit_for_unused_old", "charge_for_new", "net_balance"]];
  for (const x of r.sweep) rows.push([iso(x.date), (x.credit / 100).toFixed(2), (x.charge / 100).toFixed(2), (x.net / 100).toFixed(2)]);
  return rows.map((row) => row.join(",")).join("\n") + "\n";
}
