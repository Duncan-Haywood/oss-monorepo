// Australia GST registration check: has GST turnover reached the registration threshold, and by when must you register?
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. The rule modelled: register when GST turnover
// (this month plus the previous 11) is at or above AUD 75,000 (AUD 150,000 for non-profit bodies), or is projected to be
// over the next 12 months; taxi, limousine and ride-share drivers register whatever their turnover. Registration is due
// within 21 days. Every result names its source to verify.

export const VERIFY = "ATO 'Registering for GST' and 'GST turnover'; A New Tax System (Goods and Services Tax) Act 1999 ss 23-5, 23-15, 25-1 and 51-5";
export const THRESHOLD = 75_000;
export const NONPROFIT_THRESHOLD = 150_000;
export const MONTHS = 12;
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const yn = (v) => v === true || v === "yes";
const money = (n) => "AUD " + Number(n).toLocaleString("en-AU");
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
  return { errors, m, year, month, next, taxi: yn(i.taxi), nonprofit: yn(i.nonprofit) };
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
  const threshold = p.nonprofit ? NONPROFIT_THRESHOLD : THRESHOLD;
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
    trigger = { kind: "taxi", label: "Taxi, limousine or ride-share driver" };
    findings.push({ severity: "high", title: "Taxi, limousine and ride-share drivers must register for GST from the first fare, whatever their turnover. Register before you start, and within 21 days at the latest." });
  } else if (current >= threshold) {
    trigger = { kind: "current", label: latest.label, registerBy: addDays(latest.endIso, 21) };
    findings.push({ severity: "high", title: `Your GST turnover for the 12 months to ${latest.label} is ${money(current)}, at or above ${money(threshold)}. You must register within 21 days of the day it reached that figure. If that was in ${latest.label}, the last day is ${trigger.registerBy}; if it was earlier, the deadline has already passed and you should register now.` });
  } else if (projected !== null && projected >= threshold) {
    trigger = { kind: "projected", label: latest.label, registerBy: addDays(latest.endIso, 21) };
    findings.push({ severity: "high", title: `Your projected GST turnover for the next 12 months (${money(latest.amount)} for ${latest.label} plus ${money(p.next)} expected) is ${money(projected)}, at or above ${money(threshold)}. The ATO counts projected turnover too: register within 21 days of the day you could tell you would pass it, which on these figures is no later than ${trigger.registerBy}.` });
  }

  if (!trigger) {
    findings.unshift({ severity: "info", title: `GST turnover for the 12 months to ${latest.label} is ${money(current)}, ${money(threshold - current)} below ${money(threshold)}.${projected !== null ? ` Projected turnover over the next 12 months is ${money(projected)}, also below.` : ""}` });
    if (current >= threshold * 0.9) findings.push({ severity: "medium", title: "Within 10% of the threshold on a trailing basis. Re-test every month and track every sale from here." });
    if (runRate >= threshold) findings.push({ severity: "medium", title: `Your last three months annualise to ${money(runRate)}, above the threshold. If that pace holds, the projected test will be met; enter an expected figure for the next 11 months to check.` });
    obligations.push(
      { ref: "Voluntary", title: "Registering early is allowed", why: "You can register for GST voluntarily, claim credits on your business costs and charge GST from then on. You must stay registered for at least 12 months." },
      { ref: "Watch", title: "Re-test every month", why: "The test is rolling: add each finished month, drop the oldest, and keep a record of how you worked out your turnover." },
    );
  } else {
    obligations.push(
      { ref: "Register", title: "Get an ABN, then register for GST", why: "You need an Australian Business Number first. Register through the ATO Online Services for business or the Business Registration Service." },
      { ref: "Charge", title: "Charge 10% GST", why: "From your registration date you add one-eleventh of the price to taxable sales, and issue tax invoices when a buyer asks (required above AUD 82.50)." },
      { ref: "Credits", title: "Claim GST credits", why: "Once registered you can claim back the GST in the price of business purchases, if you hold a tax invoice." },
      { ref: "Report", title: "Lodge business activity statements", why: "Most new registrants report quarterly through a BAS; the ATO sets the default, and you can ask for monthly." },
    );
  }
  findings.push({ severity: "info", title: "GST turnover leaves out the GST itself, input-taxed sales such as residential rent, sales of capital assets and sales to associates not made for payment. Enter taxable and GST-free sales only." });
  if (p.nonprofit) findings.push({ severity: "info", title: "Non-profit bodies use the AUD 150,000 threshold, applied here." });
  return { errors: [], months, current, projected, runRate, threshold, trigger, findings, obligations };
}

export const SAMPLE = { lastYear: 2026, lastMonth: 9, m1: 4200, m2: 4800, m3: 5100, m4: 5400, m5: 5900, m6: 6300, m7: 6700, m8: 7000, m9: 7400, m10: 7800, m11: 8200, m12: 8600, next11: 110000, taxi: "no", nonprofit: "no" };

export function summaryText(r) {
  const L = ["Australia GST registration check", ""];
  for (const x of r.months) L.push(`${x.label}: ${money(x.amount)}`);
  L.push("", `GST turnover, last 12 months: ${money(r.current)} (threshold ${money(r.threshold)})`);
  if (r.projected !== null) L.push(`Projected, next 12 months: ${money(r.projected)}`);
  L.push("");
  if (r.trigger) {
    L.push(`Registration required: ${r.trigger.kind === "taxi" ? "from the first fare (taxi, limousine or ride-share)" : `within 21 days of the day the threshold was met; latest ${r.trigger.registerBy} if met in ${r.trigger.label}`}`);
  } else L.push("Not required on these figures.");
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
