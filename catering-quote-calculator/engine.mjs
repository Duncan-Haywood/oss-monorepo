// Zero-dependency, deterministic catering per-guest quote engine. One cost line
// per row (name, basis, qty, unit cost) in; total cost, cost per guest, the
// price per guest that delivers a target margin, food and labor percentages of
// the quote, a deposit, a break-even guest count and a guest-count tier table
// out.
//
// What is arithmetic and what is a rule of thumb. Arithmetic: every total, the
// price (cost / (1 - margin - overhead)), the margin at a price you name and
// the break-even count (fixed cost / (price - variable cost per guest)). Rules
// of thumb, NOT facts about your business: the 35% food-cost and 35% labor
// levels at which findings fire, and the default 30% target margin and 10%
// overhead. They are inputs; change them to your own.

export const MODEL_NOTE = "Costs are the lines you entered; the 35% food-cost and 35% labor warning levels, the 30% target margin and the 10% overhead are common rules of thumb, not an industry standard; sales tax, service charges and gratuity are shown separately and never counted as your revenue; supplier price changes, no-shows below a guaranteed count and venue rules are not modelled";
export const DEFAULTS = { guests: 50, targetMargin: 0.3, overheadPct: 0.1, wastePct: 0.05, burdenPct: 0.12, depositPct: 0.5, offeredPrice: null, warnFood: 0.35, warnLabor: 0.35, taxPct: 0 };
const BASES = { guest: /^(guest|per.?guest|head|person|pp|per.?person|portion)$/i, flat: /^(flat|fixed|event|job|lump)$/i, staff: /^(staff.?hour|hour|hours|labor|labour|staff)$/i };
const HEADERS = { name: /^(name|item|line|description)/i, basis: /^(basis|type|kind|per|unit.?type)/i, qty: /^(qty|quantity|count|hours|portions)/i, unit: /^(unit|unit.?cost|cost|rate|price|amount)/i };

const toNum = (s) => {
  const t = String(s ?? "").trim().replace(/^\$|^-\$/, (m) => (m === "-$" ? "-" : "")).replace(/,/g, "");
  const n = Number(t);
  return t !== "" && Number.isFinite(n) ? n : NaN;
};
function splitLine(line) {
  const cells = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") { cells.push(cur.trim()); cur = ""; } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}
const basisOf = (s) => (BASES.guest.test(s) ? "guest" : BASES.flat.test(s) ? "flat" : BASES.staff.test(s) ? "staff" : null);

export function parseLines(text) {
  const rows = [];
  rows.skipped = 0;
  let cols = { name: 0, basis: 1, qty: 2, unit: 3 };
  let first = true;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cells = splitLine(raw);
    if (first) {
      first = false;
      const idx = {};
      cells.forEach((c, i) => { for (const [k, re] of Object.entries(HEADERS)) if (idx[k] === undefined && re.test(c)) idx[k] = i; });
      if (idx.name !== undefined && idx.basis !== undefined && idx.unit !== undefined) { cols = { name: idx.name, basis: idx.basis, qty: idx.qty ?? -1, unit: idx.unit }; continue; }
    }
    const basis = basisOf(cells[cols.basis] ?? "");
    const unit = toNum(cells[cols.unit]);
    const qty = cols.qty < 0 ? 1 : toNum(cells[cols.qty]);
    const name = (cells[cols.name] ?? "").trim();
    if (!name || !basis || !Number.isFinite(unit) || !Number.isFinite(qty) || unit < 0 || qty < 0) { rows.skipped += 1; continue; }
    rows.push({ name, basis, qty, unit });
  }
  return rows;
}

const round2 = (x) => Math.round(x * 100) / 100;

