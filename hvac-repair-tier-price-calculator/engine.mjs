// HVAC good/better/best repair pricing: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  wage: 36, // hourly pay for the technician, before burden
  burdenPct: 25, // payroll tax, workers' comp, benefits as a share of wage
  paidHours: 2080, // hours a year you pay for
  billableHours: 1200, // hours a year actually sold on tickets
  truckYear: 17000, // van payments, fuel, maintenance, registration
  insuranceYear: 7000, // liability, vehicle, bond
  toolsYear: 5000, // gauges, recovery machine, vacuum pump, consumables
  overheadYear: 13000, // phone, software, licence, office, marketing, EPA certification
  travelHours: 0.75, // round trip plus the supply-house run
  diagHours: 0.75, // time on site to diagnose
  targetMarginPct: 35, // margin you want on time (labour and overhead)
  reservePct: 3, // share of each price set aside for callbacks and warranty labour
  roundTo: 5, // price-book rounding, up to the next multiple
  goodHours: 1.5, // Good: repair what failed
  goodParts: 180,
  betterHours: 2.5, // Better: repair plus the part that will fail next
  betterParts: 520,
  bestHours: 8, // Best: replace the system
  bestParts: 5200,
  mixGood: 50, // of customers who approve work, share choosing each tier
  mixBetter: 35,
  mixBest: 15,
  declinePct: 20, // of calls where the customer pays the diagnostic fee and approves nothing
};

// Marginal tiers, like tax brackets: each slice of a ticket's equipment and parts cost earns its own markup.
export const DEFAULT_TIERS = [
  { upTo: 100, markupPct: 100 },
  { upTo: 500, markupPct: 60 },
  { upTo: 2000, markupPct: 40 },
  { upTo: null, markupPct: 30 },
];

export const TIER_KEYS = ["good", "better", "best"];
export const TIER_NAMES = { good: "Good: repair", better: "Better: repair plus", best: "Best: replace" };

export const INPUT_NOTES = [
  { what: "Wage, burden, paid and billable hours", detail: "Pay per hour plus payroll tax, comp and benefits, over the hours you pay for. Billable hours are the hours actually sold on tickets: drive time between calls, supply-house runs, callbacks, quoting and paperwork are paid but not billed, so a one-van shop often sells 1,000-1,400 of 2,080. This is the number a price book most often gets wrong." },
  { what: "Van, insurance, tools, overhead per year", detail: "A year of van payments, fuel and repairs; liability and vehicle insurance; gauges, recovery gear and consumables; phone, dispatch software, licence, EPA certification, office and marketing. All of it is spread over billable hours." },
  { what: "Travel and diagnostic hours", detail: "Round trip including the supply-house run, and the time on site to find the fault. The diagnostic fee is priced from both, and is credited against the approved repair." },
  { what: "Good, Better, Best hours and parts", detail: "Good fixes what failed. Better fixes it and replaces the part that is likely to fail next, or adds a capacitor, a hard-start kit or a surge protector. Best replaces the system. Enter on-site hours and your cost of parts or equipment for each; travel is added to every tier." },
  { what: "Markup tiers", detail: "Marginal, like tax brackets: the first slice of a ticket's parts and equipment cost carries the highest percentage, the expensive slices less, so a $14 contactor and a $4,800 condensing unit and coil are both priced sensibly." },
  { what: "Target margin and callback reserve", detail: "Margin applies to time (labour and overhead); parts earn their own markup. The reserve is the share of every price you set aside for callbacks and warranty labour, so the profit shown is after it." },
  { what: "Mix of choices and decline rate", detail: "Of customers who approve work, what share pick each tier, and what share of calls end with the diagnostic fee and nothing else. These are your assumptions, not market data: replace them with your own counts from a month of tickets." },
  { what: "Round up to", detail: "Prices are rounded up to the next multiple, so rounding never takes your margin down." },
];

const num = (v, name, { min = 0 } = {}) => {
  const n = v === "" || v == null ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number of ${min} or more.`);
  return n;
};

export function money(v) {
  const neg = v < 0 && Math.abs(v) >= 0.005;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}$${s}`;
}
export const pct = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
const r2 = (v) => Math.round(v * 100) / 100;
const roundUp = (v, step) => (step > 0 ? Math.ceil(v / step - 1e-9) * step : v);

