// Cash-flow risk forecaster. A 13-week cash forecast where invoices do not arrive on their due date:
// each one is paid on time, late by a random number of days, or never, and a seeded Monte Carlo run
// turns that into the odds of running short, how much cushion would cover it, and which single invoice
// or bill moves those odds most. Everything is arithmetic on the user's own lines; no network.

const DAY = 86400000;
export const MAX_TRIALS = 5000;

export const SAMPLE = {
  start: "2026-10-12",
  opening: "19000",
  weeks: "13",
  buffer: "5000",
  incoming: [
    "2026-10-16, Harbor Dental invoice, 4120",
    "2026-10-23, Brightline Co invoice, 9800",
    "2026-11-06, Northfield School invoice, 6400",
    "2026-11-20, Acme Builders invoice, 15200",
    "2026-12-04, Brightline Co invoice, 9800",
    "2026-12-18, Harbor Dental invoice, 4120",
    "2026-10-14, Patel Law retainer, 2500, monthly",
  ].join("\n"),
  outgoing: [
    "2026-10-16, Payroll, 4600, biweekly",
    "2026-11-01, Rent, 3400, monthly",
    "2026-10-20, Software and insurance, 1250, monthly",
    "2026-11-15, Quarterly estimated tax, 6100",
    "2026-12-15, Materials supplier, 8800",
  ].join("\n"),
  onTime: "35",
  lateDays: "18",
  noPay: "3",
  trials: "2000",
};

export function dollars(n) {
  const v = Math.round(Math.abs(n));
  return `${n < 0 ? "-" : ""}$${v.toLocaleString("en-US")}`;
}

function num(raw, label, errors, { min = -Infinity, max = Infinity, blank } = {}) {
  const s = String(raw ?? "").trim().replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (s === "") {
    if (blank !== undefined) return blank;
    errors.push(`${label} is required.`);
    return NaN;
  }
  const v = Number(s);
  if (!Number.isFinite(v)) { errors.push(`${label} must be a number.`); return NaN; }
  if (v < min || v > max) { errors.push(`${label} must be between ${min} and ${max}.`); return NaN; }
  return v;
}

export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
const iso = (t) => new Date(t).toISOString().slice(0, 10);

function addMonths(t, k, anchorDay) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + k;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(anchorDay, last));
}

const REPEATS = { "": 0, once: 0, weekly: 7, biweekly: 14, "every 2 weeks": 14, monthly: -1 };

// Lines: date, description, amount[, repeat]. Returns { lines, errors }.
export function parseLines(text, label) {
  const lines = [], errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const row = raw.trim();
    if (!row || row.startsWith("#")) return;
    const parts = row.split(",").map((p) => p.trim());
    const at = `${label} line ${i + 1}`;
    if (parts.length < 3) { errors.push(`${at}: expected "date, description, amount" (YYYY-MM-DD).`); return; }
    const date = parseDate(parts[0]);
    if (Number.isNaN(date)) { errors.push(`${at}: "${parts[0]}" is not a date in YYYY-MM-DD form.`); return; }
    // Amounts may contain thousands separators written as spaces or $; commas split columns, so none allowed.
    const amount = Number(parts[2].replace(/[$\s]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) { errors.push(`${at}: amount "${parts[2]}" must be a positive number (no commas).`); return; }
    const rep = (parts[3] ?? "").toLowerCase();
    if (!(rep in REPEATS)) { errors.push(`${at}: repeat "${parts[3]}" must be weekly, biweekly, monthly or blank.`); return; }
    lines.push({ id: lines.length, date, name: parts[1] || `line ${i + 1}`, amount, repeat: rep });
  });
  return { lines, errors };
}

