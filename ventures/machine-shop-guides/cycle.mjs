/**
 * First-number cycle time from a part model and the shop's own cutting data.
 * The volumetric method estimators use before CAM: no feed, speed or tool
 * value here is built in; every rate is the user's.
 *
 * All lengths in mm, feeds in mm/min, volumes in mm3, areas in mm2.
 *   roughing  = (stock volume - part volume) / removal rate
 *               removal rate = width of cut x depth of cut x feed
 *   finishing = part surface area / (stepover x finishing feed)
 *               (every face counted, so it errs long on faces left as stock)
 *   spindle   = roughing + finishing
 *   cycle     = spindle x (1 + non-cutting allowance) + load/unload minutes
 * The result is a starting estimate for the quote's cycle-time line. The
 * quote-vs-actual page's cycle factor is how a shop corrects it from its own
 * jobs.
 */

const pos = (v) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Removal rate in mm3/min from width of cut, depth of cut (mm) and feed (mm/min). */
export function removalRate({ width, depth, feed } = {}) {
  return pos(width) * pos(depth) * pos(feed);
}

/** Finishing coverage in mm2/min from stepover (mm) and feed (mm/min). */
export function finishRate({ stepover, feed } = {}) {
  return pos(stepover) * pos(feed);
}

/**
 * reading: { volume, area, closed } from readPart (STL gives volume and area)
 * stockVolume: mm3 of the stock option chosen
 * rough: { width, depth, feed }   finish: { stepover, feed }
 * allowancePct: rapids, tool changes, probing, as % of spindle time
 * loadMinutes: load/unload per part
 * Returns minutes for each part and the reasons any part is missing.
 */
export function cycleEstimate(reading, stockVolume, { rough = {}, finish = {}, allowancePct = 0, loadMinutes = 0 } = {}) {
  const missing = [];
  const out = { removed: null, roughMinutes: null, finishMinutes: null, spindleMinutes: null, cycleMinutes: null, missing };
  const vol = reading && reading.closed && pos(reading.volume) ? reading.volume : 0;
  if (!vol) missing.push("a closed STL of the part (STEP files give no volume or area here)");
  const mrr = removalRate(rough);
  const fr = finishRate(finish);
  if (vol) {
    out.removed = Math.max(0, pos(stockVolume) - vol);
    if (mrr) out.roughMinutes = out.removed / mrr;
    else missing.push("your roughing width, depth and feed");
    const area = pos(reading.area);
    if (area && fr) out.finishMinutes = area / fr;
    else missing.push(fr ? "the part's surface area (the mesh gave none)" : "your finishing stepover and feed");
  } else {
    if (!mrr) missing.push("your roughing width, depth and feed");
    if (!fr) missing.push("your finishing stepover and feed");
  }
  if (out.roughMinutes !== null && out.finishMinutes !== null) {
    out.spindleMinutes = out.roughMinutes + out.finishMinutes;
    out.cycleMinutes = out.spindleMinutes * (1 + pos(allowancePct) / 100) + pos(loadMinutes);
  }
  return out;
}
