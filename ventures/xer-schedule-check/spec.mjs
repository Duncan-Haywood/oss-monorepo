// Contract specification check: does a schedule submittal meet the limits
// the contract's scheduling section sets?
//
// Every construction contract with a CPM schedule has a section (CSI
// 01 32 16, 01 32 16.13, UFGS 01 32 01.00 10 on US federal work, a state
// DOT's "progress schedule" article) that says what the contractor's
// baseline and each update must look like: no activity longer than so many
// working days, no lags over so many days, no leads, which constraints are
// allowed, activity codes every activity must carry, the schedule cost-loaded
// to the contract value with no activity worth too much of it, the contract
// milestones present, retained logic. The owner's reviewer checks each
// submittal against that list before accepting it, by filtering P6 layouts
// one requirement at a time, or by hand without a P6 seat.
//
// The numbers differ contract by contract, so none are built in: the reviewer
// types them from their own specification (a rule left blank is not
// checked), saves them as a small JSON file, and runs every update against
// the same file. Nothing here claims to be any agency's specification.
//
// specCheck(xer, rules, { model, projId }) -> {
//   results: [{ key, label, limit, status: "pass" | "fail" | "note", count,
//   of, items: [{ code, name, why }], text }], failed, passed, checked,
//   warnings
// }
// Units: durations, lags and float in working days on the activity's own
// calendar (hours / that calendar's hours per day); a lag on its
// predecessor's calendar's hours per day. Costs in the file's currency, as
// budgeted (TASKRSRC.target_cost plus PROJCOST.target_cost).

import { buildModel } from "./cpm.mjs";
import { num, formatDate, parseDate } from "./xer.mjs";

export const CONSTRAINTS = [
  ["CS_MSO", "Start on"], ["CS_MSOA", "Start on or after"], ["CS_MSOB", "Start on or before"],
  ["CS_MEO", "Finish on"], ["CS_MEOA", "Finish on or after"], ["CS_MEOB", "Finish on or before"],
  ["CS_ALAP", "As late as possible"], ["CS_MANDSTART", "Mandatory start"], ["CS_MANDFIN", "Mandatory finish"],
];
const CSTR_NAME = new Map(CONSTRAINTS);

// The rules a specification can set, in the order they are reported.
// type: number (blank = not checked), bool, text (comma or line separated
// list), date, constraints (a list of allowed P6 constraint types).
export const RULES = [
  { key: "maxDuration", type: "number", label: "Longest original duration", unit: "working days", hint: "e.g. 20 or 15; milestones, level of effort, WBS summaries and finished work are left out" },
  { key: "durationExempt", type: "text", label: "Exempt from the duration limit", hint: "words in the ID or name, word stems match inside words, e.g. submi, procure, fabricat, deliver, cure" },
  { key: "maxLag", type: "number", label: "Longest lag", unit: "working days" },
  { key: "noLeads", type: "bool", label: "No negative lags (leads)" },
  { key: "noStartToFinish", type: "bool", label: "No start-to-finish relationships" },
  { key: "allowedConstraints", type: "constraints", label: "Constraint types allowed", hint: "any other type on an activity fails; tick none to allow no constraints" },
  { key: "maxConstrainedPct", type: "number", label: "Most activities with a date constraint", unit: "% of open activities" },
  { key: "singleStartFinish", type: "bool", label: "One start and one finish activity only (no other open ends)" },
  { key: "maxTotalFloat", type: "number", label: "Largest total float on open work", unit: "working days" },
  { key: "requiredCodes", type: "text", label: "Activity codes every activity must carry", hint: "code type names as in P6, e.g. Responsibility, Area, Phase" },
  { key: "minNameLength", type: "number", label: "Shortest activity name", unit: "characters" },
  { key: "uniqueNames", type: "bool", label: "No two activities share a name in the same WBS" },
  { key: "resourceLoaded", type: "bool", label: "Every activity has a resource assignment", hint: "milestones, level of effort and WBS summaries left out" },
  { key: "costLoaded", type: "bool", label: "Every activity carries budgeted cost", hint: "milestones, level of effort and WBS summaries left out" },
  { key: "contractValue", type: "number", label: "Contract value the budget must sum to", unit: "currency" },
  { key: "valueTolerancePct", type: "number", label: "Tolerance on the contract value", unit: "%", hint: "default 0.5" },
  { key: "maxActivityValuePct", type: "number", label: "Most of the budget on one activity", unit: "%" },
  { key: "milestones", type: "text", label: "Contract milestones that must be in the schedule", hint: "one per line; matched to a milestone's ID or whole words of its name, case and spacing ignored" },
  { key: "retainedLogic", type: "bool", label: "Scheduled with retained logic (not progress override)" },
  { key: "minActivities", type: "number", label: "Fewest activities", unit: "activities" },
  { key: "maxActivities", type: "number", label: "Most activities", unit: "activities" },
  { key: "dataDate", type: "date", label: "Data date of this submittal", hint: "the date the specification or pay period sets, YYYY-MM-DD" },
];
const RULE = new Map(RULES.map((r) => [r.key, r]));

