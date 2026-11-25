// Contractor's sworn statement: every subcontractor, supplier and laborer on a job, what each
// was contracted for, what each has been paid, what each is owed now, and what is left.
//
// Illinois (770 ILCS 60/5) has the contractor give the owner a sworn statement of everyone who
// furnished labor or materials and the amounts due or to become due to each before the owner
// pays. Michigan (MCL 570.1110) has the contractor give one to the owner or lessee when payment
// is due or requested, and a subcontractor give one to the contractor, listing each
// subcontractor, supplier and laborer with the type of improvement, total contract price,
// amount already paid, amount currently owing, balance to complete (optional), and unpaid
// wages and fringe benefits. Title companies and lenders ask for the same table in other
// states. This module builds that table and checks it adds up; it does not supply the
// statutory wording or the oath, which the page links.
//
// Pure functions, no I/O. Money is integer cents.
import { fmt, csvCell } from "./calc.mjs";
import { parseCsv, parseMoney } from "./colog.mjs";

// The worked example on sworn-statement.html: a $480,000 electrical subcontract.
export const EXAMPLE = `Name,Address,Type of work,Contract price,Change orders,Retainage,Amount paid,Amount owing
Own forces (labor and profit),,Electrical labor; overhead and profit,268000,12000,5600,40000,10400
Valley Electric Supply,"120 Mill Rd, Springfield",Wire and gear,150000,0,7500,45000,22500
Lowvolt Systems LLC,"8 Oak St, Springfield",Fire alarm,50000,0,0,0,0`;

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Header words -> field. First match wins, so the more specific patterns come first.
const HEADERS = [
  ["phone", /phone|tel/],
  ["address", /address|addr/],
  ["name", /name/],
  ["balance", /balance/], // computed here, so a pasted balance column is read and ignored
  ["fringe", /fringe|withholding/],
  ["wages", /wage|laborer/],
  ["retainage", /retain|retention|holdback/],
  ["changes", /change|^adjustments?$|^c\.?o\.?s?$/],
  ["completed", /complet|earned|work to date/],
  ["owing", /owing|owed|due|this (period|draw|request)|current/],
  ["paid", /paid|previous/],
  ["contract", /contract|price|amount|subcontract/],
  ["work", /type|work|trade|scope|improvement|description/],
  ["name", /name|sub|supplier|vendor|company|party/],
];

export function parseSworn(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { lines: [], errors: ["Paste a list with a header row: name, type of work, contract price, amount paid, amount owing."] };
  const cols = {};
  rows[0].forEach((h, i) => {
    const n = norm(h);
    for (const [key, re] of HEADERS) {
      if (re.test(n)) { if (cols[key] === undefined) cols[key] = i; break; }
    }
  });
  const errors = [];
  for (const [key, label] of [["name", "name"], ["contract", "contract price"]]) {
    if (cols[key] === undefined) errors.push(`No "${label}" column found in the header row.`);
  }
  if (errors.length) return { lines: [], errors };
  const lines = [];
  for (const r of rows.slice(1)) {
    const get = (k) => (cols[k] === undefined ? "" : (r[cols[k]] ?? "").trim());
    if (/^totals?$/i.test(get("name"))) continue;
    lines.push({ name: get("name"), address: get("address"), phone: get("phone"), work: get("work"), contract: get("contract"), changes: get("changes"), completed: get("completed"), retainage: get("retainage"), paid: get("paid"), owing: get("owing"), wages: get("wages"), fringe: get("fringe") });
  }
  return { lines, errors };
}

const MONEY = ["contract", "changes", "completed", "retainage", "paid", "owing", "wages", "fringe"];
const LABEL = { contract: "contract price", changes: "change orders", completed: "completed to date", retainage: "retainage", paid: "amount paid", owing: "amount owing", wages: "unpaid wages", fringe: "unpaid fringe benefits" };

