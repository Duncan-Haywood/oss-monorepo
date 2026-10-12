// Ghostwriter book quote: turns a book brief into hours, a price that holds a target hourly rate after fees,
// an implied per-word and per-page rate, a payment schedule, and what the effective hourly becomes if the job runs over.
// Pure functions, nothing leaves the browser.
//
// The model is hours-first: a flat book fee is only safe if it was derived from the hours the book will really take
// (drafting + interviews + research + revision rounds + project management), plus a premium for confidentiality and
// rush, grossed up for any marketplace commission, plus expenses passed through at cost.

export const DEFAULTS = {
  wordCount: 60000,
  draftWordsPerHour: 350, // finished, client-ready words per hour of drafting, not typing speed
  interviewHours: 20,
  interviewOverhead: 1.0, // extra hours of prep, transcript review and follow-up per interview hour
  researchHours: 15,
  revisionRounds: 2,
  revisionShare: 0.1, // each round costs this share of the drafting hours
  managementHours: 12,
  targetHourly: 75,
  confidentialityPremium: 0.25, // uncredited work: you give up the portfolio credit
  rushPremium: 0,
  platformFee: 0,
  expenses: 600,
  clientBudget: 0,
  overrun: 0.25,
  deposit: 0.3,
  milestones: 3,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

export function hours(o) {
  const draft = o.wordCount / o.draftWordsPerHour;
  const interviews = o.interviewHours * (1 + o.interviewOverhead);
  const research = o.researchHours;
  const revisions = o.revisionRounds * o.revisionShare * draft;
  const management = o.managementHours;
  const total = draft + interviews + research + revisions + management;
  return { draft, interviews, research, revisions, management, total };
}

// Price that nets `hourly` per hour after the platform fee. Premiums multiply the labour; expenses are added at cost
// and are not marked up, and the platform fee is taken on the whole invoice.
export function priceFor(o, h, hourly) {
  const labour = h.total * hourly * (1 + o.confidentialityPremium) * (1 + o.rushPremium);
  const invoice = (labour + o.expenses) / (1 - o.platformFee);
  return { labour, invoice };
}

// What the writer actually keeps per hour for a given invoice and hours actually worked.
export function effectiveHourly(o, invoice, hoursWorked) {
  const kept = invoice * (1 - o.platformFee) - o.expenses;
  return hoursWorked > 0 ? kept / hoursWorked : 0;
}

export function schedule(o, invoice) {
  const deposit = invoice * o.deposit;
  const n = Math.max(1, Math.round(o.milestones));
  const each = (invoice - deposit) / n;
  const rows = [["Deposit on signing", deposit]];
  for (let i = 1; i <= n; i++) rows.push([n === 1 ? "On delivery" : `Milestone ${i} of ${n}`, each]);
  return rows;
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) {
    if (!Number.isFinite(o[k])) warnings.push(`${k} must be a number.`);
    else if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  }
  if (warnings.length) return { opts: o, warnings, result: null };
  if (!(o.wordCount > 0)) warnings.push("Enter the book's target word count.");
  if (!(o.draftWordsPerHour > 0)) warnings.push("Drafting speed must be above zero words per hour.");
  if (!(o.targetHourly > 0)) warnings.push("Enter the hourly rate you want to earn.");
  if (o.platformFee >= 1) warnings.push("Platform fee must be a decimal below 1 (0.10 = 10%).");
  if (o.deposit > 1) warnings.push("Deposit must be a decimal share of the fee (0.3 = 30%).");
  if (warnings.length) return { opts: o, warnings, result: null };
  if (o.draftWordsPerHour > 800) warnings.push("Above about 800 finished words per hour, a book-length voice match is unlikely. Check the drafting speed.");
  if (o.interviewHours === 0 && o.wordCount > 20000) warnings.push("No interview time for a book-length job: the client's voice and stories have to come from somewhere.");

  const h = hours(o);
  const quote = priceFor(o, h, o.targetHourly);
  const invoice = quote.invoice;
  const floor = priceFor({ ...o, confidentialityPremium: 0, rushPremium: 0 }, h, o.targetHourly).invoice;
  const perWord = invoice / o.wordCount;
  const perPage = perWord * 250;
  const overHours = { ...h, total: h.total * (1 + o.overrun) };
  const atRisk = effectiveHourly(o, invoice, overHours.total);
  const atBudget = o.clientBudget > 0 ? effectiveHourly(o, o.clientBudget, h.total) : null;
  const budgetGap = o.clientBudget > 0 ? invoice - o.clientBudget : null;
  // Words the client's budget buys at the target hourly with the same non-draft scope.
  let budgetWords = null;
  if (o.clientBudget > 0) {
    const fixed = h.interviews + h.research + h.management;
    const perWordHours = (1 + o.revisionRounds * o.revisionShare) / o.draftWordsPerHour;
    const rate = o.targetHourly * (1 + o.confidentialityPremium) * (1 + o.rushPremium);
    const labourBudget = o.clientBudget * (1 - o.platformFee) - o.expenses;
    const hoursBudget = labourBudget / rate;
    budgetWords = Math.max(0, Math.floor((hoursBudget - fixed) / perWordHours));
  }
  const extraRound = o.revisionShare * h.draft * o.targetHourly * (1 + o.rushPremium) / (1 - o.platformFee);
  const grid = [0.5, 0.75, 1, 1.25, 1.5].map((m) => {
    const w = { ...o, wordCount: Math.round(o.wordCount * m) };
    const hh = hours(w);
    return { words: w.wordCount, hours: hh.total, invoice: priceFor(w, hh, o.targetHourly).invoice };
  });
  const sched = schedule(o, invoice);
  const form = [
    ["Drafting hours", h.draft], ["Interview hours with prep", h.interviews], ["Research hours", h.research],
    ["Revision hours", h.revisions], ["Management hours", h.management], ["Total hours", h.total],
    ["Quoted fee", invoice], ["Expenses passed through", o.expenses], ["Fee per word", perWord], ["Fee per 250-word page", perPage],
  ];
  return {
    opts: o, warnings, result: quote, hours: h, invoice, floor, perWord, perPage, atRisk, atBudget, budgetGap, budgetWords,
    extraRound, grid, schedule: sched, form, confidentialityValue: invoice - floor,
  };
}

export function toCsv(a) {
  const rows = [["line", "value"], ...a.form.map(([k, v]) => [k.replace(/,/g, ""), Number(v).toFixed(2)])];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
