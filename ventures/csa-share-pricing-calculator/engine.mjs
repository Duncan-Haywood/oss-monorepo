// CSA share pricing calculator: a small farm sells seasonal produce-box
// shares up front. What should a share cost so that the season pays the
// farmer for their hours, and what does the box look like to a member?
//
// Per share, over a season of W weeks:
//
//   retail value  = sum over items of  weeks x qty x value_each
//   item cost     = sum over items of  weeks x qty x cost_each
//   item hours    = sum over items of  weeks x qty x minutes_each / 60
//   packing hours = W x pack_minutes / 60
//   box costs     = W x (packaging + delivery)
//   revenue       = price x (1 - fee)
//
// Season profit before your own pay is  N x (revenue - item cost - box costs) - fixed,
// and after paying yourself it also subtracts  N x (item hours + packing hours) x rate.
// The price that pays you exactly a target hourly wage is closed-form, and
// the price sweep re-runs the season at other prices with members falling
// as (price / base price)^-elasticity, capped at capacity.
//
// Pure functions, no network, no dependencies.

export const MODEL_NOTE =
  "Per share: retail value, item cost and hours are summed over the weeks each item is in the box; profit is shown before and after paying yourself at the hourly rate. " +
  "The price sweep assumes members fall as (price / base price)^-elasticity, an assumption you set, not a measurement. Every figure is exact for the numbers you supply, not a forecast.";

export const INPUT_NOTES = [
  { what: "Tomatoes (lb),2,4.50,0.70,3,10", detail: "One row per item: name, quantity per box, what it would cost a member at a store or market (value each), what it costs you to grow and harvest (seeds, inputs, water, per unit), minutes of your labour per unit, and how many weeks of the season it is in the box[,note]." },
  { what: "Season weeks, shares, price", detail: "Length of the season in weeks, the number of shares you sell, and the full-season price of one share." },
  { what: "Fee, packaging, delivery", detail: "Payment fee as a percent of price; packaging and delivery cost per box per share, every week." },
  { what: "Pack minutes, hourly rate", detail: "Minutes per box to wash, pack and hand off, every week; and what an hour of your time is worth. Set the rate to zero to ignore your own pay." },
  { what: "Fixed costs, capacity, elasticity", detail: "Season costs that do not depend on share count (insurance, software, mailing); the most shares you can serve; and how strongly sign-ups react to price (1.0 means a 10% higher price loses about 10% of members; zero disables the sweep)." },
  { what: "Header row and # comments", detail: "A first row starting with item, blank lines and lines starting with # are skipped. Avoid commas inside names." },
];

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

export function money(n) {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${s}`;
}

export function parseLines(text) {
  const items = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || /^item\b/i.test(line)) return;
    const c = line.split(",").map((s) => s.trim());
    const where = `Line ${i + 1}`;
    if (c.length < 6) {
      errors.push(`${where}: expected item,qty_per_box,value_each,cost_each,minutes_each,weeks[,note] but found ${c.length} column(s)`);
      return;
    }
    const [name, q, v, co, mi, w] = c;
    const qty = num(q), value = num(v), cost = num(co), minutes = num(mi), weeks = num(w);
    if (!name) errors.push(`${where}: missing item name`);
    else if (!Number.isFinite(qty) || qty <= 0) errors.push(`${where}: quantity per box must be more than zero`);
    else if (!Number.isFinite(value) || value < 0) errors.push(`${where}: value must be a number, zero or more`);
    else if (!Number.isFinite(cost) || cost < 0) errors.push(`${where}: cost must be a number, zero or more`);
    else if (!Number.isFinite(minutes) || minutes < 0) errors.push(`${where}: minutes must be a number, zero or more`);
    else if (!Number.isInteger(weeks) || weeks < 1) errors.push(`${where}: weeks must be a whole number, 1 or more`);
    else items.push({ name, qty, value, cost, minutes, weeks, note: c.slice(6).join(",") });
  });
  return { items, errors };
}

const DEFAULTS = { seasonWeeks: 20, shares: 60, price: 500, feePct: 3, packaging: 1.5, delivery: 0.8, packMinutes: 8, hourlyRate: 20, fixedCosts: 6000, capacity: 120, elasticity: 1.2, targetWage: 20 };
const LIMITS = { seasonWeeks: [1, 52], shares: [1, Infinity], price: [1, Infinity], feePct: [0, 99], packaging: [0, Infinity], delivery: [0, Infinity], packMinutes: [0, Infinity], hourlyRate: [0, Infinity], fixedCosts: [0, Infinity], capacity: [1, Infinity], elasticity: [0, 10], targetWage: [0, Infinity] };

function readOptions(opts = {}) {
  const o = { ...DEFAULTS };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (opts[k] === undefined || opts[k] === "" || opts[k] === null) continue;
    const v = Number(opts[k]);
    if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${k} must be a number between ${lo} and ${hi === Infinity ? "any amount" : hi}`);
    o[k] = v;
  }
  if (o.seasonWeeks !== Math.floor(o.seasonWeeks)) throw new Error("seasonWeeks must be a whole number");
  return o;
}

