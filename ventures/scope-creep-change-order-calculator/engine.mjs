// Price scope creep. Given the fixed price and hours the project was quoted at,
// and a list of extra requests with hour estimates, return what to charge as a
// change order, what you lose if you absorb it instead, and the schedule slip.
// Pure, no I/O.

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : d);

export const DEFAULTS = { basePrice: 0, baseHours: 0, rate: 0, premiumPct: 0, bufferPct: 0, hoursPerDay: 6 };

// "Add SSO login | 6" per line. Hours may be "6", "6h" or "1.5d" (day = 8h).
export function parseRequests(text) {
  const items = [];
  const bad = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = /^(.*?)[|,;\t]\s*([\d.]+)\s*(h|hr|hrs|hours?|d|days?)?\s*$/i.exec(line.trim());
    const n = m && Number(m[2]);
    if (!m || !m[1].trim() || !Number.isFinite(n) || n < 0) return bad.push({ line: i + 1, text: line.slice(0, 80) });
    const hours = /^d/i.test(m[3] || "") ? n * 8 : n;
    items.push({ title: m[1].trim(), hours });
  });
  return { items, bad };
}

// Effective rate = explicit rate, else quoted price / quoted hours. A change
// order priced at the *effective* rate is what the original quote implied;
// `premiumPct` is the surcharge for rush work or re-planning an agreed build.
export function effectiveRate(o) {
  const rate = num(o.rate);
  if (rate > 0) return rate;
  const hrs = num(o.baseHours);
  return hrs > 0 ? num(o.basePrice) / hrs : 0;
}

export function calculate(items, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const rate = effectiveRate(o);
  const premium = Math.max(0, num(o.premiumPct)) / 100;
  const changeRate = round2(rate * (1 + premium));
  // Free allowance: the slack you are willing to eat before a change order starts.
  const buffer = round2(num(o.baseHours) * Math.max(0, num(o.bufferPct)) / 100);
  let freeLeft = buffer;
  const lines = items.map((it) => {
    const hours = Math.max(0, num(it.hours));
    const free = Math.min(freeLeft, hours);
    freeLeft = round2(freeLeft - free);
    const billable = round2(hours - free);
    return { title: it.title, hours, freeHours: round2(free), billableHours: billable, amount: round2(billable * changeRate) };
  });
  const extraHours = round2(lines.reduce((n, l) => n + l.hours, 0));
  const billableHours = round2(lines.reduce((n, l) => n + l.billableHours, 0));
  const amount = round2(lines.reduce((n, l) => n + l.amount, 0));
  const baseHours = num(o.baseHours);
  const basePrice = num(o.basePrice);
  const hpd = Math.max(0.5, num(o.hoursPerDay, 6));
  const absorbedRate = baseHours + extraHours > 0 ? round2(basePrice / (baseHours + extraHours)) : 0;
  return {
    opts: o, rate: round2(rate), changeRate, buffer, lines, extraHours, billableHours, amount,
    newPrice: round2(basePrice + amount), newHours: round2(baseHours + extraHours),
    // What the creep costs if nobody sends a change order.
    absorbedCost: round2(extraHours * rate),
    absorbedRate, rateDropPct: rate > 0 ? round2((1 - absorbedRate / rate) * 100) : 0,
    creepPct: baseHours > 0 ? round2((extraHours / baseHours) * 100) : null,
    daysAdded: round2(extraHours / hpd),
  };
}

const money = (n, cur) => `${cur}${n.toFixed(2)}`;

export function toMarkdown(r, { client = "", project = "", currency = "$" } = {}) {
  const L = [`# Change order${project ? ` — ${project}` : ""}`, ""];
  if (client) L.push(`Prepared for: ${client}`, "");
  L.push("The items below are outside the agreed scope. Work on them starts once this change order is approved.", "");
  L.push("| Request | Est. hours | Included | Billable | Amount |", "|---|---:|---:|---:|---:|");
  for (const l of r.lines) L.push(`| ${l.title.replace(/\|/g, "/")} | ${l.hours} | ${l.freeHours} | ${l.billableHours} | ${money(l.amount, currency)} |`);
  L.push("", `**Change order total: ${money(r.amount, currency)}** at ${money(r.changeRate, currency)}/h`);
  L.push(`Original price ${money(r.opts.basePrice, currency)} → revised price ${money(r.newPrice, currency)}`);
  if (r.daysAdded > 0) L.push(`Estimated schedule impact: +${r.daysAdded} working day(s)`);
  L.push("", "Hours are estimates. Reply to approve, or to remove items from this list.");
  return L.join("\n") + "\n";
}

export function toCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["request,hours,included_hours,billable_hours,amount", ...r.lines.map((l) => [q(l.title), l.hours, l.freeHours, l.billableHours, l.amount].join(","))].join("\n") + "\n";
}

// CI/cron-style gate: fail when creep passes a threshold.
export function gate(r, { maxCreepPct, maxAbsorbed } = {}) {
  const problems = [];
  if (maxCreepPct != null && r.creepPct != null && r.creepPct > maxCreepPct) problems.push(`scope creep ${r.creepPct}% exceeds ${maxCreepPct}%`);
  if (maxAbsorbed != null && r.absorbedCost > maxAbsorbed) problems.push(`absorbing it would cost ${r.absorbedCost.toFixed(2)}, over ${maxAbsorbed}`);
  return problems;
}
