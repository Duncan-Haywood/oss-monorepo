// Pool service route calculator: pure functions, no I/O, no network.
//
// Arithmetic on numbers the user types: what each account pays per month, how
// long a visit and the drive into it take, what chemicals and callbacks cost,
// what the truck costs per driving hour and what an hour of route time should
// earn. Nothing here is a market rate and nothing is a prediction.

export const MAX_ACCOUNTS = 300;

export const MODEL_NOTE =
  "Estimates, not market rates and not advice: every price, minute and cost is a number you typed. Check your service agreements, local rules and what each customer will accept yourself.";

export const DEFAULTS = Object.freeze({
  visitsPerMonth: 4.33,
  truckPerHr: 14,
  laborPerHr: 0,
  callbackMin: 45,
  callbackCost: 15,
  targetHourly: 40,
  maxIncreasePct: 15,
  newLegMin: 15,
  newPrice: 140,
  newVisitMin: 25,
  newChem: 30,
  newCallbacks: 1,
});

export const DEFAULT_ACCOUNTS_CSV = `name,price,visitMin,driveMin,chemicals,callbacks
Alvarez (Oak Lane),130,25,6,28,1
Brooks (Oak Lane),120,22,4,24,0
Chen (Cedar Ct),160,30,8,36,2
Dunn (Hillcrest),115,28,22,30,3
Ellis (Lakeshore),210,40,10,52,1
Foster (Far Rd),125,25,35,34,2
Garcia (Cedar Ct),140,26,5,30,1
Hart (Hillcrest),95,24,24,22,1
Ito (Lakeshore),185,35,9,48,0
Jones (Oak Lane),110,22,5,22,0
`;

export const INPUT_NOTES = [
  { what: "Accounts", detail: "One row per pool: name, monthly price, minutes on site per visit, drive minutes into that stop from the previous one, chemical cost per month, and unplanned callbacks (equipment or repair trips) per year. A header row may reorder the columns by name. Up to 300 accounts." },
  { what: "Visits per month", detail: "Weekly service is 4.33 visits a month. Every account uses the same number." },
  { what: "Truck cost", detail: "Fuel and wear per hour spent driving, applied to drive minutes and callback trips. Helper pay per route hour is optional; your own time is what the target hourly is for." },
  { what: "Callbacks", detail: "Each callback costs the minutes and parts you type, spread over twelve months. They are unpaid trips, so they show up as lost hours." },
  { what: "Target hourly", detail: "What an hour of route time should earn you after chemicals, truck, callbacks and any helper. The price that clears it is the account's cost plus target times its hours." },
  { what: "Route density", detail: "Dropping a stop removes its visit and the drive into it; the hours it frees are assumed not refilled. Adding a stop uses the drive minutes you type for the new leg." },
];

const num = (v, name, { min = 0, max = Infinity } = {}) => {
  if (v === undefined || v === null || v === "") throw new Error(`${name} needs a number`);
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new Error(`${name} needs a number`);
  if (n < min || n > max) throw new Error(`${name} must be between ${min} and ${max === Infinity ? "a large number" : max}`);
  return n;
};