/** Validate tiers: ascending ceilings, last tier open-ended. */
export function cleanTiers(tiers = DEFAULT_TIERS) {
  if (!Array.isArray(tiers) || tiers.length === 0) throw new Error("Add at least one markup tier.");
  let prev = 0;
  return tiers.map((t, i) => {
    const last = i === tiers.length - 1;
    const markupPct = num(t.markupPct, `Tier ${i + 1} markup`);
    let upTo = null;
    if (!last) {
      upTo = num(t.upTo, `Tier ${i + 1} ceiling`);
      if (upTo <= prev) throw new Error(`Tier ${i + 1} ceiling must be above the one before it.`);
      prev = upTo;
    }
    return { upTo, markupPct };
  });
}

/** Markup in dollars on a parts or equipment cost, slice by slice. */
export function partsMarkup(partsCost, tiers = DEFAULT_TIERS) {
  const cost = num(partsCost, "Parts cost");
  const ts = cleanTiers(tiers);
  let floor = 0;
  let total = 0;
  const slices = [];
  for (const t of ts) {
    const top = t.upTo == null ? Infinity : t.upTo;
    const amount = Math.max(0, Math.min(cost, top) - floor);
    if (amount > 0) {
      const markup = amount * (t.markupPct / 100);
      slices.push({ from: floor, to: Math.min(cost, top), amount, markupPct: t.markupPct, markup });
      total += markup;
    }
    floor = top;
    if (cost <= top) break;
  }
  return { markup: total, slices, effectivePct: cost > 0 ? (total / cost) * 100 : 0 };
}

/** True cost of one billable hour. */
export function hourlyCost(o) {
  const wage = num(o.wage, "Hourly wage");
  const burdenPct = num(o.burdenPct, "Burden");
  const paidHours = num(o.paidHours, "Paid hours", { min: 1 });
  const billableHours = num(o.billableHours, "Billable hours", { min: 1 });
  if (billableHours > paidHours) throw new Error("Billable hours cannot be more than paid hours.");
  const van = num(o.truckYear, "Van per year");
  const insurance = num(o.insuranceYear, "Insurance per year");
  const tools = num(o.toolsYear, "Tools per year");
  const overhead = num(o.overheadYear, "Overhead per year");
  const loadedWage = wage * (1 + burdenPct / 100);
  const labourYear = loadedWage * paidHours;
  const overheadTotal = van + insurance + tools + overhead;
  const labourPerHour = labourYear / billableHours;
  const overheadPerHour = overheadTotal / billableHours;
  return { loadedWage, labourYear, overheadTotal, labourPerHour, overheadPerHour, perHour: labourPerHour + overheadPerHour };
}

function shopSettings(o) {
  const targetMarginPct = num(o.targetMarginPct, "Target margin");
  if (targetMarginPct >= 100) throw new Error("Target margin must be under 100%.");
  const reservePct = num(o.reservePct, "Callback reserve");
  if (reservePct >= 100 || targetMarginPct + reservePct >= 100) throw new Error("Target margin plus callback reserve must be under 100%.");
  return { targetMarginPct, reservePct, roundTo: num(o.roundTo, "Round up to"), travelHours: num(o.travelHours, "Travel hours") };
}

/** Price one tier of one ticket. */
export function priceTier(hourlyPerHour, s, onsiteHours, partsCost, tiers) {
  const onsite = num(onsiteHours, "On-site hours");
  const hours = onsite + s.travelHours;
  if (hours <= 0) throw new Error("On-site plus travel hours must be more than zero.");
  const m = partsMarkup(partsCost, tiers);
  const timeCost = hours * hourlyPerHour;
  const timeCharge = timeCost / (1 - s.targetMarginPct / 100);
  const partsCharge = num(partsCost, "Parts cost") + m.markup;
  const exact = (timeCharge + partsCharge) / (1 - s.reservePct / 100);
  const price = roundUp(exact, s.roundTo);
  const cost = timeCost + Number(partsCost);
  const reserve = price * (s.reservePct / 100);
  const profit = price - cost - reserve;
  return {
    onsiteHours: onsite, hours, partsCost: Number(partsCost), markup: m, timeCost, timeCharge, partsCharge, exact, price, cost, reserve, profit,
    marginPct: price > 0 ? (profit / price) * 100 : 0,
    profitPerHour: profit / hours,
    // Hours at which the price, less parts and reserve, no longer covers the cost of the labour.
    breakEvenHours: hourlyPerHour > 0 ? (price - reserve - Number(partsCost)) / hourlyPerHour : Infinity,
  };
}

