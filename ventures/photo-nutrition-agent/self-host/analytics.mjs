// Longitudinal analysis. Every estimate is returned with what it rests on
// (days of data, logging coverage, a standard error) so a chat model can
// qualify it rather than read it as a measurement.
import { mealTotals, sumNutrients, addDays, daysBetween, round } from "./nutrition.mjs";
import { getTargets } from "./policy.mjs";

const KCAL_PER_KG = 7700; // conventional energy density of body-mass change; real tissue varies (~5500-9500)
const LB = 0.45359237;

export function dailyTotals(store, date) {
  const meals = store.mealsByDate(date, date);
  const logged = meals.filter((m) => m.status === "logged");
  const provisional = meals.filter((m) => m.status === "provisional");
  const t = (list) => sumNutrients(list.map((m) => mealTotals(m.items)).map(({ energy_kcal_range, ...n }) => n));
  const range = logged.reduce((a, m) => { const r = mealTotals(m.items).energy_kcal_range; return [a[0] + r[0], a[1] + r[1]]; }, [0, 0]);
  const targets = getTargets(store);
  const totals = t(logged);
  const remaining = {};
  for (const k of ["energy_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"]) if (targets[k] != null) remaining[k] = round(targets[k] - (totals[k] || 0), 0);
  return {
    date,
    meals_logged: logged.length,
    meals_provisional: provisional.length,
    totals,
    energy_kcal_range: range,
    provisional_totals: t(provisional),
    targets: Object.fromEntries(Object.entries(targets).filter(([k, v]) => v != null && !["notes"].includes(k))),
    remaining,
    estimate_note: "Totals from photos are visual estimates; energy_kcal_range shows the combined uncertainty. Provisional meals are excluded from totals.",
  };
}

