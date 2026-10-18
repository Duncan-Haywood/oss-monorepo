// PTO accrual liability: what an employer owes (or would owe) for employees' unused paid time off.
// Per employee: balance hours x hourly rate, plus the employer payroll tax on a payout; projects each balance forward
// by the pay-period accrual up to its cap, and prices the hours above a target balance.
// Payout rules are a short, conservative list of states where unused vacation/PTO is wages that must be paid at separation.
// Every other state is "your written policy decides". The user can override the rule. This is arithmetic, not legal advice.

export const MAX_ROWS = 500;

// Verified-as-conservative: statute or controlling case treats accrued, unused vacation/PTO as earned wages payable at separation.
export const PAYOUT_REQUIRED = {
  CA: { law: "California Labor Code 227.3 (vested vacation is wages; use-it-or-lose-it forfeiture is not allowed, a reasonable cap on accrual is)", forfeit: false },
  CO: { law: "Colorado Wage Act and Nieto v. Clifton Park (2020): earned vacation must be paid; forfeiture is not allowed", forfeit: false },
  IL: { law: "Illinois Wage Payment and Collection Act, 820 ILCS 115/5: earned vacation is final compensation", forfeit: false },
  MA: { law: "Massachusetts Wage Act, M.G.L. c.149 s.148: earned vacation is wages", forfeit: false },
};

export const SHARED_DEFAULTS = { asof: "", state: "CA", ppy: "26", horizon: "12", burden: "7.65", target: "80", policy: "state", roster: "" };
export const EXAMPLE_SHARED = {
  asof: "2026-10-09", state: "CA", ppy: "26", horizon: "12", burden: "7.65", target: "80", policy: "state",
  roster: [
    "Name, Hourly rate, Balance hours, Accrual hours per pay period, Cap hours",
    "Alex R., 32.50, 118, 3.08, 160",
    "Bao N., 24.00, 41.5, 2.31, 120",
    "Carmen D., 58.00, 205, 4.62, 240",
    "Dev P., 19.75, 12, 1.54, 80",
    "Eli S., 41.00, 160, 3.85, ",
    "Farah K., 27.25, 77, 3.08, 120",
  ].join("\n"),
};

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (n) => (Math.round(n * 100) / 100).toLocaleString("en-US");

