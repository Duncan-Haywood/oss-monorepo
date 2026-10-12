// Lot split calculator: a reseller has bought (or been offered) a mixed bulk
// lot -- an estate, a storage unit, a liquidation pallet -- and a buyer will
// take the whole lot for one price. Is it worth listing the items one by one?
//
// Per line (qty units of one thing), listing the units yourself yields
//
//   list = qty x ( p x (price x (1 - fee) - shipping)       sold units
//                + (1 - p) x price x remnant )               unsold units, sold on at a discount
//          - qty x minutes/60 x hourly rate                 your time listing, packing, shipping
//
// and dumping the line straight to a liquidator yields qty x price x remnant,
// with no time spent. Lines do not interact, so the best mix is the exact
// per-line maximum of the two -- no search is needed, and the tests check it
// against every one of the 2^n list-or-dump choices. The break-even hourly
// rate (the value of your time at which the whole-lot offer ties the best
// mix) is found by bisection because the best mix is piecewise-linear and
// falling in that rate.
//
// Pure functions, no network, no dependencies.

export const MODEL_NOTE =
  "List value = sell-through x (price x (1 - fee) - shipping) per unit, plus unsold units sold on at the remnant percentage of price, less your time at the hourly rate. " +
  "Prices and sell-through rates are your estimates, not a forecast; the answer is exact for the numbers you supply.";

export const INPUT_NOTES = [
  { what: "Pyrex bowls,6,28,85,9,12,heavy", detail: "One line per kind of item: name,quantity,expected sale price per unit,sell-through percent,shipping you pay per unit,minutes of your time per unit[,note]. Sell-through is the share of units you expect to sell at that price (85 = 85%)." },
  { what: "Whole-lot offer", detail: "The single price a buyer will pay for the entire lot today. Optional: leave it at zero to only see what splitting is worth." },
  { what: "Marketplace fee", detail: "Percent of the sale price taken by the marketplace and payment processor, applied to the price only (13 is typical of eBay-style fees; use your own)." },
  { what: "Remnant percent", detail: "What unsold or not-worth-listing units fetch when sold in bulk to a liquidator or a yard sale, as a percent of the expected price (20 = 20%). Zero means you throw them away." },
  { what: "Hourly rate", detail: "What an hour of your time is worth: listing, photographing, packing and shipping. If you would rather not count it, set it to zero." },
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
      errors.push(`${where}: expected item,qty,price,sell_through,shipping,minutes[,note] but found ${c.length} column(s)`);
      return;
    }
    const [name, q, pr, st, sh, mi] = c;
    const qty = num(q), price = num(pr), sellThrough = num(st), shipping = num(sh), minutes = num(mi);
    if (!name) errors.push(`${where}: missing item name`);
    else if (!Number.isInteger(qty) || qty < 1) errors.push(`${where}: quantity must be a whole number, 1 or more`);
    else if (!Number.isFinite(price) || price < 0) errors.push(`${where}: price must be a number, zero or more`);
    else if (!Number.isFinite(sellThrough) || sellThrough < 0 || sellThrough > 100) errors.push(`${where}: sell-through must be between 0 and 100`);
    else if (!Number.isFinite(shipping) || shipping < 0) errors.push(`${where}: shipping must be a number, zero or more`);
    else if (!Number.isFinite(minutes) || minutes < 0) errors.push(`${where}: minutes must be a number, zero or more`);
    else items.push({ name, qty, price, sellThrough, shipping, minutes, note: c.slice(6).join(",") });
  });
  return { items, errors };
}

const OPTION_DEFAULTS = { feePct: 13, remnantPct: 20, hourlyRate: 15, lotOffer: 0, lotCost: 0, downside: 80 };

