// Proposal maths and wording in integer cents so totals never drift by a penny.
// Pure functions only: the page owns storage and the DOM. Nothing here reads a
// clock, the network or a random source, so the same proposal always prints
// the same document.

export const LEGAL_NOTICE =
  "Template wording only. This is not legal advice. Have a lawyer review any contract before you rely on it.";

export const MODELS = ["fixed", "tiers", "hourly", "retainer"];
export const STATUSES = ["draft", "sent", "accepted", "declined"];
export const MAX_TIERS = 3;

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function toCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9));
}

export function formatMoney(cents, currency = "USD", locale = "en-US") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

// Round a percentage of an integer-cent amount half away from zero.
export function percentOf(cents, pct) {
  const raw = (cents * (Number(pct) || 0)) / 100;
  return Math.sign(raw) * Math.round(Math.abs(raw) + 1e-9);
}

export function lineAmount(line) {
  const qty = Number(line && line.qty);
  const rate = toCents(line && line.rate);
  if (!Number.isFinite(qty)) return 0;
  const raw = qty * rate;
  return Math.round(raw + (raw < 0 ? -1e-9 : 1e-9));
}

export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = parseDate(iso);
  if (!d) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

// Same day-of-month `months` later, clamped to the end of a shorter month.
export function addMonths(iso, months) {
  const d = parseDate(iso);
  if (!d) return "";
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return isoDate(t);
}