// Expand lines into dated occurrences inside [start, start + days).
function occurrences(lines, start, days, overdueToStart) {
  const end = start + days * DAY, out = [];
  for (const ln of lines) {
    const step = REPEATS[ln.repeat];
    const anchor = new Date(ln.date).getUTCDate();
    let t = ln.date, k = 0;
    const next = () => (step === -1 ? addMonths(ln.date, ++k, anchor) : t + step * DAY);
    for (let guard = 0; guard < 400 && t < end; guard++) {
      if (t >= start) out.push({ line: ln.id, name: ln.name, amount: ln.amount, day: Math.round((t - start) / DAY) });
      else if (overdueToStart && step === 0) out.push({ line: ln.id, name: ln.name, amount: ln.amount, day: 0, overdue: true });
      if (step === 0) break;
      t = next();
    }
  }
  return out;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pct = (sorted, p) => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
};

// Run every trial. mod: { inOnTime:Set(line), outShift:{line:days} } for what-if levers.
function simulate(ctx, mod = {}, full = false) {
  const { ins, outs, draws, trials, days, weeks, opening, buffer, onTime, lateMean, noPay } = ctx;
  const minBal = new Float64Array(trials), firstShort = new Int32Array(trials).fill(-1);
  const weekEnd = full ? new Float64Array(weeks * trials) : null;
  const delta = new Float64Array(days);
  let shortTrials = 0;
  for (let tr = 0; tr < trials; tr++) {
    delta.fill(0);
    for (const o of outs) {
      const d = o.day + (mod.outShift?.[o.line] || 0);
      if (d < days) delta[d] -= o.amount;
    }
    for (let i = 0; i < ins.length; i++) {
      const o = ins[i], b = (tr * ins.length + i) * 3;
      let d = o.day;
      if (!mod.inOnTime?.has(o.line)) {
        if (draws[b + 2] < noPay) continue;
        if (draws[b] >= onTime) d += Math.max(1, Math.round(-Math.log(1 - draws[b + 1]) * lateMean));
      }
      if (d < days) delta[d] += o.amount;
    }
    let bal = opening, low = opening;
    for (let d = 0; d < days; d++) {
      bal += delta[d];
      if (bal < low) low = bal;
      if (firstShort[tr] < 0 && bal < buffer) firstShort[tr] = d;
      if (weekEnd && d % 7 === 6) weekEnd[(d / 7 | 0) * trials + tr] = bal;
    }
    minBal[tr] = low;
    if (firstShort[tr] >= 0) shortTrials++;
  }
  const gaps = Array.from(minBal, (m) => Math.max(0, buffer - m)).sort((a, b) => a - b);
  return { minBal, firstShort, weekEnd, pShort: shortTrials / trials, cushion90: pct(gaps, 0.9), cushion50: pct(gaps, 0.5) };
}

