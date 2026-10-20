// Deal Keeper engine: a small sales pipeline whose win probabilities are learned from YOUR closed deals,
// with a forecast range, an out-of-time backtest and a pipeline-hygiene list.
// Pure and browser-safe (no node: imports): the web page and the server run this same file.
export const DAY = 86_400_000;
export const DEFAULT_STAGES = ["lead", "qualified", "proposal", "negotiation"];
export const K = 5; // shrinkage: a stage's learned win rate counts as K pseudo-deals of the prior
export const MIN_LEARNED = 20; // closed deals (and 5 of each outcome) before the label says "learned"
const ID = /^[\w.:@-]{1,100}$/;
const MAX_TOUCHES = 400;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const toMs = (v) => (typeof v === "number" ? v : Date.parse(v));

export function newState(stages = DEFAULT_STAGES) { return { stages: [...stages], deals: {}, alerted: {}, model: null, modelAt: 0 }; }

/** Prior win chance for each stage before any history: 10% at the first stage rising to 75% at the last. */
export const priors = (stages) => stages.map((_, i) => 0.1 + (stages.length < 2 ? 0 : (0.65 * i) / (stages.length - 1)));

const idxOf = (state, stage) => {
  const i = state.stages.indexOf(String(stage ?? "").toLowerCase());
  if (i < 0) throw fail(`stage must be one of: ${state.stages.join(", ")}`);
  return i;
};
const when = (v, name, now) => {
  const t = v == null ? now : toMs(v);
  if (!Number.isFinite(t)) throw fail(`${name} must be an ISO date or epoch milliseconds`);
  return t;
};

/**
 * Create or update a deal. Changing `stage` appends to its history (that history is what the model learns
 * from); changing `closeDate` counts as a slip. `status` is open | won | lost. Nothing here stores free text
 * beyond a short name and next step: send ids you choose, never contact details.
 */
export function upsertDeal(state, d, now) {
  if (!d || typeof d !== "object") throw fail("deal must be an object");
  if (!ID.test(d.id || "")) throw fail("id is required (1-100 characters of letters, digits and _ . : @ -)");
  let deal = state.deals[d.id];
  const status = d.status == null ? deal?.status || "open" : String(d.status).toLowerCase();
  if (!["open", "won", "lost"].includes(status)) throw fail("status must be open, won or lost");
  if (d.amount != null && !(Number.isFinite(Number(d.amount)) && Number(d.amount) >= 0)) throw fail("amount must be a number of zero or more");
  const create = !deal;
  if (create) {
    const createdAt = when(d.createdAt, "createdAt", now);
    const idx = d.stage == null ? 0 : idxOf(state, d.stage);
    const enteredAt = d.stageAt == null ? createdAt : when(d.stageAt, "stageAt", now);
    deal = state.deals[d.id] = { id: d.id, name: "", amount: null, createdAt, closeDate: null, closeChanges: 0, status: "open", closedAt: null, nextStep: "", touches: [createdAt], history: [[idx, enteredAt]], exact: d.exact !== false };
    if (Array.isArray(d.history) && d.history.length) { // a full stage history, as exported by `import.mjs`
      if (d.history.length > 50) throw fail("history is limited to 50 stage moves");
      deal.history = d.history.map((h) => [idxOf(state, h?.stage), when(h?.at, "history.at", now)]).sort((a, b) => a[1] - b[1]);
      deal.exact = true; for (const [, t] of deal.history) touch(deal, t);
    }
  } else if (d.stage != null && idxOf(state, d.stage) !== currentIdx(deal)) {
    const ts = when(d.stageAt, "stageAt", now);
    deal.history.push([idxOf(state, d.stage), ts]);
    touch(deal, ts);
  }
  if (d.name != null) deal.name = String(d.name).slice(0, 80);
  if (d.amount != null) deal.amount = Number(d.amount);
  if (d.nextStep != null) deal.nextStep = String(d.nextStep).slice(0, 120);
  if (d.closeDate !== undefined) {
    const cd = d.closeDate === null ? null : when(d.closeDate, "closeDate", now);
    if (!create && deal.closeDate != null && cd != null && cd > deal.closeDate) deal.closeChanges++;
    deal.closeDate = cd;
  }
  if (d.lastActivityAt != null) touch(deal, when(d.lastActivityAt, "lastActivityAt", now));
  if (status !== "open" && deal.status === "open") { deal.closedAt = when(d.closedAt, "closedAt", now); touch(deal, deal.closedAt); }
  else if (status === "open") deal.closedAt = null;
  deal.status = status;
  return deal;
}