export function series(store, from, to) {
  const n = daysBetween(from, to);
  if (n < 0) throw new Error("from must be on or before to");
  if (n > 731) throw new Error("range is limited to two years");
  const meals = store.mealsByDate(from, to).filter((m) => m.status === "logged");
  const byDay = new Map();
  for (const m of meals) {
    if (!byDay.has(m.local_date)) byDay.set(m.local_date, []);
    byDay.get(m.local_date).push(mealTotals(m.items));
  }
  const out = [];
  for (let i = 0; i <= n; i++) {
    const d = addDays(from, i);
    const list = byDay.get(d) || [];
    const tot = sumNutrients(list.map(({ energy_kcal_range, ...x }) => x));
    out.push({ date: d, meals: list.length, ...tot });
  }
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

export function nutritionHistory(store, from, to) {
  const days = series(store, from, to);
  const loggedDays = days.filter((d) => d.meals > 0);
  const targets = getTargets(store);
  const field = (k) => loggedDays.map((d) => d[k] || 0);
  const summary = {};
  for (const k of ["energy_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"]) {
    const xs = field(k);
    summary[k] = { mean: round(mean(xs), 0), sd: round(sd(xs), 0), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null };
  }
  const adherence = {};
  if (targets.protein_g) {
    const hit = loggedDays.filter((d) => (d.protein_g || 0) >= 0.9 * targets.protein_g).length;
    adherence.protein_days_within_10pct_or_above = { days: hit, of: loggedDays.length, pct: loggedDays.length ? round((100 * hit) / loggedDays.length, 0) : null };
  }
  if (targets.energy_kcal) {
    const within = loggedDays.filter((d) => Math.abs((d.energy_kcal || 0) - targets.energy_kcal) <= 0.1 * targets.energy_kcal).length;
    const over = loggedDays.filter((d) => (d.energy_kcal || 0) > 1.1 * targets.energy_kcal).length;
    adherence.energy_days_within_10pct = { days: within, over, of: loggedDays.length, pct: loggedDays.length ? round((100 * within) / loggedDays.length, 0) : null };
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const w = days.slice(i, i + 7).filter((d) => d.meals > 0);
    weeks.push({ week_start: days[i].date, days_logged: w.length, energy_kcal_mean: round(mean(w.map((d) => d.energy_kcal || 0)), 0), protein_g_mean: round(mean(w.map((d) => d.protein_g || 0)), 0) });
  }
  return {
    from,
    to,
    days_in_range: days.length,
    days_with_logged_meals: loggedDays.length,
    coverage_note: loggedDays.length < days.length ? "Days without logged meals are excluded from means; they may be unlogged rather than fasting days." : null,
    summary,
    adherence,
    weekly: weeks,
    daily: days,
  };
}

/** Ordinary least squares of y on x; returns slope, intercept and the slope's standard error. */
export function ols(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const se = Math.sqrt(sse / (n - 2) / sxx);
  return { slope, intercept, se, n };
}

export function weightHistory(store, from, to) {
  const pts = store.metrics("body_mass_kg", from, to);
  const fat = store.metrics("body_fat_pct", from, to);
  const lean = store.metrics("lean_mass_kg", from, to);
  const fit = ols(pts.map((p) => daysBetween(from, p.date)), pts.map((p) => p.value));
  const trend = fit
    ? {
        kg_per_week: round(fit.slope * 7, 2),
        lb_per_week: round((fit.slope * 7) / LB, 2),
        ci95_lb_per_week: [round(((fit.slope - 1.96 * fit.se) * 7) / LB, 2), round(((fit.slope + 1.96 * fit.se) * 7) / LB, 2)],
        n_weigh_ins: fit.n,
        note: "Linear trend through daily weigh-ins; water and glycogen swings make short windows noisy (prefer 3+ weeks).",
      }
    : { note: "Need at least 3 weigh-ins for a trend." };
  return {
    from,
    to,
    weigh_ins: pts.map((p) => ({ date: p.date, kg: round(p.value, 2), lb: round(p.value / LB, 1), source: p.source })),
    body_fat_pct: fat,
    lean_mass_kg: lean,
    trend,
  };
}

/**
 * Estimated energy expenditure from intake and weight change:
 *   TDEE ~ mean intake - (weight slope [kg/day] x 7700 kcal/kg)
 * The uncertainty combines the weight-slope standard error with a stated
 * relative error on logged intake (photo estimates: default 20%).
 */
export function energyBalance(store, { to, days = 28, intakeRelError = 0.2 } = {}) {
  const from = addDays(to, -(days - 1));
  const hist = nutritionHistory(store, from, to);
  const w = store.metrics("body_mass_kg", from, to);
  const active = store.metrics("active_kcal", from, to);
  const resting = store.metrics("resting_kcal", from, to);
  const intake = hist.summary.energy_kcal.mean;
  const fit = ols(w.map((p) => daysBetween(from, p.date)), w.map((p) => p.value));
  const out = {
    from,
    to,
    days,
    days_with_logged_meals: hist.days_with_logged_meals,
    weigh_ins: w.length,
    mean_logged_intake_kcal: intake,
    wearable_expenditure_kcal: active.length && resting.length ? round(mean(active.map((a) => a.value)) + mean(resting.map((r) => r.value)), 0) : null,
    caveats: [
      "Assumes 7700 kcal per kg of weight change; real tissue composition varies.",
      `Assumes logged intake is within +/-${Math.round(intakeRelError * 100)}% (photo estimates) and that unlogged days are excluded, not zero.`,
      "Wearable active/resting energy is shown for comparison only; it is commonly off by 10-30%.",
    ],
  };
  const enough = fit && hist.days_with_logged_meals >= Math.min(14, days * 0.6) && w.length >= Math.min(8, days / 3);
  if (!enough) {
    out.estimate = null;
    out.reason = "Not enough data: need roughly 60% of days logged and 8+ weigh-ins over the window.";
    return out;
  }
  const slopeKcal = fit.slope * KCAL_PER_KG; // kcal/day stored (+) or drawn down (-)
  const tdee = intake - slopeKcal;
  const seTdee = Math.sqrt((fit.se * KCAL_PER_KG) ** 2 + (intake * intakeRelError) ** 2);
  const targets = getTargets(store);
  out.estimate = {
    tdee_kcal: round(tdee, 0),
    tdee_ci95_kcal: [round(tdee - 1.96 * seTdee, 0), round(tdee + 1.96 * seTdee, 0)],
    deficit_kcal_per_day: round(tdee - intake, 0),
    weight_trend_lb_per_week: round((fit.slope * 7) / LB, 2),
  };
  if (targets.weekly_weight_change_kg != null) {
    const needed = (targets.weekly_weight_change_kg * KCAL_PER_KG) / 7; // negative for loss
    out.estimate.intake_for_target_rate_kcal = round(tdee + needed, 0);
    out.estimate.target_rate_lb_per_week = round(targets.weekly_weight_change_kg / LB, 2);
  }
  return out;
}

export function bodyCompositionHistory(store) {
  const scans = store.dexaScans();
  const withDelta = scans.map((s, i) => {
    if (i === 0) return s;
    const p = scans[i - 1];
    const d = (k) => (s[k] != null && p[k] != null ? round(s[k] - p[k], 2) : null);
    return { ...s, change_since_previous: { days: daysBetween(p.scan_date, s.scan_date), total_mass_kg: d("total_mass_kg"), fat_mass_kg: d("fat_mass_kg"), lean_mass_kg: d("lean_mass_kg"), body_fat_pct: d("body_fat_pct"), appendicular_lean_mass_kg: d("appendicular_lean_mass_kg"), vat_mass_g: d("vat_mass_g") } };
  });
  return {
    scans: withDelta,
    notes: [
      "DEXA lean-mass precision is typically around 1-2% (roughly +/-0.5-1 kg); hydration, glycogen and recent meals shift it. Treat changes smaller than that as noise.",
      "Compare scans from the same machine, ideally at the same time of day and hydration state.",
    ],
  };
}

export { LB };
