// Spare parts: usage from completed work orders, reorder points with safety
// stock, and what open work orders have already claimed.
//
// part: { id, name, onHand, unitCost, leadDays, serviceLevel (0.9 | 0.95 | 0.99), minQty }
// work order parts: [{ partId, qty }], counted as used on the order's completion day.

import { parseDay } from "./schedule.mjs";

const Z = { 0.8: 0.8416, 0.9: 1.2816, 0.95: 1.6449, 0.98: 2.0537, 0.99: 2.3263 };

// Reorder point = expected demand over the lead time + z * sd of that demand.
// Demand is counted per 30-day bucket over the last `windowDays`, so a part
// used twice a year gets a sd that reflects its lumpiness; the lead-time sd
// scales by sqrt(lead / 30) (independent buckets).
export function partStatus(part, workOrders, today, { windowDays = 365 } = {}) {
  const buckets = Math.max(1, Math.round(windowDays / 30));
  const per = new Array(buckets).fill(0);
  let reserved = 0, used = 0;
  for (const w of workOrders) {
    for (const p of w.parts || []) {
      if (p.partId !== part.id) continue;
      const q = Number(p.qty) || 0;
      if (w.status !== "done") { reserved += q; continue; }
      const d = parseDay(w.completed);
      if (d === null || d > today || d <= today - buckets * 30) continue;
      per[Math.min(buckets - 1, Math.floor((today - d) / 30))] += q;
      used += q;
    }
  }
  const mean = per.reduce((s, x) => s + x, 0) / buckets; // per 30 days
  const sd = buckets > 1 ? Math.sqrt(per.reduce((s, x) => s + (x - mean) ** 2, 0) / (buckets - 1)) : 0;
  const lead = Number(part.leadDays) || 0;
  const z = Z[part.serviceLevel] ?? Z[0.95];
  const leadDemand = (mean * lead) / 30;
  const safety = z * sd * Math.sqrt(lead / 30);
  const rop = Math.max(Number(part.minQty) || 0, Math.ceil(leadDemand + safety));
  const onHand = Number(part.onHand) || 0;
  const available = onHand - reserved;
  const status = available < 0 ? "short" : available <= rop && (rop > 0) ? "reorder" : "ok";
  return {
    used12m: used,
    perMonth: Math.round(mean * 100) / 100,
    reserved,
    available,
    reorderPoint: rop,
    safetyStock: Math.round(safety * 100) / 100,
    status,
    suggestOrder: status === "ok" ? 0 : Math.max(1, rop + Math.ceil(mean) - available),
    stockValue: Math.round(onHand * (Number(part.unitCost) || 0) * 100) / 100,
  };
}