export function compute(raw) {
  const errors = [];
  const start = parseDate(raw.start);
  if (Number.isNaN(start)) errors.push("Start date must be YYYY-MM-DD.");
  const opening = num(raw.opening, "Cash in the bank today", errors, { min: -1e9, max: 1e10 });
  const weeks = num(raw.weeks, "Weeks to forecast", errors, { min: 4, max: 26, blank: 13 });
  const buffer = num(raw.buffer, "Cash you never want to drop below", errors, { min: 0, max: 1e10, blank: 0 });
  const onTimePct = num(raw.onTime, "Invoices paid on time, %", errors, { min: 0, max: 100, blank: 40 });
  const lateMean = num(raw.lateDays, "Typical days late for the rest", errors, { min: 1, max: 180, blank: 15 });
  const noPayPct = num(raw.noPay, "Invoices never paid, %", errors, { min: 0, max: 100, blank: 2 });
  const trials = num(raw.trials, "Trials", errors, { min: 200, max: MAX_TRIALS, blank: 2000 });
  const ins = parseLines(raw.incoming, "Money in");
  const outs = parseLines(raw.outgoing, "Money out");
  errors.push(...ins.errors, ...outs.errors);
  if (!ins.errors.length && !outs.errors.length && !ins.lines.length && !outs.lines.length) errors.push("Add at least one line of money coming in or going out.");
  if (errors.length) return { errors };

  const days = Math.round(weeks) * 7, wk = Math.round(weeks), tn = Math.round(trials);
  const inOcc = occurrences(ins.lines, start, days, true), outOcc = occurrences(outs.lines, start, days, false);
  const draws = new Float64Array(tn * inOcc.length * 3), next = rng(Number(raw.seed) || 20261012);
  for (let i = 0; i < draws.length; i++) draws[i] = next();
  const ctx = { ins: inOcc, outs: outOcc, draws, trials: tn, days, weeks: wk, opening, buffer, onTime: onTimePct / 100, lateMean, noPay: noPayPct / 100 };

  const base = simulate(ctx, {}, true);
  // Deterministic reference: everyone pays on the due date.
  let refBal = opening, refLowDay = 0, refLow = opening, refShortDay = -1;
  const refDelta = new Float64Array(days);
  for (const o of outOcc) refDelta[o.day] -= o.amount;
  for (const o of inOcc) refDelta[o.day] += o.amount;
  for (let d = 0; d < days; d++) {
    refBal += refDelta[d];
    if (refBal < refLow) { refLow = refBal; refLowDay = d; }
    if (refShortDay < 0 && refBal < buffer) refShortDay = d;
  }

  const rows = [];
  for (let w = 0; w < wk; w++) {
    const col = Array.from(base.weekEnd.subarray(w * tn, (w + 1) * tn)).sort((a, b) => a - b);
    let short = 0;
    for (let t = 0; t < tn; t++) if (base.firstShort[t] >= 0 && base.firstShort[t] < (w + 1) * 7) short++;
    rows.push({ week: w + 1, from: iso(start + w * 7 * DAY), p10: pct(col, 0.1), p50: pct(col, 0.5), p90: pct(col, 0.9), pShort: short / tn });
  }
  const firsts = Array.from(base.firstShort).filter((d) => d >= 0).sort((a, b) => a - b);
  const medianFirst = firsts.length ? iso(start + pct(firsts, 0.5) * DAY) : null;

  // Levers: rank each line by how much making it behave improves the odds.
  const totals = new Map();
  for (const o of inOcc) totals.set(`in:${o.line}`, (totals.get(`in:${o.line}`) || 0) + o.amount);
  for (const o of outOcc) totals.set(`out:${o.line}`, (totals.get(`out:${o.line}`) || 0) + o.amount);
  const cand = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const levers = [];
  if (base.pShort > 0) {
    for (const [key, total] of cand) {
      const [kind, id] = key.split(":"), line = Number(id);
      const mod = kind === "in" ? { inOnTime: new Set([line]) } : { outShift: { [line]: 14 } };
      const r = simulate(ctx, mod);
      const name = (kind === "in" ? ins : outs).lines[line].name;
      levers.push({
        kind, name, total,
        action: kind === "in" ? `Collect "${name}" on its due date, every time` : `Pay "${name}" 14 days later`,
        pShort: r.pShort, cushion90: r.cushion90,
        gain: base.pShort - r.pShort, cushionGain: base.cushion90 - r.cushion90,
      });
    }
    levers.sort((a, b) => b.cushionGain - a.cushionGain || b.gain - a.gain);
  }

  // Concentration of expected inflow in one source.
  const byName = new Map();
  let inTotal = 0;
  for (const o of inOcc) { byName.set(o.name, (byName.get(o.name) || 0) + o.amount); inTotal += o.amount; }
  const top = [...byName.entries()].sort((a, b) => b[1] - a[1])[0];

  const findings = [];
  const p = base.pShort;
  if (refShortDay >= 0) findings.push({ severity: "high", title: `Even if every invoice is paid on its due date, cash drops below ${dollars(buffer)} on ${iso(start + refShortDay * DAY)} and bottoms at ${dollars(refLow)}.` });
  findings.push({ severity: p >= 0.5 ? "high" : p >= 0.15 ? "medium" : "info", title: `${Math.round(p * 100)}% of ${tn.toLocaleString("en-US")} simulated outcomes dip below ${dollars(buffer)} within ${wk} weeks${medianFirst ? `, usually around ${medianFirst}` : ""}.` });
  if (base.cushion90 > 0) findings.push({ severity: base.cushion90 > opening * 0.5 ? "high" : "medium", title: `A cushion of about ${dollars(base.cushion90)} (cash or a credit line) would cover 9 in 10 outcomes; ${dollars(base.cushion50)} covers half.` });
  if (levers[0] && (levers[0].cushionGain > 0 || levers[0].gain > 0.005)) findings.push({ severity: "info", title: `Biggest single lever: ${levers[0].action}. It cuts the chance of a shortfall from ${Math.round(p * 100)}% to ${Math.round(levers[0].pShort * 100)}% and the 9-in-10 cushion from ${dollars(base.cushion90)} to ${dollars(levers[0].cushion90)}.` });
  if (top && inTotal > 0 && top[1] / inTotal > 0.4 && byName.size > 1) findings.push({ severity: "medium", title: `"${top[0]}" is ${Math.round((top[1] / inTotal) * 100)}% of the money you expect in; one slow payer moves the whole forecast.` });
  if (!inOcc.length) findings.push({ severity: "info", title: "No money-in lines fall inside the forecast window." });

  return {
    errors: [], start: iso(start), weeks: wk, trials: tn, opening, buffer,
    onTimePct, lateMean, noPayPct,
    pShort: p, cushion90: base.cushion90, cushion50: base.cushion50, medianFirst,
    reference: { low: refLow, lowDate: iso(start + refLowDay * DAY), shortDate: refShortDay >= 0 ? iso(start + refShortDay * DAY) : null },
    rows, levers, findings, inTotal, outTotal: outOcc.reduce((s, o) => s + o.amount, 0),
  };
}

