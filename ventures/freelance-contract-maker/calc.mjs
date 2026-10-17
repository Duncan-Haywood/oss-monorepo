// Freelance service agreement builder. Pure functions: inputs in, plain text
// clauses out. Money is whole cents. Nothing here reads the DOM or the network.

export const CURRENCIES = { USD: "$", CAD: "CA$", EUR: "€", GBP: "£", AUD: "A$", NZD: "NZ$", CHF: "CHF ", JPY: "¥", MXN: "MX$", INR: "₹" };

export const DEFAULTS = {
  contractor: "",
  client: "",
  effective: "",
  project: "",
  deliverables: "",
  feeType: "fixed", // fixed | hourly | retainer
  amount: "",
  currency: "USD",
  hoursEstimate: "",
  depositPct: "50",
  milestones: "", // one per line: "Name | percent"
  payDays: "14",
  lateFeePct: "1.5",
  revisions: "2",
  extraRevisionRate: "",
  killFeePct: "25",
  noticeDays: "14",
  ip: "on-payment", // on-payment | license | contractor
  portfolio: true,
  confidential: true,
  expenses: true,
  liabilityCap: true,
  law: "",
};

export function parseCents(v) {
  const s = String(v ?? "").replace(/[,\s]/g, "").replace(/^[^\d.-]+/, "");
  if (s === "" || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseNum(v) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatMoney(cents, currency = "USD") {
  const sym = CURRENCIES[currency] ?? currency + " ";
  const whole = currency === "JPY";
  const v = cents / 100;
  const body = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return (cents < 0 ? "-" : "") + sym + body;
}

// "Design | 30" per line. Percentages must be positive and total at most 100.
export function parseMilestones(text) {
  const rows = [];
  const problems = [];
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.lastIndexOf("|");
    const name = (bar >= 0 ? line.slice(0, bar) : line).trim();
    const pct = bar >= 0 ? parseNum(line.slice(bar + 1).replace("%", "")) : null;
    if (!name || pct === null || pct <= 0) { problems.push(`Milestone "${line}" needs a name and a percentage, like: First draft | 30`); continue; }
    rows.push({ name, pct });
  }
  return { rows, problems };
}

// Split a total into cents-exact parts for the given percentages. The last
// part absorbs rounding so the parts always add to the total.
export function splitByPercent(totalCents, pcts) {
  const out = [];
  let used = 0;
  pcts.forEach((p, i) => {
    const isLast = i === pcts.length - 1;
    const amt = isLast ? totalCents - used : Math.round((totalCents * p) / 100);
    out.push(amt);
    used += amt;
  });
  return out;
}

// Payment schedule for a fixed fee: deposit, then milestones, then the rest on delivery.
export function paymentSchedule(raw) {
  const inp = { ...DEFAULTS, ...raw };
  const total = parseCents(inp.amount);
  if (total === null || inp.feeType !== "fixed") return { rows: [], total, problems: [] };
  const deposit = parseNum(inp.depositPct) ?? 0;
  const ms = parseMilestones(inp.milestones);
  const problems = [...ms.problems];
  if (deposit > 100) problems.push("Deposit is more than 100%.");
  const msPct = ms.rows.reduce((a, r) => a + r.pct, 0);
  if (deposit + msPct > 100) problems.push(`Deposit and milestones add up to ${round2(deposit + msPct)}%, which is more than 100%.`);
  const stages = [];
  if (deposit > 0) stages.push({ name: "Deposit, due on signing", pct: deposit });
  for (const r of ms.rows) stages.push({ name: r.name, pct: r.pct });
  const rest = round2(100 - stages.reduce((a, s) => a + s.pct, 0));
  if (rest > 0) stages.push({ name: "Balance, due on final delivery", pct: rest });
  const amts = splitByPercent(total, stages.map((s) => s.pct));
  return { rows: stages.map((s, i) => ({ ...s, cents: amts[i] })), total, problems };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Cost of a late payment, for the example sentence in the page and the contract.
export function lateFeeExample(inp) {
  const total = parseCents(inp.amount);
  const pct = parseNum(inp.lateFeePct);
  if (total === null || pct === null || pct === 0) return null;
  return Math.round((total * pct) / 100);
}

export function killFee(inp) {
  const total = parseCents(inp.amount);
  const pct = parseNum(inp.killFeePct);
  if (total === null || pct === null || inp.feeType !== "fixed") return null;
  return Math.round((total * pct) / 100);
}

export function check(raw) {
  const inp = { ...DEFAULTS, ...raw };
  const issues = [];
  if (!String(inp.contractor).trim()) issues.push("Add your name or business name.");
  if (!String(inp.client).trim()) issues.push("Add the client's name.");
  if (!String(inp.project).trim()) issues.push("Describe the project in a sentence.");
  if (!String(inp.deliverables).trim()) issues.push("List at least one deliverable. A contract without them cannot say when the work is done.");
  if (parseCents(inp.amount) === null) issues.push(inp.feeType === "hourly" ? "Add your hourly rate." : inp.feeType === "retainer" ? "Add the monthly retainer." : "Add the project fee.");
  else if (parseCents(inp.amount) === 0) issues.push("The fee is zero.");
  if (!String(inp.law).trim()) issues.push("Add the state or country whose law governs the agreement.");
  const lf = parseNum(inp.lateFeePct);
  if (lf !== null && lf > 5) issues.push("A late fee over 5% a month is unenforceable in many places. Check your local limit.");
  const pd = parseNum(inp.payDays);
  if (pd === null || pd < 0) issues.push("Payment terms need a number of days (0 means due on receipt).");
  for (const p of paymentSchedule(inp).problems) issues.push(p);
  return issues;
}

const list = (text) => String(text ?? "").split("\n").map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean);
const days = (n) => (n === 0 ? "on receipt" : `within ${n} days of the invoice date`);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Returns [{ title, body: [paragraph strings] }]. Deterministic; no model.
export function buildAgreement(raw) {
  const inp = { ...DEFAULTS, ...raw };
  const cur = inp.currency;
  const m = (c) => formatMoney(c, cur);
  const contractor = String(inp.contractor).trim() || "[Contractor]";
  const client = String(inp.client).trim() || "[Client]";
  const sections = [];
  const add = (title, ...body) => sections.push({ title, body: body.flat().filter(Boolean) });
  const total = parseCents(inp.amount);
  const payDays = parseNum(inp.payDays) ?? 14;
  const lateFee = parseNum(inp.lateFeePct) ?? 0;
  const revisions = Math.round(parseNum(inp.revisions) ?? 0);
  const notice = Math.round(parseNum(inp.noticeDays) ?? 14);
  const sched = paymentSchedule(inp);

  add("Parties", `This agreement is between ${contractor} ("Contractor") and ${client} ("Client")${inp.effective ? `, effective ${inp.effective}` : ""}.`);

  const dl = list(inp.deliverables);
  add("1. Services and deliverables",
    `Contractor will provide the following services: ${String(inp.project).trim() || "[describe the project]"}.`,
    dl.length ? "Deliverables:" : "",
    ...dl.map((d, i) => `  (${String.fromCharCode(97 + i)}) ${d}`),
    "Anything not listed above is outside the scope of this agreement and will be quoted separately in writing before work on it begins.");

  const feeLines = [];
  if (inp.feeType === "fixed") {
    feeLines.push(`Client will pay Contractor a fixed fee of ${total === null ? "[amount]" : m(total)} for the services above.`);
    if (sched.rows.length) {
      feeLines.push("Payment schedule:");
      sched.rows.forEach((r) => feeLines.push(`  - ${r.name}: ${m(r.cents)} (${r.pct}%)`));
    }
  } else if (inp.feeType === "hourly") {
    const est = parseNum(inp.hoursEstimate);
    feeLines.push(`Client will pay Contractor ${total === null ? "[rate]" : m(total)} per hour for time spent on the services above, invoiced monthly in arrears.`);
    if (est) feeLines.push(`Contractor's good-faith estimate is ${plural(est, "hour")}${total !== null ? `, about ${m(Math.round(total * est))}` : ""}. It is an estimate, not a cap. Contractor will tell Client before the work passes ${est} hours.`);
  } else {
    feeLines.push(`Client will pay Contractor a monthly retainer of ${total === null ? "[amount]" : m(total)}, invoiced in advance on the first of each month, for the services above.`);
    feeLines.push("Unused time does not roll over unless both parties agree in writing.");
  }
  add("2. Fees and payment", feeLines,
    `Invoices are due ${days(payDays)}.${lateFee > 0 ? ` Overdue balances accrue a late fee of ${lateFee}% per month, or the maximum the law allows if lower.` : ""}`,
    inp.expenses ? "Client will reimburse pre-approved, documented out-of-pocket expenses at cost." : "Contractor bears its own expenses unless Client approves them in writing.");

  add("3. Revisions",
    inp.feeType === "hourly" ? "Because Contractor bills by the hour, revisions are billed at the hourly rate." :
      `The fee includes ${plural(revisions, "round")} of revisions to each deliverable. Further revisions, or changes to the agreed scope, are billed ${parseCents(inp.extraRevisionRate) !== null ? `at ${m(parseCents(inp.extraRevisionRate))} per hour` : "at Contractor's then-current hourly rate"} after Contractor gives Client an estimate.`,
    "Client will give feedback within 5 business days of receiving a deliverable. Delays in feedback may move delivery dates by the same amount.");

  add("4. Client responsibilities",
    "Client will provide the content, access, approvals and decisions Contractor reasonably needs, on time. Contractor is not responsible for delays or defects caused by late or missing input.");

  const ipText = {
    "on-payment": "Contractor assigns to Client the copyright in the final deliverables once Client has paid all amounts due. Until then Client has a limited licence to review them but not to publish or use them. Contractor keeps ownership of its pre-existing tools, templates and know-how, and grants Client a non-exclusive licence to use any of them embedded in the deliverables.",
    license: "Contractor keeps ownership of the deliverables. On payment in full, Client receives a non-exclusive, worldwide, perpetual licence to use them for its own business. Client may not resell or sublicense them as stand-alone work.",
    contractor: "Contractor keeps all rights in the work. Client may use the deliverables only as described in this agreement and needs Contractor's written permission for any other use.",
  }[inp.ip] ?? "";
  add("5. Ownership", ipText,
    inp.portfolio ? "Contractor may show the finished work in its portfolio and marketing, unless Client asks in writing, before delivery, that it be kept private." : "Contractor will not publicly show the work without Client's written permission.");

  if (inp.confidential) add("6. Confidentiality", "Each party will keep the other's non-public business information confidential, use it only for this project, and not share it except with advisers who need it and are bound to keep it private. This does not apply to information that is public, was already known, or must be disclosed by law. It lasts for two years after the agreement ends.");

  const kf = killFee(inp);
  add(`${inp.confidential ? 7 : 6}. Term and termination`,
    `Either party may end this agreement with ${plural(notice, "day")} written notice. Client will pay for all work done up to the end date, including work in progress, and any non-refundable expenses already incurred.`,
    kf !== null && kf > 0 ? `If Client ends the agreement before the work is delivered, Client will pay the greater of the work done to date or a cancellation fee of ${inp.killFeePct}% of the project fee (${m(kf)}), less any amounts already paid toward it.` : "",
    "Contractor may pause work while an invoice is more than 14 days overdue.");

  const n = inp.confidential ? 8 : 7;
  add(`${n}. Independent contractor`, "Contractor is an independent contractor, not an employee, partner or agent of Client. Contractor chooses how and when the work is done, supplies its own tools, and is responsible for its own taxes and insurance.");
  add(`${n + 1}. Warranty and liability`,
    "Contractor will perform the services in a professional manner. Except as stated here, the services are provided without other warranties, express or implied.",
    inp.liabilityCap && total !== null && inp.feeType === "fixed" ? `Neither party is liable to the other for indirect or consequential losses. Contractor's total liability under this agreement is limited to the fees Client has paid under it (${m(total)} at most).` :
      inp.liabilityCap ? "Neither party is liable to the other for indirect or consequential losses. Contractor's total liability under this agreement is limited to the fees Client has paid in the three months before the claim." : "");
  add(`${n + 2}. General`,
    `This agreement is governed by the laws of ${String(inp.law).trim() || "[state or country]"}. It is the whole agreement between the parties, replaces earlier discussions, and can be changed only in writing signed by both. If a clause is found unenforceable, the rest still applies.`);

  add("Signatures", `${contractor}: ______________________  Date: __________`, `${client}: ______________________  Date: __________`);
  return sections;
}

export function agreementText(sections) {
  return sections.map((s) => `${s.title}\n\n${s.body.join("\n\n")}`).join("\n\n\n") + "\n";
}

// Words a client would argue about. Shown beside the draft as "what to check".
export function reviewNotes(inp) {
  const notes = [];
  if (inp.ip === "on-payment") notes.push("Ownership passes only when you are paid in full, so a late payer cannot use the work.");
  if (inp.feeType === "fixed" && (parseNum(inp.depositPct) ?? 0) < 25) notes.push("A deposit under 25% leaves you exposed if the client disappears after you start.");
  if (inp.feeType === "fixed" && (parseNum(inp.revisions) ?? 0) === 0) notes.push("Zero included revisions: most clients expect at least one round, so say so before they ask.");
  if ((parseNum(inp.payDays) ?? 14) > 30) notes.push("Net terms over 30 days mean you finance the client. Consider net 14 or a deposit.");
  if (!inp.liabilityCap) notes.push("No liability cap: a mistake in your work could be argued to cost more than you were paid.");
  if (!String(inp.law).trim()) notes.push("Pick the governing law. Courts and arbitrators look to it first in a dispute.");
  return notes;
}

// Reads "#handoff=<json>" as written by Freelance Proposal Maker. Only known
// text fields are taken, as strings, capped in length; anything else in the
// link is ignored. Returns null when the hash carries no usable hand-off.
const HANDOFF_FIELDS = ["contractor", "client", "effective", "project", "deliverables", "feeType", "amount", "currency", "depositPct", "payDays"];
export function parseHandoff(hash) {
  const m = /^#?handoff=(.+)$/.exec(String(hash ?? ""));
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  for (const k of HANDOFF_FIELDS) if (typeof obj[k] === "string") out[k] = obj[k].slice(0, 4000);
  if (out.feeType !== undefined && out.feeType !== "fixed") delete out.feeType;
  if (out.currency !== undefined && !(out.currency in CURRENCIES)) delete out.currency;
  return Object.keys(out).length ? out : null;
}
