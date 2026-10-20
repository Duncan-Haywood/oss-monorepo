// Freelance proposal builder. Pure functions: inputs in, plain text sections
// out. Money is whole cents; dates are YYYY-MM-DD strings handled in UTC.
// Nothing here reads the DOM or the network.

export const CURRENCIES = { USD: "$", CAD: "CA$", EUR: "€", GBP: "£", AUD: "A$", NZD: "NZ$", CHF: "CHF ", JPY: "¥", MXN: "MX$", INR: "₹" };

export const DEFAULTS = {
  contractor: "",
  client: "",
  title: "",
  proposalDate: "",
  validDays: "14",
  problem: "",
  approach: "",
  deliverables: "",
  phases: "", // one per line: "Name | weeks"
  startDate: "",
  options: "", // one per line: "Name | price | what is included"
  currency: "USD",
  depositPct: "50",
  payDays: "14",
  whyMe: "",
  assumptions: "",
  contact: "",
  hours: "", // private: your hours estimate per option, one number per line, same order as options
  targetRate: "", // private: the hourly rate you want each option to pay
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
  const body = Math.abs(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return (cents < 0 ? "-" : "") + sym + body;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(s) {
  const m = ISO.exec(String(s ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

export function addDays(iso, n) {
  const d = parseDate(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso) {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "";
}

// "Name | price | description" per line. Price is required and must parse.
export function parseOptions(text) {
  const rows = [];
  const problems = [];
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split("|").map((p) => p.trim());
    const cents = parts.length >= 2 ? parseCents(parts[1]) : null;
    if (!parts[0] || cents === null || cents <= 0) {
      problems.push(`Option "${line}" needs a name and a price, like: Standard | 6000 | Five pages, two revision rounds`);
      continue;
    }
    rows.push({ name: parts[0], cents, includes: parts.slice(2).join(" | ") });
  }
  return { rows, problems };
}

// "Discovery | 1" per line; weeks may be fractional. Returns each phase with
// start and end dates when a start date is known. A phase starts the day the
// previous one ends.
export function parsePhases(text, startDate) {
  const rows = [];
  const problems = [];
  let cursor = parseDate(startDate) ? String(startDate).trim() : null;
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.lastIndexOf("|");
    const name = (bar >= 0 ? line.slice(0, bar) : line).trim();
    const weeks = bar >= 0 ? parseNum(line.slice(bar + 1).replace(/weeks?/i, "")) : null;
    if (!name || weeks === null || weeks <= 0) { problems.push(`Phase "${line}" needs a name and a number of weeks, like: Design | 2`); continue; }
    const row = { name, weeks, start: cursor, end: null };
    if (cursor) { row.end = addDays(cursor, Math.round(weeks * 7)); cursor = row.end; }
    rows.push(row);
  }
  const totalWeeks = rows.reduce((a, r) => a + r.weeks, 0);
  return { rows, problems, totalWeeks, finish: rows.length && cursor ? cursor : null };
}

export function validUntil(inp) {
  const base = String(inp.proposalDate ?? "").trim();
  const n = parseNum(inp.validDays);
  if (!parseDate(base) || n === null) return null;
  return addDays(base, Math.round(n));
}

// Deposit and balance for each option, cents-exact (balance absorbs rounding).
export function optionTerms(raw) {
  const inp = { ...DEFAULTS, ...raw };
  const dep = Math.min(parseNum(inp.depositPct) ?? 0, 100);
  return parseOptions(inp.options).rows.map((o) => {
    const deposit = Math.round((o.cents * dep) / 100);
    return { ...o, deposit, balance: o.cents - deposit };
  });
}

// How far each option sits from the middle one, so the writer can see the
// anchoring: a top option that is 1.5-2x the middle makes the middle easy to say yes to.
export function ladder(raw) {
  const rows = optionTerms(raw);
  if (rows.length < 2) return [];
  const sorted = [...rows].sort((a, b) => a.cents - b.cents);
  const mid = sorted[Math.floor((sorted.length - 1) / 2)];
  return sorted.map((o) => ({ name: o.name, cents: o.cents, vsMidPct: Math.round(((o.cents - mid.cents) / mid.cents) * 100) }));
}

// Private to the freelancer, never printed. Price over your own hours estimate
// for each option, in the order the options were typed, against a target rate.
export function rateCheck(raw) {
  const inp = { ...DEFAULTS, ...raw };
  const target = parseCents(inp.targetRate);
  const hours = String(inp.hours ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => parseNum(l.replace(/\s*h(ours?|rs?)?$/i, "")));
  return parseOptions(inp.options).rows.map((o, i) => {
    const h = hours[i] && hours[i] > 0 ? hours[i] : null;
    const rate = h ? Math.round(o.cents / h) : null;
    const below = rate !== null && target !== null && target > 0 && rate < target;
    return { name: o.name, cents: o.cents, hours: h, rate, belowTarget: below, floorCents: h && target ? Math.round(h * target) : null };
  });
}

export function check(raw) {
  const inp = { ...DEFAULTS, ...raw };
  const issues = [];
  if (!String(inp.contractor).trim()) issues.push("Add your name or business name.");
  if (!String(inp.client).trim()) issues.push("Add the client's name.");
  if (!String(inp.title).trim()) issues.push("Give the proposal a title the client would recognise.");
  if (!String(inp.problem).trim()) issues.push("Say in a few sentences what the client is trying to fix or achieve. A proposal that starts with you instead of their problem reads as a quote.");
  if (!lines(inp.deliverables).length) issues.push("List at least one deliverable.");
  const opts = parseOptions(inp.options);
  issues.push(...opts.problems);
  if (!opts.rows.length && !opts.problems.length) issues.push("Add at least one priced option.");
  const ph = parsePhases(inp.phases, inp.startDate);
  issues.push(...ph.problems);
  if (inp.startDate && !parseDate(inp.startDate)) issues.push("Start date should be a real date.");
  if (inp.proposalDate && !parseDate(inp.proposalDate)) issues.push("Proposal date should be a real date.");
  const dep = parseNum(inp.depositPct);
  if (dep !== null && dep > 100) issues.push("Deposit is more than 100%.");
  if (String(inp.targetRate).trim() && parseCents(inp.targetRate) === null) issues.push("Target hourly rate should be a number.");
  return issues;
}

// What tends to lose or under-price a proposal. Shown beside the draft.
export function reviewNotes(raw) {
  const inp = { ...DEFAULTS, ...raw };
  const notes = [];
  const opts = parseOptions(inp.options).rows;
  if (opts.length === 1) notes.push("One option means the client's only choice is yes or no. Offering three (a smaller, a standard and a fuller scope) turns the question into which one, and the middle usually wins.");
  if (opts.length > 4) notes.push("More than four options makes the client compare instead of decide. Three is plenty.");
  if (opts.length >= 2) {
    const l = ladder(inp);
    const top = l[l.length - 1];
    if (top.vsMidPct < 25) notes.push("Your options are priced close together, so the choice is about price rather than scope. Make the top one clearly bigger.");
  }
  if (!validUntil(inp)) notes.push("Set a proposal date and a validity period. An expiry date gives the client a reason to answer this week, and protects you if your rates or calendar change.");
  if (!parsePhases(inp.phases, inp.startDate).rows.length) notes.push("No timeline: clients read a missing schedule as a risk. Add two or three phases with weeks.");
  if (!String(inp.whyMe).trim()) notes.push("One or two lines on why you, ideally a similar past result, do more than a long bio.");
  if (!String(inp.assumptions).trim()) notes.push("List assumptions (for example, content supplied by the client, two revision rounds). They are where scope creep starts.");
  if ((parseNum(inp.depositPct) ?? 0) === 0) notes.push("No deposit: asking for one at acceptance filters out clients who were never going to start.");
  const m = (c) => formatMoney(c, inp.currency);
  for (const r of rateCheck(inp)) {
    if (r.belowTarget) notes.push(`${r.name} works out to ${m(r.rate)} an hour on your own estimate, under your ${m(parseCents(inp.targetRate))} target. To reach the target it would need to cost at least ${m(r.floorCents)}. This check is private and is not in the proposal.`);
  }
  return notes;
}

const lines = (text) => String(text ?? "").split("\n").map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Returns [{ title, body: [paragraph strings] }]. Deterministic; no model.
export function buildProposal(raw) {
  const inp = { ...DEFAULTS, ...raw };
  const cur = inp.currency;
  const m = (c) => formatMoney(c, cur);
  const contractor = String(inp.contractor).trim() || "[Your name]";
  const client = String(inp.client).trim() || "[Client]";
  const sections = [];
  const add = (title, ...body) => sections.push({ title, body: body.flat().filter(Boolean) });

  add("Overview",
    `Prepared for ${client} by ${contractor}${inp.proposalDate && parseDate(inp.proposalDate) ? `, ${formatDate(inp.proposalDate)}` : ""}.`);

  if (String(inp.problem).trim()) add("What you are trying to achieve", String(inp.problem).trim());
  if (String(inp.approach).trim()) add("How I would approach it", String(inp.approach).trim());

  const dl = lines(inp.deliverables);
  if (dl.length) add("What you get", ...dl.map((d) => `  - ${d}`));

  const ph = parsePhases(inp.phases, inp.startDate);
  if (ph.rows.length) {
    add("Timeline",
      ...ph.rows.map((r) => `  - ${r.name}: ${plural(r.weeks, "week")}${r.start ? `, ${formatDate(r.start)} to ${formatDate(r.end)}` : ""}`),
      `Total: ${plural(ph.totalWeeks, "week")}${ph.finish ? `, finishing around ${formatDate(ph.finish)}` : ""}.`);
  }

  const opts = optionTerms(inp);
  if (opts.length) {
    const dep = Math.min(parseNum(inp.depositPct) ?? 0, 100);
    add(opts.length === 1 ? "Investment" : "Your options",
      ...opts.map((o, i) => `${opts.length === 1 ? "" : `Option ${String.fromCharCode(65 + i)}: `}${o.name}: ${m(o.cents)}${o.includes ? `\n  ${o.includes}` : ""}${dep > 0 ? `\n  ${m(o.deposit)} on acceptance, ${m(o.balance)} on delivery.` : ""}`),
      `Invoices are due ${parseNum(inp.payDays) === 0 ? "on receipt" : `within ${parseNum(inp.payDays) ?? 14} days`}.`);
  }

  if (lines(inp.assumptions).length) add("Assumptions", ...lines(inp.assumptions).map((a) => `  - ${a}`));
  if (String(inp.whyMe).trim()) add("Why me", String(inp.whyMe).trim());

  const until = validUntil(inp);
  add("Next steps",
    `1. Reply to choose an option${until ? ` by ${formatDate(until)}, when these prices and dates expire` : ""}.`,
    "2. I send a short service agreement for you to sign.",
    `3. ${(parseNum(inp.depositPct) ?? 0) > 0 ? "You pay the deposit invoice and I" : "I"} confirm the start date${ph.rows[0]?.start ? ` (${formatDate(ph.rows[0].start)})` : ""}.`,
    String(inp.contact).trim() ? `Questions: ${String(inp.contact).trim()}` : "");
  return sections;
}

export function proposalText(title, sections) {
  return `${title}\n\n` + sections.map((s) => `${s.title}\n\n${s.body.join("\n\n")}`).join("\n\n\n") + "\n";
}

// Fields for Freelance Contract Maker once the client picks option `index`.
// Carries only what the proposal already says; the private hours and target
// rate never leave this page. Returns null when that option does not exist.
export function contractHandoff(raw, index) {
  const inp = { ...DEFAULTS, ...raw };
  const o = optionTerms(inp)[index];
  if (!o) return null;
  const items = lines(inp.deliverables);
  const chosen = `${o.name}${o.includes ? `: ${o.includes}` : ""}`;
  return {
    contractor: String(inp.contractor).trim(),
    client: String(inp.client).trim(),
    effective: parseDate(inp.startDate) ? String(inp.startDate).trim() : "",
    project: String(inp.title).trim(),
    deliverables: [chosen, ...items].join("\n"),
    feeType: "fixed",
    amount: o.cents % 100 === 0 ? String(o.cents / 100) : (o.cents / 100).toFixed(2),
    currency: inp.currency,
    depositPct: String(inp.depositPct),
    payDays: String(inp.payDays),
  };
}

export function contractHandoffHash(raw, index) {
  const f = contractHandoff(raw, index);
  return f ? "#handoff=" + encodeURIComponent(JSON.stringify(f)) : null;
}

// The deposit invoice for an accepted option, for Invoice Maker. Same rules as
// the contract hand-off: text only, in the URL fragment, whitelisted on arrival.
export function invoiceHandoffHash(raw, index = 0) {
  const inp = { ...DEFAULTS, ...raw };
  const opt = optionTerms(inp)[index];
  if (!opt) return null;
  const title = String(inp.title).trim() || "Project";
  const dep = Math.min(parseNum(inp.depositPct) ?? 0, 100);
  const payDays = Math.max(0, Math.floor(parseNum(inp.payDays) ?? 14));
  const cents = opt.deposit > 0 ? opt.deposit : opt.cents;
  const invoice = {
    fromName: inp.contractor, clientName: inp.client, currency: inp.currency, terms: "custom", customDays: String(payDays),
    lines: [{ desc: `${title}: ${opt.name}${opt.deposit > 0 ? `, ${dep}% deposit` : ""}`, qty: 1, rate: (cents / 100).toFixed(2) }],
    notes: opt.deposit > 0 ? `Deposit for the accepted proposal "${title}", option ${opt.name}. Balance of ${(opt.balance / 100).toFixed(2)} ${inp.currency} is due on delivery.` : `Accepted proposal "${title}", option ${opt.name}.`,
  };
  return "#handoff=" + encodeURIComponent(JSON.stringify({ v: 1, from: "freelance-proposal-maker", invoice }));
}

// Reads "#handoff=<json>" as written by Freelance Lead Tracker. Only known text
// fields are taken, as capped strings; anything else in the link is ignored.
// Returns null when the hash carries no usable lead hand-off.
const LEAD_FIELDS = ["client", "contact", "problem", "currency"];
export function parseLeadHandoff(hash) {
  const m = /^#?handoff=(.+)$/.exec(String(hash ?? ""));
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || obj.from !== "freelance-lead-tracker") return null;
  const src = obj.proposal;
  if (!src || typeof src !== "object" || Array.isArray(src)) return null;
  const out = {};
  for (const k of LEAD_FIELDS) if (typeof src[k] === "string" && src[k].trim()) out[k] = src[k].slice(0, 4000);
  if (out.currency !== undefined && !(out.currency in CURRENCIES)) delete out.currency;
  return Object.keys(out).length ? out : null;
}
