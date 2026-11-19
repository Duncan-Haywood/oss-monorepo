// Three-point duration ranges from the schedule's own P6 user-defined fields.
//
// A schedule that went through a risk review may keep each activity's
// optimistic, most likely and pessimistic duration in activity UDFs such as
// "Optimistic Duration", "Most Likely Dur" and "Pessimistic Duration", or
// "Min Dur" / "Max Dur", or "BC %" / "WC %". An XER export carries them in two
// tables: UDFTYPE (one row per field: udf_type_id, table_name, udf_type_label,
// logical_data_type) and UDFVALUE (one row per value: udf_type_id, fk_id =
// task_id for an activity field, udf_number).
//
// udfFields(xer) -> [{ id, label, type, values }]   numeric activity UDFs
// guessRangeFields(fields) -> { min, likely, max } field ids (likely may be
//   null: the file's remaining duration stands in) or null when no optimistic
//   and pessimistic pair is recognisable
// rangesFromUdf(xer, { min, likely, max, unit, projId }) -> {
//   ranges: Map code -> { min, likely, max, unit }   (likely null = the file's
//     remaining duration; unit "days" of the activity's own calendar, "hours",
//     or "pct" of the remaining duration),
//   fields: { min, likely, max } as { id, label, unit } (likely may be null),
//   read, partial: [codes with some but not all of the fields],
// }
// risk.mjs takes the Map as `ranges`, the same as ranges pasted as CSV, and
// checks min <= likely <= max per activity once it knows the remaining
// duration.

const NUMERIC = new Set(["FT_INT", "FT_FLOAT", "FT_FLOAT_2_DECIMALS"]);

const norm = (s) => ` ${String(s || "").toLowerCase().replace(/[_\-./()[\]:]+/g, " ").replace(/\s+/g, " ").trim()} `;
const has = (s, words) => words.some((w) => s.includes(` ${w} `));

// strong words name a range point on their own; weak ones only beside a
// duration word ("Min Dur", not "Min Qty")
const ROLE = {
  min: { strong: ["optimistic", "opt dur", "best case", "bcd", "bc dur", "bc %"], weak: ["bc", "min", "minimum", "low", "lo", "shortest"] },
  likely: { strong: ["most likely", "mostlikely", "mld", "ml dur", "ml %"], weak: ["likely", "ml", "mode", "modal"] },
  max: { strong: ["pessimistic", "pess dur", "worst case", "wcd", "wc dur", "wc %"], weak: ["wc", "max", "maximum", "high", "hi", "longest"] },
};
const DURATION = ["dur", "duration", "drtn", "days", "day", "d", "hrs", "hours", "hr", "h", "%", "pct", "percent", "estimate", "est"];

export function unitOf(label) {
  const s = norm(String(label).replace(/%/g, " % "));
  if (has(s, ["%", "pct", "percent", "percentage"])) return "pct";
  if (has(s, ["hrs", "hours", "hour", "hr", "h"])) return "hours";
  return "days";
}

export function roleOf(label) {
  const s = norm(String(label).replace(/%/g, " % "));
  const durationy = has(s, DURATION);
  const hits = Object.entries(ROLE).filter(([, w]) => has(s, w.strong) || (durationy && has(s, w.weak))).map(([r]) => r);
  // "Min/Max Dur" or "Optimistic - Pessimistic" names two points: not one field
  return hits.length === 1 ? hits[0] : null;
}

export function udfFields(xer) {
  const types = (xer.tables.UDFTYPE || []).filter((u) => u.table_name === "TASK" && NUMERIC.has(u.logical_data_type));
  const count = new Map();
  for (const v of xer.tables.UDFVALUE || []) {
    if (v.udf_number === "" || v.udf_number == null || !Number.isFinite(Number(v.udf_number))) continue;
    count.set(v.udf_type_id, (count.get(v.udf_type_id) || 0) + 1);
  }
  return types.map((u) => ({ id: u.udf_type_id, label: u.udf_type_label || u.udf_type_name, type: u.logical_data_type, values: count.get(u.udf_type_id) || 0 }));
}

export function guessRangeFields(fields) {
  const pick = {};
  for (const role of ["min", "likely", "max"]) {
    const cands = fields.filter((f) => f.values > 0 && roleOf(f.label) === role);
    cands.sort((a, b) => b.values - a.values);
    pick[role] = cands[0]?.id ?? null;
  }
  if (!pick.min || !pick.max || pick.min === pick.max) return null;
  return pick;
}

