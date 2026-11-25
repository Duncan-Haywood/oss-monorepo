// DCMA findings broken down by WBS node or activity code: the "ribbon"
// view a schedule-analysis seat sells, where each row is one area,
// responsibility or subcontractor and each column one of the 14 points,
// scored against the same thresholds on that group's own activities. An
// owner's rep can then send each subcontractor its own list ("Electrical:
// 12% missing logic, 3 hard constraints") instead of one project-wide score
// nobody owns.
//
// ribbon(xer, report, { by, level }) -> {
//   by: "wbs" | code type name, level, label,
//   columns: [{ id, name, threshold }],
//   groups: [{ key, code, name, path, population, failing, findings,
//              cells: { [id]: { count, total, value, pass } }, extra: { [id]: count } }],
//   project: { cells }, warnings,
// }
//
// report is assess()'s result for the same xer (dcma.mjs); its findings
// carry the activity id (`tid`, a relationship's successor) and its
// `populations` give each check's denominator, so a group's cells use the
// same population rules as the project-wide check, and the groups' counts
// add up to the project's. Points 12 to 14 (critical path test, CPLI, BEI)
// are properties of the whole network and have no per-group value; they
// are left out.
//
// level: 1 = the top WBS node under the project (or the top value of a
// hierarchical code), 2 = one below, and so on; an activity filed above the
// level is grouped at its own node.

import { codeTypes, findCodeType, codeLevel } from "./actvcodes.mjs";

// threshold per point, as in dcma.mjs; value for a group is computed the
// same way as the project's
const RULES = new Map(Object.entries({
  1: { kind: "pct", max: 5, threshold: "<= 5%" },
  2: { kind: "count", max: 0, threshold: "0" },
  3: { kind: "pct", max: 5, threshold: "<= 5%" },
  4: { kind: "fs", min: 90, threshold: ">= 90% FS" },
  5: { kind: "pct", max: 5, threshold: "<= 5%" },
  6: { kind: "pct", max: 5, threshold: "<= 5%" },
  7: { kind: "pct", max: 0, threshold: "0%" },
  8: { kind: "pct", max: 5, threshold: "<= 5%" },
  9: { kind: "count", max: 0, threshold: "0" },
  10: { kind: "pct", max: 0, threshold: "0%" },
  11: { kind: "pct", max: 5, threshold: "<= 5%" },
}).map(([k, v]) => [Number(k), v]));
const EXTRA = ["out-of-sequence", "open-finish"];
const round1 = (x) => Math.round(x * 10) / 10;

function cell(id, count, total) {
  const r = RULES.get(id);
  if (r.kind === "count") return { count, total, value: count, pass: count <= r.max };
  if (!total) return { count, total, value: null, pass: true };
  if (r.kind === "fs") { const v = (100 * (total - count)) / total; return { count, total, value: round1(v), pass: v >= r.min }; }
  const v = (100 * count) / total;
  return { count, total, value: round1(v), pass: v <= r.max + 1e-9 };
}

// the options a page or CLI can offer for this file: WBS levels that exist
// and the code types this project's activities carry
export function ribbonOptions(xer, projId) {
  const wbs = (xer.tables.PROJWBS || []).filter((w) => w.proj_id === projId);
  const byId = new Map(wbs.map((w) => [w.wbs_id, w]));
  let depth = 0;
  for (const w of wbs) {
    let d = 0;
    const seen = new Set();
    for (let k = w.wbs_id; k && byId.has(k) && byId.get(k).proj_node_flag !== "Y" && !seen.has(k); k = byId.get(k).parent_wbs_id) { seen.add(k); d++; }
    depth = Math.max(depth, d);
  }
  const codes = codeTypes(xer, projId).filter((t) => t.assigned > 0).map((t) => ({ id: t.id, name: t.name, hierarchical: t.hierarchical }));
  return { wbsLevels: depth, codes };
}

function wbsGrouper(xer, projId, level) {
  const wbs = (xer.tables.PROJWBS || []).filter((w) => w.proj_id === projId);
  const byId = new Map(wbs.map((w) => [w.wbs_id, w]));
  const cache = new Map();
  const chain = (id) => {
    if (cache.has(id)) return cache.get(id);
    const out = [];
    const seen = new Set();
    for (let k = id; k && byId.has(k) && byId.get(k).proj_node_flag !== "Y" && !seen.has(k); k = byId.get(k).parent_wbs_id) { seen.add(k); out.unshift(byId.get(k)); }
    cache.set(id, out);
    return out;
  };
  return (task) => {
    const c = chain(task.row.wbs_id);
    if (!c.length) return { key: "", code: "", name: "(project level)", path: [] };
    const node = c[Math.min(level, c.length) - 1];
    const path = c.slice(0, Math.min(level, c.length));
    return { key: node.wbs_id, code: path.map((w) => w.wbs_short_name).join("."), name: node.wbs_name || node.wbs_short_name, path: path.map((w) => w.wbs_name || w.wbs_short_name), seq: path.map((w) => Number(w.seq_num) || 0) };
  };
}

