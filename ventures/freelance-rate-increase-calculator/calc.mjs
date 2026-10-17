// What a freelance rate increase is worth once some clients leave. Per client: hours, current rate and
// the chance they walk if the rate rises. Pure functions, no DOM. Arithmetic on figures the user types;
// no market rate, contract term, tax treatment or client behaviour is asserted anywhere in here.

export const DEFAULTS = Object.freeze({
  raisePct: 0,
  refillPct: 0,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const cells = (line) => (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));

// Lines: "client, hours per month, current rate $/hour, chance they leave if raised %". The chance may
// be blank (counts as 0). Header optional.
export function parseClients(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = cells(line);
    const hours = num(c[1], NaN), rate = num(c[2], NaN), leave = num(c[3], 0);
    if (c.length < 3 || !Number.isFinite(hours) || !Number.isFinite(rate)) { if (rows.length || !/client|hours|name|rate/i.test(line)) skipped++; continue; }
    if (!(hours > 0) || !(rate > 0) || !(leave >= 0 && leave <= 100)) { skipped++; continue; }
    rows.push({ label: c[0] || "Client", hours, rate, leavePct: leave });
  }
  const warnings = skipped ? [`${skipped} client line(s) skipped (need a name, hours above 0, a rate above 0 and a leave chance from 0 to 100).`] : [];
  if (!rows.length) return { error: "Add at least one client: name, hours per month, current rate per hour, chance they leave if you raise it (%). Use one line called All clients for an overall figure." };
  return { rows, warnings };
}

const clean = (s) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (s && s[k] !== undefined) o[k] = num(s[k], DEFAULTS[k]);
  return o;
};

// Share of hours a raise of r (a fraction) can lose before income falls, if a share f of the lost
// hours is refilled at the new rate: (1 - p(1 - f))(1 + r) = 1.
export function breakEvenLoss(raisePct, refillPct = 0) {
  const r = raisePct / 100, f = refillPct / 100;
  if (!(r > 0)) return 0;
  const p = r / ((1 + r) * (1 - f));
  return Math.min(p, 1);
}

const LADDER = [5, 10, 15, 20, 25, 30, 40, 50];

export function analyze(settingsIn, clients) {
  const o = clean(settingsIn);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (!(o.raisePct > 0)) return { error: "Enter the raise you are considering, as a percent above 0." };
  if (o.refillPct > 100) return { error: "Refill share must be between 0 and 100." };
  if (o.refillPct >= 100) return { error: "A refill share of 100% means no loss is ever permanent; use 99 or less." };
  const warnings = [];
  const r = o.raisePct / 100, f = o.refillPct / 100;

  const lines = clients.map((c) => {
    const p = c.leavePct / 100;
    const newRate = c.rate * (1 + r);
    const before = c.hours * c.rate;
    const hoursAfter = c.hours * (1 - p * (1 - f));
    const after = hoursAfter * newRate;
    const be = breakEvenLoss(o.raisePct, o.refillPct);
    return { ...c, newRate, before, after, delta: after - before, hoursAfter, hoursFreed: c.hours - hoursAfter, breakEvenLeavePct: be * 100, safe: p <= be + 1e-12, hourlyAfter: after / hoursAfter };
  });

  const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
  const hoursBefore = sum("hours"), hoursAfter = sum("hoursAfter");
  const before = sum("before"), after = sum("after");
  const totals = {
    hoursBefore, hoursAfter, hoursFreed: hoursBefore - hoursAfter,
    before, after, delta: after - before, annualDelta: (after - before) * 12,
    hourlyBefore: before / hoursBefore, hourlyAfter: after / hoursAfter,
    expectedLossPct: (1 - hoursAfter / hoursBefore) * 100,
  };
  const be = breakEvenLoss(o.raisePct, o.refillPct) * 100;

  // The same book at other raises, with each client's leave chance held where you typed it.
  const ladder = LADDER.map((pc) => {
    const rr = pc / 100;
    const rev = lines.reduce((a, l) => a + l.hoursAfter * l.rate * (1 + rr), 0);
    return { raisePct: pc, breakEvenLeavePct: breakEvenLoss(pc, o.refillPct) * 100, monthly: rev, delta: rev - before, hoursFreed: totals.hoursFreed };
  });

  const risky = lines.filter((l) => !l.safe);
  if (risky.length) warnings.push(`${risky.map((l) => l.label).join(", ")} ${risky.length === 1 ? "is" : "are"} above the ${be.toFixed(1)}% leave chance where a ${o.raisePct}% raise stops paying; raising only the others, or phasing the raise for them, is worth testing.`);
  if (lines.some((l) => l.leavePct === 0) && lines.length > 1) warnings.push("A leave chance of 0 means you are certain the client stays. Be honest about your least loyal clients or the result is too rosy.");

  let verdict;
  if (totals.delta > 1e-9) verdict = `On your numbers a ${o.raisePct}% raise nets about ${Math.round(totals.delta).toLocaleString("en-US")} more per month while freeing about ${totals.hoursFreed.toFixed(1)} hours.`;
  else if (totals.delta < -1e-9) verdict = `On your numbers a ${o.raisePct}% raise loses about ${Math.round(-totals.delta).toLocaleString("en-US")} per month, although it frees about ${totals.hoursFreed.toFixed(1)} hours you could fill.`;
  else verdict = `On your numbers a ${o.raisePct}% raise is income-neutral and frees about ${totals.hoursFreed.toFixed(1)} hours.`;

  return { settings: o, lines, totals, breakEvenLeavePct: be, ladder, verdict, warnings };
}

export function sampleJob() {
  return {
    clients: "client,hours per month,current rate,chance they leave if raised %\nAgency A (steady),60,70,5\nStartup B,30,70,15\nOld retainer C,40,45,10\nOne-off referrals,20,80,35",
    settings: { raisePct: 15, refillPct: 25 },
  };
}

const f2 = (v) => (v === null || !Number.isFinite(v) ? "" : v.toFixed(2));
export function reportCsv(r) {
  const out = [["Client", "Hours per month", "Current rate", "New rate", "Leave chance %", "Leave chance where raise breaks even %", "Revenue before", "Expected revenue after", "Change", "Hours after"]];
  for (const l of r.lines) out.push([l.label, l.hours, f2(l.rate), f2(l.newRate), l.leavePct, f2(l.breakEvenLeavePct), f2(l.before), f2(l.after), f2(l.delta), f2(l.hoursAfter)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => v.toFixed(d) + "%";