export function summaryText(r) {
  const out = [
    `Cash-flow risk forecast: ${r.weeks} weeks from ${r.start}`,
    `Opening cash ${dollars(r.opening)}; floor ${dollars(r.buffer)}; money in ${dollars(r.inTotal)}, money out ${dollars(r.outTotal)} in the window`,
    `Assumed: ${r.onTimePct}% of invoices paid on time, the rest ${r.lateMean} days late on average, ${r.noPayPct}% never paid. ${r.trials} simulated outcomes.`,
    "",
    `Chance of dipping below the floor: ${Math.round(r.pShort * 100)}%`,
    `Cushion to cover 9 in 10 outcomes: ${dollars(r.cushion90)}`,
    r.reference.shortDate ? `If everything is paid on time: below the floor from ${r.reference.shortDate}` : `If everything is paid on time: never below the floor (low ${dollars(r.reference.low)} on ${r.reference.lowDate})`,
    "",
    "Week | from | 10th pct | median | 90th pct | chance short by now",
    ...r.rows.map((x) => `${x.week} | ${x.from} | ${dollars(x.p10)} | ${dollars(x.p50)} | ${dollars(x.p90)} | ${Math.round(x.pShort * 100)}%`),
  ];
  if (r.levers.length) out.push("", "What moves the odds:", ...r.levers.slice(0, 5).map((l) => `- ${l.action}: ${Math.round(r.pShort * 100)}% -> ${Math.round(l.pShort * 100)}%, 9-in-10 cushion ${dollars(r.cushion90)} -> ${dollars(l.cushion90)}`));
  return out.join("\n");
}

export function sweepCsv(r) {
  return ["week,from,p10_balance,median_balance,p90_balance,chance_short_by_week_end",
    ...r.rows.map((x) => [x.week, x.from, x.p10.toFixed(2), x.p50.toFixed(2), x.p90.toFixed(2), x.pShort.toFixed(4)].join(","))].join("\n") + "\n";
}