// Per-share season figures from the item rows.
export function perShare(items, o) {
  let retail = 0, itemCost = 0, itemHours = 0;
  for (const it of items) {
    retail += it.weeks * it.qty * it.value;
    itemCost += it.weeks * it.qty * it.cost;
    itemHours += (it.weeks * it.qty * it.minutes) / 60;
  }
  const packHours = (o.seasonWeeks * o.packMinutes) / 60;
  return { retail, itemCost, boxCosts: o.seasonWeeks * (o.packaging + o.delivery), hours: itemHours + packHours, itemHours, packHours };
}

// Season result at a given price and member count.
export function season(ps, o, price, members) {
  const margin = price * (1 - o.feePct / 100) - ps.itemCost - ps.boxCosts;
  const beforePay = members * margin - o.fixedCosts;
  const hours = members * ps.hours;
  const afterPay = beforePay - hours * o.hourlyRate;
  return { price, members, margin, beforePay, hours, afterPay, wage: hours > 0 ? beforePay / hours : null };
}

// Price that pays exactly `wage` per hour at `members` shares (closed form).
export function priceForWage(ps, o, members, wage) {
  return (ps.itemCost + ps.boxCosts + (o.fixedCosts + members * ps.hours * wage) / members) / (1 - o.feePct / 100);
}

// Shares needed to break even after paying yourself at the hourly rate; null if each share loses money.
export function breakEvenShares(ps, o, price) {
  const perShareAfter = price * (1 - o.feePct / 100) - ps.itemCost - ps.boxCosts - ps.hours * o.hourlyRate;
  if (perShareAfter <= 0) return null;
  return o.fixedCosts / perShareAfter;
}

export function sweep(ps, o) {
  const rows = [];
  for (let pct = 60; pct <= 160; pct += 5) {
    const price = Math.round(o.price * pct) / 100;
    const demand = o.elasticity === 0 ? o.shares : o.shares * Math.pow(price / o.price, -o.elasticity);
    const members = Math.min(o.capacity, Math.floor(demand + 1e-9));
    rows.push({ pct, ...season(ps, o, price, members), valueRatio: price > 0 ? ps.retail / price : null });
  }
  let best = rows[0];
  for (const r of rows) if (r.afterPay > best.afterPay) best = r;
  return { rows, best };
}

