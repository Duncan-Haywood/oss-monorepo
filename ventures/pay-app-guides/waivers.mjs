// Lien waiver log: the waivers a subcontractor gives up the chain and collects from its own
// suppliers and lower-tier subs, matched conditional to unconditional, with the risky ones flagged.
// Pure functions, no I/O. Money is integer cents; dates are whole UTC days (from colog.mjs).
// It checks the log's own consistency. It does not decide what any state's law requires.

import { parseCsv, parseMoney, parseDate, dayText, dollars, csvCell } from "./colog.mjs";

const HEADERS = {
  direction: /^(direction|given or received|given\/received|in\/out|way|flow)$/,
  party: /^(party|from|to|from\/to|vendor|supplier|sub|subcontractor|customer|gc|company|name|claimant|owner\/gc)$/,
  type: /^(type|waiver type|waiver|form|kind)$/,
  through: /^(through|through date|thru|thru date|period( end)?|work through|period through)$/,
  amount: /^(amount|waiver amount|payment amount|\$|amount \(\$\)|value)$/,
  signed: /^(signed|date signed|sent|date sent|received date|date received|dated|date)$/,
  paid: /^(paid|date paid|payment cleared|cleared|funds cleared|payment date|payment received|date cleared)$/,
  paidAmount: /^(paid amount|amount paid|payment|cleared amount|amount received)$/,
  payApp: /^(pay app|pay app #|pay app no\.?|application|application no\.?|app #|invoice|invoice #|ref(erence)?)$/,
};

function mapHeaders(row) {
  const idx = {};
  row.forEach((h, i) => {
    const t = String(h).trim().toLowerCase().replace(/\s+/g, " ");
    for (const [k, re] of Object.entries(HEADERS)) if (idx[k] == null && re.test(t)) { idx[k] = i; break; }
  });
  return idx;
}

// "given" = you signed it for the GC or owner; "received" = a supplier or lower-tier sub signed it for you.
export function normDirection(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "") return null;
  if (/^(given|gave|out|outgoing|sent|to gc|to owner|ours|mine|us|upstream|issued)$/.test(t)) return "given";
  if (/^(received|in|incoming|collected|from sub|from supplier|lower tier|lower-tier|theirs|downstream|vendor)$/.test(t)) return "received";
  return undefined;
}

// "Conditional progress", "unconditional final", "CP", "UF", "conditional waiver on final payment" ...
export function normType(s) {
  const t = String(s ?? "").trim().toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  if (t === "") return null;
  const short = { cp: ["conditional", "progress"], up: ["unconditional", "progress"], cf: ["conditional", "final"], uf: ["unconditional", "final"] }[t.replace(/ /g, "")];
  if (short) return { condition: short[0], stage: short[1] };
  const condition = /\bunconditional\b/.test(t) ? "unconditional" : /\bconditional\b/.test(t) ? "conditional" : null;
  const stage = /\bfinal\b/.test(t) ? "final" : /\b(progress|partial|interim)\b/.test(t) ? "progress" : null;
  if (!condition || !stage) return undefined;
  return { condition, stage };
}

