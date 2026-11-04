/**
 * Launch marketing planner: how much advertising a design can afford, and a
 * week-by-week calendar of drafts that works backwards from the break-even.
 *
 * It does arithmetic on numbers the designer types. It does not know what a
 * click costs or how many visitors buy, so the defaults are round placeholders
 * the page labels as such; replace them with a first small test's results.
 *
 *   CAC (cost per sale) = cost per click / conversion rate
 *   break-even CAC      = left per sale after cost, tax and fees (profitPerSale)
 *   break-even ROAS     = shelf price / profitPerSale  (revenue per unit of ad spend)
 *
 * Above break-even CAC, every ad-driven sale loses money. Nothing is posted
 * or bought for you.
 */

import { captions } from "./launchkit.mjs";

export const DEFAULT_ASSUMPTIONS = Object.freeze({
  cpc: 0.8,            // cost per click, in the sheet's currency (placeholder)
  conversionPct: 1.5,  // share of clicks that buy (placeholder)
  weeks: 6,            // length of the launch window
  postsPerWeek: 3,
});

const round2 = v => Math.round(v * 100) / 100;

/** Split `total` whole units over `weights` so the parts sum to exactly `total`. */
export function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || total <= 0) return weights.map(() => 0);
  const exact = weights.map(w => (w / sum) * total);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left--; }
  return out;
}

/** What the ad budget can buy at the typed click price and conversion rate. */
export function adEconomics({ profitPerSale, price, adBudget, cpc, conversionPct }) {
  const conv = conversionPct / 100;
  const cac = cpc > 0 && conv > 0 ? cpc / conv : null;
  const out = {
    cac: cac == null ? null : round2(cac),
    breakEvenCac: round2(profitPerSale),
    breakEvenRoas: profitPerSale > 0 ? round2(price / profitPerSale) : null,
    maxCpcAtBreakEven: profitPerSale > 0 && conv > 0 ? round2(profitPerSale * conv) : null,
    minConversionPct: profitPerSale > 0 && cpc > 0 ? Math.round((cpc / profitPerSale) * 1000) / 10 : null,
    clicks: cpc > 0 ? Math.floor(adBudget / cpc) : null,
    paidSales: cac ? Math.floor(adBudget / cac) : null,
    roas: null, netFromAds: null, verdict: "", notes: [],
  };
  if (out.paidSales != null) {
    out.roas = adBudget > 0 ? round2((out.paidSales * price) / adBudget) : null;
    out.netFromAds = round2(out.paidSales * profitPerSale - adBudget);
  }
  if (profitPerSale <= 0) {
    out.verdict = "Each sale leaves nothing after cost, tax and fees, so no advertising can pay for itself. Fix the price or the cost first.";
  } else if (cac == null) {
    out.verdict = "Enter a click price and a conversion rate to see what ads can do.";
  } else if (cac > profitPerSale) {
    out.verdict = `At ${out.cac} per sale, ads cost more than the ${out.breakEvenCac} each sale leaves. Ads lose money at these numbers: raise the conversion rate (better page, photos, price), find cheaper clicks, or lean on organic and email.`;
  } else {
    out.verdict = `At ${out.cac} per sale against ${out.breakEvenCac} left per sale, ads can pay for themselves. The click price and conversion rate are your guesses: run a small test (a tenth of the budget) before spending the rest.`;
  }
  if (adBudget > 0 && out.paidSales === 0 && cac) out.notes.push("The budget is smaller than one expected sale's ad cost.");
  return out;
}

const PHASES = [
  { id: "teaser", label: "Teaser", goal: "Build a list of people who want to hear when it is out; no sales yet." },
  { id: "launch", label: "Launch", goal: "The drop. Most sales happen in the first days." },
  { id: "proof", label: "Proof", goal: "Show real people wearing it; answer the questions buyers ask." },
  { id: "last", label: "Last call", goal: "Say honestly how many are left and when the run closes." },
];

