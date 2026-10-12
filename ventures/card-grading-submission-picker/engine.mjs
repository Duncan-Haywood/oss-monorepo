// Card grading submission picker: pure functions, no I/O, no network.
//
// Everything here is arithmetic on numbers the user types: what each card is
// worth raw, what they think it is worth in each grade, and how likely they
// think each grade is. Nothing is a price guide and nothing is a forecast.

export const MAX_CARDS = 120;
export const EPS = 1e-9;

export const MODEL_NOTE =
  "Estimates, not a forecast and not a price guide: every value, grade chance, fee and turnaround is a number you typed (or an illustrative example you must replace). Grading fees, declared-value limits and turnaround change often; copy them from the grader's current price list.";

// Illustrative fee tiers. They are EXAMPLES so the page works on first load;
// they are not any grader's current price list and they go stale. The user
// must replace them with the numbers on the grader's own site.
export const DEFAULT_TIERS_TEXT = `# name,fee_per_card,max_declared_value,turnaround_days
# EXAMPLE tiers only - replace with the grader's current price list.
Economy,25,500,60
Regular,50,1500,30
Express,100,3000,10
Premium,250,10000,5
Elite,600,20000,3
`;

// Illustrative generic condition guesses used only when a row gives no grade
// chances. They are not population-report data. Remainder = grade 7 or lower.
export const CONDITION_DEFAULTS = {
  sharp: { p10: 0.35, p9: 0.4, p8: 0.15, note: "sharp corners, clean surface, good centering" },
  clean: { p10: 0.15, p9: 0.4, p8: 0.25, note: "light wear at most, decent centering" },
  fair: { p10: 0.03, p9: 0.15, p8: 0.3, note: "visible whitening or a surface flaw" },
  worn: { p10: 0, p9: 0.02, p8: 0.1, note: "obvious wear, creases or print lines" },
};

export const INPUT_NOTES = [
  { what: "name,raw,v10,v9,v8,v7_or_lower,p10,p9,p8[,note]", detail: "One card per row. Values are what the card would sell for in that state (raw, or a slab at that grade) before fees. p10, p9, p8 are your own chances of each grade; the rest is grade 7 or lower." },
  { what: "p10, p9, p8 as 0.35 or 35%", detail: "A number from 0 to 1, or a percent. A plain number above 1 up to 100 is read as a percent. They must add up to 100% or less." },
  { what: "p10 cell holds a word: sharp, clean, fair, worn", detail: "Uses an illustrative chance table instead of your own (leave p9 and p8 empty). Rows with no chances at all use the default condition. These are generic guesses, not population data." },
  { what: "Fee tiers: name,fee,max_declared_value,days", detail: "The cheapest tier whose declared-value limit covers the card's best case is used. Use none for no limit. Defaults are examples, not a current price list." },
  { what: "Time value", detail: "A graded sale arrives after the turnaround. It is discounted by your annual rate times days over 365. Selling raw is immediate and not discounted." },
  { what: "Budget and card limit", detail: "When total grading spend or cards per submission is capped, the best subset is found exactly (knapsack search), not by ranking and cutting off." },
];