// lines: [{ name, address, phone, work, contract, changes, completed, retainage, paid, owing, wages, fringe }]
// settings: { contractSum, requested, state: "IL" | "MI" | "other" }
//   contractSum: your own contract with the owner (or the GC), change orders in.
//   requested: what this pay application asks for this period.
// Returns { errors, findings: [{ level, text }], rows, totals, waivers }.
export function swornStatement(lines, settings = {}) {
  const errors = [];
  const findings = [];
  const add = (level, text) => findings.push({ level, text });
  const state = String(settings.state ?? "other").toUpperCase();
  const contractSum = String(settings.contractSum ?? "").trim() === "" ? null : parseMoney(settings.contractSum);
  const requested = String(settings.requested ?? "").trim() === "" ? null : parseMoney(settings.requested);
  // parseMoney gives null for text that is not a number; blank means "not given".
  const given = (v) => String(v ?? "").trim() !== "";
  if (given(settings.contractSum) && (contractSum === null || contractSum < 0)) errors.push("Your contract sum must be a number, zero or more.");
  if (given(settings.requested) && (requested === null || requested < 0)) errors.push("The amount requested this period must be a number, zero or more.");
  if (!lines.length) errors.push("List at least one subcontractor, supplier or your own forces.");

  const rows = [];
  lines.forEach((l, i) => {
    const who = l.name?.trim() || `Row ${i + 2}`;
    if (!l.name?.trim()) errors.push(`${who}: name is missing.`);
    const v = {};
    for (const k of MONEY) {
      v[k] = parseMoney(l[k]);
      if (v[k] === null) { errors.push(`${who}: ${LABEL[k]} "${l[k]}" is not a number.`); v[k] = 0; }
      else if (v[k] < 0 && k !== "changes") { errors.push(`${who}: ${LABEL[k]} cannot be negative.`); v[k] = 0; }
    }
    const adjusted = v.contract + v.changes;
    const completedGiven = String(l.completed ?? "").trim() !== "";
    const completed = completedGiven ? v.completed : v.paid + v.owing + v.retainage;
    const balance = adjusted - v.paid - v.owing; // left to pay, retainage included
    const toFinish = adjusted - completed; // work not yet done
    rows.push({ name: l.name?.trim() ?? "", address: l.address?.trim() ?? "", phone: l.phone?.trim() ?? "", work: l.work?.trim() ?? "", ...v, adjusted, completed, balance, toFinish });

    if (adjusted < 0) add("high", `${who}: change orders take the contract below zero.`);
    if (v.paid + v.owing > adjusted) add("high", `${who}: paid plus owing (${fmt(v.paid + v.owing)}) is more than the contract with change orders (${fmt(adjusted)}). A change order is missing from the list, or the amounts are wrong; a statement showing more paid than contracted will be questioned.`);
    if (completedGiven && completed - v.retainage !== v.paid + v.owing) add("medium", `${who}: completed to date less retainage is ${fmt(completed - v.retainage)}, but paid plus owing is ${fmt(v.paid + v.owing)}. They should match: what is earned net of retainage is either paid already or owing now.`);
    if (completedGiven && completed > adjusted) add("high", `${who}: completed to date is more than the contract with change orders.`);
    if (v.retainage > completed) add("medium", `${who}: retainage held is more than the work completed.`);
    if (!l.address?.trim() && !/\b(own forces|self|our own|contractor)\b/i.test(l.name ?? "")) add("medium", `${who}: no address. Both the Illinois and Michigan statutes ask for each party's address${state === "MI" ? "; Michigan's form also has a phone number column" : ""}.`);
    if (state === "MI" && !l.work?.trim()) add("low", `${who}: no type of improvement. Michigan's form has a column for it.`);
    if (v.wages > 0 || v.fringe > 0) add("low", `${who}: unpaid wages ${fmt(v.wages)}, fringe benefits and withholdings ${fmt(v.fringe)}. Michigan's form lists these in their own columns; an owner can pay laborers directly from what it withholds.`);
  });
  if (errors.length) return { errors, findings: [], rows: [], totals: null, waivers: [] };

  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const totals = Object.fromEntries(["contract", "changes", "adjusted", "completed", "retainage", "paid", "owing", "balance", "wages", "fringe"].map((k) => [k, sum(k)]));

  const names = new Map();
  for (const r of rows) {
    const k = norm(r.name);
    names.set(k, (names.get(k) ?? 0) + 1);
  }
  for (const [k, n] of names) if (n > 1) add("low", `"${rows.find((r) => norm(r.name) === k).name}" is listed ${n} times. Fine for separate contracts; otherwise combine the rows so the totals per party are clear.`);

  if (contractSum !== null) {
    const gap = contractSum - totals.adjusted;
    if (gap > 0) add("medium", `The rows add up to ${fmt(totals.adjusted)}, ${fmt(gap)} less than your contract sum of ${fmt(contractSum)}. Most sworn statements carry a row for the contractor's own work, overhead and profit so the total equals the contract; add one, or list the party that is missing. A lender or title company will ask.`);
    if (gap < 0) add("high", `The rows add up to ${fmt(totals.adjusted)}, ${fmt(-gap)} more than your contract sum of ${fmt(contractSum)}. Either your contract sum is missing a change order, or you have committed more to subs and suppliers than the job pays you.`);
  }
  if (requested !== null) {
    if (totals.owing > requested) add("high", `You owe ${fmt(totals.owing)} on this statement but this pay application asks for ${fmt(requested)}. In Michigan the owner may withhold, and must on the contractor's written demand, enough to pay the amounts shown, so asking for less than you owe will be noticed; under Illinois' statute an owner who pays without keeping back enough for the listed claims risks paying twice.`);
    if (totals.owing < requested) add("medium", `This pay application asks for ${fmt(requested)} but the statement shows ${fmt(totals.owing)} owing. Usually the difference is your own forces' share; add it as a row so the statement matches the request.`);
  }

  const waivers = rows
    .filter((r) => !/\b(own forces|self|our own)\b/i.test(r.name))
    .flatMap((r) => [
      r.paid > 0 ? { name: r.name, kind: "unconditional", amount: r.paid, text: `${r.name}: unconditional waiver through the ${fmt(r.paid)} already paid` } : null,
      r.owing > 0 ? { name: r.name, kind: "conditional", amount: r.owing, text: `${r.name}: conditional waiver for the ${fmt(r.owing)} owing now (becomes unconditional once paid)` } : null,
    ])
    .filter(Boolean);

  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  return { errors, findings, rows, totals, waivers };
}

