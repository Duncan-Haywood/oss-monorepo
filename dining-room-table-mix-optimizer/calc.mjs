// Dining room table mix: how many 2-tops, 4-tops, 6-tops... fit a floor and serve the most guests.
//
// Method. A service is simulated as a loss/waiting queue: parties arrive at random through the window, take the smallest free
// table (or two pushed together, if allowed) that holds them, stay for a random time, and walk away if they wait longer than
// they will tolerate. Every candidate mix is scored on the SAME pre-drawn services (common random numbers), so two mixes are
// compared on identical nights rather than lucky ones. The best mix is found by steepest-ascent search over add / remove /
// swap-one-table moves that keep the floor area, started from today's mix and from an empty room. The figures reported for
// today's mix and the recommended one are re-measured on a second, independent set of services, with a paired standard error.
//
// Check. With one party size, one table type and no waiting, the model is the Erlang-B loss system, whose blocking
// probability does not depend on how long parties stay (only on the mean), so the simulator is tested against the closed form.

export const MAX_TYPES = 6;
export const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

export const SHARED_DEFAULTS = {
  areaSqFt: "",
  windowHours: "",
  partiesPerService: "",
  patienceMin: "",
  combine: "yes",
  spendPerGuest: "",
  marginPct: "",
  servicesPerMonth: "",
};
export const TABLE_DEFAULTS = { name: "", seats: "", sqft: "", count: "", max: "" };
export const PARTY_DEFAULTS = { share: "", dwell: "" };

export const EXAMPLE_SHARED = {
  areaSqFt: "460",
  windowHours: "3",
  partiesPerService: "62",
  patienceMin: "10",
  combine: "yes",
  spendPerGuest: "34",
  marginPct: "30",
  servicesPerMonth: "40",
};
export const EXAMPLE_TABLES = [
  { name: "2-top", seats: "2", sqft: "20", count: "0", max: "" },
  { name: "4-top", seats: "4", sqft: "32", count: "14", max: "" },
  { name: "6-top", seats: "6", sqft: "48", count: "0", max: "3" },
  { name: "8-top", seats: "8", sqft: "64", count: "0", max: "1" },
];
export const EXAMPLE_PARTIES = [
  { share: "8", dwell: "45" },
  { share: "44", dwell: "60" },
  { share: "7", dwell: "70" },
  { share: "26", dwell: "80" },
  { share: "4", dwell: "90" },
  { share: "7", dwell: "100" },
  { share: "1", dwell: "105" },
  { share: "3", dwell: "110" },
];

