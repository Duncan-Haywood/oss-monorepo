// Dog grooming day planner: what to charge for a groom, and which of the
// requests on the books to accept for a day with a fixed number of table
// minutes.
//
// Each request is a dog with the minutes the groom really takes, the price
// quoted and the supplies it uses. A dog also blocks the table for the
// turnover (bath-station clean-down, hand-off, notes). Net = price - supplies;
// net per table hour = net / ((minutes + turnover) / 60).
//
// The set of requests that maximises the day's net under the table minutes, an
// optional cap on dogs and an optional cap on large dogs is found exactly by
// branch-and-bound with a fractional-knapsack bound; the tests check it against
// trying every subset. Pure functions, no network, no dependencies.

export const MODEL_NOTE =
  "Net = price - supplies. Table time = groom minutes + turnover. The plan is the exact best answer for the numbers you supply: it does not know a dog's temperament, a matted coat you have not seen yet or a client who cancels, and it is not a forecast.";

export const INPUT_NOTES = [
  { what: "Biscuit,medium,75,70,6,Doodle", detail: "One request per row: dog,size,groom minutes,price,supplies[,note]. Size is small, medium, large or giant. Dollars and minutes as plain numbers." },
  { what: "Groom minutes", detail: "Hands-on time for that dog, drying included, from your own history for that breed and coat. Matted or double-coated dogs are where quotes usually run short." },
  { what: "Supplies", detail: "Shampoo, conditioner, blades, ear and nail supplies used on that groom. Use 0 if you fold supplies into your overhead." },
  { what: "Day settings", detail: "Table minutes in the day (480 = eight hours), turnover minutes between dogs, the most dogs, the most large and giant dogs, your target net per table hour and a no-show percentage for the downside check." },
  { what: "Header row and # comments", detail: "A first row starting with dog, blank lines and lines starting with # are skipped. Avoid commas inside names." },
];

export const SIZES = ["small", "medium", "large", "giant"];
const MAX_DOGS = 40;
const EPS = 1e-9;

export function money(n) {
  const v = Math.round(n * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

export function pct(n, digits = 0) {
  return Number.isFinite(n) ? `${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)}%` : "n/a";
}

function num(cell, what, where, errors, { positive = false } = {}) {
  const v = Number(String(cell ?? "").replace(/[$,%\s]/g, ""));
  if (cell === undefined || cell === "" || !Number.isFinite(v) || v < 0 || (positive && v === 0)) {
    errors.push(`${where}: ${what} must be a number${positive ? " above zero" : ", zero or more"}`);
    return null;
  }
  return v;
}

export function parseRequests(text) {
  const requests = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^dog$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    const name = cells[0];
    if (!name) { errors.push(`${where}: the dog needs a name`); return; }
    const size = String(cells[1] || "").toLowerCase();
    if (!SIZES.includes(size)) { errors.push(`${where}: size must be small, medium, large or giant (got "${cells[1] ?? ""}")`); return; }
    const before = errors.length;
    const minutes = num(cells[2], "groom minutes", where, errors, { positive: true });
    const price = num(cells[3], "price", where, errors);
    const supplies = num(cells[4], "supplies", where, errors);
    if (errors.length > before) return;
    requests.push({ id: requests.length, name, size, minutes, price, supplies, note: cells.slice(5).join(",").trim() });
  });
  if (requests.length > MAX_DOGS) errors.push(`At most ${MAX_DOGS} requests per day (got ${requests.length})`);
  return { requests, errors };
}