export const money = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const r = Math.round(Math.abs(v) * 100) / 100;
  return `${v < -0.004 ? "-" : ""}$${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const pct = (p, digits = 1) => (p === null || p === undefined ? "n/a" : `${(p * 100).toFixed(digits).replace(/\.0+$/, "")}%`);

const toNumber = (s) => {
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
};

export function parseProb(s) {
  const t = String(s ?? "").trim();
  if (t === "") return null;
  if (t.endsWith("%")) {
    const n = toNumber(t.slice(0, -1));
    return n === null || n < 0 || n > 100 ? NaN : n / 100;
  }
  const n = toNumber(t);
  if (n === null || n < 0 || n > 100) return NaN;
  return n > 1 ? n / 100 : n;
}

const splitLine = (line) => line.split(",").map((s) => s.trim());

/** Parse card rows. Never throws; errors carry line numbers. */
export function parseCards(text) {
  const cards = [];
  const errors = [];
  const lines = String(text ?? "").split(/\r?\n/);
  let seenHeader = false;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = splitLine(line);
    if (!seenHeader && /^(name|card)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `line ${i + 1}`;
    if (f.length < 6) { errors.push(`${at}: expected name,raw,v10,v9,v8,v7_or_lower[,p10,p9,p8[,note]] but found ${f.length} field(s)`); return; }
    if (!f[0]) { errors.push(`${at}: name is empty`); return; }
    const labels = ["raw value", "value if grade 10", "value if grade 9", "value if grade 8", "value if grade 7 or lower"];
    const vals = [];
    for (let k = 0; k < 5; k += 1) {
      const n = toNumber(f[1 + k]);
      if (n === null || n < 0) { errors.push(`${at}: ${labels[k]} must be a number of dollars, zero or more`); return; }
      vals.push(n);
    }
    let probs = null;
    let condition = null;
    let note = "";
    const pf = [f[6], f[7], f[8]];
    if (pf[0] && /^[a-z][a-z-]*$/i.test(pf[0]) && !Number.isFinite(toNumber(pf[0]))) {
      const key = pf[0].toLowerCase();
      if (!CONDITION_DEFAULTS[key]) { errors.push(`${at}: condition must be one of ${Object.keys(CONDITION_DEFAULTS).join(", ")} (or give p10,p9,p8)`); return; }
      condition = key;
      note = f.slice(9).join(",");
    } else if (pf.some((x) => x !== undefined && x !== "")) {
      const ps = pf.map(parseProb);
      if (ps.some((x) => x === null || Number.isNaN(x))) { errors.push(`${at}: p10, p9 and p8 must each be a chance from 0 to 1 (or a percent), all three or none`); return; }
      const sum = ps[0] + ps[1] + ps[2];
      if (sum > 1 + 1e-9) { errors.push(`${at}: p10 + p9 + p8 is ${pct(sum)}, which is above 100%`); return; }
      probs = { p10: ps[0], p9: ps[1], p8: ps[2] };
      note = f.slice(9).join(",");
    } else {
      note = f.slice(9).join(",");
    }
    cards.push({ name: f[0], raw: vals[0], v10: vals[1], v9: vals[2], v8: vals[3], v7: vals[4], probs, condition, note, line: i + 1 });
  });
  if (cards.length > MAX_CARDS) errors.push(`at most ${MAX_CARDS} cards at a time; found ${cards.length}`);
  return { cards, errors };
}

/** Parse the fee table. Lines: name,fee,max_declared_value,days. */
export function parseTiers(text) {
  const tiers = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = splitLine(line);
    const at = `tier line ${i + 1}`;
    if (/^name$/i.test(f[0])) return;
    if (f.length < 4) { errors.push(`${at}: expected name,fee,max_declared_value,days`); return; }
    const fee = toNumber(f[1]);
    const days = toNumber(f[3]);
    const maxRaw = f[2].toLowerCase();
    const max = ["", "none", "any", "unlimited", "no limit", "inf"].includes(maxRaw) ? Infinity : toNumber(f[2]);
    if (!f[0]) { errors.push(`${at}: name is empty`); return; }
    if (fee === null || fee < 0) { errors.push(`${at}: fee must be a number of dollars, zero or more`); return; }
    if (max === null || max <= 0) { errors.push(`${at}: max declared value must be above zero (or none)`); return; }
    if (days === null || days < 0) { errors.push(`${at}: turnaround days must be zero or more`); return; }
    tiers.push({ name: f[0], fee, maxValue: max, days });
  });
  if (!tiers.length && !errors.length) errors.push("no fee tiers found");
  return { tiers, errors };
}

export const DEFAULT_TIERS = parseTiers(DEFAULT_TIERS_TEXT).tiers;

function numOpt(v, dflt, name, { min = 0, max = Infinity, allowBlank = false } = {}) {
  if (v === undefined || v === null || v === "") {
    if (allowBlank) return null;
    return dflt;
  }
  const n = typeof v === "number" ? v : toNumber(v);
  if (n === null || !Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a number from ${min} to ${max === Infinity ? "any size" : max}`);
  return n;
}

