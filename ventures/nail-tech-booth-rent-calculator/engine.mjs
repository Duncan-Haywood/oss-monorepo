// Nail tech booth rent calculator: pure functions, no I/O, no network.
//
// Everything here is arithmetic on numbers the user types: what a week at the
// chair nets under booth rent, a commission split and an hourly job, divided by
// the hours actually WORKED (idle chair time and unpaid admin included), not the
// hours that were booked. Nothing is a market rate, a tax filing or a forecast.

export const MAX_WEEKS = 300;

export const MODEL_NOTE =
  "Estimates, not market rates and not tax advice: every price, rent, percentage and tax rate is a number you typed. Self-employment and income tax figures are rough set-asides, not a return. Check your lease, your state's rules and a tax professional yourself.";

export const MODELS = ["booth", "commission", "employee"];

export const MODEL_LABELS = {
  booth: "Booth / chair rent",
  commission: "Commission split",
  employee: "Employee (hourly wage)",
};

export const DEFAULTS = Object.freeze({
  hoursAtSalon: 36,
  clientsPerWeek: 24,
  avgTicket: 60,
  minutesPerClient: 75,
  unpaidHours: 4,
  tipPct: 18,
  retailPerClient: 5,
  suppliesPerClient: 6.5,
  targetHourly: 25,
  rentPerWeek: 275,
  cardFeePct: 2.9,
  retailMarginPct: 40,
  insuranceMonthly: 40,
  otherFixedMonthly: 35,
  boothSuppliesPct: 100,
  splitPct: 55,
  retailCommissionPct: 10,
  commissionSuppliesPct: 20,
  hourlyWage: 15,
  employeeSuppliesPct: 0,
  seTaxPct: 15.3,
  incomeReservePct: 10,
  ficaPct: 7.65,
});

export const INPUT_NOTES = [
  { what: "Hours at the salon", detail: "Hours per week your chair is open to you, booked or not. Idle chair time is the gap between these and the hours your clients actually take." },
  { what: "Clients, ticket, minutes per client", detail: "Clients a week, average service price and chair minutes each. Booked hours = clients x minutes / 60; idle hours = hours at the salon less booked hours." },
  { what: "Unpaid admin hours", detail: "Booking, cleaning, laundering towels, ordering, social media, off the chair and unpaid. Counted in hours worked for the booth and commission models; an employee is assumed to do these on the clock." },
  { what: "Tips, retail, supplies", detail: "Tips as a percent of the ticket (you keep them in every model). Retail sold per client. Supplies (gel, acrylic, files, gloves, wipes) per client, with the share you pay for under each model." },
  { what: "Booth rent model", detail: "Weekly rent, card fee percent on everything you take by card, your margin on retail you buy and resell, monthly liability insurance and other fixed costs (licence, booking software), spread over 52 weeks." },
  { what: "Commission model", detail: "You keep your split percent of service sales plus a retail commission and your tips. The salon sets the price and usually pays card fees; you pay the share of supplies you enter. Treated as self-employed income." },
  { what: "Employee model", detail: "Hourly wage on the hours you are at the salon (or more, if clients are booked beyond them), plus tips and retail commission. Only the employee share of payroll tax applies." },
  { what: "Tax set-asides", detail: "Self-employment tax is applied to 92.35 percent of net profit at the rate you enter (15.3 percent default). Income reserve is the percent of net (less half of self-employment tax) you set aside; use your own rate. Not tax advice." },
  { what: "Target hourly", detail: "Take-home per hour worked you need. Break-even clients per week is the fewest clients a week at which a model reaches it." },
  { what: "Past-week rows", detail: "week,model,pay,tips,expenses,hours[,booked_hours]. Pay is what you kept from services and retail before expenses; hours are all hours worked including idle and admin; booked_hours is optional." },
];

