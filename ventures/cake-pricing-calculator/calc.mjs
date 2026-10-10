// Cake price from cost. Pure arithmetic over what the baker types in: ingredients per serving, decoration and packaging, the hours
// each stage takes, a wage the baker wants for them, delivery, overhead, a sales-fee percentage and a target profit margin.
// Price = cost / (1 - fee% - margin%), because the fee and the margin are both taken out of the price, not added on top of cost.

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => (s === undefined || s === null || s === "" ? 0 : Number(String(s).replace(/[$,%\s_]/g, "")));

export const FIELDS = ["servings", "ingredientPerServing", "decor", "packaging", "bakeHours", "decorateHours", "otherHours", "wage", "miles", "perMile", "driveHours", "overheadPct", "feePct", "marginPct", "quoted"];

export function priceCake(input) {
  const v = Object.fromEntries(FIELDS.map((k) => [k, num(input[k])]));
  if (!(v.servings > 0)) return { error: "Enter the number of servings above zero." };
  for (const k of FIELDS) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: "Use plain numbers of zero or more in every box." };
  if (v.feePct + v.marginPct >= 95) return { error: "Sales fee plus profit margin must be under 95%, otherwise no price can cover the cost." };
  const hours = v.bakeHours + v.decorateHours + v.otherHours;
  const materials = v.servings * v.ingredientPerServing + v.decor + v.packaging;
  const labor = hours * v.wage;
  const delivery = v.miles * v.perMile + v.driveHours * v.wage;
  const overhead = (materials + labor) * v.overheadPct / 100;
  const cost = materials + labor + delivery + overhead;
  const price = cost / (1 - (v.feePct + v.marginPct) / 100);
  const tiers = [
    { name: "Break-even (pays your wage, no profit)", margin: 0 },
    { name: "Your target margin", margin: v.marginPct },
    { name: "Premium (+10 points of margin)", margin: v.marginPct + 10 },
  ].filter((t) => v.feePct + t.margin < 95).map((t) => {
    const p = cost / (1 - (v.feePct + t.margin) / 100);
    return { name: t.name, price: round2(p), perServing: round2(p / v.servings) };
  });
  const totalHours = hours + v.driveHours;
  const out = {
    servings: v.servings, hours: round2(totalHours),
    breakdown: { materials: round2(materials), labor: round2(labor), delivery: round2(delivery), overhead: round2(overhead), cost: round2(cost) },
    price: round2(price), perServing: round2(price / v.servings), fee: round2(price * v.feePct / 100), profit: round2(price * v.marginPct / 100),
    deposit: round2(price / 2), tiers, advice: [],
  };
  if (v.quoted > 0) {
    const net = v.quoted * (1 - v.feePct / 100);
    const perHour = totalHours > 0 ? (net - materials - v.miles * v.perMile - overhead) / totalHours : null;
    out.quoted = { price: round2(v.quoted), afterFees: round2(net), profitAfterWage: round2(net - cost), perHour: perHour === null ? null : round2(perHour), perServing: round2(v.quoted / v.servings) };
    if (net < cost) out.advice.push(`At $${out.quoted.price.toFixed(2)} you lose $${(cost - net).toFixed(2)} after paying yourself $${v.wage}/hour and the fees. The break-even price is $${out.tiers[0].price.toFixed(2)}.`);
    else out.advice.push(`At $${out.quoted.price.toFixed(2)} you keep $${(net - cost).toFixed(2)} above your own wage and costs.`);
  }
  if (v.wage === 0 && hours > 0) out.advice.push("Your wage is zero, so the price pays for ingredients only. Your time is the largest cost in most custom cakes; enter what an hour is worth to you.");
  if (labor > materials * 2 && labor > 0) out.advice.push(`Labor is $${labor.toFixed(2)} against $${materials.toFixed(2)} of materials. Customers compare cakes by servings, so say what the price includes (design time, tasting, delivery) instead of cutting the hours.`);
  if (out.perServing < 4) out.advice.push(`$${out.perServing.toFixed(2)} a serving is low for a custom cake. Check each hour and the delivery are counted.`);
  out.advice.push("Laws on selling home-baked goods (cottage food rules, licences, insurance, sales tax) vary by place. Check yours; this tool does not model them.");
  return out;
}

export function sampleInput() {
  return {
    servings: 24, ingredientPerServing: 1.6, decor: 18, packaging: 9, bakeHours: 2.5, decorateHours: 3, otherHours: 1,
    wage: 20, miles: 14, perMile: 0.67, driveHours: 0.75, overheadPct: 8, feePct: 3, marginPct: 20, quoted: 120,
  };
}

export function toCsv(r) {
  const rows = [["item", "amount"], ["materials", r.breakdown.materials], ["labor", r.breakdown.labor], ["delivery", r.breakdown.delivery], ["overhead", r.breakdown.overhead], ["total_cost", r.breakdown.cost], ...r.tiers.map((t) => [t.name, t.price])];
  return rows.map((row) => row.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";
}