// ---------- random numbers ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DWELL_SIGMA = 0.3;
function normal(rnd) {
  const u = Math.max(rnd(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

// Draw `n` services. A party is [arrivalMin, size, dwellMultiplier]; the multiplier has mean 1.
export function drawServices({ n, seed, windowMin, ratePerMin, sizeCdf }) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let s = 0; s < n; s++) {
    const parties = [];
    let t = 0;
    for (;;) {
      t += -Math.log(Math.max(rnd(), 1e-12)) / ratePerMin;
      if (t > windowMin) break;
      const u = rnd();
      let k = 0;
      while (k < sizeCdf.length - 1 && u > sizeCdf[k]) k++;
      parties.push([t, k, Math.exp(DWELL_SIGMA * normal(rnd) - (DWELL_SIGMA * DWELL_SIGMA) / 2)]);
    }
    out.push(parties);
  }
  return out;
}

// ---------- one service ----------
// tables: [{seats}], one entry per physical table. dwellMin[k] is the mean stay for party size index k.
// Returns { guests, parties, lost, waitMin (sum over seated), seatMinutes }.
export function runService(parties, tables, sizes, dwellMin, patienceMin, combine) {
  const free = tables.map(() => true);
  const order = tables.map((t, i) => i).sort((a, b) => tables[a].seats - tables[b].seats);
  const deps = []; // [time, tableIdxA, tableIdxB|-1]
  const queue = []; // [deadline, arrival, k, dwell]
  const r = { guests: 0, parties: parties.length, lost: 0, waitMin: 0, seated: 0, seatMinutes: 0 };

  const pick = (size) => {
    for (const i of order) if (free[i] && tables[i].seats >= size) return [i, -1];
    if (!combine) return null;
    let best = null;
    let bestSeats = Infinity;
    for (let x = 0; x < order.length; x++) {
      const a = order[x];
      if (!free[a]) continue;
      for (let y = x + 1; y < order.length; y++) {
        const b = order[y];
        if (!free[b]) continue;
        const seats = tables[a].seats + tables[b].seats;
        if (seats >= size && seats < bestSeats) { best = [a, b]; bestSeats = seats; }
      }
    }
    return best;
  };
  const seat = (now, arrival, k, dwell) => {
    const size = sizes[k];
    const slot = pick(size);
    if (!slot) return false;
    free[slot[0]] = false;
    if (slot[1] >= 0) free[slot[1]] = false;
    const t = now + dwell;
    let lo = 0;
    while (lo < deps.length && deps[lo][0] <= t) lo++;
    deps.splice(lo, 0, [t, slot[0], slot[1]]);
    r.guests += size;
    r.seated += 1;
    r.waitMin += now - arrival;
    r.seatMinutes += dwell * (tables[slot[0]].seats + (slot[1] >= 0 ? tables[slot[1]].seats : 0));
    return true;
  };
  const drain = (now) => {
    for (let q = 0; q < queue.length; ) {
      if (queue[q][0] < now) { r.lost += 1; queue.splice(q, 1); continue; }
      if (seat(now, queue[q][1], queue[q][2], queue[q][3])) queue.splice(q, 1);
      else q++;
    }
  };

  let a = 0;
  while (a < parties.length || deps.length) {
    const nextArr = a < parties.length ? parties[a][0] : Infinity;
    const nextDep = deps.length ? deps[0][0] : Infinity;
    if (nextDep <= nextArr) {
      const d = deps.shift();
      free[d[1]] = true;
      if (d[2] >= 0) free[d[2]] = true;
      drain(d[0]);
    } else {
      const [t, k, mult] = parties[a++];
      const dwell = dwellMin[k] * mult;
      if (!seat(t, t, k, dwell)) {
        if (patienceMin > 0) queue.push([t + patienceMin, t, k, dwell]);
        else r.lost += 1;
      }
    }
  }
  r.lost += queue.length;
  return r;
}

function expand(counts, types) {
  const tables = [];
  counts.forEach((c, i) => { for (let j = 0; j < c; j++) tables.push({ seats: types[i].seats }); });
  return tables;
}

// Mean guests per service over a set of drawn services, plus the per-service vector.
export function evaluate(counts, types, services, sizes, dwellMin, patienceMin, combine) {
  const tables = expand(counts, types);
  const guests = new Array(services.length);
  let parties = 0, lost = 0, wait = 0, seated = 0, seatMin = 0;
  for (let i = 0; i < services.length; i++) {
    const r = runService(services[i], tables, sizes, dwellMin, patienceMin, combine);
    guests[i] = r.guests; parties += r.parties; lost += r.lost; wait += r.waitMin; seated += r.seated; seatMin += r.seatMinutes;
  }
  const n = services.length;
  return {
    guests,
    meanGuests: guests.reduce((s, g) => s + g, 0) / n,
    partiesPerService: parties / n,
    lostPerService: lost / n,
    meanWaitMin: seated ? wait / seated : 0,
    seatMinutes: seatMin / n,
    seats: counts.reduce((s, c, i) => s + c * types[i].seats, 0),
  };
}

// ---------- input handling ----------
const num = (v) => {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(/[$,%]/g, "");
  if (s === "") return NaN;
  return Number(s);
};

export function normalize(tableRows, partyRows, shared) {
  const warnings = [];
  const get = (k, min, label) => {
    const v = num(shared[k]);
    if (!Number.isFinite(v) || v < min) { warnings.push(label); return null; }
    return v;
  };
  const areaSqFt = get("areaSqFt", 1, "Enter the dining floor area in square feet.");
  const windowHours = get("windowHours", 0.25, "Enter how many hours the busy service lasts.");
  const partiesPerService = get("partiesPerService", 1, "Enter how many parties want a table during that window.");
  const patienceRaw = num(shared.patienceMin);
  const patienceMin = Number.isFinite(patienceRaw) && patienceRaw >= 0 ? patienceRaw : 0;
  const spendPerGuest = Number.isFinite(num(shared.spendPerGuest)) && num(shared.spendPerGuest) >= 0 ? num(shared.spendPerGuest) : 0;
  const marginPct = Number.isFinite(num(shared.marginPct)) ? Math.min(100, Math.max(0, num(shared.marginPct))) : 0;
  const servicesPerMonth = Number.isFinite(num(shared.servicesPerMonth)) && num(shared.servicesPerMonth) > 0 ? num(shared.servicesPerMonth) : 0;
  const combine = String(shared.combine || "").trim().toLowerCase() !== "no";

  const types = [];
  tableRows.forEach((t, i) => {
    const any = ["name", "seats", "sqft", "count", "max"].some((k) => String(t[k] ?? "").trim() !== "");
    if (!any) return;
    const seats = num(t.seats), sqft = num(t.sqft);
    if (!Number.isInteger(seats) || seats < 1 || seats > 16) { warnings.push(`Table type ${i + 1}: seats must be a whole number from 1 to 16.`); return; }
    if (!Number.isFinite(sqft) || sqft <= 0) { warnings.push(`Table type ${i + 1}: enter its floor footprint in square feet, chairs and walking room included.`); return; }
    const c = num(t.count);
    const m = num(t.max);
    types.push({
      name: String(t.name || "").trim() || `${seats}-top`,
      seats, sqft,
      count: Number.isInteger(c) && c >= 0 ? c : 0,
      max: Number.isInteger(m) && m >= 0 ? m : Infinity,
    });
  });
  if (types.length < 1) warnings.push("Enter at least one table type with seats and floor footprint.");
  if (types.length > MAX_TYPES) warnings.push(`Only the first ${MAX_TYPES} table types are used.`);
  const T = types.slice(0, MAX_TYPES);

  const shares = [], dwells = [];
  let shareSum = 0;
  partyRows.forEach((p, k) => {
    const s = num(p.share), d = num(p.dwell);
    shares.push(Number.isFinite(s) && s > 0 ? s : 0);
    dwells.push(Number.isFinite(d) && d > 0 ? d : 0);
    shareSum += shares[k];
  });
  if (shareSum <= 0) warnings.push("Enter the share of parties of each size (any scale; they are normalised).");
  for (let k = 0; k < shares.length; k++) {
    if (shares[k] > 0 && dwells[k] <= 0) { warnings.push(`Enter how long a party of ${PARTY_SIZES[k]} stays, in minutes.`); }
  }

  const ok = Boolean(areaSqFt && windowHours && partiesPerService && T.length && shareSum > 0 && shares.every((s, k) => s === 0 || dwells[k] > 0));
  return { ok, warnings, areaSqFt, windowHours, partiesPerService, patienceMin, spendPerGuest, marginPct, servicesPerMonth, combine, types: T, shares, dwells, shareSum };
}

// ---------- search ----------
function footprint(counts, types) { return counts.reduce((s, c, i) => s + c * types[i].sqft, 0); }
function feasible(counts, types, area) {
  if (footprint(counts, types) > area + 1e-9) return false;
  return counts.every((c, i) => c >= 0 && c <= types[i].max);
}

export function search(types, area, scoreOf, start) {
  const key = (c) => c.join(",");
  const cache = new Map();
  const score = (c) => {
    const k = key(c);
    if (!cache.has(k)) cache.set(k, scoreOf(c) - 1e-6 * footprint(c, types));
    return cache.get(k);
  };
  let cur = start.slice();
  let curScore = score(cur);
  for (let iter = 0; iter < 200; iter++) {
    let best = null, bestScore = curScore + 1e-9;
    const consider = (c) => {
      if (!feasible(c, types, area)) return;
      const s = score(c);
      if (s > bestScore) { best = c; bestScore = s; }
    };
    for (let i = 0; i < types.length; i++) {
      const add = cur.slice(); add[i] += 1; consider(add);
      if (cur[i] > 0) {
        const rem = cur.slice(); rem[i] -= 1; consider(rem);
        for (let j = 0; j < types.length; j++) {
          if (j === i) continue;
          const sw = cur.slice(); sw[i] -= 1; sw[j] += 1; consider(sw);
          for (let l = 0; l < types.length; l++) { // two-for-one: swap one big for two small, etc.
            if (l === i) continue;
            const sw2 = cur.slice(); sw2[i] -= 1; sw2[j] += 1; sw2[l] += 1; consider(sw2);
          }
        }
      }
    }
    if (!best) break;
    cur = best; curScore = bestScore;
  }
  return { counts: cur, score: curScore };
}

export const SEARCH_SERVICES = 60;
export const REPORT_SERVICES = 300;

export function analyze(tableRows, partyRows, shared) {
  const n = normalize(tableRows, partyRows, shared);
  if (!n.ok) return { ok: false, warnings: n.warnings };
  const { types } = n;
  const warnings = n.warnings.slice();
  const currentCounts = types.map((t) => t.count);
  if (footprint(currentCounts, types) > n.areaSqFt + 1e-9) {
    warnings.push(`Today's tables take ${Math.round(footprint(currentCounts, types))} sq ft, more than the ${Math.round(n.areaSqFt)} you entered. The comparison still runs, but check the area or the footprints.`);
  }
  if (currentCounts.every((c) => c === 0)) warnings.push("No tables are entered as in place today, so the comparison is against an empty room.");

  const windowMin = n.windowHours * 60;
  const ratePerMin = n.partiesPerService / windowMin;
  const total = n.shareSum;
  const cdf = [];
  let acc = 0;
  n.shares.forEach((s) => { acc += s / total; cdf.push(acc); });
  cdf[cdf.length - 1] = 1;
  const sizes = PARTY_SIZES;
  const dwellMin = n.dwells;
  const draw = (count, seed) => drawServices({ n: count, seed, windowMin, ratePerMin, sizeCdf: cdf });
  const searchSet = draw(SEARCH_SERVICES, 20251009);
  const reportSet = draw(REPORT_SERVICES, 77150921);
  const scoreOnSearch = (c) => evaluate(c, types, searchSet, sizes, dwellMin, n.patienceMin, n.combine).meanGuests;

  const starts = [currentCounts.map((c, i) => Math.min(c, types[i].max)), types.map(() => 0)];
  let best = null;
  for (const st of starts) {
    if (!feasible(st, types, n.areaSqFt) && st.some((c) => c > 0)) continue;
    const r = search(types, n.areaSqFt, scoreOnSearch, st);
    if (!best || r.score > best.score) best = r;
  }
  if (!best) best = search(types, n.areaSqFt, scoreOnSearch, types.map(() => 0));
  const recCounts = best.counts;

  const cur = evaluate(currentCounts, types, reportSet, sizes, dwellMin, n.patienceMin, n.combine);
  const rec = evaluate(recCounts, types, reportSet, sizes, dwellMin, n.patienceMin, n.combine);
  const diff = rec.guests.map((g, i) => g - cur.guests[i]);
  const dMean = diff.reduce((s, d) => s + d, 0) / diff.length;
  const dVar = diff.reduce((s, d) => s + (d - dMean) * (d - dMean), 0) / Math.max(1, diff.length - 1);
  const dSe = Math.sqrt(dVar / diff.length);

  // Value of one more / one fewer table of each type, measured on the report set from the recommended mix.
  const marginal = types.map((t, i) => {
    const out = { name: t.name, seats: t.seats, sqft: t.sqft };
    const add = recCounts.slice(); add[i] += 1;
    out.addFits = feasible(add, types, n.areaSqFt);
    out.addDelta = out.addFits ? evaluate(add, types, reportSet, sizes, dwellMin, n.patienceMin, n.combine).meanGuests - rec.meanGuests : null;
    if (recCounts[i] > 0) {
      const rem = recCounts.slice(); rem[i] -= 1;
      out.removeDelta = evaluate(rem, types, reportSet, sizes, dwellMin, n.patienceMin, n.combine).meanGuests - rec.meanGuests;
    } else out.removeDelta = null;
    return out;
  });

  const perGuest = n.spendPerGuest;
  const months = n.servicesPerMonth;
  const monthlyRevenue = dMean * perGuest * months;
  return {
    ok: true,
    warnings,
    shared: n,
    types,
    currentCounts,
    recCounts,
    cur, rec,
    deltaGuests: dMean,
    deltaSe: dSe,
    significant: Math.abs(dMean) > 2 * dSe,
    areaUsedCur: footprint(currentCounts, types),
    areaUsedRec: footprint(recCounts, types),
    monthlyRevenue,
    monthlyContribution: monthlyRevenue * (n.marginPct / 100),
    demandGuests: n.partiesPerService * (sizes.reduce((s, z, k) => s + z * n.shares[k], 0) / total),
    marginal,
  };
}

export function money(x) {
  const v = Math.round(x);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}
export function one(x) { return (Math.round(x * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

const csvCell = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
export function toCsv(a) {
  const rows = [["table type", "seats", "sq ft each", "tables today", "tables recommended", "change"]];
  a.types.forEach((t, i) => rows.push([t.name, t.seats, t.sqft, a.currentCounts[i], a.recCounts[i], a.recCounts[i] - a.currentCounts[i]]));
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