export function analyze(lines, userOpts = {}) {
  const o = { ...DEFAULTS };
  for (const [k, v] of Object.entries(userOpts)) if (v !== undefined && v !== null && Number.isFinite(v)) o[k] = v;
  if (userOpts.offeredPrice === null) o.offeredPrice = null;
  const guests = Math.max(1, Math.round(o.guests));
  let food = 0, labor = 0, fixed = 0, perGuestVar = 0;
  const items = [];
  for (const l of lines) {
    let cost, perGuest = 0;
    if (l.basis === "guest") { perGuest = l.qty * l.unit * (1 + o.wastePct); cost = perGuest * guests; food += cost; perGuestVar += perGuest; }
    else if (l.basis === "staff") { cost = l.qty * l.unit * (1 + o.burdenPct); labor += cost; fixed += cost; }
    else { cost = l.qty * l.unit; fixed += cost; }
    items.push({ ...l, cost: round2(cost) });
  }
  const totalCost = food + fixed;
  const base = { food, labor, fixed, perGuestVar, totalCost, guests };
  const markup = 1 - o.targetMargin - o.overheadPct;
  const quote = markup > 0 ? totalCost / markup : NaN;
  const pricePerGuest = quote / guests;
  const priceAt = (n) => {
    const cost = perGuestVar * n + fixed;
    return markup > 0 ? cost / markup / n : NaN;
  };
  const tiers = [0.5, 0.75, 1, 1.25, 1.5, 2].map((f) => {
    const n = Math.max(1, Math.round(guests * f));
    const cost = perGuestVar * n + fixed;
    const price = priceAt(n);
    return { guests: n, cost: round2(cost), pricePerGuest: round2(price), quote: round2(price * n), profit: round2(price * n * (1 - o.overheadPct) - cost) };
  });
  const findings = [];
  if (!lines.length) return { ...base, count: 0, items, findings, tiers: [], options: { ...o, guests }, skipped: lines.skipped || 0 };
  if (!(markup > 0)) findings.push({ rule: "margin-impossible", severity: "error", message: `A ${(o.targetMargin * 100).toFixed(0)}% margin plus ${(o.overheadPct * 100).toFixed(0)}% overhead leaves no room: the two must add to under 100% of the price.` });
  const foodPct = quote > 0 ? food / quote : null;
  const laborPct = quote > 0 ? labor / quote : null;
  if (foodPct !== null && foodPct > o.warnFood) findings.push({ rule: "food-cost-high", severity: "warn", message: `Food and per-guest supplies are ${(foodPct * 100).toFixed(0)}% of the quote, above the ${(o.warnFood * 100).toFixed(0)}% level; check portion sizes or the menu price.` });
  if (laborPct !== null && laborPct > o.warnLabor) findings.push({ rule: "labor-cost-high", severity: "warn", message: `Staff cost is ${(laborPct * 100).toFixed(0)}% of the quote, above the ${(o.warnLabor * 100).toFixed(0)}% level; hours or headcount may be heavy for ${guests} guests.` });
  if (!perGuestVar) findings.push({ rule: "no-per-guest-lines", severity: "warn", message: "No per-guest lines were entered, so the price will not move with the guest count." });
  const minDeposit = quote * o.depositPct;
  let offered = null, breakEven = null;
  if (o.offeredPrice !== null && o.offeredPrice > 0) {
    const revenue = o.offeredPrice * guests;
    const profit = revenue * (1 - o.overheadPct) - totalCost;
    offered = { pricePerGuest: o.offeredPrice, revenue: round2(revenue), profit: round2(profit), margin: revenue ? profit / revenue : 0 };
    if (offered.margin < o.targetMargin - 0.0005) findings.push({ rule: "offered-price-below-target", severity: offered.profit < 0 ? "error" : "warn", message: `At $${o.offeredPrice.toFixed(2)} per guest the margin after overhead is ${(offered.margin * 100).toFixed(1)}% (${offered.profit < 0 ? "a loss of $" + Math.abs(offered.profit).toFixed(0) : "$" + offered.profit.toFixed(0) + " profit"}), under your ${(o.targetMargin * 100).toFixed(0)}% target; the target price is $${pricePerGuest.toFixed(2)}.` });
    const contribution = o.offeredPrice * (1 - o.overheadPct) - perGuestVar;
    breakEven = contribution > 0 ? Math.ceil(fixed / contribution) : null;
    if (breakEven === null) findings.push({ rule: "never-breaks-even", severity: "error", message: "At this price each extra guest loses money after overhead, so no guest count covers the fixed costs." });
    else if (breakEven > guests) findings.push({ rule: "below-break-even-count", severity: "error", message: `At $${o.offeredPrice.toFixed(2)} you need ${breakEven} guests to cover the fixed costs; this quote is for ${guests}. Set a minimum guest count of at least ${breakEven}.` });
  }
  return { ...base, count: lines.length, items, findings, tiers, options: { ...o, guests }, skipped: lines.skipped || 0, quote: round2(quote), pricePerGuest: round2(pricePerGuest), costPerGuest: round2(totalCost / guests), foodPct, laborPct, deposit: round2(minDeposit), tax: round2(quote * o.taxPct), offered, breakEven };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No cost lines were read. Use name, basis (guest, flat or staff-hour), quantity and unit cost per line." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const head = Number.isFinite(report.quote) ? `Quote $${Math.round(report.quote).toLocaleString("en-US")} for ${report.guests} guests: $${report.pricePerGuest.toFixed(2)} per guest against a cost of $${report.costPerGuest.toFixed(2)}.` : "No price can be set from these margin settings.";
  return { status: errors ? "error" : warns ? "warn" : "ok", errors, warns, text: errors || warns ? `${head} ${errors} error(s), ${warns} warning(s).` : `${head} No warnings.` };
}

export const INPUT_NOTES = [
  { what: "name,guest,1,5.40", detail: "A per-guest line: quantity per guest times unit cost, times guest count, plus the waste allowance (default 5%)." },
  { what: "name,flat,1,120", detail: "A cost that does not change with guest count: rentals, fuel, permits, a venue fee." },
  { what: "name,staff-hour,18,18", detail: "Total staff hours (people x hours) times the hourly rate, plus payroll burden (default 12%). Treated as a fixed cost for the event." },
  { what: "header row", detail: "Columns found by name (name/item, basis/type, qty/hours, unit/cost/rate), so a spreadsheet export can be pasted as it is." },
];
