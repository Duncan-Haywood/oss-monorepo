// T&M ticket log: price time-and-material tickets at the subcontract's own markups, flag the ones
// that will be hard to collect (unsigned, no change order after the chase window, missing
// quantities), and write the unconverted signed tickets as change order request lines that the
// change order log (colog.mjs) reads. Pure functions, no I/O. Money is integer cents; dates are
// whole UTC days. No markup is assumed: blank is 0%.
import { parseCsv, parseMoney, parseDate, dayText, dollars, csvCell } from "./colog.mjs";

export const TYPES = ["labor", "material", "equipment", "sub", "other"];
const TYPE_WORDS = {
  labor: ["labor", "labour", "l", "lab", "manpower", "crew"],
  material: ["material", "materials", "m", "mat", "matl", "supplies"],
  equipment: ["equipment", "e", "equip", "eq", "rental", "rentals"],
  sub: ["sub", "subcontract", "subcontractor", "s", "lower tier", "lower-tier"],
  other: ["other", "o", "misc", "permit", "freight", "fee"],
};
export const TYPE_LABEL = { labor: "Labor", material: "Material", equipment: "Equipment", sub: "Lower-tier sub", other: "Other" };

const HEADERS = {
  ticket: /^(ticket( no\.?| number| #)?|t&m( ticket)?( no\.?| #)?|tm( no\.?| #)?|no\.?|#|tag( no\.?)?)$/,
  date: /^(date|work date|date of work|day)$/,
  type: /^(type|category|cost type|kind)$/,
  desc: /^(description|desc|item|resource|worker|trade|work)$/,
  qty: /^(qty|quantity|hours|hrs|units)$/,
  rate: /^(rate|unit (price|cost|rate)|price|cost each|\$\/unit|rate \(\$\))$/,
  amount: /^(amount|extended|ext\.?|total|line total)$/,
  signed: /^(signed( by)?|gc sign(ed|ature)?|approved by|signature|gc signoff|signed off)$/,
  co: /^(co|co( no\.?| number| #)?|change order( no\.?| number| #)?|cor( no\.?| #)?)$/,
};

function mapHeaders(row) {
  const idx = {};
  row.forEach((h, i) => {
    const t = String(h).trim().toLowerCase().replace(/\s+/g, " ");
    for (const [k, re] of Object.entries(HEADERS)) if (idx[k] == null && re.test(t)) { idx[k] = i; break; }
  });
  return idx;
}

export function normType(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "") return null;
  for (const [k, words] of Object.entries(TYPE_WORDS)) if (words.includes(t)) return k;
  return undefined;
}

// Quantity: plain decimal, up to 4 places, thousands commas allowed. Returned as ten-thousandths so
// 7.5 hours x $68.25 stays exact until the single rounding to the cent.
export function parseQty(s) {
  let t = String(s ?? "").trim();
  if (t === "") return 0;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.split(",").join("");
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return null;
  const [d, f = ""] = t.split(".");
  return parseInt(d, 10) * 10000 + parseInt((f + "0000").slice(0, 4), 10);
}

// Round half up (all values here are non-negative).
const mulRound = (qty4, cents) => Math.floor((qty4 * cents + 5000) / 10000);
const pctOf = (cents, bp) => Math.floor((cents * bp + 5000) / 10000);

// Percent as basis points: "15", "15%", "12.5" -> 1500, 1250. Blank is 0; bad or over 100% is null.
export function parsePct(s) {
  const t = String(s ?? "").trim().replace(/%$/, "").trim();
  if (t === "") return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const [d, f = ""] = t.split(".");
  const bp = parseInt(d, 10) * 100 + parseInt((f + "00").slice(0, 2), 10);
  return bp > 10000 ? null : bp;
}

const SIGN_NO = ["", "no", "n", "unsigned", "none", "pending", "not signed", "refused", "-"];
const signedBy = (s) => {
  const t = String(s ?? "").trim();
  return SIGN_NO.includes(t.toLowerCase()) ? "" : t;
};

/**
 * @param {string} text CSV or tab-separated ticket lines with a header row; one row per labor,
 *   material or equipment line; rows with the same ticket number are one ticket.
 * @param {{markup?: Record<string,string>, bond?: string, asOf?: string, chaseDays?: string|number}} settings
 */
export function compute(text, settings = {}) {
  const out = { tickets: [], errors: [], findings: [], totals: null };
  const grid = parseCsv(text);
  if (grid.length < 2) { out.errors.push("Paste a header row and at least one ticket line."); return out; }
  const idx = mapHeaders(grid[0]);
  if (idx.ticket == null) { out.errors.push("No ticket column. Name a column 'Ticket'."); return out; }
  if (idx.qty == null && idx.amount == null) { out.errors.push("No quantity or amount column. Name columns 'Qty' and 'Rate', or 'Amount'."); return out; }

  const markup = {};
  for (const k of TYPES) {
    const bp = parsePct(settings.markup?.[k]);
    if (bp == null) { out.errors.push(`${TYPE_LABEL[k]} markup must be a percent from 0 to 100.`); return out; }
    markup[k] = bp;
  }
  const bond = parsePct(settings.bond);
  if (bond == null) { out.errors.push("Bond and insurance must be a percent from 0 to 100."); return out; }
  const asOf = settings.asOf ? parseDate(settings.asOf) : Math.floor(Date.now() / 86400000);
  if (asOf == null) { out.errors.push("As-of date must be YYYY-MM-DD or M/D/YYYY."); return out; }
  const chaseRaw = String(settings.chaseDays ?? "").trim();
  if (chaseRaw !== "" && !/^\d{1,4}$/.test(chaseRaw)) { out.errors.push("Days before a signed ticket needs a change order must be a whole number."); return out; }
  const chase = chaseRaw === "" ? 14 : parseInt(chaseRaw, 10);

  const cell = (row, k) => (idx[k] == null ? "" : String(row[idx[k]] ?? "").trim());
  const byNo = new Map();
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const no = cell(row, "ticket");
    const rowNo = r + 1;
    if (no === "") { out.errors.push(`Row ${rowNo}: no ticket number.`); continue; }
    let type = normType(cell(row, "type"));
    if (type === undefined) { out.errors.push(`Row ${rowNo}: type "${cell(row, "type")}" is not labor, material, equipment, sub or other.`); continue; }
    if (type === null) type = "other";
    const qty = parseQty(cell(row, "qty"));
    if (qty == null) { out.errors.push(`Row ${rowNo}: quantity "${cell(row, "qty")}" is not a number.`); continue; }
    const rate = parseMoney(cell(row, "rate"));
    if (rate == null || rate < 0) { out.errors.push(`Row ${rowNo}: rate "${cell(row, "rate")}" is not a dollar amount.`); continue; }
    const amtRaw = cell(row, "amount");
    const given = amtRaw === "" ? null : parseMoney(amtRaw);
    if (given === null && amtRaw !== "") { out.errors.push(`Row ${rowNo}: amount "${amtRaw}" is not a dollar amount.`); continue; }
    if (given != null && given < 0) { out.errors.push(`Row ${rowNo}: a negative amount belongs on a credit change order, not a T&M ticket.`); continue; }
    const date = parseDate(cell(row, "date"));
    if (date === null) { out.errors.push(`Row ${rowNo}: date "${cell(row, "date")}" must be YYYY-MM-DD or M/D/YYYY.`); continue; }
    const extended = mulRound(qty, rate);
    const hasQty = idx.qty != null && cell(row, "qty") !== "";
    const cost = hasQty ? extended : given ?? 0;
    const line = { row: rowNo, type, desc: cell(row, "desc"), qty, rate, cost, given, mismatch: hasQty && given != null && given !== extended };

    let t = byNo.get(no.toLowerCase());
    if (!t) {
      t = { number: no, lines: [], dates: new Set(), signedBy: "", co: "", date: undefined };
      byNo.set(no.toLowerCase(), t);
      out.tickets.push(t);
    }
    t.lines.push(line);
    if (date != null) { t.dates.add(date); if (t.date == null || date < t.date) t.date = date; }
    const s = signedBy(cell(row, "signed"));
    if (s && !t.signedBy) t.signedBy = s;
    const co = cell(row, "co");
    if (co && !t.co) t.co = co;
  }
  if (out.errors.length) return out;
  if (!out.tickets.length) { out.errors.push("No ticket lines found."); return out; }

  const F = (severity, text) => out.findings.push({ severity, text });
  const totals = { cost: 0, markup: 0, bond: 0, total: 0, unsigned: 0, unsignedCount: 0, open: 0, openCount: 0, stale: 0, staleCount: 0, onCo: 0, byType: Object.fromEntries(TYPES.map((k) => [k, 0])) };
  for (const t of out.tickets) {
    t.cost = Object.fromEntries(TYPES.map((k) => [k, 0]));
    for (const l of t.lines) t.cost[l.type] += l.cost;
    t.markup = Object.fromEntries(TYPES.map((k) => [k, pctOf(t.cost[k], markup[k])]));
    t.costTotal = TYPES.reduce((a, k) => a + t.cost[k], 0);
    t.markupTotal = TYPES.reduce((a, k) => a + t.markup[k], 0);
    t.bond = pctOf(t.costTotal + t.markupTotal, bond);
    t.total = t.costTotal + t.markupTotal + t.bond;
    t.age = t.date == null ? null : asOf - t.date;
    t.signed = Boolean(t.signedBy);
    t.status = t.co ? "on-co" : t.signed ? "signed" : "unsigned";
    t.hours = t.lines.filter((l) => l.type === "labor").reduce((a, l) => a + l.qty, 0) / 10000;
    for (const k of TYPES) totals.byType[k] += t.cost[k];
    totals.cost += t.costTotal; totals.markup += t.markupTotal; totals.bond += t.bond; totals.total += t.total;
    const L = `Ticket ${t.number}`;
    if (t.status === "on-co") totals.onCo += t.total;
    else {
      totals.open += t.total; totals.openCount++;
      if (!t.signed) { totals.unsigned += t.total; totals.unsignedCount++; }
      else if (t.age != null && t.age > chase) { totals.stale += t.total; totals.staleCount++; }
    }
    if (!t.signed && !t.co) F("high", `${L} (${dollars(t.total)}) has no GC signature${t.age != null ? ` and is ${t.age} days old` : ""}. An unsigned ticket is the hardest kind of extra to collect: get it signed by the GC's super, or send it with a dated cover note now while the work is fresh.`);
    else if (t.status === "signed" && t.age != null && t.age > chase) F("high", `${L} (${dollars(t.total)}) was signed ${t.age} days ago and is on no change order. Send a change order request for it; a signed ticket is usually still not billable on the pay application until a change order is executed.`);
    if (t.date == null) F("info", `${L}: no date. A ticket should say the day the work was done.`);
    if (t.dates.size > 1) F("info", `${L} covers ${t.dates.size} different days. One ticket per day per crew is easier to get signed and harder to dispute.`);
    if (t.date != null && t.date > asOf) F("info", `${L} is dated after the as-of date.`);
    for (const l of t.lines) {
      if (l.mismatch) F("info", `${L}, row ${l.row}: qty x rate is ${dollars(mulRound(l.qty, l.rate))} but the amount column says ${dollars(l.given)}. The quantity and rate were used.`);
      if (l.cost === 0) F("info", `${L}, row ${l.row}: no cost${l.type === "labor" && l.rate === 0 ? " (labor with no rate)" : ""}. Price it or delete the row.`);
      if (l.type === "labor" && !l.desc) F("info", `${L}, row ${l.row}: labor with no worker or trade named. GCs reject tickets that do not say who worked.`);
    }
    if (t.costTotal > 0 && t.signed && t.hours === 0 && t.cost.material === 0 && t.cost.equipment === 0) F("info", `${L}: priced as a lump sum only. A T&M ticket normally lists hours and materials; a lump sum is a change order quote.`);
  }
  const cos = new Map();
  for (const t of out.tickets) if (t.co) cos.set(t.co, (cos.get(t.co) ?? 0) + t.total);
  out.cos = [...cos].map(([number, total]) => ({ number, total }));
  out.totals = totals;
  if (totals.unsignedCount) F("high", `${dollars(totals.unsigned)} on ${totals.unsignedCount} unsigned ticket${totals.unsignedCount > 1 ? "s" : ""}. Subcontracts usually set a deadline for written notice of extra work or a claim, signed ticket or not: find yours and diary it.`);
  out.findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  return out;
}

const cents = (c) => (c / 100).toFixed(2);

// Signed tickets not yet on a change order, as rows the change order log reads (Number, Description,
// Status, Amount, Submitted). Status is "pending": a ticket is a request until the GC executes a CO.
export function corRows(result) {
  const head = "Number,Description,Status,Amount,Submitted";
  const rows = result.tickets.filter((t) => t.status === "signed").map((t) => {
    const what = t.lines.map((l) => l.desc).filter(Boolean);
    const desc = `T&M ticket ${t.number}${t.date != null ? ` (${dayText(t.date)})` : ""}${what.length ? `: ${[...new Set(what)].slice(0, 3).join(", ")}` : ""}`;
    return [`TM-${t.number}`, desc, "pending", cents(t.total), dayText(t.date)].map(csvCell).join(",");
  });
  return [head, ...rows].join("\n");
}

export function ticketsCsv(result) {
  const head = ["Ticket", "Date", "Signed by", "CO", "Status", "Labor hours", ...TYPES.map((k) => TYPE_LABEL[k]), "Markup", "Bond and insurance", "Total", "Days old"];
  const rows = result.tickets.map((t) => [t.number, dayText(t.date), t.signedBy, t.co, t.status, t.hours, ...TYPES.map((k) => cents(t.cost[k])), cents(t.markupTotal), cents(t.bond), cents(t.total), t.age ?? ""].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}

// A plain change order request listing signed tickets not yet on a CO. It states only the figures
// computed here; it makes no claim about entitlement, notice or lien rights.
export function requestLetter(result, s = {}) {
  const list = result.tickets.filter((t) => t.status === "signed");
  if (!list.length) return "";
  const total = list.reduce((a, t) => a + t.total, 0);
  const lines = [
    `${s.date ?? ""}`,
    `To: ${s.gc || "[GC]"}`,
    `Project: ${s.project || "[project]"}`,
    `From: ${s.sub || "[your company]"}`,
    "",
    `Re: Change order request for ${list.length} signed T&M ticket${list.length > 1 ? "s" : ""}, ${dollars(total)}`,
    "",
    `Please issue a change order for the time-and-material work below. Each ticket was signed by your field representative; copies are attached.`,
    "",
    ...list.map((t) => `- Ticket ${t.number}${t.date != null ? `, ${dayText(t.date)}` : ""}, signed by ${t.signedBy}: ${dollars(t.total)}${t.hours ? ` (${t.hours} labor hours)` : ""}`),
    "",
    "Pricing on each ticket is cost by category with markup at the subcontract rates:",
    ...TYPES.filter((k) => list.some((t) => t.cost[k])).map((k) => `- ${TYPE_LABEL[k]}: ${dollars(list.reduce((a, t) => a + t.cost[k], 0))} cost + ${dollars(list.reduce((a, t) => a + t.markup[k], 0))} markup`),
    ...(list.some((t) => t.bond) ? [`- Bond and insurance: ${dollars(list.reduce((a, t) => a + t.bond, 0))}`] : []),
    `Total requested: ${dollars(total)}`,
    "",
    "Please reply with the change order number, or with any questions on the tickets, so this can be included on the next pay application.",
    "",
    s.sub || "[your name]",
  ];
  return lines.join("\n");
}

export const SAMPLE_SETTINGS = { markup: { labor: "15", material: "10", equipment: "10", sub: "5", other: "0" }, bond: "1.5", asOf: "2026-11-25", chaseDays: "14" };
export function sampleTickets() {
  return [
    "Ticket,Date,Type,Description,Qty,Rate,Signed by,CO",
    "101,2026-11-03,labor,Journeyman electrician,8,68.25,R. Diaz (Hill Builders),",
    "101,2026-11-03,labor,Apprentice,8,41.50,R. Diaz (Hill Builders),",
    "101,2026-11-03,material,12/2 MC cable (250 ft),1,212.40,R. Diaz (Hill Builders),",
    "102,2026-11-14,labor,Journeyman electrician,4.5,68.25,,",
    "102,2026-11-14,equipment,Scissor lift (day),1,185,,",
    "103,2026-10-20,labor,Foreman,6,79.00,K. Moss,CO-6",
    "103,2026-10-20,material,Fixtures,4,96.75,K. Moss,CO-6",
  ].join("\n");
}
