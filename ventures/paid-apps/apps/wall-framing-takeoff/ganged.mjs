// @ts-check
// Ganged openings: two or more windows (or doors) set so close together that
// their king studs would collide are framed as ONE rough opening with a mullion
// where the gap is, the way builders frame a ganged window unit.
//
// Opt-in (`--gang` on the CLI). Only openings of the same kind, height, head
// height and header size are merged; anything else is left alone and the
// engine's own "too narrow to share kings" error still tells the user. The
// merged opening's width is first.offset .. last.offset + last.width, so the
// gap becomes part of the opening. The mullion is not sized or checked here:
// the ganged unit's maker and the engineer decide that.
import { THICK } from "./engine.mjs";

/**
 * Why a plan cannot be ganged, or null: walls and openings must be objects, and each opening's
 * offset and width real numbers (text coerced in the sort and NaN became null on save).
 * @param {any} plan
 * @returns {string | null}
 */
export function gangPlanError(plan) {
  if (!plan || typeof plan !== "object") return "plan must be an object";
  if (plan.walls != null && !Array.isArray(plan.walls)) return "walls must be a list";
  for (const [i, w] of (plan.walls || []).entries()) {
    if (!w || typeof w !== "object") return `wall ${i + 1} must be an object`;
    if (w.openings != null && !Array.isArray(w.openings)) return `wall ${w.id ?? i + 1}: openings must be a list`;
    for (const [j, o] of (w.openings || []).entries()) {
      if (!o || typeof o !== "object") return `wall ${w.id ?? i + 1}: opening ${j + 1} must be an object`;
      if (!Number.isFinite(o.offset) || !Number.isFinite(o.width)) return `wall ${w.id ?? i + 1}: opening ${j + 1} needs a numeric offset and width`;
    }
  }
  return null;
}

/**
 * @param {any} plan
 * @returns {{ plan: any, notes: string[] }} a copy of the plan with close openings merged
 */
export function gangOpenings(plan) {
  const bad = gangPlanError(plan);
  if (bad) throw new Error(bad);
  const out = structuredClone(plan);
  const notes = [];
  for (const wall of out.walls || []) {
    const ops = [...(wall.openings || [])].sort((a, b) => a.offset - b.offset);
    const merged = [];
    for (const op of ops) {
      const prev = merged[merged.length - 1];
      if (prev && canGang(prev, op)) {
        const gap = op.offset - (prev.offset + prev.width);
        const width = op.offset + op.width - prev.offset;
        notes.push(`${wall.id}: ${prev.label || prev.kind} and ${op.label || op.kind} are ${gap} in apart; framed as one ${width} in opening with a ${gap} in mullion. The unit's maker or your engineer sizes the mullion and header.`);
        prev.width = width;
        prev.label = `${prev.label || prev.kind} + ${op.label || op.kind}`;
        prev.ganged = (prev.ganged || 1) + 1;
      } else merged.push({ ...op });
    }
    wall.openings = merged;
  }
  return { plan: out, notes };
}

/** Same kind, size and head, and close enough that the jacks and kings cannot both fit in the gap. */
function canGang(a, b) {
  const gap = b.offset - (a.offset + a.width);
  const need = THICK * ((a.jacks ?? 1) + (b.jacks ?? 1) + Math.max(a.kings ?? 1, b.kings ?? 1));
  return gap >= 0 && gap < need - 1e-9
    && a.kind === b.kind && a.height === b.height
    && a.headerHeight === b.headerHeight && (a.header ?? "") === (b.header ?? "");
}
