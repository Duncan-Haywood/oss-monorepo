// Dog grooming price calculator: pure functions, no I/O, no network.
//
// Arithmetic on numbers the groomer types: what a dog class takes in minutes
// (including matting and de-shedding extras and drive time), what it brings in,
// and what an hour of their time should earn. Nothing is a market rate.

export const MAX_ROWS = 500;

export const MODEL_NOTE =
  "Estimates, not market rates and not advice: every price, minute and percentage is a number you typed. Check your own costs, local rules and what clients will accept yourself.";

export const DEFAULTS = Object.freeze({
  targetHourly: 60,
  walkAwayPct: 75,
  driveMinutes: 0,
  noShowPct: 5,
  suppliesPerDog: 6,
});

export const INPUT_NOTES = [
  { what: "Class rows", detail: "class,price,minutes,supplies,matting_minutes,matting_fee,deshed_minutes,deshed_fee. Price is your base price for that size or coat class; the last four columns are optional extras." },
  { what: "Minutes", detail: "Table time for a plain groom: bath, dry, cut, nails. Use times you have tracked, not times you quote." },
  { what: "Matting and de-shedding extras", detail: "Extra minutes and the surcharge you add when a dog arrives matted or needs a de-shed. The tool shows the effective hourly with each extra, so you see whether the surcharge covers the time." },
  { what: "Drive minutes", detail: "Mobile groomers: minutes of driving and setup per appointment, unpaid. Leave 0 for a salon." },
  { what: "Supplies", detail: "Shampoo, blades, wipes and anything consumed per dog. A class row can override the default." },
  { what: "No-show percent", detail: "Share of booked slots that never pay. The slot time is lost and no price is collected, so the price must cover it." },
  { what: "Target hourly rate", detail: "What an hour of your time should earn. Effective hourly = (price less supplies, after no-shows) / hours the slot holds." },
  { what: "Walk-away price", detail: "The price at a floor rate (a percent of your target). Below it the dog costs you more than it is worth to you." },
  { what: "Past appointments", detail: "breed_class,price,minutes. Grouped by class: effective hourly after drive time, supplies and no-shows, and which classes underpay your target." },
];

