// P6 resource curves (curves.mjs) on public P6 files: which curves a file
// carries, which assignments use them, and how far the planned units and
// cost by the data date move when each is spread by its curve instead of
// evenly. Also checks, on every curved assignment, that the slices sum to
// the budget and that the Linear curve gives the even spread.
//
//   node eval/resource-curves.mjs <dir-or-files...> [--json out.json]
//
// eval/resource-curves-2026-11-21.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer, parseDate, num } from "../xer.mjs";
import { parseSchedule } from "../mspdi.mjs";
import { schedule } from "../cpm.mjs";
import { assess } from "../dcma.mjs";
import { readCurves, spreadCurve, SLICES } from "../curves.mjs";
import { earnedValue } from "../evm.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json")) {
  if (statSync(a).isDirectory()) { for (const f of readdirSync(a)) if (/\.xer$/i.test(f)) files.push(join(a, f)); } else files.push(a);
}
const EVEN = Array(SLICES).fill(1 / SLICES);
const out = [];
for (const f of files.sort()) {
  const xer = parseSchedule(decodeXer(readFileSync(f)));
  const curves = readCurves(xer);
  const assigns = xer.tables.TASKRSRC || [];
  const named = assigns.filter((a) => a.curv_id);
  const row = { file: f.split("/").pop(), curves: [...curves.values()].map((c) => ({ id: c.id, name: c.name, sum: c.sum, used: named.filter((a) => a.curv_id === c.id).length })), assignments: assigns.length, curved: named.length, missing: named.filter((a) => !curves.has(a.curv_id)).map((a) => ({ taskrsrc_id: a.taskrsrc_id, curv_id: a.curv_id })) };
  if (named.length) {
    const result = schedule(xer);
    const model = result.model;
    const pid = assess(xer, { result }).project.id;
    const dd = model.projects.get(pid)?.dataDate ?? null;
    const tasks = new Map((xer.tables.TASK || []).map((t) => [t.task_id, t]));
    let evenH = 0, curveH = 0, evenC = 0, curveC = 0, budgetH = 0, budgetC = 0, sumOk = 0, linOk = 0, linN = 0, checked = 0;
    const per = [];
    // daily hours both ways, for the month-end S-curves of the curved work
    const dE = new Map(), dC = new Map();
    const into = (m) => (d, v) => m.set(d, (m.get(d) || 0) + v);
    for (const a of named) {
      const c = curves.get(a.curv_id);
      if (!c) continue;
      const t = tasks.get(a.task_id), cal = model.tasks.get(a.task_id)?.cal || model.projects.get(pid)?.cal;
      const ps = parseDate(a.target_start_date) ?? parseDate(t?.target_start_date), pf = parseDate(a.target_end_date) ?? parseDate(t?.target_end_date);
      if (ps === null || pf === null || !cal) continue;
      const h = num(a.target_qty) ?? 0, cost = num(a.target_cost) ?? 0;
      let sum = 0;
      const cut = dd ?? Infinity;
      const ce = spreadCurve(cal, ps, pf, h, c.slices, (d, v) => { sum += v; }, cut);
      const ee = spreadCurve(cal, ps, pf, h, EVEN, into(dE), cut);
      spreadCurve(cal, ps, pf, h, c.slices, into(dC), cut);
      checked++;
      if (Math.abs(sum - h) <= 1e-6 * Math.max(1, Math.abs(h))) sumOk++;
      if (c.slices.every((v) => Math.abs(v - 1 / SLICES) < 1e-12)) { linN++; if (Math.abs(ce - ee) < 1e-6) linOk++; }
      budgetH += h; budgetC += cost; evenH += ee; curveH += ce;
      evenC += spreadCurve(cal, ps, pf, cost, EVEN, () => {}, cut);
      curveC += spreadCurve(cal, ps, pf, cost, c.slices, () => {}, cut);
      per.push({ task: t?.task_code, curve: c.name, budgetH: h, evenH: Math.round(ee), curveH: Math.round(ce) });
    }
    // cumulative at month ends: the largest gap between the two S-curves
    const days = [...new Set([...dE.keys(), ...dC.keys()])].sort((a, b) => a - b);
    let cE = 0, cC = 0, gap = { h: 0, date: null, even: 0, curve: 0 };
    const months = [];
    for (let d = days[0]; days.length && d <= days.at(-1); d++) {
      cE += dE.get(d) || 0; cC += dC.get(d) || 0;
      const next = new Date((d + 1) * 86400000);
      if (next.getUTCDate() !== 1 && d !== days.at(-1)) continue;
      const date = new Date(d * 86400000).toISOString().slice(0, 10);
      months.push({ date, even: Math.round(cE), curve: Math.round(cC) });
      if (Math.abs(cC - cE) > Math.abs(gap.h)) gap = { h: Math.round(cC - cE), date, even: Math.round(cE), curve: Math.round(cC) };
    }
    row.gap = gap; row.months = months;
    per.sort((x, y) => Math.abs(y.curveH - y.evenH) - Math.abs(x.curveH - x.evenH));
    const r = earnedValue(xer, { projId: pid, result });
    Object.assign(row, { dataDate: r.dataDate, measure: r.measure, checked, sumOk, linN, linOk, budgetH: Math.round(budgetH), evenH: Math.round(evenH), curveH: Math.round(curveH), budgetCost: Math.round(budgetC), evenCost: Math.round(evenC), curveCost: Math.round(curveC), pvTotal: r.totals?.pv ?? null, notes: r.notes.filter((n) => /resource curve/.test(n)), largest: per.slice(0, 8) });
  }
  out.push(row);
  console.log(`${row.file}: ${row.curves.length} curves, ${row.curved} of ${row.assignments} assignments name one${row.missing.length ? ` (${row.missing.length} missing)` : ""}${row.checked ? `; ${row.checked} spread: sum = budget ${row.sumOk}/${row.checked}, Linear = even ${row.linOk}/${row.linN}; planned by ${row.dataDate}: ${row.curveH.toLocaleString("en-US")} h on curves vs ${row.evenH.toLocaleString("en-US")} h evenly of ${row.budgetH.toLocaleString("en-US")} h; cost ${row.curveCost} vs ${row.evenCost} of ${row.budgetCost}; largest month-end gap ${row.gap.h.toLocaleString("en-US")} h at ${row.gap.date} (${row.gap.curve.toLocaleString("en-US")} h on curves vs ${row.gap.even.toLocaleString("en-US")} h evenly)` : ""}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
