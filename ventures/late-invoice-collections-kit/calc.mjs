// Late Invoice Collections Kit: pure functions, no DOM, no network.
// Interest and fee arithmetic on numbers the user types, a dated escalation
// plan with letter text, a small-claims break-even, and an .ics export.

export const RATES_AS_OF = "2026-09-29";

// Legal (default) annual interest rates that apply when a contract names no
// rate, for the states where the rate is a single fixed statutory figure the
// author is confident of. States whose rate floats with a benchmark (TX, FL,
// NJ, OH, GA, ...) are deliberately absent: the user types their own rate.
// Judgment-interest rates can differ from this figure in some states. Every
// row is a reference to verify, never an instruction.
export const STATE_RATES = {
  AZ: { name: "Arizona", pct: 10, cite: "A.R.S. 44-1201" },
  CA: { name: "California", pct: 10, cite: "Cal. Civ. Code 3289" },
  CO: { name: "Colorado", pct: 8, cite: "C.R.S. 5-12-102" },
  IL: { name: "Illinois", pct: 9, cite: "815 ILCS 205/2 / 735 ILCS 5/2-1303" },
  MA: { name: "Massachusetts", pct: 12, cite: "M.G.L. c. 231 s. 6C" },
  NC: { name: "North Carolina", pct: 8, cite: "N.C.G.S. 24-1" },
  NY: { name: "New York", pct: 9, cite: "N.Y. CPLR 5004 (lower rate for consumer debt judgments)" },
  OR: { name: "Oregon", pct: 9, cite: "ORS 82.010" },
  PA: { name: "Pennsylvania", pct: 6, cite: "41 P.S. 202" },
  VA: { name: "Virginia", pct: 6, cite: "Va. Code 6.2-302" },
  WA: { name: "Washington", pct: 12, cite: "RCW 19.52.010" },
};