export function normalizeOptions(o = {}) {
  const defaultCondition = String(o.defaultCondition ?? "clean").toLowerCase();
  if (!CONDITION_DEFAULTS[defaultCondition]) throw new Error(`default condition must be one of ${Object.keys(CONDITION_DEFAULTS).join(", ")}`);
  const budget = numOpt(o.budget, null, "grading budget", { allowBlank: true });
  const maxCards = numOpt(o.maxCards, null, "max cards per submission", { allowBlank: true });
  if (maxCards !== null && !Number.isInteger(maxCards)) throw new Error("max cards per submission must be a whole number");
  let tiers = o.tiers;
  if (typeof tiers === "string") {
    const t = parseTiers(tiers);
    if (t.errors.length) throw new Error(t.errors.join("; "));
    tiers = t.tiers;
  }
  if (!tiers) tiers = DEFAULT_TIERS;
  if (!tiers.length) throw new Error("at least one fee tier is needed");
  return {
    tiers: [...tiers].sort((a, b) => a.fee - b.fee || a.days - b.days || a.maxValue - b.maxValue),
    shipPerCard: numOpt(o.shipPerCard, 8, "shipping and insurance per card"),
    sellFeePct: numOpt(o.sellFeePct, 13, "marketplace fee percent", { max: 99 }),
    sellFixed: numOpt(o.sellFixed, 0.3, "fixed fee per sale"),
    annualRate: numOpt(o.annualRate, 10, "annual discount rate percent", { max: 1000 }),
    budget: budget === null ? Infinity : budget,
    maxCards: maxCards === null ? Infinity : maxCards,
    minUplift: numOpt(o.minUplift, 0, "minimum uplift"),
    defaultCondition,
  };
}

/** Cheapest tier whose declared-value limit covers the card's best case. */
export function chooseTier(bestCase, tiers) {
  for (const t of tiers) if (t.maxValue + EPS >= bestCase) return t;
  return null;
}

const saleNet = (v, o) => (v > 0 ? v * (1 - o.sellFeePct / 100) - o.sellFixed : 0);

export function resolveProbs(card, o) {
  if (card.probs) return { ...card.probs, p7: Math.max(0, 1 - card.probs.p10 - card.probs.p9 - card.probs.p8), source: "yours" };
  const c = card.condition || o.defaultCondition;
  const d = CONDITION_DEFAULTS[c];
  return { p10: d.p10, p9: d.p9, p8: d.p8, p7: Math.max(0, 1 - d.p10 - d.p9 - d.p8), source: card.condition ? `condition: ${c}` : `default condition: ${c}` };
}

/** Exact p10 at which grading ties selling raw, p9 and p8 held fixed. */
export function breakEvenP10({ nets, d, cost, netRaw, p9, p8 }) {
  const [n10, n9, n8, n7] = nets;
  const slope = d * (n10 - n7);
  const base = d * n7 - cost + p9 * d * (n9 - n7) + p8 * d * (n8 - n7);
  const pMax = Math.max(0, 1 - p9 - p8);
  if (slope <= 1e-12) return { status: base >= netRaw ? "always" : "never", p10: base >= netRaw ? 0 : null, max: pMax };
  const p = (netRaw - base) / slope;
  if (p <= 0) return { status: "always", p10: 0, max: pMax };
  if (p > pMax + 1e-12) return { status: "never", p10: p, max: pMax };
  return { status: "at", p10: p, max: pMax };
}

