// New Zealand GST registration check: has taxable turnover passed the NZD 60,000 registration threshold, and by when must you register?
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. The rule modelled: register when GST turnover
// (this month plus the previous 11) is MORE than NZD 60,000, or is expected to be over the next 12 months; ride-share and
// taxi drivers register whatever their turnover. Registration is modelled as due within 21 days. Every result names its
// source to verify.

export const VERIFY = "Inland Revenue 'Registering for GST' and 'Do you need to register for GST'; Goods and Services Tax Act 1985 ss 51 and 52";
export const THRESHOLD = 60_000;
export const MONTHS = 12;
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const yn = (v) => v === true || v === "yes";
const money = (n) => "NZD " + Number(n).toLocaleString("en-NZ");
const pad = (n) => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addDays = (iso, days) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export function parse(input) {
  const i = input || {};
  const errors = [];
  const m = [];
  for (let k = 1; k <= MONTHS; k++) {
    const v = i["m" + k];
    const raw = v === undefined || v === "" || v === null ? 0 : Number(v);
    if (!Number.isFinite(raw) || raw < 0) { errors.push(`Enter an amount of zero or more for month ${k}.`); m.push(0); } else m.push(raw);
  }
  const year = Number(i.lastYear), month = Number(i.lastMonth);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push("Enter the year of your most recent month, such as 2026.");
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.push("Pick the month (1 to 12) of your most recent month.");
  let next = null;
  if (i.next11 !== undefined && i.next11 !== "" && i.next11 !== null) {
    next = Number(i.next11);
    if (!Number.isFinite(next) || next < 0) { errors.push("Enter an expected amount of zero or more for the next 11 months, or leave it blank."); next = null; }
  }
  return { errors, m, year, month, next, taxi: yn(i.taxi) };
}

// Label and month-end for entry k (0 = oldest) given the most recent month.
export function monthAt(year, month, k) {
  const idx = year * 12 + (month - 1) - (MONTHS - 1 - k);
  const y = Math.floor(idx / 12), n = (idx % 12) + 1;
  return { year: y, n, label: `${MONTH_NAMES[n - 1]} ${y}`, endIso: `${y}-${pad(n)}-${pad(lastDay(y, n))}` };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const threshold = THRESHOLD;
  const months = p.m.map((amount, k) => ({ ...monthAt(p.year, p.month, k), amount }));
  const current = p.m.reduce((a, b) => a + b, 0);
  const latest = months[MONTHS - 1];
  const projected = p.next === null ? null : p.m[MONTHS - 1] + p.next;
  const recent3 = p.m.slice(-3).reduce((a, b) => a + b, 0);
  const runRate = recent3 * 4;
  const findings = [];
  const obligations = [];
  let trigger = null;

  if (p.taxi) {
    trigger = { kind: "taxi", label: "Taxi or ride-share driver" };
    findings.push({ severity: "high", title: "Taxi and ride-share drivers must be GST-registered from the first fare, whatever their turnover. Register before you start." });
  } else if (current > threshold) {
    trigger = { kind: "current", label: latest.label, registerBy: addDays(latest.endIso, 21) };
    findings.push({ severity: "high", title: `Your GST turnover for the 12 months to ${latest.label} is ${money(current)}, over ${money(threshold)}. You must register; this tool models that as within 21 days of the day it went over. If that was in ${latest.label}, the last day is ${trigger.registerBy}; if it was earlier, the deadline has already passed and you should register now.` });
  } else if (projected !== null && projected > threshold) {
    trigger = { kind: "projected", label: latest.label, registerBy: addDays(latest.endIso, 21) };
    findings.push({ severity: "high", title: `Your projected GST turnover for the next 12 months (${money(latest.amount)} for ${latest.label} plus ${money(p.next)} expected) is ${money(projected)}, over ${money(threshold)}. Inland Revenue counts expected turnover too: register within 21 days of the day you could tell you would pass it, which on these figures is no later than ${trigger.registerBy}.` });
  }

  if (!trigger) {
    findings.unshift({ severity: "info", title: `GST turnover for the 12 months to ${latest.label} is ${money(current)}, ${money(threshold - current)} short of ${money(threshold)}.${projected !== null ? ` Projected turnover over the next 12 months is ${money(projected)}, also below.` : ""}` });
    if (current >= threshold * 0.9) findings.push({ severity: "medium", title: "Within 10% of the threshold on a trailing basis. Re-test every month and track every sale from here." });
    if (runRate >= threshold) findings.push({ severity: "medium", title: `Your last three months annualise to ${money(runRate)}, above the threshold. If that pace holds, the projected test will be met; enter an expected figure for the next 11 months to check.` });
    obligations.push(
      { ref: "Voluntary", title: "Registering early is allowed", why: "You can register for GST voluntarily, claim GST back on business costs and charge GST from then on. Voluntary registration means filing returns for as long as you stay registered." },
      { ref: "Watch", title: "Re-test every month", why: "The test is rolling: add each finished month, drop the oldest, and keep a record of how you worked out your turnover." },
    );
  } else {
    obligations.push(
      { ref: "Register", title: "Get an IRD number, then register for GST", why: "You need an IRD number first. Register in myIR or with the Inland Revenue GST registration form." },
      { ref: "Charge", title: "Charge 15% GST", why: "From your registration date you add GST at 15% (three-twenty-thirds of the GST-inclusive price) to taxable sales, and issue tax invoices when a buyer asks." },
      { ref: "Credits", title: "Claim back GST on costs", why: "Once registered you can claim the GST in the price of business purchases, if you hold a tax invoice." },
      { ref: "Report", title: "File GST returns", why: "You file on a monthly, two-monthly or six-monthly cycle depending on turnover; Inland Revenue confirms yours when you register." },
    );
  }
  findings.push({ severity: "info", title: "Taxable turnover leaves out the GST itself, exempt supplies such as residential rent and financial services, and the sale of private assets. Enter sales that are taxable (including zero-rated, such as exports) only." });
  return { errors: [], months, current, projected, runRate, threshold, trigger, findings, obligations };
}

export const SAMPLE = { lastYear: 2026, lastMonth: 9, m1: 4200, m2: 4800, m3: 5100, m4: 5400, m5: 5900, m6: 6300, m7: 6700, m8: 7000, m9: 7400, m10: 7800, m11: 8200, m12: 8600, next11: 110000, taxi: "no" };

export function summaryText(r) {
  const L = ["New Zealand GST registration check", ""];
  for (const x of r.months) L.push(`${x.label}: ${money(x.amount)}`);
  L.push("", `Taxable turnover, last 12 months: ${money(r.current)} (threshold ${money(r.threshold)})`);
  if (r.projected !== null) L.push(`Projected, next 12 months: ${money(r.projected)}`);
  L.push("");
  if (r.trigger) {
    L.push(`Registration required: ${r.trigger.kind === "taxi" ? "from the first fare (taxi or ride-share)" : `within 21 days of the day the threshold was met; latest ${r.trigger.registerBy} if met in ${r.trigger.label}`}`);
  } else L.push("Not required on these figures.");
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
