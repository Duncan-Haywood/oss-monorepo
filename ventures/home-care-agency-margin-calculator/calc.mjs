/**
 * What each payer of a non-medical home care agency actually leaves per billed
 * hour, and what dropping a payer is worth if the freed hours refill with
 * private-pay clients.
 *
 * An agency bills one rate per hour of caregiver time and pays the caregiver a
 * wage, but the gap between them is not the margin. Employer payroll taxes and
 * workers' compensation ride on every wage dollar (and home care classes are
 * among the expensive ones), overtime lifts the effective wage, the caregiver's
 * drive between clients is paid and never billed, the office costs something
 * per hour served, and a share of billed hours is never collected. Rates also
 * differ a great deal by who pays: private pay, long-term-care insurance,
 * veterans' programs and state waiver programs all pay a different rate, a
 * different share and on a different clock.
 *
 * ## Three design decisions are load-bearing
 *
 * **Everything is per billed hour, with the unbilled drive folded back in.**
 * Unpaid-to-bill travel minutes per visit are spread over the billed hours of
 * that visit, so a payer served in short visits across town is charged for the
 * driving it causes and a payer served in long shifts is not.
 *
 * **Margin is shown against a target, and the bill rate that reaches the target
 * is solved, not guessed.** `rate = cost per billed hour / (paid share x (1 -
 * target margin))` is the number to take to a rate conversation or to a price
 * list. The tool also reports what each extra dollar of caregiver wage costs the
 * agency per month at that payer's hours, because wage pressure, not the bill
 * rate, is what moves most agencies' margin.
 *
 * **Dropping a payer is judged by the refill share it needs, not by a forecast.**
 * `margin per hour (payer) / margin per hour (best private-pay row)` is the
 * fraction of the freed hours that private clients must take for the drop to
 * be neutral. Caregivers are paid by the hour worked, so an unfilled hour earns
 * nothing and costs nothing; the annual result is printed at 25, 50, 75 and 100
 * percent refill so the reader supplies the one number only they know.
 *
 * Nothing here is legal, tax, insurance, licensing or Medicaid-billing advice, a
 * reading of a payer contract or a wage-and-hour opinion. It is arithmetic on
 * period totals the user typed. No client or caregiver identity is an input, by
 * design: every row is a payer, so nothing here is protected health information.
 */

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

export const DEFAULTS = Object.freeze({
  employerTaxPct: 10,
  workersCompPct: 7,
  overheadPerHour: 4,
  overtimeSharePct: 0,
  targetMarginPct: 25,
});

const PRIVATE_NAME = /^(private|self[ -]?pay|cash|direct|family|out[ -]of[ -]pocket)/i;
export const isPrivatePay = (name) => PRIVATE_NAME.test(String(name).trim());

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

const blank = (s) => s === undefined || s === "";

/**
 * One row per payer: payer, bill rate per hour, billed hours per month,
 * caregiver wage per hour, share paid, days to payment, hours per visit, unpaid
 * travel minutes per visit. The last four may be blank (100% paid, 30 days,
 * 4-hour visits, 0 minutes).
 */
export function parseRows(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste one row per payer: payer, bill rate per hour, billed hours per month, caregiver wage per hour, share paid, days to payment, hours per visit, unpaid travel minutes per visit." };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  let start = 0;
  if (/payer|rate|wage|hours|client/i.test(lines[0]) && !/\d/.test(splitLine(lines[0], sep)[1] || "")) start = 1;
  const rows = [], warnings = [];
  let skipped = 0;
  for (const line of lines.slice(start)) {
    const c = splitLine(line, sep);
    const rate = num(c[1]), hours = num(c[2]), wage = num(c[3]);
    if (!c[0] || !(rate > 0) || !(hours >= 0) || !(wage >= 0)) { skipped++; continue; }
    let collect = blank(c[4]) ? 1 : num(c[4]);
    if (!Number.isFinite(collect)) { skipped++; continue; }
    if (collect > 1) collect /= 100;
    if (collect <= 0 || collect > 1) { skipped++; continue; }
    const days = blank(c[5]) ? 30 : num(c[5]);
    const visitHours = blank(c[6]) ? 4 : num(c[6]);
    const travel = blank(c[7]) ? 0 : num(c[7]);
    if (!(days >= 0) || !(visitHours > 0) || !(travel >= 0)) { skipped++; continue; }
    rows.push({ payer: c[0], rate, hours, wage, collect, days, visitHours, travel });
  }
  if (skipped) warnings.push(`${skipped} row(s) skipped: a payer name, a bill rate above zero, billed hours, a caregiver wage, a paid share between 0 and 100%, and positive visit hours are required.`);
  if (rows.length < 2) return { error: "Need at least two payers, for example one program and your private-pay clients.", warnings };
  if (rows.every((r) => r.hours === 0)) return { error: "Every payer has zero billed hours, so there is nothing to compare.", warnings };
  const seen = new Set();
  for (const r of rows) {
    const k = r.payer.toLowerCase();
    if (seen.has(k)) warnings.push(`"${r.payer}" appears more than once; each row is treated as its own line.`);
    seen.add(k);
  }
  return { rows, warnings };
}

/** Agency cost of one billed hour for a row, at a given wage. */
export function costPerBilledHour(row, o, wage = row.wage) {
  const effWage = wage * (1 + 0.5 * o.overtimeSharePct / 100);
  const loaded = effWage * (1 + (o.employerTaxPct + o.workersCompPct) / 100);
  const travelLoad = (row.travel / 60) / row.visitHours;
  return loaded * (1 + travelLoad) + o.overheadPerHour;
}