export function evaluateCard(card, o) {
  const probs = resolveProbs(card, o);
  const bestCase = Math.max(card.v10, card.v9, card.v8, card.v7);
  const tier = chooseTier(bestCase, o.tiers);
  const netRaw = saleNet(card.raw, o);
  const out = { name: card.name, note: card.note, line: card.line, probs, bestCase, netRaw, tier: tier ? tier.name : null, findings: [] };
  const ordered = card.v10 >= card.v9 && card.v9 >= card.v8 && card.v8 >= card.v7;
  if (!ordered) out.findings.push({ severity: "info", rule: "values-order", message: `${card.name}: your grade values are not highest-to-lowest from grade 10 down; check them.` });
  if (!tier) {
    out.findings.push({ severity: "warn", rule: "no-tier", message: `${card.name}: best case ${money(bestCase)} is above every fee tier's declared-value limit, so no tier in your table covers it. Add the grader's high-value tier or sell raw.` });
    return { ...out, gradable: false, cost: null, uplift: null, expGrade: null };
  }
  const cost = tier.fee + o.shipPerCard;
  const d = 1 / (1 + (o.annualRate / 100) * (tier.days / 365));
  const nets = [card.v10, card.v9, card.v8, card.v7].map((v) => saleNet(v, o));
  const grades = ["10", "9", "8", "7 or lower"];
  const ps = [probs.p10, probs.p9, probs.p8, probs.p7];
  const outcomes = grades.map((g, i) => ({ grade: g, p: ps[i], net: d * nets[i] - cost, vsRaw: d * nets[i] - cost - netRaw }));
  const expGrade = outcomes.reduce((s, x) => s + x.p * x.net, 0);
  const live = outcomes.filter((x) => x.p > EPS);
  const worst = live.reduce((w, x) => (x.net < w.net ? x : w), live[0]);
  const pLose = live.filter((x) => x.vsRaw < -EPS).reduce((s, x) => s + x.p, 0);
  return {
    ...out,
    gradable: true,
    tierFee: tier.fee,
    tierDays: tier.days,
    cost,
    discount: d,
    outcomes,
    expGrade,
    uplift: expGrade - netRaw,
    breakEven: breakEvenP10({ nets, d, cost, netRaw, p9: probs.p9, p8: probs.p8 }),
    pLoseVsRaw: pLose,
    worst: { grade: worst.grade, net: worst.net, vsRaw: worst.vsRaw },
  };
}

const cents = (x) => Math.round(x * 100);

/**
 * Exact best subset: maximise total value subject to total cost <= budget
 * and at most maxCount items. Items: {id, cost (dollars), value}.
 * Dynamic programming over (count, non-dominated (cost, value) labels).
 */
export function selectBest(items, { budget = Infinity, maxCount = Infinity } = {}) {
  const cand = items.filter((x) => x.value > EPS && cents(x.cost) <= (Number.isFinite(budget) ? cents(budget) : Infinity));
  const cap = Number.isFinite(budget) ? cents(budget) : Infinity;
  const totalCost = cand.reduce((s, x) => s + cents(x.cost), 0);
  if (cand.length <= maxCount && totalCost <= cap) {
    return { ids: cand.map((x) => x.id), value: cand.reduce((s, x) => s + x.value, 0), cost: totalCost / 100, exact: true };
  }
  const limited = Number.isFinite(maxCount);
  const K = limited ? Math.min(maxCount, cand.length) : 0;
  let layers = Array.from({ length: K + 1 }, () => []);
  layers[0] = [{ c: 0, v: 0, node: null }];
  const prune = (labels) => {
    labels.sort((a, b) => a.c - b.c || b.v - a.v);
    const kept = [];
    let best = -Infinity;
    for (const l of labels) if (l.v > best + EPS) { kept.push(l); best = l.v; }
    return kept;
  };
  for (const item of cand) {
    const ic = cents(item.cost);
    const adds = layers.map(() => []);
    layers.forEach((labels, k) => {
      const target = limited ? k + 1 : 0;
      if (target > K) return;
      for (const l of labels) {
        if (l.c + ic <= cap) adds[target].push({ c: l.c + ic, v: l.v + item.value, node: { id: item.id, prev: l.node } });
      }
    });
    layers = layers.map((labels, k) => (adds[k].length ? prune([...labels, ...adds[k]]) : labels));
  }
  let best = null;
  for (const labels of layers) for (const l of labels) {
    if (!best || l.v > best.v + EPS || (Math.abs(l.v - best.v) <= EPS && l.c < best.c)) best = l;
  }
  const ids = [];
  for (let n = best.node; n; n = n.prev) ids.push(n.id);
  ids.reverse();
  return { ids, value: best.v, cost: best.c / 100, exact: true };
}

