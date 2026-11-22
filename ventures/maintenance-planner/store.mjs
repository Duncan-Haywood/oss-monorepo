// The data file: assets, plans, work orders and parts in one JSON object.
// The page keeps it in the browser (localStorage) and the user exports and
// imports it as a file; the CLI reads the same file.

import { parseDay, fmtDay, planStatus } from "./schedule.mjs";

export const VERSION = 1;

export function emptyData() {
  return { version: VERSION, assets: [], plans: [], workOrders: [], parts: [], nextId: 1 };
}

export function newId(data, prefix) {
  const n = data.nextId || 1;
  data.nextId = n + 1;
  return `${prefix}${n}`;
}

const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (x === undefined || x === null ? "" : String(x));

// Accept a parsed file, keep what is well formed, and say what was dropped.
export function normalize(raw) {
  const problems = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Not a maintenance-planner data file (expected a JSON object).");
  const d = emptyData();
  const ids = new Set();
  const take = (list, kind, check) => {
    for (const x of arr(list)) {
      if (!x || typeof x !== "object" || !x.id || ids.has(String(x.id))) { problems.push(`${kind}: skipped an entry with no id or a repeated id`); continue; }
      const why = check(x);
      if (why) { problems.push(`${kind} ${x.id}: ${why}`); continue; }
      ids.add(String(x.id));
      d[kind].push(x);
    }
  };
  take(raw.assets, "assets", (a) => (!str(a.name).trim() ? "no name" : null));
  const assetIds = new Set(d.assets.map((a) => a.id));
  take(raw.plans, "plans", (p) => (!assetIds.has(p.assetId) ? "unknown asset" : !p.every && !p.meter ? "no calendar or meter trigger" : p.start && parseDay(p.start) === null ? "bad start date" : null));
  take(raw.parts, "parts", (p) => (!str(p.name).trim() ? "no name" : null));
  take(raw.workOrders, "workOrders", (w) => (!assetIds.has(w.assetId) ? "unknown asset" : null));
  let maxN = 0;
  for (const id of ids) { const m = /(\d+)$/.exec(id); if (m) maxN = Math.max(maxN, +m[1]); }
  d.nextId = Math.max(Number(raw.nextId) || 1, maxN + 1);
  return { data: d, problems };
}

// Complete a work order: stamp it done, record the completion on its plan,
// take its parts out of stock and log the meter reading.
export function completeWorkOrder(data, woId, { date, meter = null, labourHours = null, downtimeHours = null } = {}) {
  const w = data.workOrders.find((x) => x.id === woId);
  if (!w) throw new Error(`no work order ${woId}`);
  if (w.status === "done") throw new Error(`${woId} is already done`);
  if (parseDay(date) === null) throw new Error("completion date must be YYYY-MM-DD");
  w.status = "done";
  w.completed = date;
  if (labourHours !== null) w.labourHours = Number(labourHours);
  if (downtimeHours !== null) w.downtimeHours = Number(downtimeHours);
  const m = meter === null || meter === "" ? null : Number(meter);
  if (m !== null && Number.isFinite(m)) w.meter = m;
  const asset = data.assets.find((a) => a.id === w.assetId);
  if (asset && m !== null && Number.isFinite(m)) {
    asset.readings = arr(asset.readings);
    asset.readings.push({ date, value: m });
  }
  if (w.planId) {
    const plan = data.plans.find((p) => p.id === w.planId);
    if (plan) {
      plan.completions = arr(plan.completions);
      plan.completions.push({ date, meter: m, wo: w.id });
    }
  }
  for (const p of arr(w.parts)) {
    const part = data.parts.find((x) => x.id === p.partId);
    if (part) part.onHand = (Number(part.onHand) || 0) - (Number(p.qty) || 0);
  }
  return w;
}

// Open a work order for every plan that is due or overdue and has none open.
export function generateDueWorkOrders(data, today) {
  const made = [];
  for (const plan of data.plans) {
    if (plan.active === false) continue;
    const open = data.workOrders.some((w) => w.planId === plan.id && w.status !== "done");
    if (open) continue;
    const asset = data.assets.find((a) => a.id === plan.assetId);
    const st = planStatus(plan, asset?.readings || [], today);
    if (st.status !== "due" && st.status !== "overdue") continue;
    const w = {
      id: newId(data, "WO"),
      assetId: plan.assetId,
      planId: plan.id,
      type: "PM",
      title: plan.title,
      status: "open",
      priority: st.status === "overdue" ? "high" : "normal",
      created: fmtDay(today),
      due: st.due,
      estHours: Number(plan.hours) || 0,
      trade: plan.trade || "general",
      steps: arr(plan.steps).map((s) => ({ text: s, done: false })),
      parts: arr(plan.parts).map((p) => ({ ...p })),
    };
    data.workOrders.push(w);
    made.push(w);
  }
  return made;
}

// Assets from CSV text (header row; columns name, location, category,
// inService, meterUnit, criticality; others ignored). Quotes as RFC 4180.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function assetsFromCsv(data, text) {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (!rows.length) return { added: 0, problems: ["empty file"] };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const col = (names) => head.findIndex((h) => names.includes(h));
  const ci = { name: col(["name", "asset", "assetname", "equipment"]), location: col(["location", "site", "area"]), category: col(["category", "type", "class"]), inService: col(["inservice", "installed", "installdate", "commissioned"]), meterUnit: col(["meterunit", "meter", "units"]), criticality: col(["criticality", "priority"]) };
  if (ci.name < 0) return { added: 0, problems: ["no name column (name, asset or equipment)"] };
  const problems = [];
  let added = 0;
  for (let r = 1; r < rows.length; r++) {
    const get = (k) => (ci[k] >= 0 ? str(rows[r][ci[k]]).trim() : "");
    const name = get("name");
    if (!name) { problems.push(`row ${r + 1}: no name`); continue; }
    const inService = get("inService");
    if (inService && parseDay(inService) === null) problems.push(`row ${r + 1}: in-service date "${inService}" is not YYYY-MM-DD, left blank`);
    data.assets.push({ id: newId(data, "A"), name, location: get("location"), category: get("category"), inService: parseDay(inService) === null ? "" : inService, meterUnit: get("meterUnit"), criticality: get("criticality") || "medium", readings: [] });
    added++;
  }
  return { added, problems };
}
