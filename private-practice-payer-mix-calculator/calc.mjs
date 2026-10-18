/**
 * What each insurance panel (and cash pay) actually nets a private practice per
 * clinical hour, and what dropping a panel is worth if the freed slots refill.
 *
 * A therapist or counselor in private practice signs contracts with several
 * payers. Each one has a contracted allowed amount per session, but what lands
 * in the bank is that amount times the share of claims actually paid (denials
 * and write-offs take the rest), minus the time spent billing, minus any
 * billing-service percentage, and it lands a different number of days later.
 * The practice's own cash fee has none of those leaks. Almost nobody compares
 * the two per hour of their own time, so a panel at "$95 a session" is kept for
 * years while it nets less than a sliding-scale cash client.
 *
 * ## Three design decisions are load-bearing
 *
 * **Everything is per clinical hour of the therapist's time, not per claim.**
 * The scarce resource is the weekly slot. Net per session is divided by the
 * minutes of work a session really takes (the session plus notes), so a panel
 * with slow, paper-heavy claims is charged for the admin time it causes at the
 * therapist's own stated hourly value of that time.
 *
 * **Dropping a panel is judged by the refill rate it needs, not by a forecast.**
 * Whether freed slots fill with cash clients cannot be known from the figures a
 * practice has. So the tool reports the break-even refill share,
 * `netPerSession(panel) / netPerSession(cash)`, the fraction of the freed slots
 * that cash clients must take for the drop to be neutral, and prints the annual
 * result at 25, 50, 75 and 100 percent refill so the reader supplies the one
 * number only they can estimate. An empty slot is worth zero, which is what
 * makes a low-paying panel often worth keeping and a very low one not.
 *
 * **The rate a panel would have to pay is solved, not guessed.** Given a target
 * net per hour (the practice's cash net unless the user sets one), the contract
 * rate that would match it is `(target × hours + adminCost) / (collect × (1 −
 * billingFee))`, which is the number to take into a rate negotiation.
 *
 * Nothing here is tax, legal, billing or clinical advice, a reading of a payer
 * contract, or a recommendation to leave a network. It is arithmetic on period
 * totals the user typed. No client-level data is an input, by design: every row
 * is a payer, so nothing here is protected health information.
 */

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

export const DEFAULTS = Object.freeze({
  sessionMinutes: 60,
  notesMinutes: 15,
  adminHourly: 40,
  billingFeePct: 0,
  weeksPerYear: 46,
});

const CASH_NAME = /^(cash|private[ -]?pay|self[ -]?pay|out[ -]of[ -]pocket|sliding)/i;
export const isCashPayer = (name) => CASH_NAME.test(String(name).trim());

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

function splitLine(line, sep) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function num(s) {
  if (s === undefined || s === null) return NaN;
  const t = String(s).replace(/[$,\s]/g, "").replace(/%$/, "");
  if (t === "") return NaN;
  return Number(t);
}

/**
 * One row per payer: payer, allowed per session, sessions per month, share of
 * claims paid, days to payment, billing/admin minutes per session.
 * The last three may be left blank (defaults: 100%, 30 days, 0 minutes).
 */
export function parseRows(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste one row per payer: payer, allowed amount per session, sessions per month, share of claims paid, days to payment, admin minutes per session." };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  let start = 0;
  if (/payer|allowed|insurance|plan|session/i.test(lines[0]) && !/\d/.test(splitLine(lines[0], sep)[1] || "")) start = 1;
  const rows = [], warnings = [];
  let skipped = 0;
  for (const line of lines.slice(start)) {
    const c = splitLine(line, sep);
    const allowed = num(c[1]), sessions = num(c[2]);
    if (!c[0] || !(allowed > 0) || !(sessions >= 0)) { skipped++; continue; }
    let collect = c[3] === undefined || c[3] === "" ? 1 : num(c[3]);
    if (!Number.isFinite(collect)) { skipped++; continue; }
    if (collect > 1) collect /= 100;
    if (collect <= 0 || collect > 1) { skipped++; continue; }
    const days = c[4] === undefined || c[4] === "" ? 30 : num(c[4]);
    const admin = c[5] === undefined || c[5] === "" ? 0 : num(c[5]);
    if (!(days >= 0) || !(admin >= 0)) { skipped++; continue; }
    rows.push({ payer: c[0], allowed, sessions, collect, days, admin });
  }
  if (skipped) warnings.push(`${skipped} row(s) skipped: a payer name, an allowed amount above zero, a session count, and a paid share between 0 and 100% are required.`);
  if (rows.length < 2) return { error: "Need at least two payers with sessions, for example one insurance panel and your cash fee.", warnings };
  if (rows.every((r) => r.sessions === 0)) return { error: "Every payer has zero sessions per month, so there is nothing to compare.", warnings };
  const seen = new Set();
  for (const r of rows) {
    const k = r.payer.toLowerCase();
    if (seen.has(k)) warnings.push(`"${r.payer}" appears more than once; each row is treated as its own line.`);
    seen.add(k);
  }
  return { rows, warnings };
}

export function netPerSession(row, o) {
  const cash = isCashPayer(row.payer);
  const fee = cash ? 0 : o.billingFeePct / 100;
  const collected = row.allowed * row.collect * (1 - fee);
  const adminCost = (row.admin / 60) * o.adminHourly;
  return collected - adminCost;
}