export const money = (v) => {
  if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return "n/a";
  const r = Math.round(Math.abs(v) * 100) / 100;
  return `${v < -0.004 ? "-" : ""}$${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const toNumber = (s) => {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
};

const FIELDS = [
  ["targetHourly", 0.01, 1e4], ["walkAwayPct", 0, 100], ["driveMinutes", 0, 1000],
  ["noShowPct", 0, 95], ["suppliesPerDog", 0, 1e4],
];

/** Merge user options over defaults and validate. Throws Error with a readable message. */
export function normalizeOptions(raw = {}) {
  const o = { ...DEFAULTS };
  for (const [k, lo, hi] of FIELDS) {
    const v = raw[k];
    if (v === undefined || v === null || v === "") continue;
    const n = toNumber(v);
    if (n === null) throw new Error(`${k} must be a number`);
    if (n < lo || n > hi) throw new Error(`${k} must be between ${lo} and ${hi}`);
    o[k] = n;
  }
  return o;
}

const splitLine = (line) => line.split(",").map((s) => s.trim());

/** Parse class rows. Never throws; errors carry line numbers. */
export function parseClasses(text, raw = {}) {
  const o = normalizeOptions(raw);
  const classes = [];
  const errors = [];
  let seenHeader = false;
  String(text ?? "").split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const f = splitLine(line);
    if (!seenHeader && /^(class|breed_class|name)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `Line ${i + 1}`;
    if (f.length < 3) { errors.push(`${at}: expected class,price,minutes[,supplies,matting_minutes,matting_fee,deshed_minutes,deshed_fee]`); return; }
    const price = toNumber(f[1]);
    const minutes = toNumber(f[2]);
    const opt = (idx, dflt) => (f[idx] === undefined || f[idx] === "" ? dflt : toNumber(f[idx]));
    const supplies = opt(3, o.suppliesPerDog);
    const matM = opt(4, 0); const matF = opt(5, 0); const desM = opt(6, 0); const desF = opt(7, 0);
    if (!f[0]) errors.push(`${at}: class name is empty`);
    else if (price === null || price < 0) errors.push(`${at}: price must be a number of dollars, zero or more`);
    else if (minutes === null || minutes <= 0) errors.push(`${at}: minutes must be greater than zero`);
    else if ([supplies, matM, matF, desM, desF].some((v) => v === null || v < 0)) errors.push(`${at}: supplies, matting and de-shedding values must be numbers, zero or more`);
    else classes.push({ name: f[0], price, minutes, supplies, mattingMinutes: matM, mattingFee: matF, deshedMinutes: desM, deshedFee: desF });
  });
  if (classes.length > MAX_ROWS) errors.push(`Too many classes: ${classes.length} (limit ${MAX_ROWS})`);
  return { classes, errors };
}

// Economics of one booked slot. A no-show holds the slot, pays nothing and uses no supplies.
function slot(o, price, minutes, supplies) {
  const keep = 1 - o.noShowPct / 100;
  const hours = (minutes + o.driveMinutes) / 60;
  const net = (price - supplies) * keep;
  const effective = hours > 0 ? net / hours : null;
  // Price at which net/hours == rate
  const priceFor = (rate) => (rate * hours) / keep + supplies;
  return { hours, net, effective, priceFor };
}

/** Effective hourly per class (plain and with each extra), price needed for target, walk-away. */
export function compare(parsed, raw = {}) {
  const o = normalizeOptions(raw);
  const floorRate = (o.targetHourly * o.walkAwayPct) / 100;
  const rows = (parsed.classes || []).map((c) => {
    const variant = (label, addMin, addFee) => {
      const s = slot(o, c.price + addFee, c.minutes + addMin, c.supplies);
      const needed = s.priceFor(o.targetHourly);
      return {
        label, price: c.price + addFee, minutes: c.minutes + addMin, hours: s.hours,
        effective: s.effective, atTarget: s.effective !== null && s.effective >= o.targetHourly - 1e-9,
        neededPrice: needed, shortfall: Math.max(0, needed - (c.price + addFee)),
        walkAway: s.priceFor(floorRate),
      };
    };
    const variants = [variant("Plain", 0, 0)];
    if (c.mattingMinutes || c.mattingFee) variants.push(variant("Matted", c.mattingMinutes, c.mattingFee));
    if (c.deshedMinutes || c.deshedFee) variants.push(variant("De-shed", c.deshedMinutes, c.deshedFee));
    if ((c.mattingMinutes || c.mattingFee) && (c.deshedMinutes || c.deshedFee)) variants.push(variant("Matted + de-shed", c.mattingMinutes + c.deshedMinutes, c.mattingFee + c.deshedFee));
    return { ...c, plain: variants[0], variants, belowWalkAway: c.price < variants[0].walkAway - 1e-9 };
  });
  const sorted = [...rows].sort((a, b) => a.plain.effective - b.plain.effective || a.name.localeCompare(b.name));
  return { options: o, classes: sorted, below: sorted.filter((r) => !r.plain.atTarget).length, floorRate };
}

export function summarizeCompare(c) {
  if (!c.classes.length) return { status: "empty", text: "No dog classes: add at least one row." };
  const o = c.options;
  const worst = c.classes[0];
  let text = `${c.below} of ${c.classes.length} classes earn under ${money(o.targetHourly)} an hour after drive time, supplies and ${o.noShowPct}% no-shows.`;
  text += ` Lowest: ${worst.name} at ${money(worst.plain.effective)} an hour; it needs ${money(worst.plain.neededPrice)} to hit target, and below ${money(worst.plain.walkAway)} is a walk-away.`;
  return { status: c.below ? "below" : "ok", text };
}

/** Parse past appointments: breed_class,price,minutes. Never throws. */
export function parseAppointments(text) {
  const appointments = [];
  const errors = [];
  let seenHeader = false;
  String(text ?? "").split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const f = splitLine(line);
    if (!seenHeader && /^(breed_class|class|breed|name)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `Line ${i + 1}`;
    if (f.length < 3) { errors.push(`${at}: expected breed_class,price,minutes`); return; }
    const price = toNumber(f[1]);
    const minutes = toNumber(f[2]);
    if (!f[0]) errors.push(`${at}: breed class is empty`);
    else if (price === null || price < 0) errors.push(`${at}: price must be a number of dollars, zero or more`);
    else if (minutes === null || minutes <= 0) errors.push(`${at}: minutes must be greater than zero`);
    else appointments.push({ name: f[0], price, minutes });
  });
  if (appointments.length > MAX_ROWS) errors.push(`Too many appointments: ${appointments.length} (limit ${MAX_ROWS})`);
  return { appointments, errors };
}

/** Group past appointments by class and show which classes underpay the target. */
export function audit(parsed, raw = {}) {
  const o = normalizeOptions(raw);
  const keep = 1 - o.noShowPct / 100;
  const groups = new Map();
  for (const a of parsed.appointments || []) {
    const key = a.name.toLowerCase();
    const g = groups.get(key) || { name: a.name, count: 0, revenue: 0, minutes: 0 };
    g.count += 1; g.revenue += a.price; g.minutes += a.minutes;
    groups.set(key, g);
  }
  const classes = [...groups.values()].map((g) => {
    const slotsLost = (g.count * (1 - keep)) / keep;
    const avgMinutes = g.minutes / g.count;
    const totalMinutes = g.minutes + (g.count + slotsLost) * o.driveMinutes + slotsLost * avgMinutes;
    const hours = totalMinutes / 60;
    const net = g.revenue - g.count * o.suppliesPerDog;
    const effective = net / hours;
    const neededNet = hours * o.targetHourly;
    const shortfall = Math.max(0, neededNet - net);
    return {
      ...g, avgPrice: g.revenue / g.count, avgMinutes, hours, net, effective,
      atTarget: shortfall <= 1e-9, shortfall,
      raisePerDog: shortfall / g.count, neededAvgPrice: g.revenue / g.count + shortfall / g.count,
    };
  }).sort((a, b) => a.effective - b.effective || a.name.localeCompare(b.name));
  const revenue = classes.reduce((a, g) => a + g.revenue, 0);
  const net = classes.reduce((a, g) => a + g.net, 0);
  const hours = classes.reduce((a, g) => a + g.hours, 0);
  const shortfall = classes.reduce((a, g) => a + g.shortfall, 0);
  return {
    options: o, classes, revenue, net, hours, shortfall,
    count: classes.reduce((a, g) => a + g.count, 0),
    below: classes.filter((g) => !g.atTarget).length,
    blendedHourly: hours > 0 ? net / hours : null,
  };
}

export function summarizeAudit(a) {
  if (!a.classes.length) return { status: "empty", text: "No appointments." };
  const o = a.options;
  const worst = a.classes[0];
  let text = `${a.below} of ${a.classes.length} classes underpay ${money(o.targetHourly)} an hour (blended ${money(a.blendedHourly)}); the shortfall to target is ${money(a.shortfall)} over ${a.count} appointments.`;
  text += ` Worst: ${worst.name} at ${money(worst.effective)} an hour.`;
  return { status: a.below ? "below" : "ok", text };
}