const mixOf = (o) => {
  const m = { good: num(o.mixGood, "Good share"), better: num(o.mixBetter, "Better share"), best: num(o.mixBest, "Best share") };
  if (Math.abs(m.good + m.better + m.best - 100) > 0.01) throw new Error("The Good, Better and Best shares must add up to 100.");
  return m;
};

/** Expected result of a call, given who picks which tier and how many decline. */
export function expectedCall(tiers3, diag, mix, declinePct) {
  const accept = 1 - declinePct / 100;
  let ticket = 0;
  let profit = 0;
  let hours = 0;
  for (const k of TIER_KEYS) {
    const w = (mix[k] / 100) * accept;
    // An approved repair credits the diagnostic fee: the customer pays the tier price, not tier plus fee.
    ticket += w * tiers3[k].price;
    profit += w * tiers3[k].profit;
    hours += w * tiers3[k].hours;
  }
  const d = declinePct / 100;
  ticket += d * diag.fee;
  profit += d * diag.profit;
  hours += d * diag.hours;
  return { ticket, profit, hours, profitPerHour: hours > 0 ? profit / hours : 0 };
}

/** Price a service call at Good, Better and Best, with the diagnostic fee and the expected result. */
export function priceCall(options = {}, tiers = DEFAULT_TIERS) {
  const o = { ...DEFAULTS, ...options };
  const h = hourlyCost(o);
  const s = shopSettings(o);
  const diagHours = num(o.diagHours, "Diagnostic hours");
  const declinePct = num(o.declinePct, "Decline rate");
  if (declinePct > 100) throw new Error("Decline rate cannot be more than 100%.");
  const mix = mixOf(o);

  const tr = {};
  for (const k of TIER_KEYS) tr[k] = priceTier(h.perHour, s, o[`${k}Hours`], o[`${k}Parts`], tiers);
  const dHours = diagHours + s.travelHours;
  if (dHours <= 0) throw new Error("Diagnostic plus travel hours must be more than zero.");
  const dCost = dHours * h.perHour;
  const fee = roundUp(dCost / (1 - s.targetMarginPct / 100), s.roundTo);
  const diag = { hours: dHours, cost: dCost, fee, profit: fee - dCost };

  for (const k of TIER_KEYS) tr[k].netDue = tr[k].price - fee;
  const expected = expectedCall(tr, diag, mix, declinePct);
  const goodOnly = expectedCall(tr, diag, { good: 100, better: 0, best: 0 }, declinePct);
  const shiftTenToBest = (tr.best.profit - tr.good.profit) * 0.1 * (1 - declinePct / 100);

  const sensitivity = [0, 5, 10, 15, 20, 25, 30].filter((b) => 100 - mix.better - b >= 0).map((b) => {
    const m = { good: 100 - mix.better - b, better: mix.better, best: b };
    return { bestShare: b, goodShare: m.good, ...expectedCall(tr, diag, m, declinePct) };
  });
  const declineSens = [0, 10, 20, 30, 40].map((d) => ({ declinePct: d, ...expectedCall(tr, diag, mix, d) }));

  const ordered = tr.good.price <= tr.better.price && tr.better.price <= tr.best.price;
  return { ...o, hourly: h, settings: s, tiers: tr, diag, mix, expected, goodOnly, liftVsGoodOnly: expected.profit - goodOnly.profit, shiftTenToBest, sensitivity, declineSens, ordered };
}

