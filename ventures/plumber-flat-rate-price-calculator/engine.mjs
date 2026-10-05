// Plumber flat-rate price: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  wage: 35, // hourly pay for the plumber, before burden
  burdenPct: 25, // payroll tax, workers' comp, benefits as a share of wage
  paidHours: 2080, // hours a year you pay for
  billableHours: 1300, // hours a year actually sold to customers
  truckYear: 15000, // payments, fuel, maintenance, registration
  insuranceYear: 6000, // liability, vehicle, bond
  toolsYear: 3500, // tools, consumables, equipment wear
  overheadYear: 14500, // phone, software, licence, rent, office, marketing
  onsiteHours: 2, // time on site for the job
  travelHours: 0.75, // round-trip drive, parts run
  partsCost: 120, // what the parts cost you
  targetMarginPct: 30, // margin you want on time (labour + overhead)
  roundTo: 5, // price-book rounding, up to the next multiple
  minOnsiteHours: 0.5, // shortest visit you will do
  tmRate: 135, // hourly rate you would bill on time and materials
};

// Marginal tiers, like tax brackets: each slice of a job's parts cost earns its own markup.
// `upTo: null` is the last tier and has no ceiling.
export const DEFAULT_TIERS = [
  { upTo: 25, markupPct: 100 },
  { upTo: 100, markupPct: 60 },
  { upTo: 500, markupPct: 40 },
  { upTo: null, markupPct: 25 },
];

