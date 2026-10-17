// Ticket margin, bay capacity and upsell value for a tire shop. Pure functions, no DOM.
// Arithmetic on figures the user types; nothing here is a market price, a labor rate or a tax rule.

export const DEFAULTS = Object.freeze({
  ticketsPerMonth: 200,
  laborCostPerHour: 0,
  cardFeePct: 3,
  overheadMonthly: 0,
  bays: 2,
  hoursPerBayDay: 8,
  daysPerMonth: 26,
  liftPoints: 5,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Lines: "item, price, parts cost, labor minutes, attach rate (% of tickets)". Header optional.
// A blank attach rate means 100 (the item is on every ticket).
export function parseItems(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 2) { skipped++; continue; }
    const price = num(cells[1], NaN);
    if (!Number.isFinite(price)) { if (rows.length || !/price|item|name|service/i.test(line)) skipped++; continue; }
    const cost = num(cells[2], 0), minutes = num(cells[3], 0), attach = num(cells[4], 100);
    if (price <= 0 || !(cost >= 0) || !(minutes >= 0) || !(attach >= 0) || attach > 100) { skipped++; continue; }
    rows.push({ name: cells[0] || "Item", price, cost, minutes, attach });
  }
  const warnings = skipped ? [`${skipped} line(s) skipped (need a name, a positive price and an attach rate from 0 to 100).`] : [];
  if (!rows.length) return { error: "Add at least one line: item, price, parts cost, labor minutes, attach rate (% of tickets)." };
  return { rows, warnings };
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], DEFAULTS[k]);
  return o;
};

const DISCOUNTS = [5, 10];