const isSet = (v) => v !== undefined && v !== null && v !== "" && v !== false && !(typeof v === "number" && !Number.isFinite(v));
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[\n,;]+/)).map((s) => String(s).trim()).filter(Boolean);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const r1 = (x) => Math.round(x * 10) / 10;
const money = (x) => Math.round(x).toLocaleString("en-US");

// A typed number read by the shape of its commas: "1,250,000" is thousands
// commas, "29,99" or "1.234,56" a decimal comma; any other comma is refused.
export function readNumber(v) {
  const t = String(v).trim().replace(/\s+/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.split(",").join(""));
  if (/^(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$/.test(t)) return Number(t.split(".").join("").replace(",", "."));
  if (t.includes(",") || t === "") return NaN;
  return Number(t);
}

/**
 * Rules read from saved JSON (or a form): unknown keys and values of the
 * wrong type are dropped and named in `problems`, so a file written for a
 * later version still loads.
 */
export function parseRules(input) {
  let o = input;
  const problems = [];
  if (typeof input === "string") {
    try { o = JSON.parse(input); } catch (e) { return { rules: {}, problems: [`not JSON: ${e.message}`] }; }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { rules: {}, problems: ["the rules file must hold one JSON object"] };
  if (o.rules && typeof o.rules === "object" && !Array.isArray(o.rules)) o = o.rules;
  const rules = {};
  for (const [k, v] of Object.entries(o)) {
    const r = RULE.get(k);
    if (!r) { if (!["name", "source", "note", "version"].includes(k)) problems.push(`unknown rule "${k}" ignored`); continue; }
    if (v === null || v === "") continue;
    if (r.type === "number") {
      const n = typeof v === "number" ? v : readNumber(v);
      if (Number.isFinite(n) && n >= 0) rules[k] = n; else problems.push(`${k}: "${v}" is not a number of 0 or more`);
    } else if (r.type === "bool") {
      if (typeof v === "boolean") rules[k] = v; else if (v === "true" || v === "false") rules[k] = v === "true"; else problems.push(`${k}: "${v}" is not true or false`);
    } else if (r.type === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) && parseDate(String(v)) !== null && formatDate(parseDate(String(v))).slice(0, 10) === String(v)) rules[k] = String(v); else problems.push(`${k}: "${v}" is not a YYYY-MM-DD date`);
    } else if (r.type === "constraints") {
      const xs = list(v);
      const bad = xs.filter((x) => !CSTR_NAME.has(x));
      if (bad.length) problems.push(`${k}: unknown constraint type ${bad.join(", ")} ignored (use ${CONSTRAINTS.map(([c]) => c).join(", ")})`);
      rules[k] = xs.filter((x) => CSTR_NAME.has(x));
    } else {
      const xs = list(v);
      if (xs.length) rules[k] = xs;
    }
  }
  if (isSet(rules.minActivities) && isSet(rules.maxActivities) && rules.minActivities > rules.maxActivities) problems.push("minActivities is larger than maxActivities");
  return { rules, problems };
}

/** The rules as the JSON a reviewer saves and reuses (blank rules left out). */
export function rulesJson(rules, name = "") {
  const out = {};
  if (name) out.name = name;
  for (const r of RULES) if (isSet(rules[r.key]) && !(Array.isArray(rules[r.key]) && !rules[r.key].length && r.type !== "constraints")) out[r.key] = rules[r.key];
  return JSON.stringify(out, null, 2) + "\n";
}

