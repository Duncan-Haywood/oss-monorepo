// Firewood profit: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  cords: 60,
  price: 300,
  wood: 90,
  processHrs: 4,
  equipment: 25,
  other: 10,
  miles: 20,
  perMile: 0.8,
  cordsPerLoad: 1.5,
  deliveryHrs: 1.5,
  wage: 25,
  lossPct: 5,
};

export const INPUT_NOTES = [
  { what: "Cords cut per season", detail: "Full cords (4 x 4 x 8 ft, 128 cubic feet of stacked wood) you cut and split, not the number you hope to sell. A face cord or rick is usually a third of a cord, so divide by three." },
  { what: "Selling price per cord", detail: "What a customer pays per full cord, delivered if you deliver. If you sell by the face cord, multiply by three, and check that the pieces really are stacked tight and a full 4 x 8 ft." },
  { what: "Wood cost per cord", detail: "What a cord of logs or standing timber costs you: the log price, stumpage, permit fee, or the cost of hauling in free tree-service wood. Put 0 only if it truly costs nothing, and count the truck trips if it does not." },
  { what: "Hours to process one cord", detail: "Time to cut to length, split, stack and, if you season it, restack. A hand splitter is slower than a processor; time a full day and divide by the cords made rather than guessing." },
  { what: "Equipment, fuel and sharpening per cord", detail: "Chainsaw fuel and chain, splitter fuel and oil, and wear on the machines spread over the cords they make. Divide a year of repairs and depreciation by the cords you cut." },
  { what: "Other cost per cord", detail: "Storage space, racks, tarps, insurance, a permit or a website, divided by the cords you sell." },
  { what: "Delivery miles, cost per mile, cords per load, hours per load", detail: "Round-trip miles for an average delivery, what the truck costs you a mile (fuel, tires, repairs, not just gas), how many cords a load carries (a pickup is often under a cord), and the hours the trip takes including unloading and stacking." },
  { what: "Your wage per hour", detail: "The hourly pay you want for your own work. It is used to say what price you need, not subtracted from the cash margin." },
  { what: "Wood that never sells (%)", detail: "Share of the wood you cut that rots, goes unsold, or is given away. It raises the true cost of every cord you sell; check last winter's leftover stack, not your best year." },
];

const num = (v, name, { min = 0 } = {}) => {
  const n = v === "" || v == null ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number of ${min} or more.`);
  return n;
};

export function money(v) {
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}$${s}`;
}
export const money0 = (v) => money(Math.round(v)).replace(/\.00$/, "");
export const pct = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;

function core(o) {
  const cords = num(o.cords, "Cords cut", { min: 0.01 });
  const price = num(o.price, "Selling price");
  const wood = num(o.wood, "Wood cost");
  const processHrs = num(o.processHrs, "Processing hours", { min: 0.01 });
  const equipment = num(o.equipment, "Equipment and fuel");
  const other = num(o.other, "Other cost");
  const miles = num(o.miles, "Delivery miles");
  const perMile = num(o.perMile, "Cost per mile");
  const cordsPerLoad = num(o.cordsPerLoad, "Cords per load", { min: 0.01 });
  const deliveryHrs = num(o.deliveryHrs, "Hours per load");
  const wage = num(o.wage, "Your wage");
  const lossPct = num(o.lossPct, "Wood that never sells");
  if (lossPct >= 100) throw new Error("Wood that never sells must be under 100%.");

  const sold = 1 - lossPct / 100;
  const lines = [
    { key: "wood", label: "Wood", value: wood },
    { key: "equipment", label: "Equipment and fuel", value: equipment },
    { key: "other", label: "Other", value: other },
    { key: "delivery", label: "Delivery vehicle (on cords sold)", value: (sold * miles * perMile) / cordsPerLoad },
  ];
  const costPerCord = lines.reduce((s, l) => s + l.value, 0);
  const hoursPerCord = processHrs + (sold * deliveryHrs) / cordsPerLoad;
  const revenuePerCord = sold * price;
  const marginPerCord = revenuePerCord - costPerCord;
  const afterWagePerCord = marginPerCord - wage * hoursPerCord;
  const biggest = lines.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    cords, price, wage, lossPct, lines, costPerCord, hoursPerCord, revenuePerCord,
    marginPerCord, afterWagePerCord,
    marginSeason: marginPerCord * cords,
    afterWageSeason: afterWagePerCord * cords,
    hoursSeason: hoursPerCord * cords,
    soldCords: cords * sold,
    profitPerHour: marginPerCord / hoursPerCord,
    breakevenPrice: costPerCord / sold,
    wagePrice: (costPerCord + wage * hoursPerCord) / sold,
    faceCordPrice: price / 3,
    faceCordWagePrice: (costPerCord + wage * hoursPerCord) / sold / 3,
    biggest, biggestShare: costPerCord > 0 ? biggest.value / costPerCord : null,
  };
}

export function computeFirewood(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const r = core(o);
  const priceScenarios = [0.8, 0.9, 1, 1.1, 1.2].map((k) => {
    const x = core({ ...o, price: r.price * k });
    return { factor: k, price: r.price * k, profitPerHour: x.profitPerHour, afterWagePerCord: x.afterWagePerCord, marginSeason: x.marginSeason, current: k === 1 };
  });
  const woodScenarios = [0.5, 1, 1.5, 2].map((k) => {
    const x = core({ ...o, wood: Number(o.wood) * k });
    return { factor: k, wood: Number(o.wood) * k, costPerCord: x.costPerCord, profitPerHour: x.profitPerHour, wagePrice: x.wagePrice, current: k === 1 };
  });
  const mileScenarios = [0.5, 1, 2, 3].map((k) => {
    const x = core({ ...o, miles: Number(o.miles) * k, deliveryHrs: Number(o.deliveryHrs) * k });
    return { factor: k, miles: Number(o.miles) * k, profitPerHour: x.profitPerHour, afterWagePerCord: x.afterWagePerCord, wagePrice: x.wagePrice, current: k === 1 };
  });
  return { ...r, priceScenarios, woodScenarios, mileScenarios };
}

export function summarize(r) {
  const good = r.afterWagePerCord >= 0;
  const parts = [
    `Each cord you cut costs ${money(r.costPerCord)} in cash and ${r.hoursPerCord.toFixed(2)} hours of your time, and ${r.biggest.label.toLowerCase()} is the largest cash line at ${pct(r.biggestShare * 100)}.`,
    `Selling at ${money(r.price)} with ${pct(r.lossPct)} of the wood unsold leaves ${money(r.marginPerCord)} a cord, or ${money(r.profitPerHour)} an hour for your time.`,
    `After paying yourself ${money(r.wage)} an hour that is ${good ? "a margin of" : "a loss of"} ${money(Math.abs(r.afterWagePerCord))} a cord, ${money(Math.abs(r.afterWageSeason))} over ${r.cords} cords.`,
    `To earn your wage you need ${money(r.wagePrice)} a cord (${money(r.faceCordWagePrice)} a face cord); you break even on cash at ${money(r.breakevenPrice)}.`,
  ];
  return { status: good ? "ok" : "warn", text: parts.join(" ") };
}
