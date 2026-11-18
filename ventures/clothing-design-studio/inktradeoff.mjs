/**
 * How many inks is this painting worth? Separate the same artwork at 2 to 8
 * inks and, for each, report the screens (with any white underbase), the
 * landed cost per garment at the planned run, and how far the flat inks sit
 * from the painting (mean CIE76 delta E; about 2 is barely visible, 5+ plain
 * to see). It then names the fewest inks after which one more ink buys less
 * than `minGain` delta E. Pure functions; the cost uses the designer's own
 * supplier sheet, so the answer is only as good as those prices.
 */
import { separate } from "./separation.mjs";
import { unitCost } from "./costing.mjs";
import { applyOp } from "./design.mjs";

export function inkTradeoff(image, design, sheet, o = {}) {
  const from = Math.max(2, o.from ?? 2), to = Math.min(8, o.to ?? 8), minGain = o.minGain ?? 1;
  const target = design.placements.find(p => p.id === design.selected);
  if (!target) throw new Error("inkTradeoff: select the artwork to price first");
  const rows = [];
  for (let k = from; k <= to; k++) {
    const sep = separate(image, { colours: k, widthCm: o.widthCm, garment: design.colour, raisedLineMm: o.raisedLineMm, smooth: o.smooth });
    const d = { ...design, placements: design.placements.map(p => p.id === target.id ? { ...p, colours: sep.screens } : p) };
    const landed = unitCost(d, sheet).landed;
    rows.push({ requested: k, inks: sep.inks.length, screens: sep.screens, landed, meanDeltaE: sep.meanDeltaE, thinWarnings: sep.notes.filter(n => /thinner than/.test(n)).length });
  }
  // Collapse requests that ended with the same ink count (an ink lost to smoothing).
  const seen = new Map();
  for (const r of rows) seen.set(r.inks, r);
  const table = [...seen.values()].sort((a, b) => a.inks - b.inks);
  table.forEach((r, i) => { r.extraCost = i ? +(r.landed - table[i - 1].landed).toFixed(2) : 0; r.gain = i ? +(table[i - 1].meanDeltaE - r.meanDeltaE).toFixed(2) : null; });
  let pick = table[table.length - 1];
  for (let i = 0; i < table.length - 1; i++) if (table[i + 1].gain < minGain) { pick = table[i]; break; }
  const note = `${pick.inks} inks (${pick.screens} screens) is the fewest after which one more ink moves the flat colours closer by less than ${minGain} delta E. Distances are CIE76 on the pixels you gave it; judge a proof, not this number.`;
  return { table, recommended: pick.inks, note, currency: sheet.currency };
}