export function daysBetween(fromIso, toIso) {
  const a = parseDate(fromIso), b = parseDate(toIso);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

export function splitLines(text) {
  return String(text ?? "").split(/\r?\n/).map((s) => s.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
}

const str = (v, max = 5000) => String(v ?? "").slice(0, max);
const num = (v, def = "") => (v === undefined || v === null ? def : String(v).slice(0, 20));
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

export function blankTerms() {
  return { revisionRounds: "2", netDays: "14", lateFeePct: "", feedbackDays: "5", killFeePct: "25", changeRate: "" };
}

export const CLAUSE_KEYS = ["changeOrders", "revisions", "clientResponsibilities", "payment", "ownership", "termination"];

// Coerce anything (a stored record, a restored backup, a half-typed form) into
// the full proposal shape. Unknown keys are dropped and every string is capped.
export function normalizeProposal(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const terms = { ...blankTerms(), ...(r.terms && typeof r.terms === "object" ? r.terms : {}) };
  const clauses = {};
  for (const k of CLAUSE_KEYS) clauses[k] = r.clauses && typeof r.clauses === "object" ? r.clauses[k] !== false : true;
  const line = (l) => ({ desc: str(l && l.desc, 300), qty: num(l && l.qty, "1"), rate: num(l && l.rate) });
  const option = (o) => ({ name: str(o && o.name, 100), lines: list(o && o.lines, 60).map(line) });
  let options = list(r.options, MAX_TIERS).map(option);
  if (!options.length) options = [{ name: "", lines: [{ desc: "", qty: "1", rate: "" }] }];
  const model = MODELS.includes(r.model) ? r.model : "fixed";
  return {
    id: str(r.id, 60) || "p0",
    number: str(r.number, 40),
    status: STATUSES.includes(r.status) ? r.status : "draft",
    sentOn: str(r.sentOn, 10),
    decidedOn: str(r.decidedOn, 10),
    acceptedOption: Number.isInteger(r.acceptedOption) && r.acceptedOption >= 0 ? r.acceptedOption : 0,
    fromName: str(r.fromName, 200), fromEmail: str(r.fromEmail, 200), fromAddr: str(r.fromAddr, 500),
    clientName: str(r.clientName, 200), clientContact: str(r.clientContact, 200), clientEmail: str(r.clientEmail, 200), clientAddr: str(r.clientAddr, 500),
    title: str(r.title, 200),
    issued: str(r.issued, 10), validDays: num(r.validDays, "30"), validUntil: str(r.validUntil, 10),
    currency: /^[A-Z]{3}$/.test(r.currency) ? r.currency : "USD",
    summary: str(r.summary), problem: str(r.problem), goals: str(r.goals),
    deliverables: list(r.deliverables, 30).map((d) => ({ name: str(d && d.name, 200), included: str(d && d.included, 2000), excluded: str(d && d.excluded, 2000) })),
    startDate: str(r.startDate, 10),
    phases: list(r.phases, 20).map((p) => ({ name: str(p && p.name, 200), days: num(p && p.days, "7"), notes: str(p && p.notes, 1000) })),
    model,
    options,
    hourly: { rate: num(r.hourly && r.hourly.rate), hours: num(r.hourly && r.hourly.hours), capHours: num(r.hourly && r.hourly.capHours) },
    retainer: { monthly: num(r.retainer && r.retainer.monthly), months: num(r.retainer && r.retainer.months, "3"), hours: num(r.retainer && r.retainer.hours), overageRate: num(r.retainer && r.retainer.overageRate) },
    taxRate: num(r.taxRate),
    depositType: ["none", "percent", "amount"].includes(r.depositType) ? r.depositType : "none",
    depositValue: num(r.depositValue),
    milestones: list(r.milestones, 12).map((m) => ({ label: str(m && m.label, 200), percent: num(m && m.percent), when: str(m && m.when, 200) })),
    assumptions: str(r.assumptions),
    terms, clauses, customTerms: str(r.customTerms),
  };
}

// ---------- pricing ----------

function taxedLines(lines, taxRate) {
  const amounts = (lines || []).map((l) => ({ ...l, amount: lineAmount(l) }));
  const subtotal = amounts.reduce((s, l) => s + l.amount, 0);
  const tax = percentOf(subtotal, taxRate);
  return { lines: amounts, subtotal, tax, total: subtotal + tax };
}

// Every price the client can choose between. fixed and hourly and retainer
// give one; tiers gives up to three. `cap` is the not-to-exceed figure for an
// hourly proposal (null otherwise).
export function pricingOptions(p) {
  const rate = p.taxRate;
  if (p.model === "hourly") {
    const hr = toCents(p.hourly.rate);
    const sub = Math.round(hr * (Number(p.hourly.hours) || 0));
    const capSub = p.hourly.capHours === "" ? null : Math.round(hr * (Number(p.hourly.capHours) || 0));
    const tax = percentOf(sub, rate);
    return [{ name: "Time and materials with a cap", kind: "hourly", lines: [], subtotal: sub, tax, total: sub + tax, cap: capSub === null ? null : capSub + percentOf(capSub, rate) }];
  }
  if (p.model === "retainer") {
    const monthly = toCents(p.retainer.monthly);
    const months = Math.max(0, Math.floor(Number(p.retainer.months) || 0));
    const taxEach = percentOf(monthly, rate);
    return [{ name: "Monthly retainer", kind: "retainer", lines: [], monthly, months, taxEach, subtotal: monthly * months, tax: taxEach * months, total: (monthly + taxEach) * months, cap: null }];
  }
  if (p.model === "tiers") {
    return p.options.slice(0, MAX_TIERS).map((o, i) => ({ name: o.name || `Option ${i + 1}`, kind: "tier", ...taxedLines(o.lines, rate), cap: null }));
  }
  const t = taxedLines((p.options[0] || {}).lines, rate);
  return [{ name: "Fixed price", kind: "fixed", ...t, cap: null }];
}

export function depositFor(p, total) {
  if (total <= 0) return 0;
  if (p.depositType === "percent") return Math.min(total, percentOf(total, p.depositValue));
  if (p.depositType === "amount") return Math.min(total, Math.max(0, toCents(p.depositValue)));
  return 0;
}

// Timeline: phases run back to back from the start date, in calendar days.
export function phaseDates(p) {
  let cursor = p.startDate;
  return p.phases.map((ph) => {
    const days = Math.max(1, Math.floor(Number(ph.days) || 1));
    const start = cursor;
    const end = start ? addDays(start, days - 1) : "";
    cursor = end ? addDays(end, 1) : "";
    return { name: ph.name, notes: ph.notes, days, start, end };
  });
}

export function finishDate(p) {
  const ph = phaseDates(p);
  return ph.length ? ph[ph.length - 1].end : "";
}

// What the client pays and when, for one pricing option. The final balance is
// whatever is left, so the rows always add up to the total exactly.
export function paymentSchedule(p, optionIndex = 0) {
  const opts = pricingOptions(p);
  const o = opts[Math.min(Math.max(optionIndex, 0), opts.length - 1)];
  if (!o) return [];
  if (o.kind === "retainer") {
    const rows = [];
    for (let i = 0; i < o.months; i++) rows.push({ label: `Month ${i + 1} of ${o.months}`, amount: o.monthly + o.taxEach, due: p.startDate ? addMonths(p.startDate, i) : "Start of the month", pct: null });
    return rows;
  }
  const total = o.total;
  const rows = [];
  let remaining = total;
  const dep = depositFor(p, total);
  if (dep > 0) { rows.push({ label: "Deposit to book the work", amount: dep, due: "On acceptance", pct: null }); remaining -= dep; }
  if (o.kind === "hourly") {
    rows.push({ label: "Hours worked, invoiced monthly", amount: null, due: `Net ${Number(p.terms.netDays) || 14} days${dep ? "; the deposit is credited on the final invoice" : ""}`, pct: null });
    return rows;
  }
  for (const m of p.milestones) {
    const pct = Number(m.percent);
    if (!(pct > 0)) continue;
    const amt = Math.min(remaining, percentOf(total, pct));
    if (amt <= 0) continue;
    rows.push({ label: m.label || "Milestone", amount: amt, due: m.when || "On completion of this milestone", pct });
    remaining -= amt;
  }
  if (remaining > 0 || !rows.length) rows.push({ label: rows.length ? "Final balance" : "Full payment", amount: remaining, due: `Net ${Number(p.terms.netDays) || 14} days from delivery`, pct: null });
  return rows;
}

// ---------- clause text (generic template wording, not legal advice) ----------

export function clauseTexts(p) {
  const t = p.terms;
  const out = [];
  const on = (k) => p.clauses[k] !== false;
  if (on("changeOrders")) {
    const rate = toCents(t.changeRate) > 0 ? ` at ${formatMoney(toCents(t.changeRate), p.currency)} per hour, or at a fixed price quoted in advance` : " at a price quoted in advance";
    out.push({ key: "changeOrders", title: "Change orders", text: `Work not listed under Scope is outside this proposal. If you ask for something that is not in Scope, or that changes a listed deliverable, ${p.fromName || "the provider"} will describe the change and its price and timing in writing first. The change is added only once you approve it in writing. Approved changes are billed${rate}, and the delivery dates move by the time the change needs.` });
  }
  if (on("revisions")) {
    const n = Math.floor(Number(t.revisionRounds));
    out.push({ key: "revisions", title: "Revisions", text: n > 0 ? `The price includes ${n} round${n === 1 ? "" : "s"} of revisions to each deliverable. A round is one consolidated set of feedback from you. Further rounds are treated as a change order.` : "Revisions are not included in the price. Any revision is treated as a change order." });
  }
  if (on("clientResponsibilities")) {
    const d = Math.floor(Number(t.feedbackDays));
    out.push({ key: "clientResponsibilities", title: "Client responsibilities", text: `You will provide the access, content and decisions the work needs${d > 0 ? ` and respond to requests for feedback or approval within ${d} business days` : ""}. If responses are late, the schedule moves by the same number of days, and long delays may be re-scheduled to the provider's next available slot.` });
  }
  if (on("payment")) {
    const net = Math.floor(Number(t.netDays)) || 14;
    const late = Number(t.lateFeePct) > 0 ? ` Overdue amounts may carry a late fee of ${Number(t.lateFeePct)}% per month, where the law allows it.` : "";
    out.push({ key: "payment", title: "Payment", text: `Invoices are due ${net} days after the invoice date unless the payment schedule above says otherwise.${late} Work may be paused while an invoice is overdue.` });
  }
  if (on("ownership")) out.push({ key: "ownership", title: "Ownership of the work", text: "Ownership of the final deliverables passes to you when the provider has been paid in full. Until then, the work is provided for review only. The provider keeps the right to reuse general know-how, tools and pre-existing materials, and may show the finished work in a portfolio unless you ask in writing that it stay private." });
  if (on("termination")) {
    const k = Number(t.killFeePct);
    out.push({ key: "termination", title: "Cancellation", text: `Either side may end the work with written notice. You pay for work done up to the notice date${k > 0 ? `, plus a cancellation fee of ${k}% of the unbilled balance to cover time that was reserved for you` : ""}. Deposits are applied to the amount owed.` });
  }
  const custom = String(p.customTerms || "").trim();
  if (custom) out.push({ key: "custom", title: "Other terms", text: custom });
  return out;
}

// ---------- status and sales view ----------

// draft -> sent -> accepted | declined. A sent proposal past its validity date
// reads as expired so it stops counting as live pipeline.
export function status(p, today) {
  if (p.status === "accepted") return "accepted";
  if (p.status === "declined") return "declined";
  if (p.status !== "sent") return "draft";
  if (p.validUntil && today && p.validUntil < today) return "expired";
  return "sent";
}

// The figure a proposal is worth: the option the client chose if accepted,
// otherwise the lowest price, which is the one you can count on.
export function proposalValue(p) {
  const totals = pricingOptions(p).map((o) => o.total);
  if (!totals.length) return 0;
  if (p.status === "accepted" && totals[p.acceptedOption] !== undefined) return totals[p.acceptedOption];
  return Math.min(...totals);
}

// Proposals worth a nudge: sent, still live, and either quiet for `quietDays`
// since they went out or expiring within `soonDays`. Most lost proposals are
// not declined, they are never answered.
export function followUps(proposals, today, { quietDays = 3, soonDays = 3 } = {}) {
  const out = [];
  for (const p of proposals) {
    if (status(p, today) !== "sent") continue;
    const quiet = p.sentOn ? daysBetween(p.sentOn, today) : null;
    const left = p.validUntil ? daysBetween(today, p.validUntil) : null;
    const expiring = left !== null && left <= soonDays;
    if (!expiring && !(quiet !== null && quiet >= quietDays)) continue;
    out.push({ id: p.id, number: p.number, clientName: p.clientName, title: p.title, quietDays: quiet, daysLeft: left, reason: expiring ? "expiring" : "quiet", value: proposalValue(p), currency: p.currency });
  }
  return out.sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9) || (b.quietDays ?? 0) - (a.quietDays ?? 0));
}