export function analyze(rows, opts = {}) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts[k] !== undefined && opts[k] !== "" && Number.isFinite(Number(opts[k]))) o[k] = Number(opts[k]);
  if (o.employerTaxPct < 0 || o.workersCompPct < 0 || o.overheadPerHour < 0 || o.overtimeSharePct < 0 || o.overtimeSharePct > 100 || o.targetMarginPct < 0 || o.targetMarginPct >= 100) {
    return { error: "Check the settings: taxes, workers' comp and overhead not negative, overtime share 0 to 100%, target margin under 100%." };
  }
  const warnings = [];
  const out = rows.map((r) => {
    const cost = costPerBilledHour(r, o);
    const collected = r.rate * r.collect;
    const margin = collected - cost;
    const bump = costPerBilledHour(r, o, r.wage + 1) - cost;
    return {
      payer: r.payer, private: isPrivatePay(r.payer), rate: r.rate, hours: r.hours, wage: r.wage, collect: r.collect, days: r.days,
      costPerHour: round2(cost),
      collectedPerHour: round2(collected),
      marginPerHour: round2(margin),
      marginPct: round4(collected > 0 ? margin / collected : 0),
      monthlyMargin: round2(margin * r.hours),
      monthlyRevenue: round2(collected * r.hours),
      wageRaiseCost: round2(bump * r.hours),
      receivables: round2(collected * r.hours * (r.days / 30)),
    };
  });
  const totalHours = out.reduce((s, r) => s + r.hours, 0);
  const totalMargin = out.reduce((s, r) => s + r.monthlyMargin, 0);
  const totalRevenue = out.reduce((s, r) => s + r.monthlyRevenue, 0);
  for (const r of out) {
    r.shareOfHours = round4(totalHours ? r.hours / totalHours : 0);
    r.shareOfMargin = round4(totalMargin ? r.monthlyMargin / totalMargin : 0);
  }
  out.sort((a, b) => b.marginPerHour - a.marginPerHour);
  const priv = out.filter((r) => r.private && r.hours > 0);
  const ref = priv.length ? priv.reduce((a, b) => (b.marginPerHour > a.marginPerHour ? b : a)) : null;
  if (!ref) warnings.push("No private-pay row was found (name it \"private pay\" or \"self-pay\"), so there is no refill comparison. Add your private-pay clients as a row.");

  const t = o.targetMarginPct / 100;
  const scenarios = [];
  for (const r of out) {
    const row = rows.find((x) => x.payer === r.payer);
    const need = r.costPerHour / (row.collect * (1 - t));
    const sc = { payer: r.payer, private: r.private, breakEvenRefill: null, annual: {}, targetRate: round2(need), rateGap: round2(need - r.rate), annualMargin: round2(r.monthlyMargin * 12) };
    if (!r.private && ref && ref.marginPerHour > 0) {
      sc.breakEvenRefill = round4(Math.max(0, r.marginPerHour) / ref.marginPerHour);
      for (const refill of [0.25, 0.5, 0.75, 1]) {
        sc.annual[refill] = round2(12 * r.hours * (refill * ref.marginPerHour - r.marginPerHour));
      }
    }
    sc.verdict = r.marginPerHour < 0 ? "loses money per hour"
      : r.marginPct < t ? (sc.breakEvenRefill === null ? "below target margin" : "below target, refill needs " + pct(sc.breakEvenRefill, 0))
      : "meets target margin";
    scenarios.push(sc);
  }
  const lateRows = out.filter((r) => r.days >= 45);
  if (lateRows.length) warnings.push(`${lateRows.map((r) => r.payer).join(", ")} pay in 45 days or more: payroll goes out weekly or biweekly, so slow payers need working capital before the margin shows up.`);
  const negative = out.filter((r) => r.marginPerHour < 0);
  if (negative.length) warnings.push(`${negative.map((r) => r.payer).join(", ")} bill less than the loaded cost of a caregiver hour at these settings.`);
  return {
    settings: o, rows: out, scenarios, privateRef: ref ? ref.payer : null,
    totals: {
      hours: round2(totalHours), monthlyMargin: round2(totalMargin), annualMargin: round2(totalMargin * 12),
      monthlyRevenue: round2(totalRevenue),
      blendedMarginPerHour: round2(totalHours ? totalMargin / totalHours : 0),
      blendedMarginPct: round4(totalRevenue ? totalMargin / totalRevenue : 0),
      receivables: round2(out.reduce((s, r) => s + r.receivables, 0)),
      wageRaiseCost: round2(out.reduce((s, r) => s + r.wageRaiseCost, 0)),
    },
    best: out[0].payer, worst: out[out.length - 1].payer, warnings,
  };
}

export function reportCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["payer,bill_rate,paid_share,cost_per_billed_hour,margin_per_hour,margin_pct,monthly_margin,rate_for_target_margin,break_even_refill"];
  for (const row of r.rows) {
    const sc = r.scenarios.find((s) => s.payer === row.payer);
    lines.push([q(row.payer), row.rate, row.collect, row.costPerHour, row.marginPerHour, row.marginPct, row.monthlyMargin, sc.targetRate,
      sc.breakEvenRefill !== null ? sc.breakEvenRefill : ""].join(","));
  }
  return lines.join("\n") + "\n";
}

export function sampleText() {
  return [
    "payer,bill rate per hour,billed hours per month,caregiver wage per hour,share paid,days to pay,hours per visit,unpaid travel minutes per visit",
    "Private pay,34,900,17.5,99%,10,4,15",
    "Long-term care insurance,30,420,17.5,95%,45,4,15",
    "Veterans program,29,300,17,97%,60,3,20",
    "State waiver program,26.5,1100,16.5,93%,50,3.5,20",
  ].join("\n");
}
