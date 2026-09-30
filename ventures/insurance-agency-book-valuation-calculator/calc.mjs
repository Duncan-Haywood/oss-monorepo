// Insurance agency book-of-business valuation. Pure arithmetic, no I/O, no imports.
//
// A book pays `revenue` a year in commissions and fees if nothing lapses.
// Each year a share `retention` of that revenue renews (lapses, rate changes
// and cross-sells all folded into one net number), so revenue in year t is
//   revenue * retention^t                      (t = 1, 2, ...)
// and the owner keeps `margin = 1 - payout - servicing` of it. "Keep value"
// is the present value of that stream at the required return, over a fixed
// horizon. An offer is a multiple of annual revenue, part paid at close and
// the rest held back and scaled down if retention misses the agreed level.

export const money = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"));
export const pct = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (Math.round(v * 1000) / 10) + "%");
export const mult = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (Math.round(v * 100) / 100) + "x");

const num = (v, d = 0) => {
  if (v === "" || v == null) return d;
  const n = Number(String(v).replace(/[$,%\sx]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export function normalize(raw) {
  const p = {
    revenue: num(raw.revenue, NaN),
    retention: num(raw.retention, 90) / 100,
    payout: num(raw.payout, 0) / 100,
    servicing: num(raw.servicing, 0) / 100,
    rate: num(raw.rate, 15) / 100,
    years: num(raw.years, 15),
    offer: num(raw.offer, 0),
    upfront: num(raw.upfront, 100) / 100,
    holdback: num(raw.holdback, 12),
    required: num(raw.required, 90) / 100,
    costs: num(raw.costs, 0) / 100,
  };
  const errs = [];
  if (!(p.revenue > 0)) errs.push("Annual book revenue must be more than zero.");
  if (!(p.retention > 0 && p.retention <= 1.2)) errs.push("Retention must be between 1% and 120% of revenue per year (above 100% means rate increases outrun lapses).");
  if (!(p.payout >= 0 && p.payout < 1)) errs.push("Producer payout must be 0% or more and under 100% of revenue.");
  if (!(p.servicing >= 0 && p.servicing < 1)) errs.push("Servicing cost must be 0% or more and under 100% of revenue.");
  if (!(p.payout + p.servicing < 1)) errs.push("Payout plus servicing must leave some margin (under 100% together).");
  if (!(p.rate >= 0 && p.rate <= 1)) errs.push("Required return must be between 0% and 100%.");
  if (!(Number.isInteger(p.years) && p.years >= 1 && p.years <= 40)) errs.push("Horizon must be a whole number of years from 1 to 40.");
  if (!(p.offer >= 0 && p.offer <= 10)) errs.push("Offer multiple must be between 0x and 10x annual revenue (0 means no offer to compare).");
  if (!(p.upfront >= 0 && p.upfront <= 1)) errs.push("Upfront share must be between 0% and 100%.");
  if (!(p.holdback >= 0 && p.holdback <= 60)) errs.push("Holdback period must be 0 to 60 months.");
  if (!(p.required > 0 && p.required <= 1.2)) errs.push("Required retention must be between 1% and 120%.");
  if (!(p.costs >= 0 && p.costs < 1)) errs.push("Transaction costs must be 0% or more and under 100% of the price.");
  return { p, errs };
}

export const margin = (p) => 1 - p.payout - p.servicing;

// Year-by-year cash kept by the owner.
export function schedule(p) {
  const rows = [];
  let cum = 0, cumPv = 0;
  for (let t = 1; t <= p.years; t++) {
    const revenue = p.revenue * p.retention ** t;
    const cash = revenue * margin(p);
    const pv = cash / (1 + p.rate) ** t;
    cum += cash; cumPv += pv;
    rows.push({ year: t, revenue, cash, pv, cumCash: cum, cumPv });
  }
  return rows;
}

// Present value of keeping the book.
export function keepValue(p) {
  const q = p.retention / (1 + p.rate);
  if (Math.abs(q - 1) < 1e-12) return p.revenue * margin(p) * p.years;
  return p.revenue * margin(p) * q * (1 - q ** p.years) / (1 - q);
}

// Share of the holdback actually paid given the retention you expect.
export const holdbackFactor = (p) => Math.min(1, p.retention / p.required);

// Present value of an offer to the seller, after transaction costs.
export function offerValue(p, offerMultiple = p.offer) {
  const price = offerMultiple * p.revenue;
  const held = price * (1 - p.upfront) * holdbackFactor(p) / (1 + p.rate) ** (p.holdback / 12);
  return price * p.upfront + held - price * p.costs;
}

// Offer multiple at which selling equals keeping, or null if no price can.
export function breakEvenMultiple(p) {
  const perUnit = offerValue(p, 1) / p.revenue;
  return perUnit > 0 ? keepValue(p) / p.revenue / perUnit : null;
}

// First year in which the running PV of keeping overtakes the offer, or null.
export function keepOvertakesYear(p, sell) {
  for (const r of schedule(p)) if (r.cumPv >= sell) return r.year;
  return null;
}

const RETENTIONS = [0.8, 0.85, 0.9, 0.95, 1];

export function analyze(raw) {
  const { p, errs } = normalize(raw);
  if (errs.length) return { error: errs.join(" ") };
  const keep = keepValue(p);
  const m = margin(p);
  const hasOffer = p.offer > 0;
  const sell = hasOffer ? offerValue(p) : null;
  const be = breakEvenMultiple(p);
  const onePoint = keepValue({ ...p, retention: p.retention + 0.01 }) - keep;
  const sens = [...new Set([...RETENTIONS, p.retention])].sort((x, y) => x - y).map((r) => {
    const q = { ...p, retention: r };
    const k = keepValue(q);
    return { retention: r, keep: k, multiple: k / p.revenue, offer: hasOffer ? offerValue(q) : null, isYours: r === p.retention };
  });
  const findings = [];
  findings.push({ severity: "info", title: `Keeping the book is worth ${money(keep)} today`, detail: `That is ${mult(keep / p.revenue)} annual revenue and ${mult(keep / (p.revenue * m))} annual cash kept, after ${pct(p.payout)} producer payout and ${pct(p.servicing)} servicing cost, discounted at ${pct(p.rate)} over ${p.years} years with ${pct(p.retention)} of revenue renewing each year.` });
  if (hasOffer) {
    const diff = sell - keep;
    const y = keepOvertakesYear(p, sell);
    if (diff >= 0) findings.push({ severity: "info", title: `The offer beats keeping by ${money(diff)} at your assumptions`, detail: `After transaction costs and the holdback the offer is worth ${money(sell)} today against ${money(keep)} for keeping. It stops winning if retention is better than you assumed or your required return is lower.` });
    else findings.push({ severity: "medium", title: `The offer is ${money(-diff)} below keeping the book`, detail: `The offer is worth ${money(sell)} today after costs and the holdback; keeping is worth ${money(keep)}.${y ? ` Keeping catches the offer's value in year ${y} of collections.` : ""} The price at which the two tie is ${mult(be)} annual revenue.` });
    if (p.upfront < 1 && p.retention < p.required) findings.push({ severity: "medium", title: "The holdback would be cut at your expected retention", detail: `You expect ${pct(p.retention)} retention against ${pct(p.required)} required, so only ${pct(holdbackFactor(p))} of the held-back ${money(p.offer * p.revenue * (1 - p.upfront))} is paid. Negotiate the retention test, the measurement period and what counts as a lapse before you sign.` });
  }
  if (be != null) findings.push({ severity: "info", title: `Break-even price: ${mult(be)} annual revenue (${money(be * p.revenue)})`, detail: hasOffer ? "An offer above this beats keeping the book at your assumptions; below it, keeping wins." : "Enter an offer multiple to compare a real offer with this tie price. A buyer using the same inputs can pay up to about this much and still earn the required return." });
  findings.push({ severity: "info", title: `One more point of retention is worth ${money(onePoint)}`, detail: `Raising retention from ${pct(p.retention)} to ${pct(p.retention + 0.01)} changes the keep value by that much, which is why buyers ask for retention history and why the quality of the book moves the price more than the revenue figure.` });
  if (p.retention > 1) findings.push({ severity: "medium", title: "Retention above 100% means the book grows", detail: "Revenue is assumed to rise every year before any new business. Confirm that rate increases and cross-sells really outrun lapses in your own history before relying on the figure." });
  return { p, margin: m, keep, sell, breakEven: be, onePoint, sens, schedule: schedule(p), findings };
}

export function reportCsv(r) {
  const lines = [["year", "revenue", "cash_kept", "present_value", "cumulative_present_value"].join(",")];
  for (const x of r.schedule) lines.push([x.year, Math.round(x.revenue), Math.round(x.cash), Math.round(x.pv), Math.round(x.cumPv)].join(","));
  lines.push(["keep_value", "", "", "", Math.round(r.keep)].join(","));
  if (r.sell != null) lines.push(["offer_value_after_costs", "", "", "", Math.round(r.sell)].join(","));
  return lines.join("\n") + "\n";
}

export const sampleBook = () => ({ revenue: 250000, retention: 90, payout: 0, servicing: 25, rate: 15, years: 15, offer: 1.5, upfront: 70, holdback: 12, required: 90, costs: 3 });