// Plain-text nudge the user can copy. Short on purpose; names the date, not pressure.
export function followUpText(f) {
  const hi = f.clientName ? `Hi ${f.clientName},` : "Hi,";
  const when = f.reason === "expiring" && f.daysLeft !== null
    ? (f.daysLeft <= 0 ? "The proposal is valid through today." : `The proposal is valid for ${f.daysLeft} more day${f.daysLeft === 1 ? "" : "s"}.`)
    : "";
  return `${hi}\n\nI wanted to check that proposal ${f.number}${f.title ? ` (${f.title})` : ""} reached you and see whether you have any questions. ${when} Happy to adjust the scope or timing if that helps.\n\nThanks`.replace(/ {2,}/g, " ");
}

export function nextNumber(items, prefix = "PROP-") {
  let max = 0, width = 4;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  for (const i of items) {
    const m = re.exec(i.number || "");
    if (m) { max = Math.max(max, +m[1]); width = Math.max(width, m[1].length); }
  }
  return prefix + String(max + 1).padStart(width, "0");
}

export function duplicateNumbers(items) {
  const seen = new Map();
  for (const i of items) if (i.number) seen.set(i.number, (seen.get(i.number) || 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

// Win rate counts decided proposals only: accepted / (accepted + declined +
// expired), so a draft or an open proposal can neither flatter nor sink it.
export function pipeline(proposals, today) {
  let sent = 0, accepted = 0, declined = 0, expired = 0, open = 0, openValue = 0, wonValue = 0;
  for (const p of proposals) {
    const st = status(p, today);
    if (st === "draft") continue;
    sent++;
    const v = proposalValue(p);
    if (st === "accepted") { accepted++; wonValue += v; }
    else if (st === "declined") declined++;
    else if (st === "expired") expired++;
    else { open++; openValue += v; }
  }
  const decided = accepted + declined + expired;
  return { sent, accepted, declined, expired, open, openValue, wonValue, winRate: decided ? accepted / decided : null };
}

// A copy that starts over as a draft with a fresh number and dates.
export function duplicateProposal(p, { id, number, today }) {
  const c = normalizeProposal(JSON.parse(JSON.stringify(p)));
  c.id = id; c.number = number; c.status = "draft"; c.sentOn = ""; c.decidedOn = ""; c.acceptedOption = 0;
  c.issued = today;
  c.validUntil = validUntil(today, c.validDays);
  return c;
}

export function validUntil(issued, validDays) {
  return addDays(issued, Math.max(0, Math.floor(Number(validDays) || 0)));
}

export function validate(p) {
  const out = [];
  if (!p.number) out.push("Add a proposal number so the client can quote it back to you.");
  if (!p.fromName) out.push("Add your name or business name.");
  if (!p.clientName) out.push("Add the client name.");
  if (!String(p.title || "").trim()) out.push("Give the project a title.");
  if (!p.issued) out.push("Add the issue date.");
  if (!p.validUntil) out.push("Add how long the price is good for: a proposal with no expiry can be held against you after your costs move.");
  if (p.issued && p.validUntil && p.validUntil < p.issued) out.push("The valid-until date is before the issue date.");
  if (!p.deliverables.some((d) => d.name.trim())) out.push("List at least one deliverable under Scope.");
  else if (p.deliverables.some((d) => d.name.trim() && !d.excluded.trim())) out.push("Say what is excluded from each deliverable: most proposal disputes are about what was not included.");
  if (!p.phases.length) out.push("Add at least one phase so the client sees a timeline.");
  else if (!p.startDate) out.push("Add a start date so the phases get dates.");
  const opts = pricingOptions(p);
  if (p.model === "hourly") {
    if (!(toCents(p.hourly.rate) > 0) || !(Number(p.hourly.hours) > 0)) out.push("Enter the hourly rate and the estimated hours.");
    else if (p.hourly.capHours === "") out.push("Set a cap on hours: an hourly proposal with no ceiling is hard for a client to approve.");
    else if (Number(p.hourly.capHours) < Number(p.hourly.hours)) out.push("The hour cap is below the estimated hours.");
  } else if (p.model === "retainer") {
    if (!(toCents(p.retainer.monthly) > 0) || !(Number(p.retainer.months) >= 1)) out.push("Enter the monthly fee and the number of months.");
    if (!(Number(p.retainer.hours) > 0)) out.push("Say how many hours a month the retainer covers.");
  } else if (!opts.some((o) => o.total > 0)) out.push("Add at least one priced line.");
  if (p.model === "tiers") {
    if (p.options.length < 2) out.push("Add a second option, or switch the pricing to a fixed price.");
    if (p.options.some((o) => !o.name.trim())) out.push("Name each option (for example Starter, Standard, Premium) so the client can say which one they pick.");
  }
  if (Number(p.taxRate) < 0 || Number(p.taxRate) > 100) out.push("Tax rate should be between 0 and 100.");
  if (p.depositType === "percent" && (Number(p.depositValue) < 0 || Number(p.depositValue) > 100)) out.push("Deposit percentage should be between 0 and 100.");
  if (p.model !== "retainer" && p.model !== "hourly") {
    const total = (opts[0] || {}).total || 0;
    const dep = depositFor(p, total);
    const ms = p.milestones.reduce((s, m) => s + percentOf(total, Number(m.percent) || 0), 0);
    if (total > 0 && dep + ms > total) out.push("The deposit and milestones add up to more than the total price.");
  }
  return out;
}

// ---------- document ----------

// The printable proposal as HTML. Every user-typed value goes through esc().
export function renderProposal(p, { today = "" } = {}) {
  const money = (c) => esc(formatMoney(c, p.currency));
  const para = (s) => esc(s).replace(/\n/g, "<br>");
  const opts = pricingOptions(p);
  const sections = [];
  const bullets = (text) => { const items = splitLines(text); return items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""; };

  const head = `<div class="top"><div><h2>PROPOSAL</h2><p class="ptitle">${esc(p.title)}</p></div>
    <table class="meta"><tr><td>Proposal no.</td><td><strong>${esc(p.number)}</strong></td></tr><tr><td>Issued</td><td>${esc(p.issued)}</td></tr><tr><td>Valid until</td><td>${esc(p.validUntil)}</td></tr></table></div>
    <div class="parties"><p><strong>Prepared for</strong><br>${esc(p.clientName)}${p.clientContact ? `<br>Attn: ${esc(p.clientContact)}` : ""}${p.clientAddr ? `<br>${para(p.clientAddr)}` : ""}${p.clientEmail ? `<br>${esc(p.clientEmail)}` : ""}</p>
    <p><strong>Prepared by</strong><br>${esc(p.fromName)}${p.fromAddr ? `<br>${para(p.fromAddr)}` : ""}${p.fromEmail ? `<br>${esc(p.fromEmail)}` : ""}</p></div>`;
  sections.push(head);

  if (p.summary.trim()) sections.push(`<h3>Project summary</h3><p>${para(p.summary)}</p>`);
  if (p.problem.trim()) sections.push(`<h3>The problem</h3><p>${para(p.problem)}</p>`);
  if (p.goals.trim()) sections.push(`<h3>Goals</h3>${bullets(p.goals)}`);

  const dels = p.deliverables.filter((d) => d.name.trim());
  if (dels.length) {
    sections.push(`<h3>Scope</h3>` + dels.map((d, i) => `<div class="deliv"><h4>${i + 1}. ${esc(d.name)}</h4>
      ${splitLines(d.included).length ? `<p class="lbl">Included</p>${bullets(d.included)}` : ""}
      ${splitLines(d.excluded).length ? `<p class="lbl">Not included</p>${bullets(d.excluded)}` : ""}</div>`).join(""));
  }

  const ph = phaseDates(p).filter((x) => x.name.trim());
  if (ph.length) {
    const fin = finishDate(p);
    sections.push(`<h3>Timeline</h3><table><thead><tr><th>Phase</th><th>Starts</th><th>Ends</th><th class="n">Days</th></tr></thead><tbody>${ph.map((x) => `<tr><td>${esc(x.name)}${x.notes ? `<br><span class="sub">${esc(x.notes)}</span>` : ""}</td><td>${esc(x.start || "TBD")}</td><td>${esc(x.end || "TBD")}</td><td class="n">${esc(x.days)}</td></tr>`).join("")}</tbody></table>${fin ? `<p class="sub">Estimated completion: ${esc(fin)}, assuming the work starts on the start date and feedback arrives on time.</p>` : ""}`);
  }

  const tax = Number(p.taxRate) ? ` Tax at ${esc(p.taxRate)}% is included in the totals.` : "";
  if (p.model === "hourly") {
    const o = opts[0];
    sections.push(`<h3>Investment</h3><table class="tot"><tr><td>Hourly rate</td><td class="n">${money(toCents(p.hourly.rate))}</td></tr><tr><td>Estimated hours</td><td class="n">${esc(p.hourly.hours)}</td></tr><tr class="due"><td>Estimated fees${Number(p.taxRate) ? " (with tax)" : ""}</td><td class="n">${money(o.total)}</td></tr>${o.cap !== null ? `<tr><td>Not to exceed${Number(p.taxRate) ? " (with tax)" : ""}</td><td class="n">${money(o.cap)}</td></tr>` : ""}</table>
      <p class="sub">Billed for hours actually worked.${o.cap !== null ? ` Fees will not exceed ${money(o.cap)} (${esc(p.hourly.capHours)} hours) without your written approval.` : ""}${tax}</p>`);
  } else if (p.model === "retainer") {
    const o = opts[0];
    sections.push(`<h3>Investment</h3><table class="tot"><tr><td>Monthly fee</td><td class="n">${money(o.monthly)}</td></tr><tr><td>Hours included each month</td><td class="n">${esc(p.retainer.hours)}</td></tr>${toCents(p.retainer.overageRate) > 0 ? `<tr><td>Extra hours</td><td class="n">${money(toCents(p.retainer.overageRate))} / hr</td></tr>` : ""}<tr class="due"><td>Term of ${esc(o.months)} month${o.months === 1 ? "" : "s"}${Number(p.taxRate) ? " (with tax)" : ""}</td><td class="n">${money(o.total)}</td></tr></table>
      <p class="sub">Unused hours do not roll over unless agreed in writing.${tax}</p>`);
  } else {
    const multi = p.model === "tiers";
    const cols = opts.map((o) => `<div class="optcol">${multi ? `<h4>${esc(o.name)}</h4>` : ""}
      <table><tbody>${o.lines.filter((l) => String(l.desc || "").trim() || l.amount).map((l) => `<tr><td>${esc(l.desc)}</td><td class="n">${esc(l.qty)} &times; ${money(toCents(l.rate))}</td><td class="n">${money(l.amount)}</td></tr>`).join("")}</tbody></table>
      <table class="tot"><tr><td>Subtotal</td><td class="n">${money(o.subtotal)}</td></tr>${Number(p.taxRate) ? `<tr><td>Tax (${esc(p.taxRate)}%)</td><td class="n">${money(o.tax)}</td></tr>` : ""}<tr class="due"><td>${multi ? "Total" : "Fixed price"}</td><td class="n">${money(o.total)}</td></tr></table></div>`).join("");
    sections.push(`<h3>Investment</h3><div class="optcols">${cols}</div>`);
  }

  const showSched = opts.map((o, i) => ({ o, i }));
  const schedFor = (i) => paymentSchedule(p, i);
  const schedTable = (rows) => `<table><thead><tr><th>Payment</th><th>When</th><th class="n">Amount</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.due)}</td><td class="n">${r.amount === null ? "As invoiced" : money(r.amount)}</td></tr>`).join("")}</tbody></table>`;
  if (showSched.length === 1 || p.model !== "tiers") sections.push(`<h3>Payment schedule</h3>${schedTable(schedFor(0))}`);
  else sections.push(`<h3>Payment schedule</h3><p class="sub">Same percentages on whichever option you choose.</p>${showSched.map(({ o, i }) => `<h4>${esc(o.name)}</h4>${schedTable(schedFor(i))}`).join("")}`);

  if (p.assumptions.trim()) sections.push(`<h3>Assumptions</h3>${bullets(p.assumptions)}`);

  const clauses = clauseTexts(p);
  if (clauses.length) sections.push(`<h3>Terms</h3>${clauses.map((c) => `<p><strong>${esc(c.title)}.</strong> ${para(c.text)}</p>`).join("")}<p class="sub">${esc(LEGAL_NOTICE)}</p>`);

  const when = p.validUntil ? `This proposal is valid until ${esc(p.validUntil)}; prices and dates may change after that.` : "Prices and dates may change after the validity date.";
  const choose = p.model === "tiers" ? `<td><div class="line">Option chosen</div></td>` : "";
  sections.push(`<h3>Acceptance</h3><p>${when} By signing, the client accepts the scope, price and terms above.</p>
    <table class="sig"><tr><td><div class="line">Client name</div></td>${choose}<td><div class="line">Signature</div></td><td><div class="line">Date</div></td></tr>
    <tr><td><div class="line">${esc(p.fromName || "Provider")}, name</div></td>${choose ? "<td></td>" : ""}<td><div class="line">Signature</div></td><td><div class="line">Date</div></td></tr></table>`);
  return sections.join("\n");
}

// ---------- standalone file ----------

// A single self-contained HTML file the client can open in any browser, with no
// network request and no script. `css` is the proposal stylesheet (the page
// passes its own); every user-typed value is already escaped by renderProposal.
export function standaloneHtml(p, { css = "", today = "" } = {}) {
  const title = `${p.number} ${p.title}`.trim() || "Proposal";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;color:#111;background:#fff;max-width:860px;margin:0 auto;padding:24px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}.n{text-align:right}@media print{body{padding:0;max-width:none}}
${css}</style></head>
<body><div id="preview">
${renderProposal(p, { today })}
</div></body></html>
`;
}

// ---------- handoff to Estimate Maker ----------

// The proposal's pricing as a draft in Estimate Maker's own schema, so it can
// be written straight into that tool's saved data on the same device.
export function toEstimateDraft(p, { number, issued, validDays = "30" }) {
  const opts = pricingOptions(p);
  const rate = (c) => (c / 100).toFixed(2);
  const options = opts.map((o) => {
    if (o.kind === "hourly") return { name: "", lines: [{ desc: `${p.title || "Project"} (hourly, estimated)`, qty: p.hourly.hours, rate: p.hourly.rate, taxable: true }] };
    if (o.kind === "retainer") return { name: "", lines: [{ desc: `${p.title || "Retainer"} (monthly retainer)`, qty: o.months, rate: rate(o.monthly), taxable: true }] };
    return { name: p.model === "tiers" ? o.name : "", lines: o.lines.filter((l) => String(l.desc || "").trim()).map((l) => ({ desc: l.desc, qty: l.qty, rate: l.rate, taxable: true })) };
  });
  const scope = p.deliverables.filter((d) => d.name.trim()).map((d) => `${d.name}${splitLines(d.excluded).length ? ` (not included: ${splitLines(d.excluded).join("; ")})` : ""}`).join("\n");
  return {
    id: "from-" + p.id, number, sent: false, sentOn: "", outcome: "", acceptedOption: undefined, acceptedAddons: [],
    fromName: p.fromName, fromEmail: p.fromEmail, fromAddr: p.fromAddr, fromTaxId: "",
    clientName: p.clientName, clientEmail: p.clientEmail, clientAddr: p.clientAddr,
    issued, validDays, validUntil: validUntil(issued, validDays), currency: p.currency, taxRate: p.taxRate || "",
    discountType: "none", discountValue: "", depositType: p.depositType, depositValue: p.depositValue,
    scope, options: options.length ? options : [{ name: "", lines: [] }], payInstructions: "", notes: `From proposal ${p.number}`.trim(),
  };
}

// ---------- backup ----------

export function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || typeof d !== "object" || !Array.isArray(d.proposals)) return null;
  const proposals = d.proposals.filter((x) => x && typeof x === "object" && typeof x.id === "string" && x.id).map(normalizeProposal);
  const profile = d.profile && typeof d.profile === "object" && !Array.isArray(d.profile) ? d.profile : {};
  return { proposals, profile };
}

export function mergeProposals(existing, incoming) {
  const ids = new Set(existing.map((p) => p.id));
  const added = [];
  for (const p of incoming) if (!ids.has(p.id)) { added.push(p); ids.add(p.id); }
  return { proposals: [...existing, ...added], added: added.length, skipped: incoming.length - added.length };
}

export function proposalsToCsv(proposals, today) {
  const cell = (v) => {
    const s = String(v ?? "");
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // spreadsheet formula injection
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ["Number", "Client", "Title", "Issued", "Valid until", "Status", "Model", "Value"];
  const rows = proposals.map((p) => [p.number, p.clientName, p.title, p.issued, p.validUntil, status(p, today), p.model, (proposalValue(p) / 100).toFixed(2)]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