function phaseFor(i, n) {
  if (i === 0) return PHASES[0];
  if (i === 1) return PHASES[1];
  return i >= n - 1 && n > 3 ? PHASES[3] : PHASES[2];
}

function tasksFor(phase, week, design, caps, postsPerWeek) {
  const t = [];
  const post = k => `Post ${k + 1}: draft in the launch kit${caps[(week + k) % caps.length] ? ` ("${caps[(week + k) % caps.length].slice(0, 60)}...")` : ""}`;
  const posts = n => Array.from({ length: n }, (_, k) => post(k));
  if (phase.id === "teaser") {
    t.push("Photograph the sample or the mock-up from three angles, with the artwork close up", "Put a sign-up form or waitlist link where people can ask to be told", ...posts(Math.max(1, postsPerWeek - 1)));
    t.push("Send the sample to two or three people whose audience matches yours, with no obligation to post");
  } else if (phase.id === "launch") {
    t.push("Email the list the moment the drop opens", `Check the store page: price ${design.price}, sizes, shipping times, returns wording`, ...posts(postsPerWeek), "Start ads at a small daily amount; look at cost per sale after two days before raising it");
  } else if (phase.id === "proof") {
    t.push("Ask first buyers for a photo (with permission to repost) and share the ones you may use", ...posts(Math.max(1, postsPerWeek - 1)), "Reply to every question and comment within a day", "Compare the cost per sale to the break-even figure above; pause ad sets above it");
  } else {
    t.push(`Tell buyers how many of the ${design.quantity} are left, only if it is true`, ...posts(Math.max(1, postsPerWeek - 1)), "Email the list a final reminder with the close date", "Decide whether a second run is worth it from the sales you have, not the hoped-for ones");
  }
  return t;
}

/**
 * The plan. `econ` is the object `economics()` or `sellingSide()` returns for
 * the design; `adBudget` defaults to the plan's launch budget in that call.
 */
export function marketingPlan({ design, econ, adBudget, assumptions = {} }) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const weeks = Math.max(2, Math.min(12, Math.round(a.weeks)));
  const budget = Math.max(0, adBudget ?? 0);
  const ads = adEconomics({ profitPerSale: econ.profitPerSale, price: econ.price, adBudget: budget, cpc: a.cpc, conversionPct: a.conversionPct });
  const notes = [];

  const salesW = Array.from({ length: weeks }, (_, i) => (i === 0 ? 0 : 0.35 * Math.pow(0.7, i - 1)));
  const spendW = salesW.map((w, i) => (i === 0 ? 0.1 : w * 0.9 / (salesW.reduce((x, y) => x + y, 0))));
  const target = econ.breakEvenUnits ?? 0;
  const salesPerWeek = apportion(target, salesW);
  const spendUnits = apportion(Math.round(budget * 100), spendW).map(c => c / 100);
  const caps = captions(design);

  let cum = 0;
  const calendar = salesPerWeek.map((s, i) => {
    cum += s;
    const phase = phaseFor(i, weeks);
    return {
      week: i + 1, phase: phase.label, goal: phase.goal,
      salesTarget: s, cumulativeSalesTarget: cum, adSpend: spendUnits[i],
      tasks: tasksFor(phase, i, design, caps, a.postsPerWeek),
    };
  });

  if (econ.breakEvenUnits == null) notes.push("There is no break-even to plan toward until each sale makes money (see the costing section).");
  else {
    const organic = Math.max(0, target - (ads.paidSales ?? 0));
    if (ads.paidSales != null) notes.push(`At the typed numbers the ad budget buys about ${ads.paidSales} sales; the other ${organic} of the ${target} needed to break even must come from your own audience, email, friends and shops that stock it.`);
    if (target > econ.sellableUnits) notes.push(`Break-even needs ${target} sales but you expect to sell ${econ.sellableUnits} of the run: no calendar fixes that.`);
    const spread = salesPerWeek.filter(x => x > 0).length;
    if (spread) notes.push(`That is about ${Math.ceil(target / spread)} sales a week on average over the ${spread} selling weeks, front-loaded to the drop.`);
  }
  return { assumptions: a, ads, calendar, notes };
}