export const money = (v) => {
  if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return "n/a";
  const r = Math.round(Math.abs(v) * 100) / 100;
  return `${v < -0.004 ? "-" : ""}$${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const pct = (p, digits = 1) => (p === null || p === undefined || Number.isNaN(p) || !Number.isFinite(p) ? "n/a" : `${(p * 100).toFixed(digits).replace(/\.0+$/, "")}%`);

const toNumber = (s) => {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
};

const FIELDS = [
  ["hoursAtSalon", 0, 168], ["clientsPerWeek", 0, 500], ["avgTicket", 0, 1e5], ["minutesPerClient", 0, 1440],
  ["unpaidHours", 0, 168], ["tipPct", 0, 200], ["retailPerClient", 0, 1e4], ["suppliesPerClient", 0, 1e4],
  ["targetHourly", 0.01, 1e4], ["rentPerWeek", 0, 1e5], ["cardFeePct", 0, 100], ["retailMarginPct", 0, 100],
  ["insuranceMonthly", 0, 1e5], ["otherFixedMonthly", 0, 1e5], ["boothSuppliesPct", 0, 100], ["splitPct", 0, 100],
  ["retailCommissionPct", 0, 100], ["commissionSuppliesPct", 0, 100], ["hourlyWage", 0, 1e4],
  ["employeeSuppliesPct", 0, 100], ["seTaxPct", 0, 100], ["incomeReservePct", 0, 100], ["ficaPct", 0, 100],
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

/** Tax set-asides on a week of results. Employees pay the employee share only; everyone else pays self-employment tax. */
function taxes(o, model, gross, net) {
  if (model === "employee") {
    const fica = Math.max(0, gross) * (o.ficaPct / 100);
    return { seTax: fica, incomeReserve: Math.max(0, gross - fica / 2) * (o.incomeReservePct / 100), seLabel: "payroll tax (employee share)" };
  }
  const se = Math.max(0, net) * 0.9235 * (o.seTaxPct / 100);
  return { seTax: se, incomeReserve: Math.max(0, net - se / 2) * (o.incomeReservePct / 100), seLabel: "self-employment tax" };
}

/** One model's week at a given client count. */
export function week(raw, model, clientsOverride) {
  const o = normalizeOptions(raw);
  const clients = clientsOverride === undefined ? o.clientsPerWeek : clientsOverride;
  const service = clients * o.avgTicket;
  const tips = service * (o.tipPct / 100);
  const retail = clients * o.retailPerClient;
  const bookedHours = (clients * o.minutesPerClient) / 60;
  const chairHours = Math.max(o.hoursAtSalon, bookedHours);
  const idleHours = Math.max(0, o.hoursAtSalon - bookedHours);
  const supplies = clients * o.suppliesPerClient;
  const fixedWeekly = ((o.insuranceMonthly + o.otherFixedMonthly) * 12) / 52;
  let income;
  let costs;
  let hoursWorked;
  const lines = [];
  if (model === "booth") {
    const card = (service + tips + retail) * (o.cardFeePct / 100);
    income = service + tips + retail * (o.retailMarginPct / 100);
    costs = o.rentPerWeek + card + supplies * (o.boothSuppliesPct / 100) + fixedWeekly;
    hoursWorked = chairHours + o.unpaidHours;
    lines.push(["Services and tips kept", service + tips], ["Retail margin", retail * (o.retailMarginPct / 100)], ["Rent", -o.rentPerWeek], ["Card fees", -card], ["Supplies", -supplies * (o.boothSuppliesPct / 100)], ["Insurance and fixed costs", -fixedWeekly]);
  } else if (model === "commission") {
    income = service * (o.splitPct / 100) + tips + retail * (o.retailCommissionPct / 100);
    costs = supplies * (o.commissionSuppliesPct / 100) + fixedWeekly;
    hoursWorked = chairHours + o.unpaidHours;
    lines.push(["Your split of services", service * (o.splitPct / 100)], ["Tips", tips], ["Retail commission", retail * (o.retailCommissionPct / 100)], ["Supplies", -supplies * (o.commissionSuppliesPct / 100)], ["Insurance and fixed costs", -fixedWeekly]);
  } else if (model === "employee") {
    const paidHours = chairHours;
    income = o.hourlyWage * paidHours + tips + retail * (o.retailCommissionPct / 100);
    costs = supplies * (o.employeeSuppliesPct / 100);
    hoursWorked = paidHours;
    lines.push(["Wages", o.hourlyWage * paidHours], ["Tips", tips], ["Retail commission", retail * (o.retailCommissionPct / 100)], ["Supplies", -costs]);
  } else {
    throw new Error(`unknown model ${model}`);
  }
  const net = income - costs;
  const t = taxes(o, model, income, net);
  const takeHome = net - t.seTax - t.incomeReserve;
  return {
    id: model, model, label: MODEL_LABELS[model], clients, service, tips, retail, bookedHours, idleHours, hoursWorked,
    income, costs, net, seTax: t.seTax, seLabel: t.seLabel, incomeReserve: t.incomeReserve, takeHome, lines,
    perWorkedHour: hoursWorked > 0 ? takeHome / hoursWorked : null,
    perBookedHour: bookedHours > 0 ? takeHome / bookedHours : null,
    netPerWorkedHour: hoursWorked > 0 ? net / hoursWorked : null,
  };
}

const SCAN_STEP = 0.05;
const SCAN_MAX = 150;

/** Fewest clients per week at which a model's take-home per worked hour reaches the target (linear interpolation on a fine scan). */
function breakEvenClients(o, model) {
  let prev = null;
  for (let c = 0; c <= SCAN_MAX + 1e-9; c += SCAN_STEP) {
    const v = week(o, model, c).perWorkedHour;
    if (v !== null && v >= o.targetHourly - 1e-9) {
      if (prev === null || c === 0) return c;
      const frac = (o.targetHourly - prev.v) / (v - prev.v);
      return prev.c + frac * (c - prev.c);
    }
    prev = { c, v };
  }
  return null;
}

/** Clients per week where model a's take-home per worked hour first overtakes model b's. */
function crossover(o, a, b) {
  let prev = null;
  for (let c = 0; c <= SCAN_MAX + 1e-9; c += SCAN_STEP) {
    const d = week(o, a, c).perWorkedHour - week(o, b, c).perWorkedHour;
    if (prev !== null && (prev.d < 0) !== (d < 0) && d !== prev.d) return prev.c + (-prev.d / (d - prev.d)) * (c - prev.c);
    prev = { c, d };
  }
  return null;
}

/** Compare all three arrangements on one typical week. */
export function compare(raw = {}) {
  const o = normalizeOptions(raw);
  const models = MODELS.map((id) => ({ ...week(o, id), breakEvenClients: breakEvenClients(o, id), meetsTarget: false }));
  for (const m of models) m.meetsTarget = m.perWorkedHour !== null && m.perWorkedHour >= o.targetHourly - 1e-9;
  const ranked = [...models].sort((a, b) => b.perWorkedHour - a.perWorkedHour);
  const best = ranked[0];
  const bookedHours = models[0].bookedHours;
  const crossovers = {
    boothVsCommission: crossover(o, "booth", "commission"),
    boothVsEmployee: crossover(o, "booth", "employee"),
  };
  const scenarios = [-6, -3, 0, 3, 6].map((delta) => {
    const clients = Math.max(0, o.clientsPerWeek + delta);
    return { delta, clients, perModel: Object.fromEntries(MODELS.map((id) => [id, week(o, id, clients).perWorkedHour])) };
  });
  return { options: o, models, best, bookedHours, idleHours: models[0].idleHours, crossovers, scenarios };
}

export function summarizeCompare(c) {
  const o = c.options;
  const ok = c.models.filter((m) => m.meetsTarget).length;
  let text = `${o.clientsPerWeek} clients a week book ${c.bookedHours.toFixed(1)} of your ${o.hoursAtSalon} hours at the salon (${c.idleHours.toFixed(1)} idle). Best is ${c.best.label} at ${money(c.best.perWorkedHour)} take-home per hour worked (${money(c.best.takeHome)} a week over ${c.best.hoursWorked.toFixed(1)} hours).`;
  text += ` ${ok} of ${c.models.length} arrangements reach your ${money(o.targetHourly)} target.`;
  const bc = c.crossovers.boothVsCommission;
  if (bc !== null) text += ` Booth rent overtakes the commission split at about ${bc.toFixed(1)} clients a week.`;
  return { status: ok ? "ok" : "below", text };
}

/** Parse past-week rows: week,model,pay,tips,expenses,hours[,booked_hours]. Never throws; errors carry line numbers. */
export function parseWeeks(text) {
  const weeks = [];
  const errors = [];
  let seenHeader = false;
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(",").map((s) => s.trim());
    if (!seenHeader && /^(week|date)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `Line ${i + 1}`;
    if (f.length < 6) { errors.push(`${at}: expected week,model,pay,tips,expenses,hours[,booked_hours]`); return; }
    const pay = toNumber(f[2]);
    const tips = toNumber(f[3]);
    const expenses = toNumber(f[4]);
    const hours = toNumber(f[5]);
    const booked = f.length > 6 && f[6] !== "" ? toNumber(f[6]) : null;
    const model = f[1].toLowerCase();
    if (!f[0]) errors.push(`${at}: week label is empty`);
    else if (!MODELS.includes(model)) errors.push(`${at}: model must be booth, commission or employee`);
    else if (pay === null || pay < 0) errors.push(`${at}: pay must be a number of dollars, zero or more`);
    else if (tips === null || tips < 0) errors.push(`${at}: tips must be a number of dollars, zero or more`);
    else if (expenses === null || expenses < 0) errors.push(`${at}: expenses must be a number of dollars, zero or more`);
    else if (hours === null || hours <= 0) errors.push(`${at}: hours must be greater than zero`);
    else if (f.length > 6 && f[6] !== "" && (booked === null || booked < 0 || booked > hours)) errors.push(`${at}: booked_hours must be between 0 and hours`);
    else weeks.push({ name: f[0], model, pay, tips, expenses, hours, bookedHours: booked });
  });
  if (weeks.length > MAX_WEEKS) errors.push(`Too many weeks: ${weeks.length} (limit ${MAX_WEEKS})`);
  return { weeks, errors };
}

/** Audit past weeks: take-home per hour worked, idle share, grouped by arrangement, worst week first. */
export function history(parsed, raw = {}) {
  const o = normalizeOptions(raw);
  const weeks = (parsed.weeks || []).map((w) => {
    const gross = w.pay + w.tips;
    const net = gross - w.expenses;
    const t = taxes(o, w.model, gross, net);
    const takeHome = net - t.seTax - t.incomeReserve;
    const perWorkedHour = takeHome / w.hours;
    const needed = w.hours * o.targetHourly;
    const shortfall = Math.max(0, needed - takeHome);
    return {
      ...w, net, seTax: t.seTax, incomeReserve: t.incomeReserve, takeHome, perWorkedHour,
      perBookedHour: w.bookedHours ? takeHome / w.bookedHours : null,
      idleHours: w.bookedHours === null ? null : w.hours - w.bookedHours,
      idleShare: w.bookedHours === null ? null : 1 - w.bookedHours / w.hours,
      shortfall, atTarget: shortfall <= 1e-9,
    };
  }).sort((a, b) => a.perWorkedHour - b.perWorkedHour || a.name.localeCompare(b.name));
  const groups = new Map();
  for (const w of weeks) {
    const g = groups.get(w.model) || { model: w.model, count: 0, takeHome: 0, hours: 0, idle: 0, idleKnown: 0 };
    g.count += 1; g.takeHome += w.takeHome; g.hours += w.hours;
    if (w.idleHours !== null) { g.idle += w.idleHours; g.idleKnown += w.hours; }
    groups.set(w.model, g);
  }
  const byModel = [...groups.values()].map((g) => ({
    model: g.model, label: MODEL_LABELS[g.model], count: g.count, takeHome: g.takeHome, hours: g.hours,
    perWorkedHour: g.takeHome / g.hours, idleShare: g.idleKnown > 0 ? g.idle / g.idleKnown : null,
  })).sort((a, b) => b.perWorkedHour - a.perWorkedHour || a.model.localeCompare(b.model));
  const takeHome = weeks.reduce((a, w) => a + w.takeHome, 0);
  const hours = weeks.reduce((a, w) => a + w.hours, 0);
  const shortfall = weeks.reduce((a, w) => a + w.shortfall, 0);
  return {
    options: o, weeks, byModel, takeHome, hours, shortfall,
    below: weeks.filter((w) => !w.atTarget).length,
    blendedHourly: hours > 0 ? takeHome / hours : null,
  };
}

export function summarizeHistory(h) {
  if (!h.weeks.length) return { status: "empty", text: "No weeks." };
  const o = h.options;
  const best = h.byModel[0];
  const worst = h.byModel[h.byModel.length - 1];
  let text = `${h.below} of ${h.weeks.length} weeks took home under ${money(o.targetHourly)} per hour worked (blended ${money(h.blendedHourly)}); the shortfall to target is ${money(h.shortfall)}.`;
  if (h.byModel.length > 1) text += ` Best arrangement: ${best.model} at ${money(best.perWorkedHour)} an hour; worst: ${worst.model} at ${money(worst.perWorkedHour)}.`;
  return { status: h.below ? "below" : "ok", text };
}