function taskCosts(xer, tasks) {
  const T = xer.tables;
  const cost = new Map(), assigned = new Map();
  for (const a of T.TASKRSRC || []) {
    if (!tasks.has(a.task_id)) continue;
    assigned.set(a.task_id, (assigned.get(a.task_id) || 0) + 1);
    cost.set(a.task_id, (cost.get(a.task_id) || 0) + (num(a.target_cost) ?? 0));
  }
  for (const c of T.PROJCOST || []) {
    if (!tasks.has(c.task_id)) continue;
    cost.set(c.task_id, (cost.get(c.task_id) || 0) + (num(c.target_cost) ?? 0));
  }
  return { cost, assigned };
}

function taskCodes(xer) {
  const T = xer.tables;
  const typeName = new Map((T.ACTVTYPE || []).map((t) => [t.actv_code_type_id, t.actv_code_type || t.actv_code_type_id]));
  const held = new Map(); // task_id -> Set of normalised type names
  for (const a of T.TASKACTV || []) {
    const n = norm(typeName.get(a.actv_code_type_id) ?? a.actv_code_type_id);
    (held.get(a.task_id) || held.set(a.task_id, new Set()).get(a.task_id)).add(n);
  }
  return { held, types: new Set([...typeName.values()].map(norm)), typeNames: [...typeName.values()] };
}

/**
 * Check one project of a schedule against the rules. A rule left blank is
 * not run; one that cannot be read from this file (no ACTVTYPE table for
 * required codes, say) reports a note, not a pass.
 */
