// One pass over the data file for the dashboard, the CLI and the CSV export.

import { planStatus, compliance, forecast, workload, fmtDay } from "./schedule.mjs";
import { assetReliability, ageReplacement, failureModes } from "./reliability.mjs";
import { partStatus } from "./parts.mjs";

export function summarize(data, today, { horizonDays = 84 } = {}) {
  const assetById = new Map(data.assets.map((a) => [a.id, a]));
  const readingsByAsset = Object.fromEntries(data.assets.map((a) => [a.id, a.readings || []]));
  const plans = data.plans.filter((p) => p.active !== false).map((p) => {
    const st = planStatus(p, readingsByAsset[p.assetId] || [], today);
    const comp = compliance(p, readingsByAsset[p.assetId] || [], today);
    return { id: p.id, assetId: p.assetId, asset: assetById.get(p.assetId)?.name ?? p.assetId, title: p.title, ...st, compliance: comp };
  });
  const order = { overdue: 0, due: 1, ok: 2, unscheduled: 3 };
  plans.sort((a, b) => order[a.status] - order[b.status] || (a.dueDay ?? 1e9) - (b.dueDay ?? 1e9));
  let on = 0, tot = 0;
  for (const p of plans) { on += p.compliance.onTime; tot += p.compliance.total; }
  const open = data.workOrders.filter((w) => w.status !== "done");
  const occ = forecast(data.plans, readingsByAsset, today, horizonDays);
  const reliability = data.assets.map((a) => {
    const r = assetReliability(a, data.workOrders, today);
    const costs = a.costs || {};
    const rep = r.fit && costs.planned > 0 && costs.failure > 0 ? ageReplacement(r.fit.shape, r.fit.scale, costs.planned, costs.failure) : null;
    const modes = failureModes(a, data.workOrders).map((m) => {
      const mr = assetReliability(a, data.workOrders, today, { mode: m.code });
      const mrep = mr.fit && costs.planned > 0 && costs.failure > 0 ? ageReplacement(mr.fit.shape, mr.fit.scale, costs.planned, costs.failure) : null;
      return { ...mr, replacement: mrep };
    });
    return { assetId: a.id, asset: a.name, ...r, replacement: rep, modes };
  });
  const parts = data.parts.map((p) => ({ id: p.id, name: p.name, onHand: Number(p.onHand) || 0, ...partStatus(p, data.workOrders, today) }));
  return {
    today: fmtDay(today),
    counts: {
      overdue: plans.filter((p) => p.status === "overdue").length,
      due: plans.filter((p) => p.status === "due").length,
      openWorkOrders: open.length,
      backlogHours: Math.round(open.reduce((s, w) => s + (Number(w.estHours) || 0), 0) * 10) / 10,
      partsToOrder: parts.filter((p) => p.status !== "ok").length,
    },
    compliancePct: tot ? Math.round((1000 * on) / tot) / 10 : null,
    plans,
    workload: workload(occ),
    upcoming: occ,
    reliability,
    parts,
  };
}

export function toCsv(rows, cols) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // a leading = + - @ would run as a formula in a spreadsheet
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.map((c) => esc(c.label)).join(","), ...rows.map((r) => cols.map((c) => esc(typeof c.get === "function" ? c.get(r) : r[c.key])).join(","))].join("\r\n") + "\r\n";
}

export const PLAN_COLUMNS = [
  { label: "Asset", key: "asset" },
  { label: "Task", key: "title" },
  { label: "Status", key: "status" },
  { label: "Due", key: "due" },
  { label: "Due by", key: "dueBy" },
  { label: "Days left", key: "daysLeft" },
  { label: "Meter now", key: "meterNow" },
  { label: "Meter due", key: "meterDue" },
  { label: "Last done", key: "lastDone" },
  { label: "Compliance %", get: (r) => r.compliance.pct },
];