export function plan(parsed, optsIn = {}) {
  const o = normalizeOptions(optsIn);
  const cards = (parsed.cards ?? parsed).map((c) => evaluateCard(c, o));
  const findings = cards.flatMap((c) => c.findings);
  const gradable = cards.filter((c) => c.gradable);
  const candidates = gradable.filter((c) => c.uplift > o.minUplift + EPS);
  const items = candidates.map((c) => ({ id: c.name + "\u0000" + c.line, cost: c.cost, value: c.uplift }));
  const sel = selectBest(items, { budget: o.budget, maxCount: o.maxCards });
  const chosen = new Set(sel.ids);
  const key = (c) => c.name + "\u0000" + c.line;
  const submit = candidates.filter((c) => chosen.has(key(c))).sort((a, b) => b.uplift - a.uplift || a.cost - b.cost);
  const hold = cards.filter((c) => !chosen.has(key(c))).map((c) => {
    let reason;
    if (!c.gradable) reason = "no fee tier covers its best-case value";
    else if (c.uplift <= o.minUplift + EPS) reason = c.uplift < -EPS ? "expected net from grading is below selling raw" : "grading adds nothing expected over selling raw";
    else reason = Number.isFinite(o.budget) || Number.isFinite(o.maxCards) ? "worth grading on its own, but the budget or card limit is better spent on other cards" : "not selected";
    return { ...c, reason };
  }).sort((a, b) => (b.uplift ?? -Infinity) - (a.uplift ?? -Infinity));
  const spend = submit.reduce((s, c) => s + c.cost, 0);
  const uplift = submit.reduce((s, c) => s + c.uplift, 0);
  const rawAll = cards.reduce((s, c) => s + c.netRaw, 0);

  const capsBind = Number.isFinite(o.budget) || Number.isFinite(o.maxCards);
  const greedyPick = [];
  let gSpend = 0;
  for (const c of [...gradable].sort((a, b) => b.bestCase - a.bestCase)) {
    if (greedyPick.length >= o.maxCards || gSpend + c.cost > o.budget + 1e-9) continue;
    greedyPick.push(c); gSpend += c.cost;
  }
  const baselines = [
    { label: "Send the highest-value cards first, within your limits", cards: greedyPick.length, spend: gSpend, uplift: greedyPick.reduce((s, c) => s + c.uplift, 0), respectsLimits: true },
    { label: capsBind ? "Send every card a tier covers (ignores your limits)" : "Send every card a tier covers", cards: gradable.length, spend: gradable.reduce((s, c) => s + c.cost, 0), uplift: gradable.reduce((s, c) => s + c.uplift, 0), respectsLimits: !capsBind },
  ];
  const bestBase = Math.max(...baselines.filter((b) => b.respectsLimits).map((b) => b.uplift));
  for (const c of submit) if (c.pLoseVsRaw >= 0.5) findings.push({ severity: "warn", rule: "likely-regret", message: `${c.name}: grading beats selling raw on average but ${pct(c.pLoseVsRaw, 0)} of your own odds leave you worse off than selling raw (worst case ${money(c.worst.vsRaw)} versus raw at grade ${c.worst.grade}).` });
  const dropped = hold.filter((h) => h.gradable && h.uplift > o.minUplift + EPS);
  if (dropped.length) findings.push({ severity: "info", rule: "limit-bound", message: `${dropped.length} card(s) are worth grading on their own but did not fit your ${Number.isFinite(o.budget) ? `${money(o.budget)} budget` : ""}${Number.isFinite(o.budget) && Number.isFinite(o.maxCards) ? " and " : ""}${Number.isFinite(o.maxCards) ? `${o.maxCards}-card limit` : ""}; the chosen set is the exact best use of it.` });
  return {
    options: { ...o, budget: Number.isFinite(o.budget) ? o.budget : null, maxCards: Number.isFinite(o.maxCards) ? o.maxCards : null, tiers: o.tiers.map((t) => ({ ...t, maxValue: Number.isFinite(t.maxValue) ? t.maxValue : null })) },
    cards: cards.length,
    submit,
    hold,
    spend,
    uplift,
    expectedNetAll: rawAll + uplift,
    rawNetAll: rawAll,
    baselines,
    upliftVsBest: uplift - bestBase,
    findings,
  };
}

export function summarize(p) {
  const n = p.submit.length;
  if (!p.cards) return { status: "none", text: "No cards." };
  if (!n) return { status: "none", text: `Send none of the ${p.cards} cards: on your numbers none is expected to net more graded than sold raw.` };
  const text = `Send ${n} of ${p.cards} cards, spending ${money(p.spend)} on fees and shipping, for an expected ${money(p.uplift)} more than selling them raw (${money(p.upliftVsBest)} more than the best simple rule). Your estimates, not a forecast.`;
  return { status: p.upliftVsBest > 0.005 ? "gain" : "ok", text };
}
