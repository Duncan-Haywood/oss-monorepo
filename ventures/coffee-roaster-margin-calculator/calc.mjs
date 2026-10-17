// Coffee roaster margin calculator: pure functions, no DOM, no network.
// Roast loss, cost per roasted pound, bag margin by channel, the cheapest blend
// that still hits a cup score, a weekly green-coffee plan and a break-even.

const round = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
};
const num = (v, fallback = 0) => {
  const n = typeof v === "string" ? Number(v.replace(/[$,%\s]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
export const LB_PER_KG = 2.2046226218;
export const OZ_PER_LB = 16;

export function roastedCostPerLb({ greenPerLb, shrinkPct = 15, laborPerRoastedLb = 0, energyPerRoastedLb = 0 }) {
  const shrink = num(shrinkPct) / 100;
  if (!(shrink >= 0 && shrink < 0.5)) throw new Error("Roast loss must be between 0% and 50%.");
  const green = num(greenPerLb);
  if (!(green >= 0)) throw new Error("Green coffee price must be zero or more.");
  const greenCost = green / (1 - shrink);
  return {
    greenPerRoastedLb: round(greenCost, 4),
    laborPerRoastedLb: num(laborPerRoastedLb),
    energyPerRoastedLb: num(energyPerRoastedLb),
    total: round(greenCost + num(laborPerRoastedLb) + num(energyPerRoastedLb), 4),
    shrinkCostPerRoastedLb: round(greenCost - green, 4),
  };
}

// One channel: what a bag brings in and leaves behind.
export function bagEconomics({ costPerRoastedLb, bagOz = 12, packagingPerBag = 0, price, feePct = 0, feeFixed = 0, shippingPaid = 0, shippingCharged = 0 }) {
  const oz = num(bagOz);
  if (!(oz > 0)) throw new Error("Bag size must be above zero.");
  const coffee = (num(costPerRoastedLb) * oz) / OZ_PER_LB;
  const p = num(price);
  const revenue = p + num(shippingCharged);
  const fees = (revenue * num(feePct)) / 100 + (p > 0 ? num(feeFixed) : 0);
  const cost = coffee + num(packagingPerBag) + num(shippingPaid);
  const profit = revenue - fees - cost;
  return {
    price: round(p),
    coffeeCost: round(coffee),
    packaging: round(num(packagingPerBag)),
    shipping: round(num(shippingPaid)),
    fees: round(fees),
    totalCost: round(cost + fees),
    profit: round(profit),
    marginPct: revenue > 0 ? round((profit / revenue) * 100, 1) : 0,
    pricePerLb: round((p * OZ_PER_LB) / oz),
    profitPerRoastedLb: round((profit * OZ_PER_LB) / oz),
  };
}

// Price that leaves `targetMarginPct` of revenue as profit after percentage and fixed fees.
export function priceForMargin({ costPerBag, targetMarginPct, feePct = 0, feeFixed = 0 }) {
  const keep = 1 - num(targetMarginPct) / 100 - num(feePct) / 100;
  if (!(keep > 0)) throw new Error("Target margin plus fees must be under 100%.");
  return round((num(costPerBag) + num(feeFixed)) / keep);
}

// Channels share the cost of the coffee; they differ in price, fees and shipping.
export function channelTable({ costPerRoastedLb, bagOz, packagingPerBag, retailPrice, channels, roastedLbPerHour = 0 }) {
  const rows = channels.map((c) => {
    const price = c.price != null && c.price !== "" ? num(c.price) : round(num(retailPrice) * (1 - num(c.discountPct) / 100));
    const e = bagEconomics({
      costPerRoastedLb,
      bagOz,
      packagingPerBag,
      price,
      feePct: c.feePct,
      feeFixed: c.feeFixed,
      shippingPaid: c.shippingPaid,
      shippingCharged: c.shippingCharged,
    });
    return {
      name: c.name,
      ...e,
      profitPerRoastingHour: roastedLbPerHour > 0 ? round(e.profitPerRoastedLb * roastedLbPerHour) : null,
    };
  });
  const best = rows.reduce((a, b) => (b.profitPerRoastedLb > a.profitPerRoastedLb ? b : a), rows[0]);
  return { rows, bestChannel: best ? best.name : null };
}

// ---------- blends ----------

export function parseLots(text, defaults = {}) {
  const lots = [];
  const problems = [];
  String(text || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const c = line.split(/\s*[,;\t]\s*/);
      const name = c[0];
      const green = num(c[1], NaN);
      const score = num(c[2], NaN);
      if (!name || !Number.isFinite(green) || !Number.isFinite(score)) {
        problems.push(`Line ${i + 1}: expected "name, $/lb, cup score" (then optional roast loss %, pounds available, min share %, max share %).`);
        return;
      }
      lots.push({
        name,
        greenPerLb: green,
        score,
        shrinkPct: c[3] ? num(c[3], defaults.shrinkPct ?? 15) : defaults.shrinkPct ?? 15,
        availableLb: c[4] ? num(c[4], Infinity) : Infinity,
        minShare: c[5] ? num(c[5]) / 100 : 0,
        maxShare: c[6] ? num(c[6]) / 100 : 1,
      });
    });
  return { lots, problems };
}

function* compositions(n, units) {
  const parts = new Array(n).fill(0);
  function* rec(i, left) {
    if (i === n - 1) {
      parts[i] = left;
      yield parts;
      return;
    }
    for (let k = 0; k <= left; k++) {
      parts[i] = k;
      yield* rec(i + 1, left - k);
    }
  }
  yield* rec(0, units);
}

function blendMetrics(lots, shares, defaults) {
  let cost = 0, score = 0, green = 0;
  lots.forEach((l, i) => {
    const s = shares[i];
    if (!s) return;
    const sh = num(l.shrinkPct, defaults.shrinkPct ?? 15) / 100;
    cost += s * (l.greenPerLb / (1 - sh));
    score += s * l.score;
    green += s / (1 - sh);
  });
  return { greenCostPerRoastedLb: cost, score, greenLbPerRoastedLb: green };
}

// Cheapest blend (by roasted weight) with weighted score >= targetScore.
export function optimizeBlend({ lots, targetScore, batchRoastedLb = 100, stepPct, top = 5 }) {
  if (!lots || lots.length < 1) throw new Error("Add at least one green coffee.");
  if (lots.length > 8) throw new Error("Use at most 8 coffees in one blend.");
  const n = lots.length;
  const step = stepPct ? num(stepPct) : n <= 6 ? 5 : 10;
  const units = Math.round(100 / step);
  const found = [];
  const eps = 1e-9;
  for (const parts of compositions(n, units)) {
    const shares = parts.map((p) => p / units);
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const l = lots[i];
      if (shares[i] < (l.minShare ?? 0) - eps || shares[i] > (l.maxShare ?? 1) + eps) ok = false;
      else if (shares[i] > 0 && Number.isFinite(l.availableLb)) {
        const sh = num(l.shrinkPct, 15) / 100;
        if ((shares[i] * batchRoastedLb) / (1 - sh) > l.availableLb + eps) ok = false;
      }
    }
    if (!ok) continue;
    const m = blendMetrics(lots, shares, {});
    if (m.score < num(targetScore) - eps) continue;
    found.push({ shares: shares.slice(), ...m });
  }
  found.sort((a, b) => a.greenCostPerRoastedLb - b.greenCostPerRoastedLb || b.score - a.score);
  const shape = (b) => ({
    shares: lots.map((l, i) => ({ name: l.name, pct: round(b.shares[i] * 100, 1), roastedLb: round(b.shares[i] * batchRoastedLb, 1), greenLb: round((b.shares[i] * batchRoastedLb) / (1 - num(l.shrinkPct, 15) / 100), 1) })).filter((x) => x.pct > 0),
    score: round(b.score, 2),
    greenCostPerRoastedLb: round(b.greenCostPerRoastedLb, 3),
    greenLbPerBatch: round(b.greenLbPerRoastedLb * batchRoastedLb, 1),
  });
  const results = found.slice(0, top).map(shape);
  const best = results[0] || null;
  // Reference: the best-scoring coffee alone, and a plain equal split, so "how much did blending save" has an answer.
  const solo = lots
    .map((l) => ({ name: l.name, score: l.score, cost: l.greenPerLb / (1 - num(l.shrinkPct, 15) / 100) }))
    .filter((l) => l.score >= num(targetScore) - eps)
    .sort((a, b) => a.cost - b.cost)[0] || null;
  return {
    feasible: found.length,
    best,
    alternatives: results.slice(1),
    cheapestSingleOrigin: solo ? { name: solo.name, score: solo.score, greenCostPerRoastedLb: round(solo.cost, 3) } : null,
    savingVsSingleOrigin: best && solo ? round(solo.cost - best.greenCostPerRoastedLb, 3) : null,
    stepPct: step,
    reachableScore: round(Math.max(...lots.map((l) => l.score)), 2),
  };
}

// The price of quality: cheapest blend cost at each target score.
export function costOfScoreFrontier({ lots, batchRoastedLb = 100, from, to, stepScore = 0.5 }) {
  const lo = from ?? Math.floor(Math.min(...lots.map((l) => l.score)) * 2) / 2;
  const hi = to ?? Math.max(...lots.map((l) => l.score));
  const out = [];
  for (let t = lo; t <= hi + 1e-9; t += stepScore) {
    const r = optimizeBlend({ lots, targetScore: t, batchRoastedLb, top: 1 });
    out.push({ targetScore: round(t, 2), greenCostPerRoastedLb: r.best ? r.best.greenCostPerRoastedLb : null });
  }
  return out;
}

// ---------- plan and break-even ----------

export function weeklyPlan({ skus, shrinkPct = 15, batchGreenLb = 30, minutesPerBatch = 18, greenOnHandLb = 0, targetWeeksCover = 4, sackLb = 132 }) {
  const shrink = num(shrinkPct) / 100;
  if (!(shrink >= 0 && shrink < 0.5)) throw new Error("Roast loss must be between 0% and 50%.");
  const roastedLb = skus.reduce((a, s) => a + (num(s.bags) * num(s.bagOz)) / OZ_PER_LB, 0);
  const greenLb = roastedLb / (1 - shrink);
  const batches = batchGreenLb > 0 ? Math.ceil(greenLb / num(batchGreenLb) - 1e-9) : 0;
  const hours = (batches * num(minutesPerBatch)) / 60;
  const weeksCover = greenLb > 0 ? num(greenOnHandLb) / greenLb : null;
  const needLb = Math.max(0, greenLb * num(targetWeeksCover) - num(greenOnHandLb));
  const sacks = sackLb > 0 ? Math.ceil(needLb / num(sackLb) - 1e-9) : 0;
  return {
    roastedLb: round(roastedLb, 1),
    greenLb: round(greenLb, 1),
    batches,
    roastingHours: round(hours, 2),
    roastedLbPerRoastingHour: hours > 0 ? round(roastedLb / hours, 1) : null,
    weeksCover: weeksCover == null ? null : round(weeksCover, 1),
    sacksToOrder: sacks,
    orderLb: sacks * num(sackLb),
  };
}

export function breakEven({ fixedMonthly, profitPerBag, bagOz = 12 }) {
  const per = num(profitPerBag);
  if (!(per > 0)) return { bagsPerMonth: null, roastedLbPerMonth: null, note: "Profit per bag is zero or negative, so no volume breaks even." };
  const bags = Math.ceil(num(fixedMonthly) / per - 1e-9);
  return { bagsPerMonth: bags, roastedLbPerMonth: round((bags * num(bagOz)) / OZ_PER_LB, 1), bagsPerWeek: round(bags / 4.345, 1), note: "" };
}

// ---------- page glue ----------

export function parseChannels(text) {
  const channels = [];
  const problems = [];
  String(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    const c = line.split(/\s*[,;\t]\s*/);
    if (!c[0]) return;
    const price = c[1] ? num(c[1], NaN) : NaN;
    if (!Number.isFinite(price)) {
      problems.push(`Channel line ${i + 1}: expected "name, price per bag" (then fee %, fixed fee, shipping you pay, shipping you charge).`);
      return;
    }
    channels.push({ name: c[0], price, feePct: num(c[2]), feeFixed: num(c[3]), shippingPaid: num(c[4]), shippingCharged: num(c[5]) });
  });
  return { channels, problems };
}

export function channelsCsv(rows) {
  const head = ["channel", "price", "coffee_cost", "packaging", "shipping", "fees", "total_cost", "profit", "margin_pct", "profit_per_roasted_lb"];
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [head.join(","), ...rows.map((r) => [r.name, r.price, r.coffeeCost, r.packaging, r.shipping, r.fees, r.totalCost, r.profit, r.marginPct, r.profitPerRoastedLb].map(esc).join(","))].join("\n") + "\n";
}

export function blendText(b) {
  if (!b) return "No blend meets that score with those limits.";
  return [`Blend (cup score ${b.score}, green cost $${b.greenCostPerRoastedLb.toFixed(2)} per roasted lb):`, ...b.shares.map((s) => `  ${s.pct}% ${s.name}: ${s.roastedLb} lb roasted, ${s.greenLb} lb green`)].join("\n");
}