export function specCheck(xer, rules0, { model: model0 = null, projId = null } = {}) {
  const { rules, problems } = parseRules(rules0 || {});
  const model = model0 || buildModel(xer);
  const warnings = [...problems.map((p) => `rules: ${p}`)];
  const projIds = projId !== null ? [projId] : [...model.projects.keys()];
  if (projId === null && projIds.length > 1) warnings.push(`${projIds.length} projects in the file, checked together; pick one with the project option to check it alone`);
  const inProj = (t) => projId === null || t.proj === projId;
  const all = [...model.tasks.values()].filter(inProj);
  const acts = all.filter((t) => t.type !== "TT_WBS");
  const milestone = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
  const work = acts.filter((t) => !milestone(t) && t.type !== "TT_LOE");
  const open = acts.filter((t) => t.status !== "TK_Complete");
  const days = (t, mins) => mins / 60 / (t.cal.hoursPerDay || 8);
  const item = (t, why) => ({ code: t.code, name: t.name, why });
  const results = [];
  const add = (key, status, count, of, items, text) => {
    const r = RULE.get(key);
    results.push({ key, label: r.label, limit: rules[key], status, count, of, items, text });
  };
  const failIf = (key, items, of, okText, badText) => add(key, items.length ? "fail" : "pass", items.length, of, items, items.length ? badText : okText);

  if (isSet(rules.maxDuration)) {
    const ex = list(rules.durationExempt).map(norm).filter(Boolean);
    const exempt = (t) => ex.some((w) => norm(`${t.code} ${t.name}`).includes(w));
    const pool = work.filter((t) => t.status !== "TK_Complete");
    let exempted = 0;
    const items = [];
    for (const t of pool) {
      if (exempt(t)) { exempted++; continue; }
      const d = days(t, t.orig);
      if (d > rules.maxDuration + 1e-9) items.push(item(t, `${r1(d)} working days original duration (limit ${rules.maxDuration})`));
    }
    items.sort((a, b) => parseFloat(b.why) - parseFloat(a.why));
    failIf("maxDuration", items, pool.length - exempted,
      `all ${pool.length - exempted} open activities are ${rules.maxDuration} working days or shorter${exempted ? ` (${exempted} exempt by name)` : ""}`,
      `${items.length} of ${pool.length - exempted} open activities are longer than ${rules.maxDuration} working days${exempted ? ` (${exempted} exempt by name)` : ""}`);
  } else if (isSet(rules.durationExempt)) {
    warnings.push("durationExempt is set but maxDuration is not, so it has nothing to exempt from");
  }

  const rels = model.rels.filter((r) => !r.external && inProj(model.tasks.get(r.succId)));
  const relName = (r) => {
    const p = model.tasks.get(r.predId), s = model.tasks.get(r.succId);
    return { code: `${p.code} → ${s.code}`, name: `${p.name} → ${s.name}`, p, s };
  };
  const lagDays = (r) => { const p = model.tasks.get(r.predId); return r.lag / 60 / (p.cal.hoursPerDay || 8); };
  const TYPE = new Map([["PR_FS", "FS"], ["PR_SS", "SS"], ["PR_FF", "FF"], ["PR_SF", "SF"]]);
  if (isSet(rules.maxLag)) {
    const items = [];
    for (const r of rels) {
      const d = lagDays(r);
      if (d > rules.maxLag + 1e-9) { const n = relName(r); items.push({ code: n.code, name: n.name, why: `${TYPE.get(r.type) || r.type} lag of ${r1(d)} working days (limit ${rules.maxLag})` }); }
    }
    failIf("maxLag", items, rels.length, `no lag over ${rules.maxLag} working days on ${rels.length} relationships`, `${items.length} of ${rels.length} relationships carry a lag over ${rules.maxLag} working days`);
  }
  if (rules.noLeads) {
    const items = rels.filter((r) => r.lag < 0).map((r) => { const n = relName(r); return { code: n.code, name: n.name, why: `${TYPE.get(r.type) || r.type} lead of ${r1(lagDays(r))} working days` }; });
    failIf("noLeads", items, rels.length, `no negative lag on ${rels.length} relationships`, `${items.length} ${items.length === 1 ? "relationship carries" : "relationships carry"} a negative lag`);
  }
  if (rules.noStartToFinish) {
    const items = rels.filter((r) => r.type === "PR_SF").map((r) => { const n = relName(r); return { code: n.code, name: n.name, why: "start-to-finish relationship" }; });
    failIf("noStartToFinish", items, rels.length, `no start-to-finish link on ${rels.length} relationships`, `${items.length} start-to-finish ${items.length === 1 ? "relationship" : "relationships"}`);
  }
  if (rules.allowedConstraints !== undefined) {
    const ok = new Set(rules.allowedConstraints);
    const items = [];
    for (const t of open) for (const c of t.cstr) if (c.type && !ok.has(c.type)) items.push(item(t, `${CSTR_NAME.get(c.type) || c.type}${c.date !== null && c.date !== undefined ? ` ${formatDate(c.date).slice(0, 10)}` : ""}, a type the specification does not allow`));
    const allowed = ok.size ? [...ok].map((c) => CSTR_NAME.get(c).toLowerCase()).join(", ") : "none";
    failIf("allowedConstraints", items, open.length, `every constraint on the ${open.length} open activities is an allowed type (${allowed})`, `${items.length} ${items.length === 1 ? "constraint" : "constraints"} of a type not allowed (allowed: ${allowed})`);
  }
  if (isSet(rules.maxConstrainedPct)) {
    const withC = open.filter((t) => t.cstr.some((c) => c.type));
    const pct = open.length ? (100 * withC.length) / open.length : 0;
    const items = pct > rules.maxConstrainedPct + 1e-9 ? withC.map((t) => item(t, t.cstr.filter((c) => c.type).map((c) => CSTR_NAME.get(c.type) || c.type).join(" and "))) : [];
    add("maxConstrainedPct", items.length ? "fail" : "pass", withC.length, open.length, items,
      `${withC.length} of ${open.length} open activities (${r1(pct)}%) carry a date constraint (limit ${rules.maxConstrainedPct}%)`);
  }
  if (rules.singleStartFinish) {
    const net = acts.filter((t) => t.type !== "TT_LOE");
    const starts = net.filter((t) => !t.preds.some((r) => !r.external));
    const ends = net.filter((t) => !t.succs.some((r) => !r.external));
    const items = [];
    if (starts.length > 1) for (const t of starts) items.push(item(t, `no predecessor (${starts.length} activities start the network)`));
    if (ends.length > 1) for (const t of ends) items.push(item(t, `no successor (${ends.length} activities end the network)`));
    add("singleStartFinish", items.length ? "fail" : "pass", items.length, net.length, items,
      `${starts.length} ${starts.length === 1 ? "activity has" : "activities have"} no predecessor and ${ends.length} no successor`);
  }
  if (isSet(rules.maxTotalFloat)) {
    const items = [];
    let read = 0;
    for (const t of open) {
      if (t.type === "TT_LOE") continue;
      const tf = num(t.row.total_float_hr_cnt);
      if (tf === null) continue;
      read++;
      const d = tf / (t.cal.hoursPerDay || 8);
      if (d > rules.maxTotalFloat + 1e-9) items.push(item(t, `${r1(d)} working days of total float (limit ${rules.maxTotalFloat}): missing logic, or work that could start any time`));
    }
    items.sort((a, b) => parseFloat(b.why) - parseFloat(a.why));
    if (!read) add("maxTotalFloat", "note", 0, 0, [], "the file stores no total float (schedule it in P6 first, or read the recomputed float in the 14-point check)");
    else failIf("maxTotalFloat", items, read, `no open activity has more than ${rules.maxTotalFloat} working days of total float`, `${items.length} of ${read} open activities have more than ${rules.maxTotalFloat} working days of total float`);
  }
  if (isSet(rules.requiredCodes)) {
    const { held, types, typeNames } = taskCodes(xer);
    const want = list(rules.requiredCodes);
    const missingTypes = want.filter((w) => !types.has(norm(w)));
    const present = want.filter((w) => types.has(norm(w)));
    const items = [];
    for (const t of acts) {
      const h = held.get(t.id) || new Set();
      const miss = want.filter((w) => !h.has(norm(w)));
      if (miss.length) items.push(item(t, `no ${miss.join(", ")} code`));
    }
    const typesNote = missingTypes.length ? `; the file defines no code type named ${missingTypes.join(", ")}${typeNames.length ? ` (it has ${typeNames.slice(0, 8).join(", ")}${typeNames.length > 8 ? ", ..." : ""})` : " (it has no activity code types)"}` : "";
    add("requiredCodes", items.length ? "fail" : "pass", items.length, acts.length, items,
      items.length ? `${items.length} of ${acts.length} activities lack a required code${typesNote}` : `all ${acts.length} activities carry ${present.join(", ")}`);
  }
  if (isSet(rules.minNameLength)) {
    const items = acts.filter((t) => String(t.name ?? "").trim().length < rules.minNameLength).map((t) => item(t, `name of ${String(t.name ?? "").trim().length} characters (shortest allowed ${rules.minNameLength})`));
    failIf("minNameLength", items, acts.length, `every activity name has ${rules.minNameLength} characters or more`, `${items.length} activity names are shorter than ${rules.minNameLength} characters`);
  }
  if (rules.uniqueNames) {
    const groups = new Map();
    for (const t of acts) { const k = `${t.wbs}\u0000${norm(t.name)}`; (groups.get(k) || groups.set(k, []).get(k)).push(t); }
    const items = [];
    for (const g of groups.values()) if (g.length > 1) for (const t of g) items.push(item(t, `same name as ${g.filter((x) => x !== t).map((x) => x.code).join(", ")} in the same WBS`));
    failIf("uniqueNames", items, acts.length, "no two activities share a name in the same WBS", `${items.length} activities share a name with another in the same WBS`);
  }
  const needCost = rules.resourceLoaded || rules.costLoaded || isSet(rules.contractValue) || isSet(rules.maxActivityValuePct);
  if (needCost) {
    const { cost, assigned } = taskCosts(xer, new Map(acts.map((t) => [t.id, t])));
    if (rules.resourceLoaded) {
      const items = work.filter((t) => !assigned.get(t.id)).map((t) => item(t, "no resource assignment"));
      failIf("resourceLoaded", items, work.length, `all ${work.length} activities have a resource assignment`, `${items.length} of ${work.length} activities have no resource assignment`);
    }
    if (rules.costLoaded) {
      const items = work.filter((t) => !((cost.get(t.id) || 0) > 0)).map((t) => item(t, "no budgeted cost"));
      failIf("costLoaded", items, work.length, `all ${work.length} activities carry budgeted cost`, `${items.length} of ${work.length} activities carry no budgeted cost`);
    }
    const total = acts.reduce((s, t) => s + (cost.get(t.id) || 0), 0);
    if (isSet(rules.contractValue)) {
      const tol = isSet(rules.valueTolerancePct) ? rules.valueTolerancePct : 0.5;
      const off = total - rules.contractValue;
      const offPct = rules.contractValue ? (100 * off) / rules.contractValue : (total ? Infinity : 0);
      const ok = Math.abs(offPct) <= tol + 1e-9;
      add("contractValue", ok ? "pass" : "fail", ok ? 0 : 1, 1, [],
        `budgeted cost ${money(total)} against a contract value of ${money(rules.contractValue)}: ${off >= 0 ? "+" : "-"}${money(Math.abs(off))} (${Number.isFinite(offPct) ? `${off >= 0 ? "+" : ""}${r1(offPct)}%` : "no contract value"}; tolerance ${tol}%)`);
    }
    if (isSet(rules.maxActivityValuePct)) {
      if (!(total > 0)) add("maxActivityValuePct", "note", 0, 0, [], "the file carries no budgeted cost, so no share can be read");
      else {
        const cap = (total * rules.maxActivityValuePct) / 100;
        const items = acts.filter((t) => (cost.get(t.id) || 0) > cap + 1e-6).sort((a, b) => cost.get(b.id) - cost.get(a.id))
          .map((t) => item(t, `${money(cost.get(t.id))} budgeted, ${r1((100 * cost.get(t.id)) / total)}% of the ${money(total)} total (limit ${rules.maxActivityValuePct}%)`));
        failIf("maxActivityValuePct", items, acts.length, `no activity holds more than ${rules.maxActivityValuePct}% of the ${money(total)} budget`, `${items.length} activities hold more than ${rules.maxActivityValuePct}% of the ${money(total)} budget each`);
      }
    }
  }
  if (isSet(rules.milestones)) {
    const ms = acts.filter(milestone);
    const items = [];
    const found = [];
    for (const want of list(rules.milestones)) {
      const w = norm(want);
      // whole words only: "Milestone 1" must not be met by "Milestone 12"
      const words = (s) => w !== "" && ` ${norm(s)} `.includes(` ${w} `);
      const hit = w === "" ? null : ms.find((t) => norm(t.name) === w || norm(t.code) === w) || ms.find((t) => words(t.name));
      if (hit) found.push(`${want} = ${hit.code}`);
      else {
        const near = acts.find((t) => words(t.name));
        items.push({ code: "", name: want, why: near ? `no milestone by this name; ${near.code} "${near.name}" matches but is not a milestone` : "no milestone by this name or ID" });
      }
    }
    add("milestones", items.length ? "fail" : "pass", items.length, list(rules.milestones).length, items,
      items.length ? `${items.length} of ${list(rules.milestones).length} contract milestones not found` : `all ${found.length} contract milestones found (${found.join("; ")})`);
  }
  if (rules.retainedLogic) {
    const bad = projIds.map((id) => model.projects.get(id)).filter((p) => p && (!p.retainedLogic || p.progressOverride));
    add("retainedLogic", bad.length ? "fail" : "pass", bad.length, projIds.length, bad.map((p) => ({ code: p.code, name: "", why: p.progressOverride ? "scheduled with progress override" : "retained logic is off" })),
      bad.length ? `${bad.map((p) => p.code).join(", ")} not scheduled with retained logic` : "scheduled with retained logic");
  }
  if (isSet(rules.minActivities) || isSet(rules.maxActivities)) {
    const n = acts.length;
    const lo = isSet(rules.minActivities) ? rules.minActivities : 0, hi = isSet(rules.maxActivities) ? rules.maxActivities : Infinity;
    const ok = n >= lo && n <= hi;
    const key = isSet(rules.minActivities) ? "minActivities" : "maxActivities";
    add(key, ok ? "pass" : "fail", ok ? 0 : 1, 1, [], `${n} activities (allowed ${lo}${hi === Infinity ? " or more" : ` to ${hi}`})`);
    if (key === "minActivities" && isSet(rules.maxActivities)) results[results.length - 1].limit = `${lo} to ${hi}`;
  }
  if (isSet(rules.dataDate)) {
    const bad = [];
    for (const id of projIds) {
      const p = model.projects.get(id);
      const dd = p ? p.dataDate : null;
      const day = dd === null || dd === undefined ? "none" : formatDate(dd).slice(0, 10);
      if (day !== rules.dataDate) bad.push({ code: p ? p.code : id, name: "", why: `data date ${day}, not ${rules.dataDate}` });
    }
    add("dataDate", bad.length ? "fail" : "pass", bad.length, projIds.length, bad, bad.length ? bad.map((b) => `${b.code}: ${b.why}`).join("; ") : `data date ${rules.dataDate}`);
  }

  const order = new Map(RULES.map((r, i) => [r.key, i]));
  results.sort((a, b) => order.get(a.key) - order.get(b.key));
  const failed = results.filter((r) => r.status === "fail").length;
  const passed = results.filter((r) => r.status === "pass").length;
  if (!results.length) warnings.push("no rule is set: type the limits from the contract's scheduling section first");
  return { results, failed, passed, checked: results.length, activities: acts.length, relationships: rels.length, warnings: [...warnings, ...model.warnings] };
}