function readOptions(options = {}) {
  const get = (k, d, { min = 0, max = Infinity } = {}) => {
    const raw = options[k];
    if (raw === undefined || raw === null || raw === "") return d;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${k} must be a number from ${min} to ${max}`);
    return v;
  };
  return {
    capacity: Math.round(get("capacity", 480, { min: 1 })),
    turnover: Math.round(get("turnover", 10, { max: 240 })),
    targetHourly: get("targetHourly", 45),
    maxDogs: Math.round(get("maxDogs", 0)),
    maxLarge: Math.round(get("maxLarge", 0)),
    noShow: get("noShow", 10, { max: 100 }),
  };
}

const isLarge = (r) => r.size === "large" || r.size === "giant";

export function economics(r, o) {
  const block = r.minutes + o.turnover;
  const hours = block / 60;
  const net = r.price - r.supplies;
  const priceForTarget = hours * o.targetHourly + r.supplies;
  return {
    block,
    net,
    netPerHour: net / hours,
    priceForTarget,
    raiseBy: Math.max(0, priceForTarget - r.price),
  };
}

// What to charge for one groom so it nets the target per table hour.
export function quotePrice({ minutes, supplies = 0, turnover = 10, targetHourly = 45, roundTo = 1 }) {
  const m = Number(minutes), s = Number(supplies), t = Number(turnover), h = Number(targetHourly), step = Number(roundTo);
  if (!Number.isFinite(m) || m <= 0) throw new Error("minutes must be a number above zero");
  if (![s, t, h].every((v) => Number.isFinite(v) && v >= 0)) throw new Error("supplies, turnover and target hourly must be numbers, zero or more");
  if (!Number.isFinite(step) || step <= 0) throw new Error("roundTo must be above zero");
  const exact = ((m + t) / 60) * h + s;
  const price = Math.ceil(exact / step - 1e-9) * step;
  return { exact, price, tableMinutes: m + t, netPerHour: (price - s) / ((m + t) / 60) };
}

function fits(chosen, add, o) {
  const used = chosen.reduce((a, r) => a + r.e.block, 0) + add.e.block;
  if (used > o.capacity) return false;
  if (o.maxDogs && chosen.length + 1 > o.maxDogs) return false;
  if (o.maxLarge && isLarge(add) && chosen.filter(isLarge).length + 1 > o.maxLarge) return false;
  return true;
}

// Exact best subset. `forced` (optional) is a request that must be included.
function solve(items, o, forced = null) {
  let base = [];
  let pool = items;
  if (forced) {
    if (!fits([], forced, o)) return null;
    base = [forced];
    pool = items.filter((r) => r.id !== forced.id);
  }
  const cand = pool.filter((r) => r.e.net > 0).sort((a, b) => b.e.net / b.e.block - a.e.net / a.e.block || a.id - b.id);
  const baseMin = base.reduce((a, r) => a + r.e.block, 0);
  const baseNet = base.reduce((a, r) => a + r.e.net, 0);
  let best = { net: baseNet, minutes: baseMin, set: base.slice() };

  const bound = (i, room) => {
    let b = 0;
    for (let k = i; k < cand.length && room > 0; k += 1) {
      const take = Math.min(1, room / cand[k].e.block);
      b += take * cand[k].e.net;
      room -= take * cand[k].e.block;
    }
    return b;
  };

  const dfs = (i, set, minutes, net) => {
    if (net > best.net + EPS || (Math.abs(net - best.net) <= EPS && minutes < best.minutes)) best = { net, minutes, set: set.slice() };
    if (i >= cand.length) return;
    if (net + bound(i, o.capacity - minutes) <= best.net + EPS) return;
    const r = cand[i];
    if (fits(set, r, o)) {
      set.push(r);
      dfs(i + 1, set, minutes + r.e.block, net + r.e.net);
      set.pop();
    }
    dfs(i + 1, set, minutes, net);
  };
  dfs(0, base.slice(), baseMin, baseNet);
  return best;
}

function greedy(items, o, order) {
  const set = [];
  for (const r of order) if (r.e.net > 0 && fits(set, r, o)) set.push(r);
  return { net: set.reduce((a, r) => a + r.e.net, 0), minutes: set.reduce((a, r) => a + r.e.block, 0), set };
}

export function plan(parsed, options = {}) {
  const o = readOptions(options);
  const items = parsed.requests.map((r) => ({ ...r, e: economics(r, o) }));
  if (items.length > MAX_DOGS) throw new Error(`At most ${MAX_DOGS} requests per day`);
  const best = solve(items, o);
  const chosenIds = new Set(best.set.map((r) => r.id));

  const ranked = items
    .slice()
    .sort((a, b) => b.e.netPerHour - a.e.netPerHour || a.id - b.id)
    .map((r, i) => ({
      rank: i + 1, name: r.name, size: r.size, minutes: r.minutes, price: r.price, supplies: r.supplies, note: r.note,
      tableMinutes: r.e.block, net: r.e.net, netPerHour: r.e.netPerHour, priceForTarget: r.e.priceForTarget, raiseBy: r.e.raiseBy,
      booked: chosenIds.has(r.id),
    }));

  const chosen = best.set
    .slice()
    .sort((a, b) => b.e.netPerHour - a.e.netPerHour || a.id - b.id)
    .map((r) => ({ name: r.name, size: r.size, tableMinutes: r.e.block, price: r.price, net: r.e.net, netPerHour: r.e.netPerHour }));

  const skipped = items.filter((r) => !chosenIds.has(r.id)).map((r) => {
    let reason;
    if (r.e.net <= 0) {
      reason = `the ${money(r.price)} price does not cover ${money(r.supplies)} of supplies; ${money(r.e.priceForTarget)} would hit your target`;
    } else if (r.e.block > o.capacity) {
      reason = `needs ${r.e.block} table minutes and the day has ${o.capacity}`;
    } else {
      const withIt = solve(items, o, r);
      if (!withIt) reason = "cannot be booked under your dog and large-dog limits";
      else {
        const cost = best.net - withIt.net;
        reason = cost <= 0.005
          ? "ties with the plan on net; the plan keeps more of the day free"
          : `taking it would cut the day's net by ${money(cost)} (${money(withIt.net)} instead of ${money(best.net)})`;
      }
      if (r.e.netPerHour < o.targetHourly) reason += `; it yields ${money(r.e.netPerHour)} per table hour, under your ${money(o.targetHourly)} target`;
    }
    return { name: r.name, size: r.size, reason };
  });

  const firstCome = greedy(items, o, items);
  const topPrice = greedy(items, o, items.slice().sort((a, b) => b.price - a.price || a.id - b.id));
  const kept = 1 - o.noShow / 100;
  const usedMinutes = best.minutes;
  const hours = usedMinutes / 60;
  const totals = {
    plan: best.net,
    usedMinutes,
    idleMinutes: o.capacity - usedMinutes,
    netPerTableHour: hours > 0 ? best.net / hours : 0,
    firstCome: firstCome.net,
    topPriceFirst: topPrice.net,
    upliftVsFirstCome: best.net - firstCome.net,
    upliftVsTopPrice: best.net - topPrice.net,
    downsidePlan: best.net * kept,
  };

  const findings = [];
  for (const c of chosen.filter((x) => x.netPerHour < o.targetHourly - EPS)) {
    const src = items.find((r) => r.name === c.name && chosenIds.has(r.id) && r.e.block === c.tableMinutes);
    findings.push({ severity: "warn", rule: "underpriced-booking", message: `${c.name} is booked at ${money(c.netPerHour)} per table hour, under your ${money(o.targetHourly)} target; ${money(src.e.priceForTarget)} (${money(src.e.raiseBy)} more) would hit it.` });
  }
  const unpriced = ranked.filter((r) => !r.booked && r.raiseBy > 0 && r.net > 0 && r.netPerHour < o.targetHourly);
  if (unpriced.length) findings.push({ severity: "info", rule: "reprice-before-booking", message: `Quote ${unpriced.map((r) => `${r.name} at ${money(r.priceForTarget)}`).join(", ")} to reach your target before you accept them.` });
  if (totals.idleMinutes >= 30 && skipped.length) findings.push({ severity: "info", rule: "idle-time", message: `${totals.idleMinutes} table minutes stay empty: no remaining request fits them without breaking a limit or lowering the day's net.` });
  if (totals.upliftVsFirstCome > 0.005) findings.push({ severity: "info", rule: "choice-matters", message: `Booking in the order requests arrived nets ${money(totals.firstCome)}; this plan nets ${money(totals.plan)}, ${money(totals.upliftVsFirstCome)} more.` });
  if (o.noShow > 0 && chosen.length) findings.push({ severity: "info", rule: "no-show", message: `If ${o.noShow}% of booked dogs fail to show, expect about ${money(totals.downsidePlan)} net. A deposit or a short waitlist closes that gap.` });

  return { options: o, ranked, chosen, skipped, totals, findings, requests: items.length };
}

export function summarize(p) {
  if (!p.chosen.length) {
    return { status: "none", text: `None of the ${p.requests} requests earns anything above supplies at these settings. Raise prices or shorten groom times and run it again.` };
  }
  const t = p.totals;
  const dogs = `${p.chosen.length} of ${p.requests} dog${p.requests === 1 ? "" : "s"}`;
  return {
    status: "gain",
    text: `Book ${dogs}: ${t.usedMinutes} of ${p.options.capacity} table minutes, ${money(t.plan)} net (${money(t.netPerTableHour)} per table hour). Booking in arrival order would net ${money(t.firstCome)}.`,
  };
}
