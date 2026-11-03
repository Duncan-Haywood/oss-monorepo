// @ts-check
// Right-sized headers from a span table the user supplies.
//
// The table is the user's own, copied from their code's header span table for
// their snow/wind load, building width and stud size (for example IRC R602.7 or
// the engineer's schedule). Nothing here carries code values: it only picks the
// first row whose span covers the rough opening and tells you which openings a
// hand-picked header falls short of.
import { DEPTH, EPS, formatLength } from "./engine.mjs";

/** @typedef {{ upTo: number, header: string, plies?: number }} HeaderRow */

/** Plies the engine frames when `headerPlies` is not given. */
const defaultPlies = (wall) => ((wall.stud || "2x4") === "2x6" ? 3 : 2);

/**
 * Check a table: spans above zero, known sizes, whole plies, and never a lighter
 * header for a longer span.
 * @param {any} table
 * @returns {string[]}
 */
export function validateHeaderTable(table) {
  if (!Array.isArray(table) || !table.length) return ["headerTable must be a list of rows {upTo, header, plies?}."];
  const errors = [];
  table.forEach((r, i) => {
    const at = `headerTable row ${i + 1}`;
    if (!(r && r.upTo > 0)) errors.push(`${at}: upTo (the longest clear span, inches) must be more than zero.`);
    if (!(r && r.header in DEPTH)) errors.push(`${at}: header must be one of ${Object.keys(DEPTH).join(", ")}.`);
    if (r && r.plies !== undefined && !(Number.isInteger(r.plies) && r.plies >= 1 && r.plies <= 4)) errors.push(`${at}: plies must be a whole number from 1 to 4.`);
  });
  if (errors.length) return errors;
  const rows = [...table].sort((a, b) => a.upTo - b.upTo);
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i - 1], q = rows[i];
    if (DEPTH[q.header] < DEPTH[p.header] - EPS || (DEPTH[q.header] === DEPTH[p.header] && (q.plies ?? 0) < (p.plies ?? 0))) {
      errors.push(`headerTable: the row up to ${formatLength(q.upTo)} is lighter than the row up to ${formatLength(p.upTo)}; a longer span cannot take a lighter header.`);
    }
  }
  return errors;
}

/**
 * Fill each opening's header from the table and compare the ones already chosen.
 * An opening with `header: "auto"` (or none) gets the first row that covers its
 * width. An opening with a header keeps it, and is reported when it is shallower
 * or has fewer plies than the table asks for. Returns a copy; the input is untouched.
 * @param {any} plan
 * @returns {{ ok: boolean, plan: any, errors: string[], rows: { wall: string, opening: string, span: number, required: string, chosen: string, status: "set"|"ok"|"under" }[], notes: string[] }}
 */
export function resolveHeaders(plan) {
  const out = structuredClone(plan);
  const byStud = plan.headerTables && typeof plan.headerTables === "object" ? plan.headerTables : {};
  const anyTable = plan.headerTable || Object.keys(byStud).length || (plan.walls || []).some((w) => w.headerTable);
  if (!anyTable) return { ok: true, plan: out, errors: [], rows: [], notes: [] };
  const errors = [];
  /** Table for a wall: its own `headerTable`, else `headerTables[stud]`, else the plan's `headerTable`. */
  const tableFor = (wall) => {
    const own = wall.headerTable ? ["wall " + wall.id, wall.headerTable] : byStud[wall.stud || "2x4"] ? [`headerTables["${wall.stud || "2x4"}"]`, byStud[wall.stud || "2x4"]] : plan.headerTable ? ["headerTable", plan.headerTable] : null;
    return own;
  };
  const checked = new Set();
  for (const wall of out.walls || []) {
    const t = tableFor(wall);
    if (!t || checked.has(t[1])) continue;
    checked.add(t[1]);
    for (const e of validateHeaderTable(t[1])) errors.push(t[0] === "headerTable" ? e : `${t[0]}: ${e}`);
  }
  if (errors.length) return { ok: false, plan: out, errors, rows: [], notes: [] };
  /** @type {{ wall: string, opening: string, span: number, required: string, chosen: string, status: "set"|"ok"|"under" }[]} */
  const rows = [];
  for (const wall of out.walls || []) {
    const t = tableFor(wall);
    if (!t) continue;
    const table = [...t[1]].sort((a, b) => a.upTo - b.upTo);
    for (const op of wall.openings || []) {
      const name = `${wall.id}, ${op.label || op.kind} at ${formatLength(op.offset)}`;
      const row = table.find((r) => r.upTo + EPS >= op.width);
      if (!row) {
        errors.push(`${name}: ${formatLength(op.width)} is wider than the table's longest span (${formatLength(table[table.length - 1].upTo)}). Add a row from your span table or frame this one to an engineer's size.`);
        continue;
      }
      const plies = row.plies ?? defaultPlies(wall);
      const required = `${plies} x ${row.header}`;
      if (!op.header || op.header === "auto") {
        op.header = row.header;
        op.headerPlies = plies;
        rows.push({ wall: wall.id, opening: name, span: op.width, required, chosen: required, status: "set" });
        continue;
      }
      const have = op.headerPlies ?? defaultPlies(wall);
      const chosen = `${have} x ${op.header}`;
      const under = !(op.header in DEPTH) ? false : DEPTH[op.header] < DEPTH[row.header] - EPS || have < plies;
      rows.push({ wall: wall.id, opening: name, span: op.width, required, chosen, status: under ? "under" : "ok" });
    }
  }
  const notes = rows.filter((r) => r.status === "under").map((r) => `${r.opening}: ${r.chosen} is lighter than your table's ${r.required} for a ${formatLength(r.span)} span.`);
  return { ok: !errors.length, plan: out, errors, rows, notes };
}

/** @param {ReturnType<typeof resolveHeaders>} r */
export function headerText(r) {
  const lines = [`  ${"opening".padEnd(44)} span        table asks   used`];
  for (const x of r.rows) lines.push(`  ${x.opening.padEnd(44)} ${formatLength(x.span).padEnd(11)} ${x.required.padEnd(12)} ${x.chosen}${x.status === "set" ? " (from table)" : x.status === "under" ? "  UNDER" : ""}`);
  lines.push("  The table is yours; nothing here carries code values.");
  return lines;
}