/** Record that someone talked to the buyer. Idempotent per timestamp. */
export function addActivity(state, id, at, now) {
  const deal = state.deals[id];
  if (!deal) throw fail("unknown deal", 404);
  touch(deal, when(at, "at", now));
  return deal;
}
function touch(deal, ts) {
  if (deal.touches.includes(ts)) return;
  deal.touches.push(ts); deal.touches.sort((a, b) => a - b);
  if (deal.touches.length > MAX_TOUCHES) deal.touches.splice(1, deal.touches.length - MAX_TOUCHES);
}
export function removeDeal(state, id) { delete state.deals[id]; for (const k of Object.keys(state.alerted)) if (k.startsWith(`${id}|`)) delete state.alerted[k]; }

const currentIdx = (deal) => deal.history[deal.history.length - 1][0];
const stageEntered = (deal) => deal.history[deal.history.length - 1][1];
const lastTouch = (deal) => deal.touches[deal.touches.length - 1];
/** Furthest stage a deal got to. A won deal went through every stage by definition. */
const reached = (state, deal) => (deal.status === "won" ? state.stages.length - 1 : Math.max(...deal.history.map((h) => h[0])));

/** Days spent in stage `i` (summed over visits), or null when the deal's stage dates are not exact. */
function dwell(deal, i, end) {
  if (!deal.exact) return null;
  let total = 0, seen = false;
  deal.history.forEach(([idx, ts], k) => {
    if (idx !== i) return;
    seen = true; total += Math.max(0, (k + 1 < deal.history.length ? deal.history[k + 1][1] : end) - ts);
  });
  return seen ? total / DAY : null;
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

const closedOf = (deals) => Object.values(deals).filter((d) => d.status !== "open" && d.closedAt != null);

/** Stage win rates from closed deals, shrunk toward the prior and forced to be non-decreasing. */
function stageRates(state, closed) {
  const pr = priors(state.stages);
  const rows = state.stages.map((name, i) => {
    const cohort = closed.filter((d) => reached(state, d) >= i), wins = cohort.filter((d) => d.status === "won").length;
    return { name, n: cohort.length, wins, p: (wins + K * pr[i]) / (cohort.length + K) };
  });
  for (let i = 1; i < rows.length; i++) rows[i].p = Math.max(rows[i].p, rows[i - 1].p);
  return rows;
}

/** Fit the model on closed deals as of `now`. `validation` is the out-of-time backtest (null when there is too little data). */
export function train(state, now, withValidation = true) {
  const closed = closedOf(state.deals), wins = closed.filter((d) => d.status === "won"), losses = closed.length - wins.length;
  const stages = stageRates(state, closed);
  const mode = closed.length >= MIN_LEARNED && wins.length >= 5 && losses >= 5 ? "learned" : "prior";
  const won = wins.filter((d) => d.exact);
  const slowAfter = state.stages.map((_, i) => { const xs = won.map((d) => dwell(d, i, d.closedAt)).filter((x) => x != null); return xs.length >= 5 ? quantile(xs, 0.75) : null; });
  const gaps = won.map((d) => { const t = [...d.touches, d.closedAt].sort((a, b) => a - b); let g = 0; for (let i = 1; i < t.length; i++) g = Math.max(g, (t[i] - t[i - 1]) / DAY); return g; });
  const staleDays = gaps.length >= 5 ? Math.max(7, Math.ceil(quantile(gaps, 0.75))) : 14;
  const cycle = median(wins.map((d) => (d.closedAt - d.createdAt) / DAY));
  return {
    mode, closed: closed.length, wins: wins.length, losses, baseRate: closed.length ? wins.length / closed.length : null,
    stages, slowAfter, staleDays, staleFromData: gaps.length >= 5, medianCycleDays: cycle,
    note: mode === "learned" ? null : `Only ${closed.length} closed deals (${wins.length} won, ${losses} lost): stage chances lean on generic defaults (${priors(state.stages).map((p) => Math.round(p * 100) + "%").join(", ")}) until you have 20 closed deals with at least 5 of each outcome.`,
    validation: withValidation ? validate(state, now) : null,
  };
}

/** Win chance of one open deal, with the words behind it. */
export function probability(state, model, deal, now) {
  const i = currentIdx(deal), st = model.stages[i], reasons = [];
  let p = st.p;
  reasons.push(st.n ? `in ${st.name}; ${st.wins} of ${st.n} past deals that got this far were won` : `in ${st.name}; no past deals to learn from yet, so a default chance`);
  const age = (now - stageEntered(deal)) / DAY;
  if (deal.exact && age >= 1) {
    const cohort = closedOf(state.deals).filter((d) => d.exact && reached(state, d) >= i && (dwell(d, i, d.closedAt) ?? -1) >= age), w = cohort.filter((d) => d.status === "won").length;
    if (cohort.length >= 3) {
      p = (w + K * st.p) / (cohort.length + K);
      reasons.push(`${Math.round(age)} days in this stage; ${w} of ${cohort.length} past deals that stayed at least that long were won`);
    }
  }
  return { p, reasons };
}

/**
 * Out-of-time backtest. Cut the closed deals at their 70th-percentile close date. Train only on deals closed
 * before the cut, then forecast the deals that were open at the cut (using the stage each was in on that day)
 * and compare with how they ended. Needs exact stage dates, 20 training deals and 10 test deals.
 */
export function validate(state, now) {
  const closed = closedOf(state.deals), exact = closed.filter((d) => d.exact);
  if (exact.length < 30) return null;
  const cut = quantile(exact.map((d) => d.closedAt), 0.7);
  const trainDeals = Object.fromEntries(closed.filter((d) => d.closedAt <= cut).map((d) => [d.id, d]));
  const test = exact.filter((d) => d.createdAt <= cut && d.closedAt > cut);
  if (Object.keys(trainDeals).length < 20 || test.length < 10) return null;
  const sub = { stages: state.stages, deals: trainDeals }, model = { stages: stageRates(sub, Object.values(trainDeals)) };
  const base = Object.values(trainDeals).filter((d) => d.status === "won").length / Object.keys(trainDeals).length;
  let predicted = 0, actual = 0, brier = 0, brierBase = 0;
  for (const d of test) {
    const clone = { ...d, history: d.history.filter(([, ts]) => ts <= cut), status: "open", closedAt: null };
    const p = probability(sub, model, clone, cut).p, y = d.status === "won" ? 1 : 0;
    predicted += p; actual += y; brier += (p - y) ** 2; brierBase += (base - y) ** 2;
  }
  return { cutoff: cut, trainDeals: Object.keys(trainDeals).length, testDeals: test.length, predictedWins: predicted, actualWins: actual, brier: brier / test.length, brierBaseline: brierBase / test.length, skill: brierBase > 0 ? 1 - brier / brierBase : null };
}

/** Why a deal needs attention. Each flag has a key, the words, and (for slow) the threshold used. */
export function flags(state, model, deal, now) {
  if (deal.status !== "open") return [];
  const out = [], i = currentIdx(deal), idle = (now - lastTouch(deal)) / DAY, age = (now - stageEntered(deal)) / DAY;
  if (idle > model.staleDays) out.push({ key: "stale", text: `no activity for ${Math.floor(idle)} days (your won deals rarely went quiet longer than ${model.staleDays}${model.staleFromData ? "" : ", a default until you have 5 won deals"})` });
  if (deal.closeDate != null && deal.closeDate < now - DAY / 2) out.push({ key: "overdue", text: `expected close date was ${Math.floor((now - deal.closeDate) / DAY)} days ago` });
  if (deal.closeChanges >= 2) out.push({ key: "slipped", text: `close date pushed back ${deal.closeChanges} times` });
  if (i > 0 && !deal.nextStep) out.push({ key: "no-next-step", text: "no next step recorded" });
  if (deal.amount == null) out.push({ key: "no-amount", text: "no amount, so it counts as $0 in the forecast" });
  const slow = model.slowAfter[i];
  if (deal.exact && slow != null && age > slow) out.push({ key: "slow", text: `${Math.round(age)} days in ${state.stages[i]}; three quarters of your won deals left it within ${Math.ceil(slow)}` });
  if (deal.closeDate == null) out.push({ key: "no-close-date", text: "no expected close date, so it is left out of date-ranged forecasts" });
  return out;
}

/** Every open deal with its chance, value, flags and a "fix these first" rank (value at risk from flags). */
export function pipeline(state, model, now) {
  const rows = Object.values(state.deals).filter((d) => d.status === "open").map((d) => {
    const { p, reasons } = probability(state, model, d, now), f = flags(state, model, d, now), amount = d.amount ?? 0;
    const urgent = f.filter((x) => !["no-close-date", "no-amount"].includes(x.key));
    return { id: d.id, name: d.name, stage: state.stages[currentIdx(d)], amount: d.amount, probability: p, weighted: amount * p, closeDate: d.closeDate, nextStep: d.nextStep, flags: f, atRisk: urgent.length ? amount * p : 0, reasons };
  });
  return rows.sort((a, b) => b.atRisk - a.atRisk || b.weighted - a.weighted);
}

/**
 * Forecast for deals expected to close in [from, to]. The range treats each deal as an independent coin
 * flip (variance = amount^2 p (1-p)), so it is a 10th-to-90th percentile band under that assumption, which
 * is optimistic when deals are correlated (a recession hits all of them). Deals with no close date are counted
 * but not placed in any window.
 */
export function forecast(state, model, now, { from = now, to = now + 90 * DAY, target = null } = {}) {
  const rows = pipeline(state, model, now), inWindow = rows.filter((r) => r.closeDate != null && r.closeDate >= from - DAY && r.closeDate <= to);
  const weighted = inWindow.reduce((s, r) => s + r.weighted, 0), variance = inWindow.reduce((s, r) => s + (r.amount ?? 0) ** 2 * r.probability * (1 - r.probability), 0), sd = Math.sqrt(variance);
  const wonSoFar = closedOf(state.deals).filter((d) => d.status === "won" && d.closedAt >= from && d.closedAt <= to).reduce((s, d) => s + (d.amount ?? 0), 0);
  const open = inWindow.reduce((s, r) => s + (r.amount ?? 0), 0);
  const out = {
    deals: inWindow.length, undated: rows.filter((r) => r.closeDate == null).length, wonSoFar, weighted, low: Math.max(0, weighted - 1.2816 * sd), high: weighted + 1.2816 * sd,
    likely: inWindow.filter((r) => r.probability >= 0.6).reduce((s, r) => s + (r.amount ?? 0), 0), openValue: open,
  };
  if (target != null) { const need = target - wonSoFar; out.target = target; out.gap = need - weighted; out.coverage = need > 0 ? open / need : null; }
  return out;
}

/** Deals newly carrying an alertable flag (stale, overdue, slipped), minus ones already alerted. Mutates state.alerted. */
export function newAlerts(state, model, now) {
  const live = new Set(), out = [];
  for (const r of pipeline(state, model, now)) for (const f of r.flags) {
    if (!["stale", "overdue", "slipped"].includes(f.key)) continue;
    const k = `${r.id}|${f.key}`; live.add(k);
    if (!state.alerted[k]) out.push({ key: k, type: `deal.${f.key}`, deal: r.id, name: r.name, stage: r.stage, amount: r.amount, text: f.text });
  }
  for (const k of Object.keys(state.alerted)) if (!live.has(k)) delete state.alerted[k]; // fixed: may alert again if it recurs
  return out;
}

export function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Synthetic history for demos and tests. With `signal` on, winning gets likelier at later stages and
 * drops for deals that sat still; off, outcomes are coin flips that ignore the stage (the honesty check).
 */
export function syntheticState(now, { closed = 220, open = 24, seed = 7, signal = true } = {}) {
  const r = mulberry32(seed), s = newState(), n = s.stages.length;
  for (let k = 0; k < closed + open; k++) {
    const isOpen = k >= closed, stalled = r() < 0.35, hops = [];
    let stop = 0;
    for (let i = 1; i < n; i++) { if (r() < (signal ? 0.62 : 0.8)) { hops.push((3 + r() * 12) * DAY); stop = i; } else break; }
    const final = stalled ? (25 + r() * 35) * DAY : (2 + r() * 14) * DAY;
    const journey = hops.reduce((a, b) => a + b, 0) + final;
    const created = isOpen ? now - (1 + r() * 70) * DAY : now - (2 + r() * 330) * DAY - journey;
    const history = [[0, created]]; let t = created;
    hops.forEach((h, j) => { t += h; history.push([j + 1, t]); });
    const deal = { id: `d${k}`, name: `Deal ${k}`, amount: Math.round(2000 + r() * 18000), createdAt: created, closeDate: null, closeChanges: 0, status: "open", closedAt: null, nextStep: r() < 0.8 ? "call" : "", touches: [], history, exact: true };
    if (isOpen) {
      while (history.length > 1 && history[history.length - 1][1] > now - DAY) history.pop();
      deal.closeDate = now + (r() * 100 - 8) * DAY; deal.closeChanges = r() < 0.12 ? 2 : 0;
      deal.touches = [...history.map((h) => h[1]), Math.max(created, now - r() * (stalled ? 30 : 9) * DAY)];
    } else {
      deal.status = r() < (signal ? [0.04, 0.16, 0.42, 0.71][Math.min(stop, 3)] * (stalled ? 0.5 : 1) : 0.3) ? "won" : "lost";
      deal.closedAt = t + final; deal.touches = [...history.map((h) => h[1]), deal.closedAt - (stalled ? final * 0.8 : 0)];
    }
    deal.touches = [...new Set(deal.touches)].sort((a, b) => a - b);
    s.deals[deal.id] = deal;
  }
  return s;
}

/**
 * Parse a pasted CSV of deals: `id,name,stage,amount,status,created,closed,close_date,last_activity,next_step,stage_since,stage_history`.
 * Only id, stage and created are required. Header row optional. `stage_history` is `lead@2026-01-02;qualified@2026-01-10`
 * and, when present, marks the row as having exact stage dates (needed for the dwell-time and backtest features).
 */
export function parseCsv(text, stages = DEFAULT_STAGES) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean), errors = [], state = newState(stages);
  const cols = ["id", "name", "stage", "amount", "status", "created", "closed", "close_date", "last_activity", "next_step", "stage_since", "stage_history"];
  let order = cols;
  if (lines.length && /^id\s*,/i.test(lines[0])) order = lines.shift().split(",").map((c) => c.trim().toLowerCase());
  const split = (line) => { const out = []; let cur = "", q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return out; };
  lines.forEach((line, n) => {
    const v = split(line), g = (c) => { const j = order.indexOf(c); return j < 0 || v[j] === undefined || v[j] === "" ? undefined : v[j]; };
    try {
      const created = g("created") && toMs(g("created"));
      if (!g("id") || !Number.isFinite(created)) throw fail("needs an id and a valid created date");
      const status = (g("status") || "open").toLowerCase(), hist = g("stage_history");
      let stage = (g("stage") || stages[0]).toLowerCase();
      const deal = { id: g("id"), name: g("name"), amount: g("amount") == null ? undefined : Number(String(g("amount")).replace(/[$,]/g, "")), createdAt: created, stage: hist ? stages[0] : stage, status, exact: Boolean(hist) || (status === "open" && Boolean(g("stage_since"))) };
      if (g("closed")) deal.closedAt = toMs(g("closed"));
      if (g("close_date")) deal.closeDate = toMs(g("close_date"));
      if (g("last_activity")) deal.lastActivityAt = toMs(g("last_activity"));
      if (g("next_step")) deal.nextStep = g("next_step");
      if (g("stage_since")) deal.stageAt = toMs(g("stage_since"));
      if (status !== "open" && !Number.isFinite(deal.closedAt)) deal.closedAt = deal.lastActivityAt ?? created;
      const made = upsertDeal(state, deal, Date.now());
      if (hist) {
        made.history = hist.split(";").map((p) => { const [s, d] = p.split("@"); const i = stages.indexOf(s.trim().toLowerCase()), t = toMs(d); if (i < 0 || !Number.isFinite(t)) throw fail(`stage_history entry "${p}" is not stage@date`); return [i, t]; });
        for (const [, t] of made.history) touch(made, t);
      } else if (stages.indexOf(stage) > 0) made.history = [[stages.indexOf(stage), deal.stageAt ?? created]];
    } catch (e) { errors.push(`Line ${n + 1}: ${e.message}`); }
  });
  return { state, errors };
}