const num = (t) => {
  const s = String(t ?? "").replace(/[$\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

// name, rate, balance, accrual per period, optional cap. A first line whose rate is not a number is a header.
export function parseRoster(text, warnings) {
  const rows = [];
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  let seen = 0;
  for (const [i, line] of lines.entries()) {
    const f = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.trim().replace(/^"|"$/g, ""));
    if (i === 0 && (f.length < 3 || Number.isNaN(num(f[1])) || num(f[1]) === null)) continue;
    if (++seen > MAX_ROWS) { warnings.push(`Only the first ${MAX_ROWS} employees were used.`); break; }
    const [name, rate, bal, acc, cap] = [f[0], num(f[1]), num(f[2]), num(f[3]), num(f[4])];
    const bad = (v, req) => (req ? v === null || Number.isNaN(v) || v < 0 : Number.isNaN(v) || (v !== null && v < 0));
    if (!name || bad(rate, true) || bad(bal, true)) { warnings.push(`Line ${i + 1} skipped: needs a name, a non-negative hourly rate and a balance (got "${line}").`); continue; }
    if (bad(acc, false) || bad(cap, false)) { warnings.push(`Line ${i + 1} skipped: accrual and cap must be non-negative numbers.`); continue; }
    rows.push({ name, rate, bal, acc: acc ?? 0, cap: cap ?? null });
  }
  return rows;
}

export function analyze(input) {
  const warnings = [];
  const state = String(input.state ?? "").trim().toUpperCase();
  const ppy = num(input.ppy), horizon = num(input.horizon), burden = num(input.burden), target = num(input.target);
  if (!/^[A-Z]{2}$/.test(state)) warnings.push("State must be a two-letter code such as CA or TX.");
  if (!(ppy > 0 && ppy <= 366)) warnings.push("Pay periods per year must be a positive number (52 weekly, 26 biweekly, 24 semi-monthly, 12 monthly).");
  if (!(horizon >= 0 && horizon <= 120)) warnings.push("Months to project must be between 0 and 120.");
  if (burden === null || Number.isNaN(burden) || burden < 0 || burden > 100) warnings.push("Employer payroll tax % must be between 0 and 100.");
  if (target !== null && (Number.isNaN(target) || target < 0)) warnings.push("Target balance must be a non-negative number of hours, or blank.");
  const policy = ["state", "always", "never"].includes(input.policy) ? input.policy : "state";
  const emps = parseRoster(input.roster, warnings);
  if (emps.length === 0) warnings.push("Paste at least one employee line: name, hourly rate, balance hours, accrual hours per pay period, optional cap hours.");
  if (warnings.length && (emps.length === 0 || !/^[A-Z]{2}$/.test(state) || !(ppy > 0) || !(horizon >= 0) || burden === null || Number.isNaN(burden))) return { ok: false, warnings };

  const rule = PAYOUT_REQUIRED[state] || null;
  const owed = policy === "always" || (policy === "state" && !!rule);
  const load = owed ? 1 + burden / 100 : 1;
  const periods = Math.round((horizon * ppy) / 12);
  const per = emps.map((e) => {
    const capped = e.cap != null && e.bal >= e.cap;
    const future = e.cap != null ? Math.max(e.bal, Math.min(e.cap, e.bal + e.acc * periods)) : e.bal + e.acc * periods;
    const toCap = e.cap != null && e.acc > 0 && e.bal < e.cap ? Math.ceil((e.cap - e.bal) / e.acc) : null;
    const excess = target != null ? Math.max(0, e.bal - target) : 0;
    return {
      ...e, capped, future, monthsToCap: toCap == null ? null : (toCap * 12) / ppy,
      now: e.bal * e.rate * load, projected: future * e.rate * load, excessHours: excess, excessValue: excess * e.rate * load,
      wages: e.bal * e.rate,
    };
  });
  const sum = (k) => per.reduce((a, r) => a + r[k], 0);
  const totals = { employees: per.length, hours: sum("bal"), wages: sum("wages"), now: sum("now"), projected: sum("projected"), excessValue: sum("excessValue"), excessHours: sum("excessHours"), atCap: per.filter((r) => r.capped).length };
  totals.growth = totals.projected - totals.now;
  if (!owed && rule === null && policy === "state") warnings.push(`${state} is not on this tool's short list of states that require payout of unused PTO, so the payout column assumes your written policy decides. If your policy says unused PTO is paid out (or you have been paying it), choose "Always owed". Policies that promise payout, and some states not listed here, create a liability even without a statute.`);
  if (per.some((r) => r.cap == null)) warnings.push("Some employees have no cap, so their balances grow without limit in the projection. A cap is the main lever on this liability.");
  return { ok: true, warnings, state, owed, rule, policy, load, periods, horizon, target, per: per.sort((a, b) => b.now - a.now), totals, burden };
}

export function toCsv(a) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const head = ["Employee", "Hourly rate", "Balance hours", "Liability now", "Projected hours", "Projected liability", "Cap hours", "Months to cap", "Hours over target", "Value over target"];
  const rows = a.per.map((r) => [r.name, r.rate, r.bal, r.now.toFixed(2), r.future.toFixed(2), r.projected.toFixed(2), r.cap ?? "", r.monthsToCap == null ? "" : r.monthsToCap.toFixed(1), r.excessHours.toFixed(2), r.excessValue.toFixed(2)]);
  rows.push(["TOTAL", "", a.totals.hours, a.totals.now.toFixed(2), "", a.totals.projected.toFixed(2), "", "", a.totals.excessHours.toFixed(2), a.totals.excessValue.toFixed(2)]);
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}

export { hrs };