// csvCell (calc.mjs) quotes commas and is the CSV formula-injection guard: a cell starting =, +, -, @ is prefixed with an apostrophe.
const money = (c) => (c / 100).toFixed(2);

export function toCsv(result) {
  const head = ["Name", "Address", "Phone", "Type of work", "Contract price", "Change orders", "Adjusted contract", "Completed to date", "Retainage held", "Amount paid", "Amount owing", "Balance to complete", "Unpaid wages", "Unpaid fringe benefits"];
  const line = (r) => [r.name, r.address, r.phone, r.work, ...["contract", "changes", "adjusted", "completed", "retainage", "paid", "owing", "balance", "wages", "fringe"].map((k) => money(r[k]))];
  const t = result.totals;
  return [head, ...result.rows.map(line), ["Totals", "", "", "", ...["contract", "changes", "adjusted", "completed", "retainage", "paid", "owing", "balance", "wages", "fringe"].map((k) => money(t[k]))]].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function summaryText(result, s = {}) {
  const t = result.totals;
  const head = [
    s.project ? `Project: ${s.project}` : null,
    s.through ? `Statement through: ${s.through}` : null,
    `Parties listed: ${result.rows.length}`,
    `Contracts with change orders: ${fmt(t.adjusted)}`,
    `Paid to date: ${fmt(t.paid)}`,
    `Owing now: ${fmt(t.owing)}`,
    `Retainage held: ${fmt(t.retainage)}`,
    `Balance to complete, retainage included: ${fmt(t.balance)}`,
  ].filter(Boolean);
  const body = result.rows.map((r) => `- ${r.name}${r.work ? ` (${r.work})` : ""}: contract ${fmt(r.adjusted)}, paid ${fmt(r.paid)}, owing ${fmt(r.owing)}, balance ${fmt(r.balance)}`);
  const f = result.findings.length ? ["", "To fix before signing:", ...result.findings.map((x) => `- [${x.level}] ${x.text}`)] : ["", "No problems found in the arithmetic."];
  const w = result.waivers.length ? ["", "Lien waivers to collect with it:", ...result.waivers.map((x) => `- ${x.text}`)] : [];
  return [...head, "", ...body, ...f, ...w].join("\n");
}
