// Donor retention: year-over-year retention, LYBUNT / SYBUNT lists and a
// 12-month-ahead giving probability fitted to the organisation's own history.
// Pure functions, no I/O, no imports.

const DAY = 86400000;

export const MIN_DONORS = 30;
export const MIN_GIFTS = 60;
export const BOOTSTRAPS = 300;
const HORIZON = 365;

export function money(v) {
  return "$" + Math.round(v).toLocaleString("en-US");
}
export function pct(v, d = 0) {
  return (v * 100).toFixed(d) + "%";
}

// Seeded generator so every range and the sample data are the same every run.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayOf(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const x = new Date(t);
  if (x.getUTCFullYear() !== y || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d) return null;
  return Math.round(t / DAY);
}

// 2026-03-14 (or a timestamp starting that way) and US-style 3/14/2026.
export function parseDate(text) {
  const s = String(text ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return dayOf(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(s);
  if (m) return dayOf(+m[3], +m[1], +m[2]);
  return null;
}

export function isoDate(day) {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

function ymd(day) {
  const d = new Date(day * DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function minusYears(day, k) {
  const { y, m, d } = ymd(day);
  const last = new Date(Date.UTC(y - k, m, 0)).getUTCDate();
  return dayOf(y - k, m, Math.min(d, last));
}

function parseAmount(text) {
  const s = String(text ?? "").trim().replace(/^\((.*)\)$/, "-$1").replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

// Rows: donor (id, name or email), gift date, amount. Header optional.
export function parseRows(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload your gifts first: one row per gift with a donor id, the gift date and the amount." };
  const warnings = [];
  const rows = [];
  let skipped = 0, nonPositive = 0;
  lines.forEach((line, i) => {
    const cells = line.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const donor = (cells[0] || "").toLowerCase();
    const day = parseDate(cells[1]);
    const amount = parseAmount(cells[2]);
    if (!donor || day === null || amount === null) {
      if (i > 0) skipped++;
      return;
    }
    if (amount <= 0) { nonPositive++; return; }
    rows.push({ donor, day, amount });
  });
  if (skipped) warnings.push(`${skipped} row(s) skipped: each needs a donor, a date like 2026-03-14 or 3/14/2026, and an amount.`);
  if (nonPositive) warnings.push(`${nonPositive} row(s) with a zero or negative amount (refunds, voids) were ignored.`);
  if (!rows.length) return { error: "No usable rows. Each row needs a donor id, a gift date and an amount, for example: d-1041,2026-03-14,50." };
  return { rows, warnings };
}

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}
function median(xs) {
  return quantile([...xs].sort((a, b) => a - b), 0.5);
}

function bandOf(n) {
  return n >= 3 ? "3+" : String(n);
}

/**
 * opts: fyStartMonth (1-12, default 1), asOf (YYYY-MM-DD, default the latest
 * gift date), listSize (rows of each outreach list kept in the result).
 */
export function analyze(rows, opts = {}) {
  const warnings = [];
  const fyStartMonth = Number.isInteger(opts.fyStartMonth) ? opts.fyStartMonth : 1;
  if (fyStartMonth < 1 || fyStartMonth > 12) return { error: "The fiscal year start month must be between 1 and 12." };
  const fyStart = (L) => dayOf(L, fyStartMonth, 1);
  const fyEnd = (L) => fyStart(L + 1) - 1;
  const fyOf = (day) => {
    const { y, m } = ymd(day);
    return m >= fyStartMonth ? y : y - 1;
  };

  let asOf = Math.max(...rows.map((r) => r.day));
  if (opts.asOf) {
    const a = parseDate(opts.asOf);
    if (a === null) return { error: "The as-of date must look like 2026-03-14." };
    asOf = a;
  } else {
    // An export pulled in the last days of a fiscal year rarely has a gift on
    // its final day; treating that year as unfinished would drop it from every
    // rate, so a latest gift within 31 days of the year end counts as the end.
    const end = fyEnd(fyOf(asOf));
    if (end - asOf <= 31 && end > asOf) {
      warnings.push(`Latest gift is ${isoDate(asOf)}; the as-of date was moved to the fiscal year end, ${isoDate(end)}. Set it yourself if the export is older or newer.`);
      asOf = end;
    }
  }
  const gifts = rows.filter((r) => r.day <= asOf);
  const dropped = rows.length - gifts.length;
  if (dropped) warnings.push(`${dropped} gift(s) dated after the as-of date were ignored.`);

  const donors = new Map();
  for (const g of gifts) {
    if (!donors.has(g.donor)) donors.set(g.donor, []);
    donors.get(g.donor).push({ day: g.day, amount: g.amount, fy: fyOf(g.day) });
  }
  for (const list of donors.values()) list.sort((a, b) => a.day - b.day);
  if (donors.size < MIN_DONORS || gifts.length < MIN_GIFTS) {
    return { error: `Too little to read: ${donors.size} donors and ${gifts.length} gifts. The analysis needs at least ${MIN_DONORS} donors and ${MIN_GIFTS} gifts, otherwise a single donor moves every rate.` };
  }

  const firstDay = Math.min(...gifts.map((g) => g.day));
  let firstFY = fyOf(firstDay);
  const currentFY = fyOf(asOf);
  // A history that starts mid-year under-counts its first year, so that year
  // is shown but never used to compute a rate.
  let firstPartial = false;
  if (firstDay - fyStart(firstFY) > 60 && firstFY < currentFY) {
    firstPartial = true;
    warnings.push(`Your first gift is ${isoDate(firstDay)}, more than two months into fiscal year ${firstFY}, so that year is treated as incomplete and left out of every rate.`);
  }
  const complete = (L) => fyEnd(L) <= asOf && !(L === firstFY && firstPartial);

  // Donors per fiscal year.
  const years = [];
  for (let L = firstFY; L <= currentFY; L++) years.push(L);
  const sets = new Map(years.map((L) => [L, new Set()]));
  const dollars = new Map(years.map((L) => [L, 0]));
  const giftCount = new Map(years.map((L) => [L, 0]));
  const donorDollars = new Map(years.map((L) => [L, new Map()]));
  for (const [id, list] of donors) {
    for (const g of list) {
      sets.get(g.fy).add(id);
      dollars.set(g.fy, dollars.get(g.fy) + g.amount);
      giftCount.set(g.fy, giftCount.get(g.fy) + 1);
      const m = donorDollars.get(g.fy);
      m.set(id, (m.get(id) || 0) + g.amount);
    }
  }
  const firstGiftFY = new Map([...donors].map(([id, list]) => [id, list[0].fy]));

  const table = years.map((L) => {
    const cur = sets.get(L);
    const prev = sets.get(L - 1);
    const row = {
      fy: L, start: isoDate(fyStart(L)), end: isoDate(fyEnd(L)), complete: complete(L),
      donors: cur.size, gifts: giftCount.get(L), dollars: dollars.get(L),
      newDonors: 0, recaptured: 0, retained: null, retention: null, firstYearRetention: null, repeatRetention: null, dollarRetention: null,
    };
    for (const id of cur) {
      if (prev && prev.has(id)) continue;
      if (firstGiftFY.get(id) === L) row.newDonors++;
      else row.recaptured++;
    }
    if (complete(L) && complete(L - 1) && prev && prev.size) {
      let kept = 0, newPrev = 0, newKept = 0, repPrev = 0, repKept = 0, prevDollars = 0, keptDollars = 0;
      for (const id of prev) {
        const isNew = firstGiftFY.get(id) === L - 1;
        const back = cur.has(id);
        if (isNew) { newPrev++; if (back) newKept++; } else { repPrev++; if (back) repKept++; }
        if (back) { kept++; keptDollars += donorDollars.get(L).get(id); }
        prevDollars += donorDollars.get(L - 1).get(id);
      }
      row.retained = kept;
      row.retention = kept / prev.size;
      row.firstYearRetention = newPrev >= 10 ? newKept / newPrev : null;
      row.repeatRetention = repPrev >= 10 ? repKept / repPrev : null;
      row.dollarRetention = prevDollars ? keptDollars / prevDollars : null;
      row.prevDonors = prev.size;
    }
    return row;
  });

  const pairs = table.filter((r) => r.retention !== null);
  if (pairs.length < 1) {
    return { error: `Retention compares two full fiscal years, and your gifts contain fewer than that (as of ${isoDate(asOf)}, fiscal year starting month ${fyStartMonth}). Add an earlier year, check the fiscal year start month, or move the as-of date.` };
  }
  const latest = pairs[pairs.length - 1];

  // Bootstrap range on the latest pair's retention: resample last year's donors.
  const rand = rng(20260930);
  const prevIds = [...sets.get(latest.fy - 1)];
  const flags = prevIds.map((id) => (sets.get(latest.fy).has(id) ? 1 : 0));
  const boots = [];
  for (let b = 0; b < BOOTSTRAPS; b++) {
    let s = 0;
    for (let i = 0; i < flags.length; i++) s += flags[(rand() * flags.length) | 0];
    boots.push(s / flags.length);
  }
  boots.sort((a, b) => a - b);
  const range80 = [quantile(boots, 0.1), quantile(boots, 0.9)];

  // Snapshot model: for each past as-of date T, donors are classified by status
  // (gave this fiscal year so far / last year / earlier) and giving-years band,
  // and the pooled share who gave again in the next 365 days is counted.
  const classify = (list, T) => {
    const fT = fyOf(T);
    let cur = false, last = false, early = false;
    const fys = new Set();
    for (const g of list) {
      if (g.day > T) break;
      fys.add(g.fy);
      if (g.fy === fT) cur = true; else if (g.fy === fT - 1) last = true; else early = true;
    }
    if (!fys.size) return null;
    return { status: cur ? "current" : last ? "LYBUNT" : "SYBUNT", band: bandOf(fys.size) };
  };
  const gaveWithin = (list, T) => list.some((g) => g.day > T && g.day <= T + HORIZON);

  const snapshots = [];
  for (let k = 1; k <= 6; k++) {
    const T = minusYears(asOf, k);
    if (T < firstDay + 365 || T + HORIZON > asOf) continue;
    snapshots.push({ k, T });
  }
  const tally = (snaps) => {
    const cell = new Map(), stat = new Map();
    let n = 0, s = 0;
    const bump = (m, key, hit) => {
      const c = m.get(key) || { n: 0, s: 0 };
      c.n++; if (hit) c.s++;
      m.set(key, c);
    };
    for (const { T } of snaps) {
      for (const list of donors.values()) {
        const c = classify(list, T);
        if (!c) continue;
        const hit = gaveWithin(list, T);
        n++; if (hit) s++;
        bump(cell, `${c.status}|${c.band}`, hit);
        bump(stat, c.status, hit);
      }
    }
    return { cell, stat, n, s };
  };
  const M = 10;
  const predictor = (t) => {
    const all = t.n ? t.s / t.n : 0;
    return (status, band) => {
      const st = t.stat.get(status) || { n: 0, s: 0 };
      const pStat = (st.s + M * all) / (st.n + M);
      const c = t.cell.get(`${status}|${band}`) || { n: 0, s: 0 };
      return (c.s + M * pStat) / (c.n + M);
    };
  };

  const full = tally(snapshots);
  let model = null, holdout = null;
  if (snapshots.length >= 1 && full.n >= 100) {
    const predict = predictor(full);
    model = { snapshots: snapshots.length, observations: full.n, rates: [] };
    for (const status of ["current", "LYBUNT", "SYBUNT"]) {
      const c = full.stat.get(status);
      if (c && c.n) model.rates.push({ status, n: c.n, rate: c.s / c.n });
    }
    model.predict = predict;
    if (snapshots.length >= 2) {
      const fit = tally(snapshots.filter((s) => s.k >= 2));
      const p = predictor(fit);
      let predicted = 0, actual = 0, n = 0;
      for (const list of donors.values()) {
        const c = classify(list, snapshots[0].T);
        if (!c) continue;
        n++;
        predicted += p(c.status, c.band);
        if (gaveWithin(list, snapshots[0].T)) actual++;
      }
      holdout = { asOf: isoDate(snapshots[0].T), donors: n, predicted, actual, gap: actual ? Math.abs(predicted - actual) / actual : 0 };
    }
  }

  // Donors at the as-of date: status, what they usually give, and outreach value.
  const status = { current: 0, LYBUNT: 0, SYBUNT: 0 };
  const lists = { LYBUNT: [], SYBUNT: [] };
  let currentExpected = 0, currentDollars = 0;
  for (const [id, list] of donors) {
    const c = classify(list, asOf);
    status[c.status]++;
    const recent = list.slice(-3).map((g) => g.amount);
    const typical = median(recent);
    const total = list.reduce((s, g) => s + g.amount, 0);
    const p = model ? model.predict(c.status, c.band) : null;
    if (c.status === "current") {
      if (p !== null) { currentExpected += p; currentDollars += p * typical; }
      continue;
    }
    const last = list[list.length - 1];
    lists[c.status].push({
      donor: id, lastGift: isoDate(last.day), lastAmount: last.amount, typicalGift: typical,
      gifts: list.length, total, givingYears: new Set(list.map((g) => g.fy)).size,
      probability: p, expected: p === null ? null : p * typical,
    });
  }
  const order = (a, b) => (b.expected ?? b.total) - (a.expected ?? a.total) || b.total - a.total;
  for (const k of Object.keys(lists)) lists[k].sort(order);
  const recoverable = model ? [...lists.LYBUNT, ...lists.SYBUNT].reduce((s, r) => s + r.expected, 0) : null;
  const lybuntDollars = lists.LYBUNT.reduce((s, r) => s + (donorDollars.get(currentFY - 1).get(r.donor) || 0), 0);

  // Concentration and a plain lifetime figure from the latest retention.
  const latestDollars = [...donorDollars.get(latest.fy).values()].sort((a, b) => b - a);
  const totalLatest = latestDollars.reduce((s, v) => s + v, 0);
  const top10 = latestDollars.slice(0, 10).reduce((s, v) => s + v, 0) / (totalLatest || 1);
  const avgAnnual = latest.dollars / Math.max(1, latest.donors);
  const r = Math.min(latest.retention, 0.95);
  const lifetimeYears = 1 / (1 - r);
  const prevTotal = dollars.get(latest.fy - 1);
  const dollarsPerPoint = latest.prevDonors * 0.01 * (latest.retained ? (latest.dollarRetention * prevTotal) / latest.retained : 0);

  if (latest.prevDonors < 100) warnings.push(`Only ${latest.prevDonors} donors in the earlier year: retention rates move by several points on a handful of donors, so read the range, not the point.`);
  if (top10 >= 0.4) warnings.push(`The ten largest donors gave ${pct(top10, 0)} of fiscal year ${latest.fy} dollars: retention by count hides how much depends on them.`);

  let verdict = "usable", verdictNote = "";
  if (!model) {
    verdict = "weak";
    verdictNote = "Retention by year is shown, but the giving-probability model needs a snapshot at least a year before your last gift and 100 donor observations, so donors below are ranked by what they gave, not by odds.";
  } else if (holdout && holdout.gap > 0.25) {
    verdict = "unstable";
    verdictNote = `The model fitted on older snapshots predicted ${holdout.predicted.toFixed(0)} donors giving again in the year after ${holdout.asOf}; ${holdout.actual} did, a ${pct(holdout.gap, 0)} miss. Giving behaviour changed, so treat the probabilities as a ranking, not a forecast.`;
  } else if (!holdout || latest.prevDonors < 100) {
    verdict = "weak";
    verdictNote = !holdout ? "Only one past year is available to fit the model, so it could not be checked against a held-out year." : "Small donor base: read the ranges.";
  }

  const cap = opts.listSize || 50;
  return {
    asOf: isoDate(asOf), currentFY, fyStartMonth, donors: donors.size, gifts: gifts.length, warnings,
    table, latest: { ...latest, range80 }, status, lybuntDollars,
    lists: { LYBUNT: lists.LYBUNT.slice(0, cap), SYBUNT: lists.SYBUNT.slice(0, cap) },
    listTotals: { LYBUNT: lists.LYBUNT.length, SYBUNT: lists.SYBUNT.length },
    allLists: lists,
    recoverable, currentExpected, currentDollars,
    model: model && { snapshots: model.snapshots, observations: model.observations, rates: model.rates },
    holdout, top10, avgAnnual, lifetimeYears, dollarsPerPoint, verdict, verdictNote,
  };
}

function csvCell(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The full outreach list, most valuable first.
export function reportCsv(result) {
  const head = ["status", "donor", "last_gift", "last_amount", "typical_gift", "gifts", "giving_years", "lifetime_total", "chance_of_giving_next_12_months", "expected_dollars"];
  const out = [head.join(",")];
  for (const status of ["LYBUNT", "SYBUNT"]) {
    for (const r of result.allLists[status]) {
      out.push([status, r.donor, r.lastGift, r.lastAmount, r.typicalGift.toFixed(2), r.gifts, r.givingYears, r.total.toFixed(2),
        r.probability === null ? "" : r.probability.toFixed(3), r.expected === null ? "" : r.expected.toFixed(2)].map(csvCell).join(","));
    }
  }
  return out.join("\n") + "\n";
}

// 420 invented donors over four calendar years, seeded. Renewal odds rise with
// tenure (25% after one year, 55% after two, 70% after three or more), a few
// lapsed donors return, and amounts follow a skewed list.
export function sampleText() {
  const rand = rng(7);
  const amounts = [10, 15, 20, 25, 25, 35, 50, 50, 75, 100, 150, 250, 500, 1000];
  const lines = ["donor,date,amount"];
  const years = [2022, 2023, 2024, 2025];
  let id = 1000;
  const live = [];
  for (const y of years) {
    const fresh = y === 2022 ? 150 : 90;
    for (let i = 0; i < fresh; i++) live.push({ id: `d-${id++}`, tenure: 0, amount: amounts[(rand() * rand() * amounts.length) | 0], active: true });
    for (const d of live) {
      if (!d.active) continue;
      const p = d.tenure === 0 ? 1 : d.tenure === 1 ? 0.25 : d.tenure === 2 ? 0.55 : 0.7;
      if (d.tenure > 0 && rand() > p) { d.active = false; d.gap = 0; continue; }
      const m = 1 + ((rand() * 12) | 0), dd = 1 + ((rand() * 27) | 0);
      lines.push(`${d.id},${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")},${(d.amount * (rand() < 0.2 ? 2 : 1)).toFixed(2)}`);
      d.tenure++;
    }
    for (const d of live) if (!d.active && d.gap !== undefined && rand() < 0.08) { d.active = true; d.tenure = 1; }
  }
  return lines.join("\n");
}