const key = (x) => `${x.direction}|${x.party.toLowerCase()}|${x.stage}|${x.through ?? ""}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * @param {string} text CSV or tab-separated waiver log with a header row
 * @param {{asOf?: string, chaseDays?: string|number, nextThrough?: string}} settings
 */
export function compute(text, settings = {}) {
  const out = { lines: [], errors: [], findings: [], totals: null, toCollect: [] };
  const grid = parseCsv(text);
  if (grid.length < 2) { out.errors.push("Paste a header row and at least one waiver."); return out; }
  const idx = mapHeaders(grid[0]);
  for (const [k, msg] of [["direction", "No direction column. Name a column 'Direction' (given or received)."], ["party", "No party column. Name a column 'Party' (who the waiver is to or from)."], ["type", "No type column. Name a column 'Type' (conditional or unconditional, progress or final)."], ["amount", "No amount column. Name a column 'Amount'."]]) {
    if (idx[k] == null) { out.errors.push(msg); return out; }
  }
  const asOf = settings.asOf ? parseDate(settings.asOf) : Math.floor(Date.now() / 86400000);
  if (asOf == null) { out.errors.push("As-of date must be YYYY-MM-DD or M/D/YYYY."); return out; }
  // Digits only: Number() read " " as 0 and "1e1" as 10 (red team 2026-11-25).
  const chaseRaw = String(settings.chaseDays ?? "").trim();
  const chase = chaseRaw === "" ? 10 : /^\d+$/.test(chaseRaw) ? Number(chaseRaw) : NaN;
  if (!Number.isInteger(chase) || chase < 0 || chase > 365) { out.errors.push("Days to wait before chasing an unconditional waiver must be a whole number from 0 to 365."); return out; }
  const nextThrough = settings.nextThrough ? parseDate(settings.nextThrough) : undefined;
  if (nextThrough === null) { out.errors.push("Next pay app's through date must be YYYY-MM-DD or M/D/YYYY."); return out; }

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r], get = (k) => (idx[k] == null ? "" : String(row[idx[k]] ?? "").trim());
    const party = get("party"), payApp = get("payApp");
    const label = `Row ${r + 1}${party ? ` (${party}${payApp ? `, ${payApp}` : ""})` : ""}`;
    const direction = normDirection(get("direction"));
    if (direction == null) { out.errors.push(`${label}: direction ${direction === null ? "is blank" : `"${get("direction")}" is not given or received`}.`); continue; }
    if (!party) { out.errors.push(`${label}: party is blank.`); continue; }
    const type = normType(get("type"));
    if (type == null) { out.errors.push(`${label}: type ${type === null ? "is blank" : `"${get("type")}" must say conditional or unconditional, and progress or final`}.`); continue; }
    const amount = parseMoney(get("amount"));
    if (amount == null || amount < 0) { out.errors.push(`${label}: amount is not a dollar figure of zero or more.`); continue; }
    const paidRaw = get("paidAmount"), paidAmount = paidRaw === "" ? undefined : parseMoney(paidRaw);
    // A negative paid amount once passed and inflated "the waiver gives up" (red team 2026-11-26).
    if (paidAmount === null || paidAmount < 0) { out.errors.push(`${label}: paid amount is not a dollar figure of zero or more.`); continue; }
    const dates = {};
    let bad = false;
    for (const k of ["through", "signed", "paid"]) {
      dates[k] = parseDate(get(k));
      if (dates[k] === null) { out.errors.push(`${label}: ${k} date must be YYYY-MM-DD or M/D/YYYY.`); bad = true; break; }
    }
    if (bad) continue;
    out.lines.push({ row: r + 1, label, direction, party, payApp, ...type, amount, paidAmount, ...dates, match: null });
  }
  if (out.errors.length) return out;
  if (!out.lines.length) { out.errors.push("No waivers found."); return out; }

  // Pair each conditional with the unconditional for the same party, direction, stage and through date.
  const uncond = new Map();
  for (const x of out.lines) if (x.condition === "unconditional") uncond.set(key(x), [...(uncond.get(key(x)) ?? []), x]);
  for (const x of out.lines) if (x.condition === "conditional") { const u = uncond.get(key(x)); if (u && u.length) x.match = u[0]; }

  const F = (severity, title) => out.findings.push({ severity, title });
  const G = out.lines.filter((x) => x.direction === "given"), R = out.lines.filter((x) => x.direction === "received");

  // Waivers you gave.
  for (const x of G.filter((x) => x.condition === "unconditional")) {
    const what = `${x.label}: unconditional ${x.stage} waiver of ${dollars(x.amount)}`;
    if (x.paid === undefined) F("high", `${what} given, but no date the payment cleared. An unconditional waiver gives up lien rights for that amount whether or not you are paid. If the money has not cleared, ask to swap it for a conditional waiver; if it has, record the date.`);
    else if (x.signed !== undefined && x.signed < x.paid) F("high", `${what} signed ${dayText(x.signed)}, before the payment cleared on ${dayText(x.paid)}. Sign unconditional waivers only after the funds clear.`);
    if (x.paidAmount !== undefined && x.paidAmount < x.amount) F("high", `${what}, but only ${dollars(x.paidAmount)} was paid. The waiver gives up ${dollars(x.amount - x.paidAmount)} you have not received.`);
  }
  for (const x of G.filter((x) => x.condition === "conditional")) {
    if (x.paid !== undefined && !x.match) F("info", `${x.label}: payment cleared ${dayText(x.paid)} on a conditional ${x.stage} waiver through ${dayText(x.through) || "(no date)"}. The GC will usually ask for the matching unconditional waiver next; it is safe to give now the funds have cleared.`);
    if (x.match && x.match.amount !== x.amount) F("info", `${x.label}: the unconditional waiver for this period is ${dollars(x.match.amount)} against ${dollars(x.amount)} on the conditional. An unconditional should state the amount actually paid; check which is right.`);
  }

  // Waivers you collected (or still need) from your own suppliers and lower-tier subs.
  for (const x of R.filter((x) => x.condition === "conditional" && x.paid !== undefined && !x.match)) {
    const waited = asOf - x.paid;
    const msg = `${x.label}: you paid on their conditional ${x.stage} waiver through ${dayText(x.through) || "(no date)"} on ${dayText(x.paid)} (${plural(waited, "day")} ago) and hold no unconditional waiver for it.`;
    if (waited > chase) F("high", `${msg} Until you do, they can still claim a lien for that amount on the job. Ask for it now.`);
    else F("info", `${msg} Collect it once their bank clears your payment.`);
    out.toCollect.push({ party: x.party, what: `unconditional ${x.stage} waiver through ${dayText(x.through) || "(no date)"}, ${dollars(x.paidAmount ?? x.amount)}`, overdue: waited > chase });
  }
  for (const x of R.filter((x) => x.condition === "unconditional" && x.paid === undefined)) F("info", `${x.label}: you hold their unconditional ${x.stage} waiver but no date you paid it. Record the payment so the log shows what it covers.`);

  // Log hygiene, both directions.
  const seen = new Map();
  for (const x of out.lines) { const k = `${key(x)}|${x.condition}`; seen.set(k, [...(seen.get(k) ?? []), x]); }
  for (const xs of seen.values()) if (xs.length > 1) F("info", `${xs[0].party}: ${xs.length} ${xs[0].condition} ${xs[0].stage} waivers ${xs[0].direction} through ${dayText(xs[0].through) || "(no date)"} (rows ${xs.map((x) => x.row).join(", ")}). If one replaces another, delete the old row.`);
  for (const x of out.lines) if (x.through === undefined && x.stage === "progress") F("info", `${x.label}: progress waiver with no through date. A progress waiver covers work up to a date; without it the waiver cannot be matched or checked.`);
  // A conditional is often signed a few days before the period ends, with the pay app; an unconditional should not be.
  for (const x of out.lines) if (x.condition === "unconditional" && x.through !== undefined && x.signed !== undefined && x.through > x.signed) F("info", `${x.label}: unconditional waiver through ${dayText(x.through)}, signed earlier, on ${dayText(x.signed)}. That waives work not yet done; check the date.`);
  const finals = new Map();
  for (const x of out.lines.filter((x) => x.stage === "final")) finals.set(`${x.direction}|${x.party.toLowerCase()}`, x);
  for (const x of out.lines.filter((x) => x.stage === "progress")) {
    const f = finals.get(`${x.direction}|${x.party.toLowerCase()}`);
    if (f && f.signed !== undefined && x.signed !== undefined && x.signed > f.signed) F("info", `${x.label}: progress waiver signed after a final waiver (row ${f.row}). A final waiver normally ends the waivers for that job; check whether work or retainage is still owed.`);
  }

  // What the next pay application's waiver package needs.
  if (nextThrough !== undefined) {
    const parties = [...new Map(R.map((x) => [x.party.toLowerCase(), x.party])).values()];
    const finalDone = (p) => R.some((x) => x.party.toLowerCase() === p.toLowerCase() && x.stage === "final");
    for (const p of parties) {
      if (finalDone(p)) continue;
      const has = R.some((x) => x.party.toLowerCase() === p.toLowerCase() && x.condition === "conditional" && x.through !== undefined && x.through >= nextThrough);
      if (!has) out.toCollect.push({ party: p, what: `conditional progress waiver through ${dayText(nextThrough)}`, overdue: false });
    }
  }

  const sum = (xs) => xs.reduce((a, x) => a + x.amount, 0);
  const riskyGiven = G.filter((x) => x.condition === "unconditional" && (x.paid === undefined || (x.signed !== undefined && x.signed < x.paid) || (x.paidAmount !== undefined && x.paidAmount < x.amount)));
  const missingUncond = R.filter((x) => x.condition === "conditional" && x.paid !== undefined && !x.match);
  out.totals = {
    asOf, chase, nextThrough,
    given: G.length, received: R.length,
    riskyGivenCount: riskyGiven.length, riskyGivenAmount: sum(riskyGiven),
    awaitingGiveCount: G.filter((x) => x.condition === "conditional" && x.paid !== undefined && !x.match).length,
    missingUncondCount: missingUncond.length,
    missingUncondAmount: missingUncond.reduce((a, x) => a + (x.paidAmount ?? x.amount), 0),
    overdueCount: missingUncond.filter((x) => asOf - x.paid > chase).length,
    unpaidConditionalGiven: sum(G.filter((x) => x.condition === "conditional" && x.paid === undefined)),
  };
  out.findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  return out;
}

export function statusText(x) {
  if (x.condition === "unconditional") return x.paid === undefined ? "no payment recorded" : "final word on this amount";
  if (x.match) return x.match.paid === undefined ? "unconditional given, payment not recorded" : "swapped for unconditional";
  return x.paid === undefined ? "waiting for payment" : x.direction === "given" ? "paid: unconditional due" : "paid: collect unconditional";
}

const cents = (c) => (c == null ? "" : (c / 100).toFixed(2));

// Every cell goes through csvCell (colog.mjs), the formula-injection guard: a cell starting =, +, -, @, tab or CR
// that is not a plain number gets a leading apostrophe (tested in waivers.test.mjs).
export function logCsv(result) {
  const head = ["Direction", "Party", "Pay app", "Type", "Through", "Amount", "Signed", "Paid", "Paid amount", "Status"];
  const rows = result.lines.map((x) => [x.direction, x.party, x.payApp, `${x.condition} ${x.stage}`, dayText(x.through), cents(x.amount), dayText(x.signed), dayText(x.paid), cents(x.paidAmount), statusText(x)].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}

export function summaryText(result, s = {}) {
  const t = result.totals;
  if (!t) return "";
  const L = (k, v) => `${k.padEnd(46)}${String(v).padStart(16)}`;
  return [
    s.project ? `Lien waiver log: ${s.project}` : "Lien waiver log",
    `As of ${dayText(t.asOf)}`,
    "",
    L("Waivers given / received", `${t.given} / ${t.received}`),
    L("Unconditional given without cleared payment", `${t.riskyGivenCount} / ${dollars(t.riskyGivenAmount)}`),
    L("Conditional given, paid, unconditional due", String(t.awaitingGiveCount)),
    L("Conditional given, still waiting for payment", dollars(t.unpaidConditionalGiven)),
    L("Paid lower tier, no unconditional held", `${t.missingUncondCount} / ${dollars(t.missingUncondAmount)}`),
    L(`  of which older than ${t.chase} days`, String(t.overdueCount)),
  ].join("\n");
}

// A short, plain request a subcontractor can send its supplier or lower-tier sub.
export function requestText(result, s = {}) {
  if (!result.toCollect.length) return "";
  const by = new Map();
  for (const c of result.toCollect) by.set(c.party, [...(by.get(c.party) ?? []), c.what]);
  return [...by].map(([party, items]) => [
    `To: ${party}`,
    `Re: lien waivers${s.project ? ` for ${s.project}` : ""}`,
    "",
    "Please send the following lien waiver(s), on the form the job requires:",
    ...items.map((w) => `- ${w}`),
    "",
    "Thank you.",
  ].join("\n")).join("\n\n----\n\n");
}

export const SAMPLE_SETTINGS = { project: "Example Office Renovation", asOf: "2026-11-25", chaseDays: "10", nextThrough: "2026-11-30" };
export function sampleLog() {
  return [
    "Direction,Party,Pay app,Type,Through,Amount,Signed,Paid,Paid amount",
    "Given,Apex Builders (GC),7,Conditional progress,2026-09-30,48200,2026-09-28,2026-10-24,48200",
    "Given,Apex Builders (GC),7,Unconditional progress,2026-09-30,48200,2026-10-27,2026-10-24,48200",
    "Given,Apex Builders (GC),8,Conditional progress,2026-10-31,51750,2026-10-29,,",
    "Given,Apex Builders (GC),8,Unconditional progress,2026-10-31,51750,2026-11-20,,",
    "Received,Metro Electrical Supply,7,Conditional progress,2026-09-30,12400,2026-09-26,2026-10-28,12400",
    "Received,Metro Electrical Supply,7,Unconditional progress,2026-09-30,12400,2026-11-04,2026-10-28,12400",
    "Received,Metro Electrical Supply,8,Conditional progress,2026-10-31,9850,2026-10-27,2026-11-05,9850",
    "Received,Ridge Low Voltage LLC,8,Conditional progress,2026-10-31,6300,2026-10-28,2026-11-23,6300",
  ].join("\n");
}