function codeGrouper(xer, projId, typeId, level) {
  const cl = codeLevel(xer, typeId, projId);
  const tname = cl.type ? cl.type.name : typeId;
  return {
    warnings: cl.warnings,
    group: (task) => {
      const p = cl.path(task.id);
      if (!p || !p.length) return { key: "", code: "", name: `(no ${tname})`, path: [] };
      const path = p.slice(0, Math.min(level, p.length));
      const node = path[path.length - 1];
      return { key: node.id, code: path.map((n) => n.code).join("."), name: node.name || node.code, path: path.map((n) => n.name || n.code), seq: path.map((n) => n.seq) };
    },
  };
}

export function ribbon(xer, report, opts = {}) {
  const projId = report.project.id;
  const level = Math.max(1, Math.floor(Number(opts.level) || 1));
  const by = opts.by == null || String(opts.by).toLowerCase() === "wbs" ? "wbs" : String(opts.by);
  const warnings = [];
  const pops = report.populations;
  if (!pops) throw new Error("the report has no populations: pass the result of assess() from dcma.mjs");
  let group, label;
  if (by === "wbs") { group = wbsGrouper(xer, projId, level); label = level === 1 ? "WBS" : `WBS level ${level}`; }
  else {
    const t = findCodeType(xer, projId, by);
    if (!t) {
      const names = codeTypes(xer, projId).map((c) => c.name);
      throw new Error(`no activity code type "${by}" in this project${names.length ? `; it has ${names.join(", ")}` : "; it has no activity codes"}`);
    }
    const g = codeGrouper(xer, projId, t.id, level);
    group = g.group; warnings.push(...g.warnings);
    label = t.hierarchical && level > 1 ? `${t.name} level ${level}` : t.name;
  }
  const tasks = new Map();
  for (const r of xer.tables.TASK || []) if (r.proj_id === projId) tasks.set(r.task_id, { id: r.task_id, row: r });
  const groups = new Map();
  const of = (tid) => {
    const t = tasks.get(tid);
    const g = t ? group(t) : { key: "?", code: "", name: "(activity not in this project)", path: [] };
    if (!groups.has(g.key)) groups.set(g.key, { ...g, population: new Set(), counts: {}, totals: {}, extra: {} });
    return groups.get(g.key);
  };
  const ids = [...RULES.keys()];
  for (const id of ids) for (const tid of pops[id] || []) { const g = of(tid); g.totals[id] = (g.totals[id] || 0) + 1; }
  for (const tid of pops[1] || []) of(tid).population.add(tid);
  const checks = new Map(report.checks.map((c) => [c.id, c]));
  let untagged = 0;
  for (const id of ids) {
    const c = checks.get(id);
    if (!c) continue;
    for (const it of c.items) { if (it.tid == null) { untagged++; continue; } const g = of(it.tid); g.counts[id] = (g.counts[id] || 0) + 1; }
  }
  for (const e of report.extra) if (EXTRA.includes(e.id)) for (const it of e.items) if (it.tid != null) { const g = of(it.tid); g.extra[e.id] = (g.extra[e.id] || 0) + 1; }
  if (untagged) warnings.push(`${untagged} finding${untagged === 1 ? "" : "s"} carry no activity and are left out of the groups`);
  const out = [];
  for (const g of groups.values()) {
    const cells = {};
    let failing = 0, findings = 0;
    for (const id of ids) {
      cells[id] = cell(id, g.counts[id] || 0, g.totals[id] || 0);
      if (!cells[id].pass) failing++;
      findings += g.counts[id] || 0;
    }
    if (!g.population.size && !findings && !Object.keys(g.extra).length) continue; // only complete work
    out.push({ key: g.key, code: g.code, name: g.name, path: g.path, seq: g.seq || [], population: g.population.size, failing, findings, cells, extra: g.extra });
  }
  // worst first; ties in the file's own order
  const seqCmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? -1) - (b[i] ?? -1); if (d) return d; } return 0; };
  out.sort((a, b) => b.failing - a.failing || b.findings - a.findings || seqCmp(a.seq, b.seq) || a.code.localeCompare(b.code));
  const project = {};
  for (const id of ids) { const c = checks.get(id); project[id] = c ? cell(id, c.count, c.total) : null; }
  return {
    by, level, label, projectName: report.project.name,
    columns: ids.map((id) => ({ id, name: checks.get(id)?.name || String(id), threshold: RULES.get(id).threshold })),
    extraColumns: EXTRA.map((id) => ({ id, name: report.extra.find((e) => e.id === id)?.name || id })),
    groups: out.map(({ seq, ...g }) => g), project, warnings,
  };
}