const csvCell = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** The calendar as CSV for a spreadsheet or a task tool. */
export function calendarCsv(plan) {
  const rows = [["Week", "Phase", "Goal", "Ad spend", "Sales target (week)", "Sales target (cumulative)", "Tasks"].join(",")];
  for (const w of plan.calendar) rows.push([w.week, w.phase, w.goal, w.adSpend.toFixed(2), w.salesTarget, w.cumulativeSalesTarget, w.tasks.join(" | ")].map(csvCell).join(","));
  return rows.join("\n") + "\n";
}

/** Wilson 95% interval for k successes in n trials (fine for small n and k = 0). */
export function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return null;
  const p = k / n, z2 = z * z, d = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/**
 * Read a first small ad test. The designer types what they spent, how many
 * clicks it bought and how many orders came from them; this returns the real
 * click price, conversion rate and cost per sale, a 95% range on the rate
 * (small tests are noisy), and whether the test already settles the question
 * against the break-even `profitPerSale`. The result's `assumptions` can
 * replace the placeholders in `marketingPlan`.
 */
export function learnFromTest({ spend, clicks, orders, profitPerSale, price, remainingBudget = 0 }) {
  const out = { cpc: null, conversionPct: null, cac: null, range: null, verdict: "unclear", message: "", assumptions: null, remainingSales: null };
  if (!(spend > 0) || !(clicks > 0) || !(orders >= 0) || orders > clicks) {
    out.verdict = "invalid";
    out.message = "Enter what the test spent, the clicks it bought, and the orders that came from those clicks (no more orders than clicks).";
    return out;
  }
  const cpc = spend / clicks, conv = orders / clicks, w = wilson(orders, clicks);
  out.cpc = round2(cpc);
  out.conversionPct = Math.round(conv * 1000) / 10;
  out.cac = orders > 0 ? round2(spend / orders) : null;
  out.range = {
    conversionPct: [Math.round(w.low * 1000) / 10, Math.round(w.high * 1000) / 10],
    cac: [w.high > 0 ? round2(cpc / w.high) : null, w.low > 0 ? round2(cpc / w.low) : null], // best case, worst case
  };
  out.assumptions = { cpc: out.cpc, conversionPct: Math.max(0.1, out.conversionPct) };
  const best = out.range.cac[0], worst = out.range.cac[1];
  if (!(profitPerSale > 0)) {
    out.verdict = "no-margin";
    out.message = "Each sale leaves nothing after cost, tax and fees, so no result from ads can make this pay. Fix the price or the cost first.";
  } else if (best != null && best > profitPerSale) {
    out.verdict = "stop";
    out.message = `Even at the best end of the range, a sale costs ${best} in ads against the ${round2(profitPerSale)} each leaves. Stop these ads; change the page, the price or the audience before spending more.`;
  } else if (worst != null && worst <= profitPerSale) {
    out.verdict = "go";
    out.message = `Even at the worst end of the range, a sale costs ${worst} in ads against the ${round2(profitPerSale)} each leaves. Raise spending in steps and re-read the numbers at each step.`;
  } else {
    // Clicks at which a rate equal to the break-even rate would no longer fit inside the interval, roughly.
    const be = cpc / profitPerSale;
    const need = be > 0 && be < 1 ? Math.ceil((1.96 * 1.96 * be * (1 - be)) / Math.pow(Math.max(Math.abs(conv - be), 0.005), 2)) : null;
    out.verdict = "unclear";
    out.message = `The test is too small to tell: the true cost per sale could be anywhere from ${best ?? "n/a"} to ${worst ?? "unbounded"}, and each sale leaves ${round2(profitPerSale)}.${need && need > clicks ? ` Roughly ${need - clicks} more clicks would settle it at this rate.` : ""} Spend a little more on the same ad before deciding.`;
  }
  if (out.cac != null && remainingBudget > 0) out.remainingSales = Math.floor(remainingBudget / out.cac);
  return out;
}
