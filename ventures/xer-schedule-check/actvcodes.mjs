// Activity codes: P6's second way of organising a schedule, beside the WBS.
// A code type (ACTVTYPE: "Responsibility", "Area", "Phase", "Trade") has
// values (ACTVCODE), which may nest (a value's parent_actv_code_id), and each
// activity holds at most one value of each type (TASKACTV). Schedulers group
// the Gantt by them ("show me the electrical sub's work by floor") far more
// often than by the WBS, and an owner without a P6 seat cannot do that from
// an XER at all.
//
// codeTypes(xer, projId) -> [{ id, name, scope, seq, values, hierarchical, assigned }]
//   The code types an activity of this project can carry: global and EPS
//   types, and project types whose proj_id is this project. P6's order:
//   global, then EPS, then project, each by seq_num then name. `assigned`
//   counts this project's activities holding a value of the type.
// findCodeType(xer, projId, nameOrId) -> the type, matched by id, then name
//   (case and spacing ignored), or null.
// codeLevel(xer, typeId, projId) -> { type, path(taskId) -> [node] | null, warnings }
//   path gives the value an activity holds and the values above it, outermost
//   first; node = { id, code (short name), name (description), seq }. null =
//   no value of this type.

const SCOPE_ORDER = { AS_Global: 0, AS_EPS: 1, AS_Project: 2 };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function codeTypes(xer, projId) {
  const T = xer.tables;
  const types = T.ACTVTYPE || [];
  if (!types.length) return [];
  const projTasks = new Set((T.TASK || []).filter((t) => !projId || t.proj_id === projId).map((t) => t.task_id));
  const values = new Map(), parents = new Map(), assigned = new Map();
  for (const c of T.ACTVCODE || []) {
    values.set(c.actv_code_type_id, (values.get(c.actv_code_type_id) || 0) + 1);
    if (c.parent_actv_code_id) parents.set(c.actv_code_type_id, true);
  }
  for (const a of T.TASKACTV || []) if (projTasks.has(a.task_id)) assigned.set(a.actv_code_type_id, (assigned.get(a.actv_code_type_id) || 0) + 1);
  const out = [];
  for (const t of types) {
    const scope = t.actv_code_type_scope || "AS_Global";
    // a project type belongs to one project; an EPS type's proj_id names an
    // EPS node the file may not carry, so it is kept when the project uses it
    if (projId && scope === "AS_Project" && t.proj_id && t.proj_id !== projId) continue;
    if (projId && scope === "AS_EPS" && !assigned.get(t.actv_code_type_id)) continue;
    out.push({ id: t.actv_code_type_id, name: t.actv_code_type || t.actv_code_type_id, scope: scope.replace(/^AS_/, ""), seq: num(t.seq_num), values: values.get(t.actv_code_type_id) || 0, hierarchical: !!parents.get(t.actv_code_type_id), assigned: assigned.get(t.actv_code_type_id) || 0 });
  }
  out.sort((a, b) => (SCOPE_ORDER["AS_" + a.scope] ?? 3) - (SCOPE_ORDER["AS_" + b.scope] ?? 3) || a.seq - b.seq || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
  return out;
}

export function findCodeType(xer, projId, nameOrId) {
  const list = codeTypes(xer, projId);
  const k = String(nameOrId ?? "");
  return list.find((t) => t.id === k) || list.find((t) => norm(t.name) === norm(k)) || null;
}

export function codeLevel(xer, typeId, projId) {
  const T = xer.tables;
  const type = codeTypes(xer, projId).find((t) => t.id === typeId) || null;
  const warnings = [];
  const nodes = new Map();
  for (const c of T.ACTVCODE || []) {
    if (c.actv_code_type_id !== typeId) continue;
    nodes.set(c.actv_code_id, { id: c.actv_code_id, parent: c.parent_actv_code_id || "", code: c.short_name || "", name: c.actv_code_name || c.short_name || "", seq: num(c.seq_num) });
  }
  const held = new Map();
  let dangling = 0, twice = 0;
  for (const a of T.TASKACTV || []) {
    if (a.actv_code_type_id !== typeId) continue;
    if (!nodes.has(a.actv_code_id)) { dangling++; continue; }
    if (held.has(a.task_id)) { twice++; continue; }
    held.set(a.task_id, a.actv_code_id);
  }
  const name = type ? type.name : typeId;
  if (dangling) warnings.push(`${dangling} ${name} assignment${dangling === 1 ? " names a value" : "s name values"} the file does not carry; ${dangling === 1 ? "that activity is" : "those activities are"} grouped under "no ${name}"`);
  if (twice) warnings.push(`${twice} activit${twice === 1 ? "y holds" : "ies hold"} a second ${name} value; the first one in the file is used`);
  const cache = new Map();
  const chain = (id) => {
    if (cache.has(id)) return cache.get(id);
    const out = [];
    const seen = new Set();
    for (let k = id; k && nodes.has(k) && !seen.has(k); k = nodes.get(k).parent) { seen.add(k); out.unshift(nodes.get(k)); }
    cache.set(id, out);
    return out;
  };
  return { type, path: (taskId) => (held.has(taskId) ? chain(held.get(taskId)) : null), warnings };
}