const SHORT = new Map([[1, "Logic"], [2, "Leads"], [3, "Lags"], [4, "FS"], [5, "Hard cstr"], [6, "High float"], [7, "Neg float"], [8, "High dur"], [9, "Inv dates"], [10, "Resources"], [11, "Missed"]]);
const label = (g) => (g.code && g.code !== g.name ? `${g.code} ${g.name}` : g.name);
const fmt = (c, id) => (!c ? "" : RULES.get(id).kind === "count" ? String(c.count) : c.value === null ? "-" : `${c.value}%`);

export function ribbonText(rb) {
  const head = ["Group", "Open", "Failing", ...rb.columns.map((c) => SHORT.get(c.id) || c.name)];
  const rows = rb.groups.map((g) => [label(g).slice(0, 40), String(g.population), String(g.failing),
    ...rb.columns.map((c) => fmt(g.cells[c.id], c.id) + (g.cells[c.id].pass ? "" : "*"))]);
  rows.push(["Project", "", String(rb.columns.filter((c) => rb.project[c.id] && !rb.project[c.id].pass).length), ...rb.columns.map((c) => fmt(rb.project[c.id], c.id) + (rb.project[c.id] && !rb.project[c.id].pass ? "*" : ""))]);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => r.map((v, i) => (i === 0 ? v.padEnd(w[i]) : v.padStart(w[i]))).join("  ");
  const out = [`DCMA 14-point by ${rb.label} (points 1-11; * fails the threshold on that group's own activities)`, line(head), ...rows.map(line)];
  for (const x of rb.warnings) out.push(`warning: ${x}`);
  return out.join("\n") + "\n";
}

const csvEsc = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?%?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ribbonCsv(rb) {
  const head = [rb.label, "name", "open activities", "points failing", "findings"];
  for (const c of rb.columns) head.push(`${c.id} ${c.name} (count)`, `${c.id} ${c.name} (of)`, `${c.id} ${c.name} (value)`, `${c.id} pass`);
  for (const e of rb.extraColumns) head.push(e.name);
  const rows = [head];
  for (const g of rb.groups) {
    const r = [g.code, g.name, g.population, g.failing, g.findings];
    for (const c of rb.columns) { const x = g.cells[c.id]; r.push(x.count, x.total, x.value ?? "", x.pass ? "yes" : "no"); }
    for (const e of rb.extraColumns) r.push(g.extra[e.id] || 0);
    rows.push(r);
  }
  return rows.map((r) => r.map(csvEsc).join(",")).join("\n") + "\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function ribbonHtml(rb) {
  const th = rb.columns.map((c) => `<th title="${esc(`${c.id} ${c.name}, threshold ${c.threshold}`)}">${c.id}<br><small>${esc(SHORT.get(c.id) || c.name)}</small></th>`).join("");
  const td = (x, id) => `<td class="${x.pass ? "ok" : "bad"}" title="${esc(`${x.count} of ${x.total}`)}">${esc(fmt(x, id))}</td>`;
  const body = rb.groups.map((g) => `<tr><th scope="row">${g.code && g.code !== g.name ? `<code>${esc(g.code)}</code> ` : ""}${esc(g.name)}</th><td>${g.population}</td><td>${g.failing}</td>${rb.columns.map((c) => td(g.cells[c.id], c.id)).join("")}<td>${g.extra["out-of-sequence"] || 0}</td></tr>`).join("");
  const proj = `<tr class="total"><th scope="row">Whole project</th><td></td><td>${rb.columns.filter((c) => rb.project[c.id] && !rb.project[c.id].pass).length}</td>${rb.columns.map((c) => (rb.project[c.id] ? td(rb.project[c.id], c.id) : "<td></td>")).join("")}<td></td></tr>`;
  return `<table class="ribbon"><thead><tr><th>${esc(rb.label)}</th><th>Open</th><th>Failing</th>${th}<th>Out of<br><small>sequence</small></th></tr></thead><tbody>${body}${proj}</tbody></table>`
    + (rb.warnings.length ? `<ul class="warn">${rb.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "");
}
