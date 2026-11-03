/**
 * The optional model upgrade for the command box.
 *
 * Without a model, `commands.mjs` understands a fixed vocabulary. With one
 * (the designer's own key, or a model running on their own computer), free
 * speech such as "I want it to feel more like an old church painting, darker
 * and with the gold standing out" is rewritten by the model into commands
 * from that same vocabulary, which are then parsed and applied exactly as
 * typed ones are. The model never edits the design directly, so it cannot
 * do anything a typed command could not, and every change is listed and
 * undoable.
 */

import { complete, withFallback, isLocal } from "./byok.mjs";
import { parseCommand, EXAMPLES } from "./commands.mjs";
import { GARMENTS, FABRICS, METHODS, COLOURS } from "./catalogue.mjs";
import { MOTIFS } from "./motifs.mjs";

export function systemPrompt() {
  return [
    "You translate a clothing designer's spoken request into short commands for a design tool.",
    "Reply with commands only, one per line, at most 8 lines, no numbering, no commentary.",
    "Use only these words:",
    `Garments: ${Object.values(GARMENTS).map(g => g.label.toLowerCase()).join(", ")}.`,
    `Fabrics: ${Object.values(FABRICS).map(f => f.label.toLowerCase()).join(", ")}; weights as "N gsm".`,
    `Decoration: ${Object.values(METHODS).map(m => m.label.toLowerCase()).join(", ")}.`,
    `Motifs to add: ${Object.values(MOTIFS).map(m => m.id).join(", ")}. Text to add goes in double quotes.`,
    `Colours: ${Object.keys(COLOURS).join(", ")}.`,
    "Placement: front, back, left chest, sleeve; move up/down/left/right N cm; bigger/smaller N%; rotate N degrees; centre it.",
    "Other: show me three versions; go with the second one; undo; make N pieces; sell them for N.",
    `Examples: ${EXAMPLES.join(" | ")}`,
    "If the request cannot be expressed with these commands, reply with the single line: none",
  ].join("\n");
}

export function describeDesign(design) {
  const ps = design.placements.map(p => `${p.kind}${p.text ? ` "${p.text}"` : p.motif ? ` ${p.motif}` : ""} on ${p.area}, ${p.method}, ${p.w} cm wide`).join("; ");
  return `Current design: ${design.colourName} ${GARMENTS[design.garment].label.toLowerCase()}, ${FABRICS[design.fabric].label.toLowerCase()} ${design.gsm} gsm. Artwork: ${ps || "none"}.`;
}

/** Keep only lines that look like commands: short, no markup. */
export function cleanModelLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(l => l && l.length <= 120 && !/[<>{}`]/.test(l) && l.toLowerCase() !== "none")
    .slice(0, 8);
}

/**
 * Interpret an utterance. Resolves to
 *   { result: parseCommand output, source: "model" | "fallback", rewritten?: string[], error?: string, local: boolean }
 */
export async function interpret(text, design, config, { fetch } = {}) {
  const deterministic = () => ({ result: parseCommand(text, design) });
  const viaModel = async cfg => {
    const reply = await complete(cfg, { system: systemPrompt(), prompt: `${describeDesign(design)}\nDesigner said: ${String(text).slice(0, 600)}`, maxTokens: 300, fetch });
    const lines = cleanModelLines(reply.text);
    if (!lines.length) throw new Error("the model returned no commands");
    const merged = { steps: [], unmatched: [] };
    for (const line of lines) {
      const r = parseCommand(line, design);
      merged.steps.push(...r.steps);
      merged.unmatched.push(...r.unmatched);
    }
    if (!merged.steps.length) throw new Error("none of the model's commands were understood");
    return { result: merged, rewritten: lines };
  };
  const out = await withFallback(config, deterministic, viaModel);
  return { ...out.value, source: out.source, error: out.error, local: config ? isLocal(config) : false };
}