export function rangesFromUdf(xer, opts = {}) {
  const fields = udfFields(xer);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const sel = opts.min && opts.max ? { min: opts.min, likely: opts.likely || null, max: opts.max } : guessRangeFields(fields);
  if (!sel) return { ranges: new Map(), fields: null, read: 0, partial: [] };
  for (const r of ["min", "likely", "max"]) if (sel[r] && !byId.has(sel[r])) throw new Error(`no numeric activity UDF with id ${sel[r]}`);
  const unitFor = (id) => opts.unit || unitOf(byId.get(id).label);
  const units = [sel.min, sel.likely, sel.max].filter(Boolean).map(unitFor);
  if (new Set(units).size > 1) throw new Error(`the range fields are in different units (${units.join(", ")}); pass one unit`);
  const unit = units[0];
  const want = new Map([[sel.min, "min"], [sel.max, "max"]]);
  if (sel.likely) want.set(sel.likely, "likely");
  const tasks = new Map();
  // open work only: a finished activity or a milestone takes no draw, and
  // fields left filled in on finished work are common
  for (const t of xer.tables.TASK || []) {
    if (opts.projId && t.proj_id !== opts.projId) continue;
    if (t.status_code === "TK_Complete" || t.task_type === "TT_Mile" || t.task_type === "TT_FinMile" || t.task_type === "TT_LOE" || t.task_type === "TT_WBS") continue;
    tasks.set(t.task_id, t);
  }
  const vals = new Map(); // task_id -> { min, likely, max }
  for (const v of xer.tables.UDFVALUE || []) {
    const role = want.get(v.udf_type_id);
    if (!role || !tasks.has(v.fk_id) || v.udf_number === "" || v.udf_number == null) continue;
    const x = Number(v.udf_number);
    if (!Number.isFinite(x)) continue;
    if (!vals.has(v.fk_id)) vals.set(v.fk_id, {});
    vals.get(v.fk_id)[role] = x;
  }
  const ranges = new Map(), partial = [];
  for (const [id, o] of vals) {
    const code = tasks.get(id).task_code;
    const complete = o.min !== undefined && o.max !== undefined && (!sel.likely || o.likely !== undefined);
    if (!complete) { partial.push(code); continue; }
    ranges.set(code, { min: o.min, likely: sel.likely ? o.likely : null, max: o.max, unit });
  }
  const f = (id) => (id ? { id, label: byId.get(id).label, unit } : null);
  return { ranges, fields: { min: f(sel.min), likely: f(sel.likely), max: f(sel.max) }, read: ranges.size, partial };
}

// A field named by its udf_type_id or its label (case and spacing ignored).
export function resolveField(fields, s) {
  if (s == null || s === "" || s === "-") return null;
  const k = norm(s);
  const f = fields.find((x) => x.id === String(s).trim()) || fields.find((x) => norm(x.label) === k);
  if (!f) throw new Error(`no numeric activity UDF "${s}" (the file has: ${fields.map((x) => x.label).join(", ") || "none"})`);
  return f.id;
}

// "auto", or "optimistic,most likely,pessimistic" fields by id or label
// ("-" or an empty middle for no most-likely field), into rangesFromUdf opts.
export function udfSpec(xer, spec) {
  if (!spec || spec === true || spec === "auto") return {};
  const fields = udfFields(xer);
  const parts = String(spec).split(",").map((p) => p.trim());
  if (parts.length === 2) parts.splice(1, 0, "");
  if (parts.length !== 3) throw new Error('name three fields: "optimistic,most likely,pessimistic" (most likely may be "-")');
  return { min: resolveField(fields, parts[0]), likely: resolveField(fields, parts[1]), max: resolveField(fields, parts[2]) };
}

const UNIT_WORD = { days: "working days", hours: "hours", pct: "% of remaining" };

// One line for the warnings box and the written review.
export function udfRangeNote(res) {
  if (!res.fields) return null;
  const f = res.fields;
  const names = [f.min, f.likely, f.max].map((x) => (x ? `"${x.label}"` : "the file's remaining duration")).join(" / ");
  return `ranges from the file's own UDFs: ${names} (${UNIT_WORD[f.min.unit]}) on ${res.read} open activit${res.read === 1 ? "y" : "ies"}${res.partial.length ? `; ${res.partial.length} with only some of the fields keep the default range` : ""}`;
}