export function analyze(rows, opts = {}) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts[k] !== undefined && opts[k] !== "" && Number.isFinite(Number(opts[k]))) o[k] = Number(opts[k]);
  if (!(o.sessionMinutes > 0) || o.notesMinutes < 0 || o.adminHourly < 0 || o.billingFeePct < 0 || o.billingFeePct >= 100) {
    return { error: "Check the settings: session minutes above zero, notes minutes and admin value not negative, billing fee under 100%." };
  }
  const hours = (o.sessionMinutes + o.notesMinutes) / 60;
  const warnings = [];
  const out = rows.map((r) => {
    const cash = isCashPayer(r.payer);
    const net = netPerSession(r, o);
    const monthlyGross = r.allowed * r.sessions;
    return {
      payer: r.payer, cash, allowed: r.allowed, sessions: r.sessions, collect: r.collect, days: r.days, admin: r.admin,
      netPerSession: round2(net),
      netPerHour: round2(net / hours),
      leak: round4(r.allowed > 0 ? 1 - net / r.allowed : 0),
      monthlyNet: round2(net * r.sessions),
      receivables: round2(r.allowed * r.collect * r.sessions * (r.days / 30)),
    };
  });
  const totalSessions = out.reduce((s, r) => s + r.sessions, 0);
  const totalNet = out.reduce((s, r) => s + r.monthlyNet, 0);
  for (const r of out) {
    r.shareOfSessions = round4(totalSessions ? r.sessions / totalSessions : 0);
    r.shareOfNet = round4(totalNet ? r.monthlyNet / totalNet : 0);
  }
  out.sort((a, b) => b.netPerHour - a.netPerHour);
  const cashRows = out.filter((r) => r.cash && r.sessions > 0);
  const cashRef = cashRows.length ? cashRows.reduce((a, b) => (b.netPerSession > a.netPerSession ? b : a)) : null;
  const target = opts.targetHourly !== undefined && opts.targetHourly !== "" && Number.isFinite(Number(opts.targetHourly))
    ? Number(opts.targetHourly) : (cashRef ? cashRef.netPerHour : null);
  if (target === null) warnings.push("No cash or private-pay row was found (name it \"cash\" or \"private pay\"), so there is no refill comparison. Add your cash fee as a row, or enter a target net per hour.");

  const scenarios = [];
  for (const r of out) {
    if (r.cash) continue;
    const sc = { payer: r.payer, breakEvenRefill: null, annual: {}, targetAllowed: null, annualNet: round2(r.monthlyNet * 12) };
    if (cashRef && cashRef.netPerSession > 0) {
      sc.breakEvenRefill = round4(Math.max(0, r.netPerSession) / cashRef.netPerSession);
      for (const refill of [0.25, 0.5, 0.75, 1]) {
        sc.annual[refill] = round2(12 * r.sessions * (refill * cashRef.netPerSession - r.netPerSession));
      }
    }
    if (target !== null) {
      const row = rows.find((x) => x.payer === r.payer);
      const need = (target * hours + (row.admin / 60) * o.adminHourly) / (row.collect * (1 - o.billingFeePct / 100));
      sc.targetAllowed = round2(need);
      sc.rateGap = round2(need - r.allowed);
    }
    sc.verdict = sc.breakEvenRefill === null ? "unknown"
      : r.netPerSession <= 0 ? "loses money"
      : sc.breakEvenRefill < 0.5 ? "refill needs under half"
      : sc.breakEvenRefill <= 0.9 ? "keep unless slots fill fast" : "close to cash";
    scenarios.push(sc);
  }
  const lateRows = out.filter((r) => r.days >= 45 && !r.cash);
  if (lateRows.length) warnings.push(`${lateRows.map((r) => r.payer).join(", ")} are slow to pay (45 days or more): the money is real, but it will not be there for this month's costs.`);
  return {
    settings: o, hours: round4(hours), rows: out, scenarios, cashRef: cashRef ? cashRef.payer : null, target,
    totals: {
      sessions: totalSessions, monthlyNet: round2(totalNet), annualNet: round2(totalNet * 12),
      blendedNetPerHour: round2(totalSessions ? totalNet / (totalSessions * hours) : 0),
      receivables: round2(out.reduce((s, r) => s + r.receivables, 0)),
    },
    best: out[0].payer, worst: out[out.length - 1].payer, warnings,
  };
}

export function reportCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["payer,allowed,paid_share,net_per_session,net_per_hour,monthly_net,break_even_refill,rate_needed"];
  for (const row of r.rows) {
    const sc = r.scenarios.find((s) => s.payer === row.payer);
    lines.push([q(row.payer), row.allowed, row.collect, row.netPerSession, row.netPerHour, row.monthlyNet,
      sc && sc.breakEvenRefill !== null ? sc.breakEvenRefill : "", sc && sc.targetAllowed !== null ? sc.targetAllowed : ""].join(","));
  }
  return lines.join("\n") + "\n";
}

export function sampleText() {
  return [
    "payer,allowed per session,sessions per month,share of claims paid,days to payment,admin minutes per session",
    "Blue Cross PPO,118,38,96%,21,4",
    "Aetna,92,26,91%,34,6",
    "Medicaid plan,68,22,84%,52,9",
    "Employee assistance program,75,12,98%,40,5",
    "Cash / private pay,160,34,100%,0,0",
    "Sliding scale,95,8,100%,0,0",
  ].join("\n");
}
