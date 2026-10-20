// Private chef and meal-prep service price. Pure arithmetic over what a personal chef types in: guests, courses, groceries, shopping and prep time,
// cooking time, cleanup, travel, the dietary load, an assistant, the chef's own time value and the overhead each visit carries. It turns that into a
// cost-plus price, the price per guest, the effective hourly rate on the price the chef quotes today, and how the price moves with the guest count,
// because a flat "per person" rate hides that shopping, travel and cleanup do not shrink with a smaller table.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

const NUMERIC = [
  "guests", "courses", "groceryPerGuest", "groceryMarkupPct", "shopHrs", "prepMinPerGuestCourse", "cookHrs", "cleanHrs", "travelHrs", "mileage", "mileRate",
  "dietPct", "dietUp", "assistants", "assistantRate", "chefRate", "overheadPerVisit", "insurancePerVisit", "visitsPerMonth", "marginPct", "minCharge", "currentPrice",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    guests: f("guests"), courses: f("courses", 3), groceryPerGuest: f("groceryPerGuest"), groceryMarkupPct: f("groceryMarkupPct", 15), shopHrs: f("shopHrs", 1.5),
    prepMinPerGuestCourse: f("prepMinPerGuestCourse", 6), cookHrs: f("cookHrs", 2), cleanHrs: f("cleanHrs", 1), travelHrs: f("travelHrs"), mileage: f("mileage"),
    mileRate: f("mileRate", 0.7), dietPct: f("dietPct"), dietUp: f("dietUp", 25), assistants: f("assistants"), assistantRate: f("assistantRate", 22), chefRate: f("chefRate", 45),
    overheadPerVisit: f("overheadPerVisit", 12), insurancePerVisit: f("insurancePerVisit", 6), visitsPerMonth: f("visitsPerMonth", 8), marginPct: f("marginPct", 20),
    minCharge: f("minCharge"), currentPrice: f("currentPrice"),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (!Number.isInteger(v.guests) || v.guests < 1) return { error: "Guests must be a whole number of at least 1." };
  if (v.guests > 200) return { error: "That is over 200 guests: this tool is for private chef and meal-prep visits, so check the number." };
  if (!Number.isInteger(v.courses) || v.courses < 1 || v.courses > 12) return { error: "Courses must be a whole number from 1 to 12." };
  if (!Number.isInteger(v.assistants) || v.assistants > 10) return { error: "Assistants must be a whole number from 0 to 10." };
  if (v.dietPct > 100) return { error: "The share of guests with dietary needs cannot be more than 100 percent." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  if (v.groceryMarkupPct > 100) return { error: "Grocery markup should be a percentage of the grocery bill, at most 100." };
  if (v.shopHrs + v.cookHrs + v.cleanHrs + v.travelHrs > 24) return { error: "Shopping, cooking, cleanup and travel add up to more than 24 hours: check the hours." };
  return { v };
}

// Dietary needs (allergy-safe, vegan, low-FODMAP, kosher) slow prep down and need a second set of tools, so prep time is stretched by that share.
export function prepMultiplier(v) {
  return 1 + (v.dietPct / 100) * (v.dietUp / 100);
}

export function visitCost(v, o = {}) {
  const guests = Math.max(1, Math.round(o.guests ?? v.guests));
  const mult = prepMultiplier(v);
  const prepHrs = ((guests * v.courses * v.prepMinPerGuestCourse) / 60) * mult;
  const chefHrs = v.shopHrs + prepHrs + v.cookHrs + v.cleanHrs + v.travelHrs;
  const onSiteHrs = prepHrs + v.cookHrs + v.cleanHrs;
  const chefLabor = chefHrs * v.chefRate;
  const assistantLabor = v.assistants * onSiteHrs * v.assistantRate;
  const groceries = guests * v.groceryPerGuest;
  const markup = groceries * (v.groceryMarkupPct / 100);
  const travel = v.mileage * v.mileRate;
  const fixed = v.overheadPerVisit + v.insurancePerVisit;
  const cost = chefLabor + assistantLabor + groceries + travel + fixed;
  // Margin is a share of the price. The grocery markup is revenue the chef earns for shopping and carrying the risk, so it sits inside the price, not on top.
  const wanted = (cost - markup) / (1 - v.marginPct / 100) + markup;
  const base = Math.max(wanted, v.minCharge);
  const price = base;
  return {
    guests, prepHrs: round1(prepHrs), chefHrs: round1(chefHrs), onSiteHrs: round1(onSiteHrs), chefLabor: round2(chefLabor), assistantLabor: round2(assistantLabor),
    groceries: round2(groceries), markup: round2(markup), travel: round2(travel), fixed: round2(fixed), cost: round2(cost), wanted: round2(wanted),
    minApplied: wanted < v.minCharge, price: round2(price), pricePerGuest: round2(price / guests), profit: round2(price - cost), actualMarginPct: price > 0 ? round1(((price - cost) / price) * 100) : 0,
  };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const job = visitCost(v);
  const advice = [];
  advice.push(`Quote ${usd(job.price)} for ${job.guests} guest${job.guests === 1 ? "" : "s"} (${usd(job.pricePerGuest)} each). It costs ${usd(job.cost)} to deliver and leaves ${usd(job.profit)} (${job.actualMarginPct}% of the price) after paying you ${usd(v.chefRate)} an hour.`);
  advice.push(`${job.chefHrs} chef hours per visit: ${v.shopHrs} shopping, ${job.prepHrs} prep, ${v.cookHrs} cooking, ${v.cleanHrs} cleanup, ${v.travelHrs} travel. Only ${job.onSiteHrs} are in the client's kitchen, which is why a per-guest rate undercharges small tables.`);
  if (job.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge sets this price.`);
  if (v.currentPrice > 0) {
    const gap = job.price - v.currentPrice;
    const monthly = gap * v.visitsPerMonth;
    const effective = job.chefHrs > 0 ? (v.currentPrice - (job.cost - job.chefLabor)) / job.chefHrs : 0;
    advice.push(gap > 0
      ? `Your current price of ${usd(v.currentPrice)} is ${usd(gap)} under the cost-plus price. At ${usd(v.currentPrice)} you earn ${usd(effective)} per chef hour after costs, against the ${usd(v.chefRate)} you set. Across ${v.visitsPerMonth} visits a month that is ${usd(monthly)} left on the table.`
      : `Your current price of ${usd(v.currentPrice)} already covers the ${usd(job.price)} cost-plus price and earns ${usd(effective)} per chef hour after costs.`);
  } else advice.push("Enter the price you quote today to see how far it sits from cost-plus and what that costs you a month.");
  if (v.dietPct > 0) advice.push(`${v.dietPct}% of guests with dietary needs stretch prep ${Math.round((prepMultiplier(v) - 1) * 100)}%, adding ${usd(((job.prepHrs - job.prepHrs / prepMultiplier(v)) * v.chefRate))} of your time to this visit.`);
  if (job.markup > 0) advice.push(`Groceries are ${usd(job.groceries)} at cost, plus a ${v.groceryMarkupPct}% markup of ${usd(job.markup)} for shopping and carrying the receipt float. Say so on the quote or bill them at cost.`);
  advice.push(`At ${v.visitsPerMonth} visits a month this price brings in ${usd(job.price * v.visitsPerMonth)} and about ${usd(job.profit * v.visitsPerMonth)} of profit beyond your hourly pay.`);
  const table = [2, 4, 6, 8, 12].map((g) => {
    const j = visitCost(v, { guests: g });
    return { guests: g, chefHrs: j.chefHrs, cost: j.cost, price: j.price, pricePerGuest: j.pricePerGuest, profit: j.profit };
  });
  return { error: null, input: v, job, table, advice };
}

export function sampleInput() {
  return {
    guests: "4", courses: "3", groceryPerGuest: "22", groceryMarkupPct: "15", shopHrs: "1.5", prepMinPerGuestCourse: "6", cookHrs: "2", cleanHrs: "1", travelHrs: "1",
    mileage: "30", mileRate: "0.7", dietPct: "25", dietUp: "25", assistants: "0", assistantRate: "22", chefRate: "45", overheadPerVisit: "12", insurancePerVisit: "6",
    visitsPerMonth: "8", marginPct: "20", minCharge: "200", currentPrice: "400",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = [...NUMERIC];

export function encodeShare(input) {
  const p = new URLSearchParams();
  for (const k of SHARE_KEYS) if (input[k] !== undefined && input[k] !== "") p.set(k, String(input[k]).slice(0, 200));
  return p.toString();
}

export function decodeShare(text) {
  const p = new URLSearchParams(String(text ?? "").replace(/^#/, ""));
  const out = {};
  for (const k of SHARE_KEYS) if (p.has(k)) out[k] = p.get(k).slice(0, 200);
  return out;
}

export function toCsv(result) {
  const head = "guests,chef_hours,cost,price,price_per_guest,profit";
  return [head, ...result.table.map((r) => [r.guests, r.chefHrs, r.cost, r.price, r.pricePerGuest, r.profit].join(","))].join("\n");
}