export function plan(parsed, opts = {}) {
  const o = readOptions(opts);
  const items = parsed.items;
  if (!items.length) throw new Error("No items to evaluate");
  const maxWeeks = Math.max(...items.map((it) => it.weeks));
  if (maxWeeks > o.seasonWeeks) throw new Error(`An item runs ${maxWeeks} weeks but the season is ${o.seasonWeeks} weeks; lengthen the season or shorten the item`);
  const ps = perShare(items, o);
  const now = season(ps, o, o.price, o.shares);
  const valueRatio = ps.retail / o.price;
  const wagePrice = priceForWage(ps, o, o.shares, o.targetWage);
  const be = breakEvenShares(ps, o, o.price);
  const sw = sweep(ps, o);
  const lines = items.map((it) => {
    const retail = it.weeks * it.qty * it.value;
    const cost = it.weeks * it.qty * it.cost;
    const hours = (it.weeks * it.qty * it.minutes) / 60;
    return { ...it, retail, cost, hours, net: retail - cost - hours * o.hourlyRate };
  }).sort((a, b) => a.net - b.net);
  const weekly = [];
  for (let w = 1; w <= o.seasonWeeks; w += 1) {
    weekly.push(items.filter((it) => it.weeks >= w).reduce((s, it) => s + it.qty * it.value, 0));
  }
  const findings = [];
  if (valueRatio < 1) findings.push({ severity: "warn", rule: "value-below-price", message: `A member gets ${money(ps.retail)} of retail value for ${money(o.price)}: ${valueRatio.toFixed(2)}x. Members who compare against a store will see poor value; raise the box or cut the price.` });
  else if (valueRatio > 1.6) findings.push({ severity: "info", rule: "value-room", message: `A member gets ${valueRatio.toFixed(2)}x the price in retail value, so there is room to raise the price and still look like a bargain.` });
  const losers = lines.filter((l) => l.net < 0);
  if (losers.length) findings.push({ severity: "info", rule: "costs-more-than-worth", message: `After your time, ${losers.map((l) => l.name).join(", ")} cost more to grow and pack than they are worth at retail. Keep them only if members ask for them.` });
  if (now.afterPay < 0) findings.push({ severity: "warn", rule: "unpaid-labour", message: `After paying yourself ${money(o.hourlyRate)} an hour the season loses ${money(-now.afterPay)}. To pay ${money(o.targetWage)} an hour at ${o.shares} shares the price must be ${money(wagePrice)}.` });
  if (now.wage !== null && now.wage < o.targetWage && now.afterPay >= 0) findings.push({ severity: "info", rule: "below-target-wage", message: `You earn ${money(now.wage)} an hour before your own pay; ${money(wagePrice)} per share pays ${money(o.targetWage)}.` });
  if (o.shares > o.capacity) findings.push({ severity: "warn", rule: "over-capacity", message: `${o.shares} shares exceeds the ${o.capacity} you can serve.` });
  if (sw.best.pct !== 100 && o.elasticity > 0) {
    const edge = sw.best.pct === 160 || sw.best.pct === 60;
    findings.push({ severity: edge ? "warn" : "info", rule: "sweep-best", message: `With elasticity ${o.elasticity}, the best price in the sweep is ${money(sw.best.price)} (${sw.best.pct}% of yours) with ${sw.best.members} shares and ${money(sw.best.afterPay)} after your pay.${edge ? " That is the edge of the range: the model keeps favouring fewer members at a higher price, which only holds if sign-ups really fall that way. Test a smaller step first." : ""}` });
  }
  const peak = Math.max(...weekly), low = Math.min(...weekly);
  if (peak > 0 && low / peak < 0.6) findings.push({ severity: "info", rule: "lumpy-box", message: `The box is worth ${money(low)} in its thinnest week and ${money(peak)} in its fullest; members notice a thin shoulder season.` });
  return { options: o, perShare: ps, valueRatio, now, wagePrice, breakEvenShares: be, sweep: sw, lines, weekly, findings };
}

export function summarize(p) {
  const n = p.now;
  const verdict = n.afterPay >= 0 ? `profit ${money(n.afterPay)} after paying yourself ${money(p.options.hourlyRate)} an hour` : `lose ${money(-n.afterPay)} after paying yourself ${money(p.options.hourlyRate)} an hour`;
  const status = n.afterPay >= 0 ? "profit" : "loss";
  return { status, text: `At ${money(p.options.price)} a share and ${p.options.shares} shares you ${verdict} (${money(n.beforePay)} before your own pay, ${n.hours.toFixed(0)} hours). Members receive ${money(p.perShare.retail)} of retail value, ${p.valueRatio.toFixed(2)}x the price.` };
}
