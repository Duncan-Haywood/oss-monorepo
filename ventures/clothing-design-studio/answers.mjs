/**
 * Answers to the questions a designer asks the studio instead of giving an
 * order (`refer.mjs` sorts them out): "is embroidery more expensive?",
 * "which is cheaper, dtg or screen print?", "how much does a hoodie cost to
 * make?", "does fleece work with embroidery?", "what colours do you have?".
 *
 * Cost questions are answered from the designer's own supplier sheet: each
 * alternative named in the question is applied to a copy of the design and
 * costed with `unitCost`, so the answer is the same number the costing panel
 * would show after the change. Nothing is applied to the design itself.
 */

import { COLOURS, FABRICS, METHODS, compatibilityNotes } from "./catalogue.mjs";
import { applyOp } from "./design.mjs";
import { unitCost, money } from "./costing.mjs";

const QUESTION_WORDS = /\b(?:is|are|does|do|did|would|will|how much|how many|which|what|cost(?:s)?|to make|more|less|expensive|cheaper|cheapest|than|price|make|work|with|it|the|a|an)\b/g;
const CHANGES = new Set(["garment", "fabric", "gsm", "method", "quantity", "inkColours"]);

/** The design changes named in a question, one alternative per chunk ("dtg or screen print" gives two). */
export function alternatives(words, design, parse) {
  const out = [];
  const seen = new Set();
  for (const chunk of String(words).toLowerCase().split(/\b(?:or|than|vs\.?|versus|and|compared to|instead of)\b|,|\?/)) {
    const bare = chunk.replace(QUESTION_WORDS, " ").replace(/\s+/g, " ").trim();
    if (!bare) continue;
    const r = parse(bare, design) ?? parse(`make it ${bare}`, design) ?? parse(`switch to ${bare}`, design);
    const ops = (r?.ops ?? []).filter(o => CHANGES.has(o.op));
    if (!ops.length) continue;
    const key = JSON.stringify(ops);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ words: bare, ops });
  }
  return out;
}

function select(design) {
  const id = design.selected ?? design.placements.at(-1)?.id;
  return id == null ? design : { ...design, selected: id };
}

/**
 * @param {{ words: string, topic: string|null }} question
 * @param {object} design the present design
 * @param {{ parse: Function, sheet?: object }} deps
 * @returns {{ text: string, rows?: { label: string, landed: number, diff: number }[] }}
 */
export function answerQuestion(question, design, { parse, sheet } = {}) {
  const words = String(question?.words ?? "");
  const alts = typeof parse === "function" ? alternatives(words, design, parse) : [];
  const topic = question?.topic ?? null;
  if (sheet && (topic === "cost" || (alts.length >= 2 && /\b(?:which|cheaper|cheapest|expensive|cost)\b/i.test(words)))) {
    const cur = unitCost(design, sheet);
    const c = sheet.currency || "EUR";
    if (!alts.length) {
      return { text: `This design costs ${money(cur.landed, c)} a garment landed at a run of ${design.quantity}, on your supplier sheet (the costing panel shows the lines).`, rows: [] };
    }
    const rows = [];
    for (const a of alts) {
      let copy = select(design);
      try { for (const op of a.ops) copy = applyOp(copy, op); } catch { continue; }
      const landed = unitCost(copy, sheet).landed;
      rows.push({ label: a.words, landed, diff: landed - cur.landed });
    }
    if (!rows.length) return { text: `This design costs ${money(cur.landed, c)} a garment landed; I could not cost the alternatives you named on this design.` };
    const parts = rows.map(r => `with ${r.label}: ${money(r.landed, c)} (${Math.abs(r.diff) < 0.005 ? "the same" : `${r.diff > 0 ? "+" : "-"}${money(Math.abs(r.diff), c)}`})`);
    const cheapest = rows.length > 1 ? rows.reduce((a, b) => (b.landed < a.landed ? b : a)) : null;
    return {
      text: `Now ${money(cur.landed, c)} a garment landed at ${design.quantity}; ${parts.join("; ")}${cheapest ? `. Cheapest of those: ${cheapest.label}` : ""}. From your supplier sheet; nothing was changed.`,
      rows,
    };
  }
  if (topic === "colours") return { text: `Garment colours I know by name: ${Object.keys(COLOURS).filter(n => !/gray/.test(n)).join(", ")}. Say "make it sage", or use the swatches.` };
  if (topic === "fabrics" && !alts.some(a => a.ops.some(o => o.op === "method"))) return { text: `Fabrics: ${Object.values(FABRICS).map(f => `${f.label} (${f.gsm[0]}-${f.gsm[1]} gsm)`).join("; ")}.` };
  if (topic === "fabrics" || topic === "methods") {
    const fabric = alts.flatMap(a => a.ops).find(o => o.op === "fabric")?.value ?? design.fabric;
    const method = alts.flatMap(a => a.ops).find(o => o.op === "method")?.value
      ?? design.placements.find(p => p.id === design.selected)?.method ?? design.placements.at(-1)?.method;
    if (method && METHODS[method]) {
      const notes = compatibilityNotes(fabric, method, { colour: design.colour, gsm: design.gsm });
      return { text: `${METHODS[method].label} on ${FABRICS[fabric]?.label.toLowerCase() ?? fabric}: ${METHODS[method].note}${notes.length ? ` To check with the maker: ${notes.join(" ")}` : ""}` };
    }
    return { text: `Methods: ${Object.values(METHODS).map(m => m.label).join("; ")}.` };
  }
  if (topic === "sizes") return { text: `Sizes and fit: the size finder (fit.html) recommends a size from chest, waist, hip and height and splits a run by size.` };
  if (topic === "timeline") return { text: `Lead times: the production timeline (timeline.html) works out the latest start for an on-sale date over samples, production, freight and customs.` };
  return { text: `I can't answer that from the design yet; nothing was changed.` };
}