export function money(v) {
  const n = Math.round(Math.abs(v) * 100) / 100;
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 && n !== 0 ? "-" : ""}$${s}`;
}

const r2 = (n) => Math.round(n * 100) / 100;

export function resolveOptions(o = {}) {
  const d = DEFAULTS;
  const pick = (k) => (o[k] === undefined || o[k] === "" ? d[k] : o[k]);
  return {
    visitsPerMonth: num(pick("visitsPerMonth"), "Visits per month", { min: 0.25, max: 31 }),
    truckPerHr: num(pick("truckPerHr"), "Truck cost per driving hour", { max: 500 }),
    laborPerHr: num(pick("laborPerHr"), "Helper pay per route hour", { max: 500 }),
    callbackMin: num(pick("callbackMin"), "Callback minutes", { max: 600 }),
    callbackCost: num(pick("callbackCost"), "Callback parts cost", { max: 100000 }),
    targetHourly: num(pick("targetHourly"), "Target hourly", { max: 1000 }),
    maxIncreasePct: num(pick("maxIncreasePct"), "Largest price increase you would ask", { max: 500 }),
    newLegMin: num(pick("newLegMin"), "New stop drive minutes", { max: 180 }),
    newPrice: num(pick("newPrice"), "New stop monthly price", { max: 100000 }),
    newVisitMin: num(pick("newVisitMin"), "New stop visit minutes", { min: 1, max: 240 }),
    newChem: num(pick("newChem"), "New stop chemicals", { max: 100000 }),
    newCallbacks: num(pick("newCallbacks"), "New stop callbacks per year", { max: 52 }),
  };
}

const HEADER_ALIASES = {
  name: "name", account: "name", customer: "name", pool: "name", client: "name",
  price: "price", monthly: "price", monthlyprice: "price", rate: "price",
  visitmin: "visitMin", visit: "visitMin", onsite: "visitMin", minutes: "visitMin", visitminutes: "visitMin",
  drivemin: "driveMin", drive: "driveMin", driveminutes: "driveMin",
  chemicals: "chemicals", chemical: "chemicals", chem: "chemicals", chemcost: "chemicals",
  callbacks: "callbacks", callback: "callbacks", repairs: "callbacks",
};
const COLUMNS = ["name", "price", "visitMin", "driveMin", "chemicals", "callbacks"];

function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseAccounts(text) {
  const errors = [];
  const accounts = [];
  const lines = String(text ?? "").split(/\r?\n/);
  let cols = COLUMNS;
  let first = true;
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = splitCsv(line);
    if (first) {
      first = false;
      const mapped = cells.map((c) => HEADER_ALIASES[c.toLowerCase().replace(/[^a-z]/g, "")]);
      if (mapped.includes("price") && mapped.includes("name")) {
        cols = mapped;
        return;
      }
    }
    if (accounts.length >= MAX_ACCOUNTS) {
      if (!errors.some((e) => e.startsWith("Too many"))) errors.push(`Too many accounts: the limit is ${MAX_ACCOUNTS}`);
      return;
    }
    const get = (k) => cells[cols.indexOf(k)];
    const label = `Line ${idx + 1}`;
    const name = get("name");
    if (!name) { errors.push(`${label}: expected name,price,visitMin,driveMin,chemicals,callbacks`); return; }
    const parse = (k, label2, o) => {
      const raw2 = get(k);
      if (raw2 === undefined || raw2 === "") { if (o.optional) return 0; throw new Error(`${label}: ${label2} is missing`); }
      const n = Number(raw2.replace(/^\$/, ""));
      if (!Number.isFinite(n) || n < (o.min ?? 0) || n > o.max) throw new Error(`${label}: ${label2} must be a number from ${o.min ?? 0} to ${o.max}`);
      return n;
    };
    try {
      accounts.push({
        name,
        price: parse("price", "price", { min: 0.01, max: 100000 }),
        visitMin: parse("visitMin", "visit minutes", { min: 1, max: 240 }),
        driveMin: parse("driveMin", "drive minutes", { max: 180 }),
        chemicals: parse("chemicals", "chemicals", { max: 100000, optional: true }),
        callbacks: parse("callbacks", "callbacks", { max: 52, optional: true }),
      });
    } catch (e) { errors.push(e.message); }
  });
  return { accounts, errors };
}

// Monthly economics of one account under the given options.
function economics(a, o) {
  const callbackHours = (a.callbacks / 12) * (o.callbackMin / 60);
  const visitHours = (o.visitsPerMonth * a.visitMin) / 60;
  const driveHours = (o.visitsPerMonth * a.driveMin) / 60;
  const hours = visitHours + driveHours + callbackHours;
  const vehicle = (driveHours + callbackHours) * o.truckPerHr;
  const labor = hours * o.laborPerHr;
  const parts = (a.callbacks / 12) * o.callbackCost;
  const cost = a.chemicals + vehicle + labor + parts;
  const net = a.price - cost;
  return { hours, driveHours, callbackHours, vehicle, labor, parts, cost, net };
}

export function analyze(accounts, options = {}) {
  const o = resolveOptions(options);
  if (!accounts?.length) throw new Error("Give at least one account");
  const rows = accounts.map((a) => {
    const e = economics(a, o);
    const effective = e.net / e.hours;
    const needed = e.cost + o.targetHourly * e.hours;
    const increasePct = (needed / a.price - 1) * 100;
    const atTarget = effective >= o.targetHourly - 1e-9;
    let move = "keep";
    if (!atTarget) move = increasePct <= o.maxIncreasePct ? "reprice" : "drop";
    return { ...a, ...e, effective, needed, increasePct: Math.max(0, increasePct), atTarget, move, shortfall: atTarget ? 0 : needed - a.price };
  });
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const revenue = sum("price");
  const hours = sum("hours");
  const net = sum("net");
  const blended = net / hours;
  rows.forEach((r) => {
    const h = hours - r.hours;
    const n = net - r.net;
    r.hoursFreed = r.hours;
    r.routeHourlyIfDropped = h > 1e-9 ? n / h : null;
    r.routeLift = r.routeHourlyIfDropped === null ? null : r.routeHourlyIfDropped - blended;
  });
  rows.sort((x, y) => x.effective - y.effective);
  const drive = sum("driveHours");
  const route = {
    accounts: rows.length, revenue, hours, net, blended, driveHours: drive, driveShare: drive / hours,
    callbackHours: sum("callbackHours"),
    below: rows.filter((r) => !r.atTarget).length,
    reprice: rows.filter((r) => r.move === "reprice").length,
    drop: rows.filter((r) => r.move === "drop").length,
    repriceGain: rows.filter((r) => r.move === "reprice").reduce((s, r) => s + r.shortfall, 0),
  };
  // Adding a stop `legMin` minutes away, with the typed price, visit and chemicals.
  const candidate = (legMin, price) => {
    const e = economics({ price, visitMin: o.newVisitMin, driveMin: legMin, chemicals: o.newChem, callbacks: o.newCallbacks }, o);
    const needed = e.cost + o.targetHourly * e.hours;
    const routeAfter = (net + e.net) / (hours + e.hours);
    return { legMin, price, hours: e.hours, net: e.net, effective: e.net / e.hours, needed, routeAfter, routeChange: routeAfter - blended };
  };
  const newStop = candidate(o.newLegMin, o.newPrice);
  const density = [...new Set([5, 10, 15, 20, 30, o.newLegMin])].sort((a, b) => a - b).map((m) => candidate(m, o.newPrice));
  return { options: o, rows, route, newStop, density };
}

export function summarize(res) {
  const { route: r, options: o } = res;
  if (!r.below) {
    return { status: "ok", text: `All ${r.accounts} accounts earn at least ${money(o.targetHourly)} an hour; the route earns ${money(r.blended)} an hour across ${r.hours.toFixed(1)} hours a month. Estimates from your numbers, not market rates.` };
  }
  const gain = r.repriceGain > 0 ? ` Repricing the ${r.reprice} within ${o.maxIncreasePct}% adds ${money(r.repriceGain)} a month.` : "";
  return {
    status: "warn",
    text: `${r.below} of ${r.accounts} accounts earn under ${money(o.targetHourly)} an hour (route blended ${money(r.blended)} an hour, driving ${(r.driveShare * 100).toFixed(0)}% of hours): ${r.reprice} to reprice, ${r.drop} to drop.${gain} Estimates from your numbers, not market rates.`,
  };
}

const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

export function toCsv(res) {
  const head = "account,price,hours_per_month,cost_per_month,net_per_month,effective_hourly,price_to_clear_target,increase_pct,move,route_hourly_if_dropped";
  const lines = res.rows.map((r) => [q(r.name), r2(r.price), r2(r.hours), r2(r.cost), r2(r.net), r2(r.effective), r2(r.needed), r2(r.increasePct), r.move, r.routeHourlyIfDropped === null ? "" : r2(r.routeHourlyIfDropped)].join(","));
  return [head, ...lines].join("\n") + "\n";
}