/** Price every call type in a book on one set of shop numbers. */
export function priceBook(jobs, shop = {}, tiers = DEFAULT_TIERS) {
  if (!Array.isArray(jobs) || jobs.length === 0) throw new Error("Add at least one call type to the price book.");
  const o = { ...DEFAULTS, ...shop };
  const h = hourlyCost(o);
  const s = shopSettings(o);
  return jobs.map((j, i) => {
    const name = String(j.name ?? "").trim() || `Call type ${i + 1}`;
    const row = { name };
    for (const k of TIER_KEYS) {
      const t = priceTier(h.perHour, s, j[`${k}Hours`], j[`${k}Parts`], tiers);
      row[`${k}Hours`] = t.onsiteHours;
      row[`${k}Parts`] = t.partsCost;
      row[`${k}Price`] = t.price;
      row[`${k}Margin`] = t.marginPct;
    }
    return row;
  });
}

// A cell that starts with = + - @ is read as a formula by spreadsheets; a leading apostrophe stops that.
const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  const head = ["Call type", "Good hours", "Good parts", "Good price", "Good margin %", "Better hours", "Better parts", "Better price", "Better margin %", "Best hours", "Best parts", "Best price", "Best margin %"];
  const f = (v) => r2(v).toFixed(2);
  const m = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const lines = rows.map((r) => [
    r.name, r.goodHours, f(r.goodParts), f(r.goodPrice), m(r.goodMargin), r.betterHours, f(r.betterParts), f(r.betterPrice), m(r.betterMargin), r.bestHours, f(r.bestParts), f(r.bestPrice), m(r.bestMargin),
  ].map(csvCell).join(","));
  return [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}

export function summarize(r) {
  const t = r.tiers;
  const parts = [
    `Your true cost is ${money(r.hourly.perHour)} per billable hour (${money(r.hourly.labourPerHour)} wages and burden plus ${money(r.hourly.overheadPerHour)} van, insurance, tools and overhead).`,
    `Diagnostic fee ${money(r.diag.fee)}, credited when the customer approves work. Good ${money(t.good.price)}, Better ${money(t.better.price)}, Best ${money(t.best.price)}, leaving ${money(t.good.profit)}, ${money(t.better.profit)} and ${money(t.best.profit)} after the ${r.reservePct}% callback reserve.`,
    `At ${r.mix.good}/${r.mix.better}/${r.mix.best} Good/Better/Best and ${r.declinePct}% declining, an average call tickets ${money(r.expected.ticket)} and earns ${money(r.expected.profit)}, ${money(r.liftVsGoodOnly)} more than offering Good alone.`,
    `Each 10 points of approvals that move from Good to Best add ${money(r.shiftTenToBest)} per call.`,
  ];
  if (!r.ordered) parts.push("Warning: the tiers are not in rising price order, so a customer could pay less for a bigger job.");
  return { status: r.expected.profit >= 0 ? "ok" : "warn", text: parts.join(" ") };
}

// Share link: only numeric inputs, in the URL fragment, which is never sent to a server.
export const SHARE_FIELDS = Object.freeze([...Object.keys(DEFAULTS)]);

export function encodeShare(inputs, tiers) {
  const p = new URLSearchParams();
  for (const k of SHARE_FIELDS) {
    const v = inputs?.[k];
    if (v === "" || v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) p.set(k, String(n));
  }
  if (Array.isArray(tiers)) {
    const t = tiers.map((x) => `${x.upTo == null ? "" : Number(x.upTo)}:${Number(x.markupPct)}`).join(",");
    if (/^[0-9.:,]+$/.test(t)) p.set("tiers", t);
  }
  return p.toString();
}

export function decodeShare(source) {
  const out = { inputs: {}, tiers: null };
  if (typeof source !== "string") return out;
  const p = new URLSearchParams(source.replace(/^[?#]/, ""));
  for (const k of SHARE_FIELDS) {
    if (!p.has(k)) continue;
    const raw = p.get(k);
    const n = raw === "" ? NaN : Number(raw);
    if (Number.isFinite(n) && n >= 0) out.inputs[k] = n;
  }
  if (p.has("tiers")) {
    const tiers = p.get("tiers").split(",").map((s) => {
      const [u, m] = s.split(":");
      return { upTo: u === "" || u == null ? null : Number(u), markupPct: Number(m) };
    });
    try { out.tiers = cleanTiers(tiers); } catch { out.tiers = null; }
  }
  return out;
}