const fmtLimit = (r) => {
  const rule = RULE.get(r.key);
  const v = r.limit;
  if (rule.type === "bool") return "required";
  if (rule.type === "constraints") return v.length ? v.map((c) => CSTR_NAME.get(c)).join(", ") : "none";
  if (Array.isArray(v)) return v.join("; ");
  return `${typeof v === "number" ? v.toLocaleString("en-US") : v}${rule.unit && rule.unit !== "currency" ? ` ${rule.unit}` : ""}`;
};

export function specText(r, { limit = 25 } = {}) {
  const L = [`Specification check: ${r.checked} rules, ${r.passed} met, ${r.failed} not met (${r.activities} activities, ${r.relationships} relationships).`];
  for (const x of r.results) {
    L.push("", `[${x.status === "pass" ? "MET" : x.status === "fail" ? "NOT MET" : "NOTE"}] ${x.label} (${fmtLimit(x)}): ${x.text}`);
    for (const i of x.items.slice(0, limit)) L.push(`  ${i.code ? i.code + "  " : ""}${i.name}${i.name ? ": " : ""}${i.why}`);
    if (x.items.length > limit) L.push(`  ... and ${x.items.length - limit} more (--csv lists all)`);
  }
  if (r.warnings.length) L.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return L.join("\n") + "\n";
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function specCsv(r) {
  const head = ["rule", "limit", "result", "summary", "activity_id", "name", "why"];
  const rows = [];
  for (const x of r.results) {
    const res = x.status === "pass" ? "met" : x.status === "fail" ? "not met" : "note";
    if (!x.items.length) rows.push([x.label, fmtLimit(x), res, x.text, "", "", ""]);
    for (const i of x.items) rows.push([x.label, fmtLimit(x), res, x.text, i.code, i.name, i.why]);
  }
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function specTableHtml(r, { limit = 12 } = {}) {
  if (!r.results.length) return `<p>No rule is set yet.</p>`;
  let h = `<table><thead><tr><th>Requirement</th><th>Limit</th><th>Result</th><th>What the file shows</th></tr></thead><tbody>`;
  for (const x of r.results) {
    const pill = x.status === "pass" ? `<span class="pill pass">met</span>` : x.status === "fail" ? `<span class="pill fail">not met</span>` : `<span class="pill warn">note</span>`;
    h += `<tr><td>${esc(x.label)}</td><td>${esc(fmtLimit(x))}</td><td>${pill}</td><td>${esc(x.text)}</td></tr>`;
  }
  h += `</tbody></table>`;
  for (const x of r.results) {
    if (!x.items.length || x.status !== "fail") continue;
    h += `<details><summary>${esc(x.label)}: ${x.items.length}</summary><table><thead><tr><th>Activity</th><th>Why</th></tr></thead><tbody>`;
    for (const i of x.items.slice(0, limit)) h += `<tr><td>${esc(i.code)} ${esc(i.name)}</td><td>${esc(i.why)}</td></tr>`;
    h += `</tbody></table>${x.items.length > limit ? `<p class="note">and ${x.items.length - limit} more in the CSV</p>` : ""}</details>`;
  }
  return h;
}