export const STEP_DEFAULTS = [
  { key: "reminder", title: "Friendly reminder", offset: 3 },
  { key: "notice", title: "Firm notice", offset: 14 },
  { key: "demand", title: "Final demand", offset: 30 },
  { key: "referral", title: "Small-claims or collections referral", offset: 45 },
];

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n) => r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- dates (UTC calendar days, no time zones) ----------
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t;
}
export function isoDate(t) {
  return new Date(t).toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  return isoDate(parseDate(iso) + n * 86400000);
}
export function daysBetween(fromIso, toIso) {
  return Math.round((parseDate(toIso) - parseDate(fromIso)) / 86400000);
}
export function prettyDate(iso) {
  return new Date(parseDate(iso)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

// ---------- accrual ----------
export function annualRatePct(inputs) {
  if (inputs.basis === "contract") return (Number(inputs.contractMonthlyPct) || 0) * 12;
  if (inputs.basis === "state") return Number(inputs.annualPct) || 0;
  return 0;
}

// Simple (non-compounding) interest. Days late are counted from the due date;
// the grace period delays the flat fee and interest start (interest then runs
// from the due date if grace has passed, the usual contract reading).
export function accrual(inputs, asOfIso) {
  const daysLate = Math.max(0, daysBetween(inputs.dueDate, asOfIso));
  const grace = Math.max(0, Math.floor(Number(inputs.graceDays) || 0));
  const pastGrace = daysLate > grace;
  const rate = annualRatePct(inputs);
  const interest = pastGrace ? r2((inputs.amount * (rate / 100) * daysLate) / 365) : 0;
  const flatFee = pastGrace ? r2(Number(inputs.flatFee) || 0) : 0;
  return { asOf: asOfIso, daysLate, interest, flatFee, total: r2(inputs.amount + interest + flatFee) };
}

export function validate(inputs) {
  const errs = [];
  if (!(Number(inputs.amount) > 0)) errs.push("Enter the invoice amount as a number above zero.");
  if (parseDate(inputs.dueDate) === null) errs.push("Enter the due date as a real date.");
  if (parseDate(inputs.today) === null) errs.push("Enter today's date as a real date.");
  if (parseDate(inputs.dueDate) !== null && parseDate(inputs.today) !== null && daysBetween(inputs.dueDate, inputs.today) < 0) {
    errs.push("The due date is after today, so nothing is overdue yet. The plan starts once it is.");
  }
  return errs;
}

export function warnings(inputs) {
  const w = [];
  const rate = annualRatePct(inputs);
  if (inputs.basis === "contract") {
    w.push("Contract late fees and interest are only collectable if they were in what the client agreed to before the work (a signed contract, quote or invoice terms). If they were not, choose the state rate or no interest.");
  }
  if (rate > 24) w.push(`${r2(rate)}% a year is high. Some states cap interest or late fees, especially for consumers; check your state's limit before you bill it.`);
  if (inputs.clientType === "consumer") {
    w.push("This client is an individual, not a business. Consumer rules are stricter in most states: late fees must be agreed in writing, and you should never threaten anything you do not intend and are not allowed to do. Third-party debt collectors are covered by the federal FDCPA; you collecting your own invoice generally is not, but state laws can be.");
  }
  if (inputs.basis === "state") {
    const s = STATE_RATES[inputs.state];
    if (!s && inputs.state !== "other") w.push("No rate is stored for this state; type the rate you verified.");
    if (inputs.state === "other" || !s) w.push("Your state's rate is user-supplied: look it up before you rely on it.");
  }
  return w;
}

// Dates the accrual table shows: each escalation step plus 60 and 90 days past due.
export function accrualTable(inputs, stepDates) {
  const dates = new Set([inputs.today]);
  for (const d of stepDates) dates.add(d);
  dates.add(addDays(inputs.dueDate, 60));
  dates.add(addDays(inputs.dueDate, 90));
  return [...dates].filter((d) => d >= inputs.today).sort().map((d) => accrual(inputs, d));
}

// ---------- worth suing ----------
export function worthSuing(o) {
  const num = (v, dflt) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : dflt);
  const claimRaw = num(o.claim, 0);
  const limit = num(o.limit, 10000);
  const fee = num(o.filingFee, 75);
  const service = num(o.serviceCost, 20);
  const hours = num(o.hours, 8);
  const hourly = num(o.hourlyValue, 50);
  const pWin = Math.min(1, Math.max(0, num(o.winPct, 70) / 100));
  const pCollect = Math.min(1, Math.max(0, num(o.collectPct, 60) / 100));
  const agencyPct = Math.min(100, Math.max(0, num(o.agencyFeePct, 30)));
  const agencyRecover = Math.min(1, Math.max(0, num(o.agencyRecoverPct, 30) / 100));
  const overLimit = claimRaw > limit;
  const claim = overLimit ? limit : claimRaw;
  const timeCost = r2(hours * hourly);
  const outOfPocket = r2(fee + service);
  const upfront = r2(outOfPocket + timeCost);
  const pGet = pWin * pCollect;
  // Filing and service costs are usually awarded back when you win, so they
  // come back only on the winning-and-collected branch.
  const expectedBack = r2((claim + outOfPocket) * pGet);
  const expectedNet = r2(expectedBack - upfront);
  const breakEvenClaim = pGet > 0 ? r2((upfront - outOfPocket * pGet) / pGet) : null;
  const agencyNet = r2(claimRaw * agencyRecover * (1 - agencyPct / 100));
  let verdict;
  if (claim <= 0) verdict = "none";
  else if (expectedNet > upfront) verdict = "worth";
  else if (expectedNet > 0) verdict = "marginal";
  else verdict = "not";
  return { claim, claimRaw, limit, overLimit, excess: overLimit ? r2(claimRaw - limit) : 0, outOfPocket, timeCost, upfront, pGet, expectedBack, expectedNet, breakEvenClaim, agencyNet, agencyPct, agencyRecover, verdict };
}

export function verdictText(w) {
  const usd = (n) => "$" + money(Math.abs(n));
  const sign = (n) => (n < 0 ? "-" : "") + usd(n);
  const lines = [];
  if (w.overLimit) lines.push(`Over the limit: the balance is above the ${usd(w.limit)} small-claims limit, so you would waive ${usd(w.excess)} or file in a higher court (usually needing a lawyer).`);
  const head = {
    worth: "Worth filing on these numbers: the expected net is at least as large as what you put in up front.",
    marginal: "Marginal: the expected net is positive but small next to the effort and the risk the client never pays.",
    not: "Not worth filing on these numbers: expected recovery does not cover fees, service and your time.",
    none: "Nothing to claim yet.",
  }[w.verdict];
  lines.push(head);
  lines.push(`Up front: ${usd(w.outOfPocket)} filing and service plus ${usd(w.timeCost)} of your time = ${usd(w.upfront)}. Chance of collecting a judgment: ${Math.round(w.pGet * 100)}%. Expected net: ${sign(w.expectedNet)}.`);
  if (w.breakEvenClaim !== null) lines.push(`Break-even claim: about ${usd(Math.max(0, w.breakEvenClaim))} at these odds; below that the fight costs more than it is expected to bring back.`);
  lines.push(`A collections agency instead: about ${usd(w.agencyNet)} to you at a ${Math.round(w.agencyRecover * 100)}% recovery rate and ${w.agencyPct}% fee (both assumptions you can change).`);
  return lines.join("\n");
}

// ---------- letters ----------
function fill(ctx) {
  const c = ctx;
  return {
    greet: c.clientName ? `Hi ${c.clientName},` : "Hello,",
    inv: c.invoiceNo ? `invoice ${c.invoiceNo}` : "my invoice",
    sign: c.yourName || "[Your name]",
  };
}

export function buildLetters(inputs, steps, payByDays = 10) {
  const consumer = inputs.clientType === "consumer";
  const f = fill(inputs);
  const pay = inputs.paymentInfo ? `\nHow to pay: ${inputs.paymentInfo}` : "";
  const amt = (n) => "$" + money(n);
  return steps.map((s, i) => {
    const a = accrual(inputs, s.date);
    const balance = a.total;
    const feeBits = [];
    if (a.interest > 0) feeBits.push(`${amt(a.interest)} interest`);
    if (a.flatFee > 0) feeBits.push(`a ${amt(a.flatFee)} late fee`);
    const extras = feeBits.length ? ` Late charges to date: ${feeBits.join(" and ")}, making ${amt(balance)} in total as of ${prettyDate(s.date)}.` : "";
    const due = prettyDate(inputs.dueDate);
    const payBy = prettyDate(addDays(s.date, payByDays));
    const base = `${f.inv} for ${amt(inputs.amount)}`;
    let subject, body;
    if (i === 0) {
      subject = `Reminder: ${f.inv} was due ${due}`;
      body = `${f.greet}\n\nA quick reminder that ${base} was due on ${due} and I have not yet seen payment, so it is now ${a.daysLate} days past due. It is easy to miss, so I am flagging it in case it slipped through.${extras}\n\nCould you let me know when I can expect it, or reply if there is a problem with the invoice?${pay}\n\nThank you,\n${f.sign}`;
    } else if (i === 1) {
      subject = `Overdue: ${f.inv}, ${a.daysLate} days past due`;
      body = `${f.greet}\n\n${base[0].toUpperCase() + base.slice(1)} is now ${a.daysLate} days past its ${due} due date. I have not had a payment or a reply to my earlier message.${extras}\n\nPlease pay the balance by ${payBy}, or tell me in writing the specific reason it is disputed and when you will pay any undisputed part.${pay}\n\nRegards,\n${f.sign}`;
    } else if (i === 2) {
      subject = `Final demand for payment: ${f.inv}`;
      body = `${f.greet}\n\nThis is a final demand for payment of ${base}, due ${due} and now ${a.daysLate} days overdue.${extras}\n\nIf full payment of ${amt(balance)} is not received by ${payBy}, I will ${consumer ? "consider the options open to me for recovering the debt, which may include a claim in small claims court or referral for collection" : "refer the account for recovery, which may include a claim in small claims court or referral to a collections agency"}, and I will ask for the filing costs and interest to the extent the law allows. I would much rather settle this directly.${pay}\n\nSincerely,\n${f.sign}`;
    } else {
      subject = `Account referred for recovery: ${f.inv}`;
      body = `${f.greet}\n\nI did not receive payment by ${prettyDate(addDays(steps[2].date, payByDays))} on ${base}, so I am moving forward with recovery. The balance as of ${prettyDate(s.date)} is ${amt(balance)}${a.interest > 0 ? ` (${amt(inputs.amount)} invoice plus late charges)` : ""}.\n\nIf you pay in full before a filing or referral is made I will stop; otherwise expect papers or a letter from the next party.${pay}\n\n${f.sign}`;
    }
    return { ...s, subject, body, balance, daysLate: a.daysLate };
  });
}

// ---------- plan ----------
export function buildPlan(inputs) {
  const errs = validate(inputs);
  const hard = errs.filter((e) => !e.startsWith("The due date is after"));
  if (hard.length) return { errors: errs };
  const offsets = (inputs.offsets && inputs.offsets.length === 4 ? inputs.offsets : STEP_DEFAULTS.map((s) => s.offset)).map((n) => Math.max(0, Math.floor(Number(n) || 0)));
  const steps = STEP_DEFAULTS.map((s, i) => {
    const target = addDays(inputs.dueDate, offsets[i]);
    const date = target < inputs.today ? inputs.today : target;
    return { key: s.key, title: s.title, offset: offsets[i], scheduled: target, date, missed: target < inputs.today };
  });
  const now = accrual(inputs, inputs.today);
  const stepDates = steps.map((s) => s.date);
  const table = accrualTable(inputs, stepDates);
  const letters = buildLetters(inputs, steps);
  const claim = accrual(inputs, steps[3].date).total;
  const suit = worthSuing({ ...inputs.suit, claim });
  return { errors: errs, steps: letters, now, table, warnings: warnings(inputs), suit, statute: statuteNote(inputs) };
}

export function statuteNote(inputs) {
  if (inputs.basis !== "state") return null;
  const s = STATE_RATES[inputs.state];
  if (!s) return { name: "your state", pct: annualRatePct(inputs), cite: "user-supplied", userSupplied: true };
  return { name: s.name, pct: s.pct, cite: s.cite, userSupplied: Number(inputs.annualPct) !== s.pct, asOf: RATES_AS_OF };
}

export function planText(inputs, plan) {
  const L = [];
  L.push(`Late invoice collection plan: ${money(inputs.amount)} due ${inputs.dueDate}`);
  L.push(`Prepared ${inputs.today}. Balance today: $${money(plan.now.total)} (${plan.now.daysLate} days late; $${money(plan.now.interest)} interest, $${money(plan.now.flatFee)} fee).`);
  if (plan.statute) L.push(`State rate reference: ${plan.statute.name} ${plan.statute.pct}% a year (${plan.statute.cite}), as of ${RATES_AS_OF}. Verify with your state statute.`);
  L.push("Not legal advice.", "");
  L.push("BALANCE ON FUTURE DATES");
  for (const r of plan.table) L.push(`  ${r.asOf}  day ${r.daysLate}: $${money(r.total)}`);
  L.push("");
  plan.steps.forEach((s, i) => {
    L.push(`STEP ${i + 1}: ${s.title.toUpperCase()}  (send ${s.date}, day ${s.offset}${s.missed ? ", already due: send now" : ""})`);
    L.push(`Subject: ${s.subject}`, "", s.body, "");
  });
  L.push("IS IT WORTH SUING");
  L.push(verdictText(plan.suit));
  return L.join("\n");
}

// ---------- .ics ----------
const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
}
export function icsText(inputs, plan, stampIso = new Date().toISOString().slice(0, 10)) {
  const stamp = stampIso.replace(/-/g, "") + "T000000Z";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//late-invoice-collections-kit//EN", "CALSCALE:GREGORIAN"];
  plan.steps.forEach((s, i) => {
    const d = s.date.replace(/-/g, "");
    const end = addDays(s.date, 1).replace(/-/g, "");
    const desc = `${s.title}. Balance then: $${money(s.balance)}. Suggested subject: ${s.subject}. Not legal advice.`;
    L.push("BEGIN:VEVENT", `UID:${inputs.dueDate}-${i + 1}-${Math.round(inputs.amount * 100)}@late-invoice-collections-kit`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${end}`, fold(`SUMMARY:${icsEsc(`Collections step ${i + 1}: ${s.title} ($${money(inputs.amount)} invoice)`)}`), fold(`DESCRIPTION:${icsEsc(desc)}`), "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER;VALUE=DURATION:PT9H", "DESCRIPTION:Collections step due today", "END:VALARM", "END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}

export function sampleInputs(todayIso) {
  return {
    amount: 2400, dueDate: addDays(todayIso, -12), today: todayIso, clientType: "business", state: "CA",
    basis: "contract", contractMonthlyPct: 1.5, annualPct: 10, flatFee: 25, graceDays: 0,
    clientName: "Sam", invoiceNo: "1042", yourName: "Alex Rivera", paymentInfo: "",
    offsets: [3, 14, 30, 45],
    suit: { limit: 10000, filingFee: 75, serviceCost: 20, hours: 8, hourlyValue: 50, winPct: 70, collectPct: 60, agencyFeePct: 30, agencyRecoverPct: 30 },
  };
}

// ---- Invoice Maker handoff ---------------------------------------------
// Invoice Maker (same origin) keeps { invoices: [...] } under this key. Only
// sent, unpaid, past-due invoices come back, most late first. The terms the
// client saw on the invoice (late fee, monthly rate) travel with it, because
// those are the only charges the client agreed to.
export const INVOICE_MAKER_KEY = "invoice-maker-data";

const cents = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9)) : 0;
};
const pctOf = (c, pct) => { const raw = (c * (Number(pct) || 0)) / 100; return Math.sign(raw) * Math.round(Math.abs(raw) + 1e-9); };

export function invoiceBalanceCents(inv) {
  const lines = (inv.lines || []).map((l) => {
    const q = Number(l.qty), r = cents(l.rate);
    return Number.isFinite(q) ? Math.round(q * r + (q * r < 0 ? -1e-9 : 1e-9)) : 0;
  });
  const subtotal = lines.reduce((a, b) => a + b, 0);
  let discount = 0;
  if (inv.discountType === "percent") discount = pctOf(subtotal, inv.discountValue);
  else if (inv.discountType === "amount") discount = Math.min(cents(inv.discountValue), Math.max(subtotal, 0));
  discount = Math.min(discount, Math.max(subtotal, 0));
  const taxable = (inv.lines || []).reduce((a, l, i) => a + (l.taxable !== false ? lines[i] : 0), 0);
  const base = subtotal > 0 ? Math.max(0, taxable - Math.round((discount * taxable) / subtotal)) : 0;
  const total = subtotal - discount + pctOf(base, inv.taxRate) + cents(inv.shipping);
  return total - Math.max(0, cents(inv.paid));
}

export function overdueFromInvoiceMaker(text, today) {
  let data = null;
  try { data = JSON.parse(text || "null"); } catch { data = null; }
  if (!data || !Array.isArray(data.invoices)) return [];
  const out = [];
  for (const inv of data.invoices) {
    if (!inv || typeof inv !== "object" || inv.void || !inv.sent || !parseDate(inv.due) || inv.due >= today) continue;
    const balance = invoiceBalanceCents(inv);
    if (balance <= 0) continue;
    out.push({
      id: String(inv.id || ""), number: String(inv.number || ""), client: String(inv.clientName || ""), currency: inv.currency || "USD",
      amount: balance / 100, due: inv.due, daysLate: daysBetween(inv.due, today),
      lateFlat: Math.max(0, cents(inv.lateFlat) / 100), lateMonthlyPct: Math.max(0, Number(inv.lateMonthlyPct) || 0),
      fromName: String(inv.fromName || ""), payInstructions: String(inv.payInstructions || ""),
    });
  }
  return out.sort((a, b) => b.daysLate - a.daysLate || b.amount - a.amount);
}