function readOptions(opts = {}) {
  const o = { ...OPTION_DEFAULTS };
  const limits = { feePct: [0, 99], remnantPct: [0, 100], hourlyRate: [0, Infinity], lotOffer: [0, Infinity], lotCost: [0, Infinity], downside: [0, 100] };
  for (const [k, [lo, hi]] of Object.entries(limits)) {
    if (opts[k] === undefined || opts[k] === "" || opts[k] === null) continue;
    const v = Number(opts[k]);
    if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${k} must be a number between ${lo} and ${hi === Infinity ? "any amount" : hi}`);
    o[k] = v;
  }
  return o;
}

// Value of one line when listed, and when dumped, at a given hourly rate and sell-through scale.
export function lineValues(it, o, rate = o.hourlyRate, scale = 1) {
  const p = Math.min(1, (it.sellThrough / 100) * scale);
  const fee = o.feePct / 100, rem = o.remnantPct / 100;
  const perUnit = p * (it.price * (1 - fee) - it.shipping) + (1 - p) * it.price * rem;
  const time = (it.minutes / 60) * rate;
  const list = it.qty * (perUnit - time);
  const dump = it.qty * it.price * rem;
  return { list, dump, listGross: it.qty * perUnit, hours: (it.qty * it.minutes) / 60 };
}

function bestMix(items, o, rate, scale = 1) {
  let total = 0, hours = 0;
  const lines = items.map((it) => {
    const v = lineValues(it, o, rate, scale);
    const doList = v.list > v.dump;
    total += doList ? v.list : v.dump;
    if (doList) hours += v.hours;
    return { ...it, ...v, action: doList ? "list" : "dump", value: doList ? v.list : v.dump };
  });
  return { total, hours, lines };
}

function allListed(items, o, rate, scale = 1) {
  let total = 0, hours = 0;
  for (const it of items) { const v = lineValues(it, o, rate, scale); total += v.list; hours += v.hours; }
  return { total, hours };
}

// Hourly rate at which the whole-lot offer ties the best mix; 0 if the offer
// already beats the mix with free time, Infinity if the mix wins at any rate.
export function breakEvenRate(items, o, scale = 1) {
  const f = (r) => bestMix(items, o, r, scale).total - o.lotOffer;
  if (f(0) <= 0) return 0;
  const hi0 = 100000;
  if (f(hi0) > 0) return Infinity;
  let lo = 0, hi = hi0;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export function plan(parsed, opts = {}) {
  const o = readOptions(opts);
  const items = parsed.items;
  if (!items.length) throw new Error("No lines to evaluate");
  const mix = bestMix(items, o, o.hourlyRate);
  const all = allListed(items, o, o.hourlyRate);
  const down = bestMix(items, o, o.hourlyRate, o.downside / 100);
  const hasOffer = o.lotOffer > 0;
  const best = hasOffer && o.lotOffer >= mix.total ? "whole" : "split";
  const be = hasOffer ? breakEvenRate(items, o) : null;
  const lines = mix.lines.slice().sort((a, b) => b.value - a.value);
  const gross = items.reduce((s, it) => s + it.qty * it.price, 0);
  const findings = [];
  const dumped = lines.filter((l) => l.action === "dump");
  if (dumped.length) findings.push({ severity: "info", rule: "not-worth-listing", message: `${dumped.length} line(s) are worth more sold on in bulk than listed after fees, shipping and your time: ${dumped.map((l) => l.name).join(", ")}.` });
  const loss = lines.filter((l) => l.list < 0);
  if (loss.length) findings.push({ severity: "warn", rule: "loses-money-listed", message: `Listing ${loss.map((l) => l.name).join(", ")} would lose money after your time; sell them in bulk or skip them.` });
  const top = lines.slice(0, 2).reduce((s, l) => s + Math.max(l.value, 0), 0);
  if (mix.total > 0 && top / mix.total >= 0.6) findings.push({ severity: "warn", rule: "concentrated", message: `Two lines (${lines.slice(0, 2).map((l) => l.name).join(" and ")}) carry ${Math.round((top / mix.total) * 100)}% of the value, so the answer rests on those prices.` });
  if (hasOffer && best === "split" && down.total < o.lotOffer) findings.push({ severity: "warn", rule: "fragile-split", message: `If sell-through comes in at ${o.downside}% of your estimate the split drops to ${money(down.total)}, below the ${money(o.lotOffer)} offer.` });
  if (hasOffer && Number.isFinite(be) && be > 0) findings.push({ severity: "info", rule: "break-even-rate", message: `The whole-lot offer wins if your time is worth more than ${money(be)} an hour; below that, splitting the lot earns more.` });
  return {
    options: o, lines, gross,
    totals: { bestMix: mix.total, allListed: all.total, wholeLot: hasOffer ? o.lotOffer : null, downsideMix: down.total, hoursBestMix: mix.hours, hoursAllListed: all.hours },
    best, breakEvenRate: be, profit: o.lotCost > 0 ? { whole: hasOffer ? o.lotOffer - o.lotCost : null, split: mix.total - o.lotCost } : null,
    gainOverOffer: hasOffer ? mix.total - o.lotOffer : null, findings,
  };
}

export function summarize(p) {
  const t = p.totals;
  if (p.totals.wholeLot === null) return { status: "split-only", text: `Splitting the lot nets ${money(t.bestMix)} for ${t.hoursBestMix.toFixed(1)} hours of work. Enter a whole-lot offer to compare.` };
  if (p.best === "split") return { status: "gain", text: `Split the lot: ${money(t.bestMix)} beats the ${money(t.wholeLot)} offer by ${money(p.gainOverOffer)} for ${t.hoursBestMix.toFixed(1)} hours of work.` };
  return { status: "whole", text: `Take the ${money(t.wholeLot)} offer: splitting nets only ${money(t.bestMix)} (${money(-p.gainOverOffer)} less) for ${t.hoursBestMix.toFixed(1)} hours of work.` };
}