export function analyze(items, opts = {}) {
  const o = clean(opts);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.cardFeePct >= 100) return { error: "Card fee must be under 100%." };
  if (o.ticketsPerMonth <= 0) return { error: "Tickets per month must be above zero." };
  if (o.bays <= 0 || o.hoursPerBayDay <= 0) return { error: "Bays and hours per bay per day must be above zero." };
  if (o.daysPerMonth <= 0 || o.daysPerMonth > 31) return { error: "Days open per month must be between 1 and 31." };
  if (o.liftPoints > 100) return { error: "Attach-rate lift must be 100 points or less." };
  const warnings = [];
  const fee = o.cardFeePct / 100;

  const lines = items.map((m) => {
    const a = m.attach / 100;
    const gross = m.price * (1 - fee) - m.cost;
    const labor = (m.minutes / 60) * o.laborCostPerHour;
    const net = gross - labor;
    const grossPerBayHour = m.minutes > 0 ? gross / (m.minutes / 60) : null;
    return {
      ...m, gross, labor, net,
      marginPct: m.price > 0 ? net / m.price : 0,
      grossPerBayHour,
      perTicketRevenue: a * m.price,
      perTicketNet: a * net,
      perTicketMinutes: a * m.minutes,
      monthlySales: o.ticketsPerMonth * a,
      monthlyNet: o.ticketsPerMonth * a * net,
      losesMoney: net < 0,
    };
  });

  const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
  const ticketRevenue = sum("perTicketRevenue"), ticketNet = sum("perTicketNet"), ticketMinutes = sum("perTicketMinutes");
  const revenue = o.ticketsPerMonth * ticketRevenue;
  const contribution = o.ticketsPerMonth * ticketNet;
  const net = contribution - o.overheadMonthly;
  const capacityMinutes = o.bays * o.hoursPerBayDay * 60 * o.daysPerMonth;
  const demandMinutes = o.ticketsPerMonth * ticketMinutes;
  const utilization = capacityMinutes > 0 && demandMinutes > 0 ? demandMinutes / capacityMinutes : 0;
  const maxTickets = ticketMinutes > 0 ? capacityMinutes / ticketMinutes : null;
  const breakEvenTickets = ticketNet > 0 ? o.overheadMonthly / ticketNet : null;
  const netPerBayHour = demandMinutes > 0 ? (contribution) / (demandMinutes / 60) : null;

  if (ticketNet <= 0) warnings.push("The average ticket makes no money after parts, fees and labor at these figures, so more tickets lose more.");
  if (utilization > 1) warnings.push(`Bay time needed is ${(utilization * 100).toFixed(0)}% of what your bays offer; these tickets do not fit without more bays or hours.`);
  if (lines.some((l) => l.losesMoney)) warnings.push("At least one line loses money on each sale after parts, fees and labor.");
  if (o.laborCostPerHour === 0 && lines.some((l) => l.minutes > 0)) warnings.push("Labor cost per hour is zero, so labor is treated as free; enter your loaded technician cost to see true margin.");

  // Attach-rate lift: points added to one line's attach rate, capped at 100% of tickets.
  const lifts = lines.map((l) => {
    const newAttach = Math.min(100, l.attach + o.liftPoints);
    const added = (newAttach - l.attach) / 100;
    return { name: l.name, from: l.attach, to: newAttach, extraSales: o.ticketsPerMonth * added, extraNet: o.ticketsPerMonth * added * l.net, extraMinutes: o.ticketsPerMonth * added * l.minutes };
  });

  // Discounting one line: ticket net falls by attach x price x pct x (1 - fee); volume must rise to hold net.
  const discounts = lines.map((l) => ({
    name: l.name,
    cuts: DISCOUNTS.map((pct) => {
      const delta = (l.attach / 100) * l.price * (pct / 100) * (1 - fee);
      const newNet = ticketNet - delta;
      const volumeGain = ticketNet > 0 && newNet > 0 ? ticketNet / newNet - 1 : null;
      const fits = volumeGain !== null && maxTickets !== null ? o.ticketsPerMonth * (1 + volumeGain) <= maxTickets + 1e-9 : null;
      return { pct, perTicketLoss: delta, volumeGain, fits };
    }),
  }));

  const best = lines.filter((l) => l.grossPerBayHour !== null).sort((a, b) => b.grossPerBayHour - a.grossPerBayHour)[0] || null;
  const bestLift = lifts.filter((x) => x.extraNet > 0).sort((a, b) => b.extraNet - a.extraNet)[0] || null;
  const verdict = ticketNet <= 0
    ? "The average ticket loses money at these figures."
    : bestLift
      ? `The average ticket nets ${money2(ticketNet)}. The biggest lever is ${bestLift.name}: ${o.liftPoints} more points of attach adds ${money(bestLift.extraNet)} a month.`
      : `The average ticket nets ${money2(ticketNet)}; no line has room to add attach or a positive margin.`;

  return {
    options: o, lines,
    ticket: { revenue: ticketRevenue, net: ticketNet, minutes: ticketMinutes, marginPct: ticketRevenue > 0 ? ticketNet / ticketRevenue : 0 },
    store: { revenue, contribution, overhead: o.overheadMonthly, net, annual: net * 12, breakEvenTickets, capacityMinutes, demandMinutes, utilization, maxTickets, netPerBayHour, bestPerBayHour: best ? best.name : null },
    lifts, discounts, verdict, warnings,
  };
}

export function sampleItems() {
  return "item,price,parts cost,labor minutes,attach rate %\nTire set of 4 installed,720,520,50,100\nWheel alignment,120,8,40,30\nRoad hazard coverage,60,24,0,35\nTPMS sensor service,45,14,10,25\nDisposal and shop fees,20,6,0,100";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Item", "Price", "Parts cost", "Labor minutes", "Attach %", "Net per sale", "Gross per bay hour", "Net per month"]];
  for (const l of r.lines) out.push([l.name, f2(l.price), f2(l.cost), f2(l.minutes), f2(l.attach), f2(l.net), l.grossPerBayHour === null ? "" : f2(l.grossPerBayHour), f2(l.monthlyNet)]);
  out.push([]);
  out.push(["Store per month", "Revenue", "Contribution", "Overhead", "Net", "Net per ticket", "Bay utilization %"]);
  out.push(["", f2(r.store.revenue), f2(r.store.contribution), f2(r.store.overhead), f2(r.store.net), f2(r.ticket.net), f2(r.store.utilization * 100)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