export const INPUT_NOTES = [
  { what: "Hourly wage and burden", detail: "What you pay (or would pay a hired plumber) per hour, plus payroll tax, workers' comp and benefits as a percentage. An owner who pays no one a wage should still enter the pay they want, or the price pays the truck and nobody." },
  { what: "Paid hours and billable hours", detail: "Paid hours is 2,080 for a full-time year. Billable hours is what you actually sell: driving between jobs, quoting, supplier runs, paperwork and callbacks are paid but not billed, so 1,100-1,500 is typical for a one-truck shop. Use your own count; this is the number most price books get wrong." },
  { what: "Truck, insurance, tools, overhead per year", detail: "Add up a year of truck payments, fuel, repairs and registration; liability and vehicle insurance; tools and consumables; and phone, software, licence, office and marketing. They are spread over billable hours, not paid hours." },
  { what: "On-site and travel hours", detail: "Time on site for this job, and the round trip including the supplier run. Travel is a cost whether or not you bill it as a line; a flat rate has to carry it." },
  { what: "Parts cost and markup tiers", detail: "What the parts cost you. Markup is tiered like tax brackets: the first slice of parts cost carries the highest percentage, the expensive slices less, so a $12 cartridge and a $900 water heater are both priced sensibly. Edit the tiers to your own." },
  { what: "Target margin", detail: "Share of the price you want left over after cost, applied to time (labour and overhead). Parts earn their own markup. The margin is what pays for the callbacks, slow jobs and bad debts a price book always meets." },
  { what: "Round up to", detail: "Price-book prices are usually round numbers. The price is rounded up to the next multiple of this amount, so rounding never takes your margin down." },
  { what: "Minimum on-site hours", detail: "The shortest visit you will drive out for. With the travel time and no parts it sets your minimum callout price." },
  { what: "Time-and-materials rate", detail: "The hourly rate you would bill if you charged by the clock. It is compared with the flat price when a job runs faster or slower than planned. Parts are marked up on the same tiers." },
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

/** Validate tiers: ascending ceilings, last tier open-ended. Throws on bad input. */
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

/** Markup in dollars on a parts cost, slice by slice. */
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

/** True cost of one billable hour: loaded wage over billable hours, plus overhead over billable hours. */
export function hourlyCost(o) {
  const wage = num(o.wage, "Hourly wage");
  const burdenPct = num(o.burdenPct, "Burden");
  const paidHours = num(o.paidHours, "Paid hours", { min: 1 });
  const billableHours = num(o.billableHours, "Billable hours", { min: 1 });
  if (billableHours > paidHours) throw new Error("Billable hours cannot be more than paid hours.");
  const truck = num(o.truckYear, "Truck per year");
  const insurance = num(o.insuranceYear, "Insurance per year");
  const tools = num(o.toolsYear, "Tools per year");
  const overhead = num(o.overheadYear, "Overhead per year");
  const loadedWage = wage * (1 + burdenPct / 100);
  const labourYear = loadedWage * paidHours;
  const overheadTotal = truck + insurance + tools + overhead;
  const labourPerHour = labourYear / billableHours;
  const overheadPerHour = overheadTotal / billableHours;
  return {
    loadedWage, labourYear, overheadTotal, labourPerHour, overheadPerHour,
    perHour: labourPerHour + overheadPerHour,
    lines: [
      { key: "labour", label: "Wages and burden", year: labourYear, perHour: labourPerHour },
      { key: "truck", label: "Truck", year: truck, perHour: truck / billableHours },
      { key: "insurance", label: "Insurance", year: insurance, perHour: insurance / billableHours },
      { key: "tools", label: "Tools and consumables", year: tools, perHour: tools / billableHours },
      { key: "overhead", label: "Phone, software, licence, office, marketing", year: overhead, perHour: overhead / billableHours },
    ],
  };
}

const roundUp = (v, step) => (step > 0 ? Math.ceil(v / step - 1e-9) * step : v);

/** Price one job from a shop's numbers. */
export function priceJob(options = {}, tiers = DEFAULT_TIERS) {
  const o = { ...DEFAULTS, ...options };
  const h = hourlyCost(o);
  const onsiteHours = num(o.onsiteHours, "On-site hours");
  const travelHours = num(o.travelHours, "Travel hours");
  const hours = onsiteHours + travelHours;
  if (hours <= 0) throw new Error("On-site plus travel hours must be more than zero.");
  const partsCost = num(o.partsCost, "Parts cost");
  const targetMarginPct = num(o.targetMarginPct, "Target margin");
  if (targetMarginPct >= 100) throw new Error("Target margin must be under 100%.");
  const roundTo = num(o.roundTo, "Round up to");
  const minOnsiteHours = num(o.minOnsiteHours, "Minimum on-site hours");
  const tmRate = num(o.tmRate, "Time-and-materials rate");

  const m = partsMarkup(partsCost, tiers);
  const timeCost = hours * h.perHour;
  const timeCharge = timeCost / (1 - targetMarginPct / 100);
  const partsCharge = partsCost + m.markup;
  const exact = timeCharge + partsCharge;
  const price = roundUp(exact, roundTo);
  const totalCost = timeCost + partsCost;
  const profit = price - totalCost;

  const minHours = travelHours + minOnsiteHours;
  const minCallout = roundUp((minHours * h.perHour) / (1 - targetMarginPct / 100), roundTo);

  const r = {
    ...o, hourly: h, hours, onsiteHours, travelHours, partsCost, markup: m, timeCost, timeCharge, partsCharge,
    exact, price, totalCost, profit,
    marginPct: price > 0 ? (profit / price) * 100 : 0,
    // What each hour earns after parts are paid for, before and after the hour's own cost.
    effectiveRate: (price - partsCost) / hours,
    profitPerHour: profit / hours,
    minCallout, minHours,
    // Hours at which the flat price just covers cost: past this the job loses money.
    breakEvenHours: h.perHour > 0 ? (price - partsCost) / h.perHour : Infinity,
  };
  r.overrun = [1, 1.25, 1.5, 2].map((k) => overrunRow(r, k));
  r.tm = tmCompare(r, tmRate, tiers);
  return r;
}

function overrunRow(r, k) {
  const hours = r.hours * k;
  const cost = hours * r.hourly.perHour + r.partsCost;
  const profit = r.price - cost;
  return { factor: k, hours, cost, profit, marginPct: r.price > 0 ? (profit / r.price) * 100 : 0, profitPerHour: profit / hours };
}

/** Flat price against a time-and-materials bill when the job runs faster or slower than planned. */
export function tmCompare(r, tmRate, tiers = DEFAULT_TIERS) {
  const rows = [0.6, 0.8, 1, 1.25, 1.5, 2].map((k) => {
    const hours = r.hours * k;
    const cost = hours * r.hourly.perHour + r.partsCost;
    const tmBill = hours * tmRate + r.partsCharge;
    const tmProfit = tmBill - cost;
    const flatProfit = r.price - cost;
    return {
      factor: k, hours, cost, tmBill, tmProfit, flatPrice: r.price, flatProfit,
      flatBeatsTm: flatProfit > tmProfit,
      customerSaves: tmBill - r.price,
    };
  });
  // Hours where the two bills match: tmRate*h + partsCharge = flat price.
  const crossHours = tmRate > 0 ? (r.price - r.partsCharge) / tmRate : Infinity;
  const tmCoversCost = tmRate >= r.hourly.perHour;
  return { rate: tmRate, rows, crossHours, tmCoversCost, tmMarginPerHour: tmRate - r.hourly.perHour };
}

/** Price every job in a book against one set of shop numbers. */
export function priceBook(jobs, shop = {}, tiers = DEFAULT_TIERS) {
  if (!Array.isArray(jobs) || jobs.length === 0) throw new Error("Add at least one job to the price book.");
  return jobs.map((j, i) => {
    const name = String(j.name ?? "").trim() || `Job ${i + 1}`;
    const r = priceJob({ ...shop, onsiteHours: j.onsiteHours, travelHours: j.travelHours, partsCost: j.partsCost }, tiers);
    return { name, onsiteHours: r.onsiteHours, travelHours: r.travelHours, partsCost: r.partsCost, hours: r.hours, price: r.price, totalCost: r.totalCost, profit: r.profit, marginPct: r.marginPct, effectiveRate: r.effectiveRate };
  });
}

// A cell that starts with = + - @ is read as a formula by spreadsheets; a leading apostrophe stops that.
const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  const head = ["Job", "On-site hours", "Travel hours", "Parts cost", "Total hours", "Flat-rate price", "Total cost", "Profit", "Margin %", "Effective rate per hour after parts"];
  const f = (v) => (Math.round(v * 100) / 100).toFixed(2);
  const lines = rows.map((r) => [r.name, r.onsiteHours, r.travelHours, f(r.partsCost), r.hours, f(r.price), f(r.totalCost), f(r.profit), (Math.round(r.marginPct * 10) / 10).toFixed(1), f(r.effectiveRate)].map(csvCell).join(","));
  return [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}

export function summarize(r) {
  const tm = r.tm;
  const fast = tm.rows.find((x) => x.factor === 0.6);
  const slow = tm.rows.find((x) => x.factor === 1.5);
  const parts = [
    `Your true cost is ${money(r.hourly.perHour)} per billable hour (${money(r.hourly.labourPerHour)} wages and burden plus ${money(r.hourly.overheadPerHour)} truck, insurance, tools and overhead).`,
    `A ${r.hours}-hour job (${r.onsiteHours} on site, ${r.travelHours} travel) with ${money(r.partsCost)} of parts costs you ${money(r.totalCost)}; the flat-rate price is ${money(r.price)}, which leaves ${money(r.profit)} (${pct(r.marginPct)}) and an effective ${money(r.effectiveRate)} an hour after parts.`,
    `Your minimum callout price is ${money(r.minCallout)}.`,
    `If the job runs 50% long the flat price leaves ${money(slow.flatProfit)}; if it takes 60% of the planned time it leaves ${money(fast.flatProfit)}. The flat price stops covering your cost at ${(Math.round(r.breakEvenHours * 100) / 100)} hours.`,
  ];
  return { status: r.profit >= 0 ? "ok" : "warn", text: parts.join(" ") };
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
