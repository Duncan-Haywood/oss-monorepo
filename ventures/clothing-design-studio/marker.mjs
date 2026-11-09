/**
 * A cutting marker estimate: the pattern pieces of a garment packed onto the
 * fabric width, so the metres to buy come from a layout instead of the
 * supplier's per-garment figure scaled by area (runcost.mjs).
 *
 * What it does: builds the pieces of a tee, long-sleeve, crewneck or hoodie
 * per size as bounding rectangles (body front and back, sleeves, ribbing,
 * hood, pocket) from fit.mjs's finished measurements plus a seam allowance,
 * keeps every piece on the grain (length runs along the cloth, no rotation),
 * and packs them with first-fit-decreasing shelves across the usable width.
 * A lay is one marker spread many plies deep; the run is cut in as few lays
 * as the ply limit allows, with one marker holding a ratio of sizes.
 *
 * What it is not: real CAD nesting. Pieces are rectangles, so the armhole,
 * neck and sleeve-cap curves are not nested into each other; that wastes some
 * cloth the factory's marker would save, so this estimate is on the cautious
 * side (more cloth). A `nestingGain` percentage can be set to the saving the
 * factory quotes. The factory's own marker consumption always wins.
 */
import { garmentMeasurements, BODY_CHEST_CM } from "./fit.mjs";
import { nestRatio, nestSvg } from "./nest.mjs";
import { DRAFTED } from "./pattern.mjs";

const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;

export const SEAM_ALLOWANCE_CM = 1.5;
export const SLEEVE_LENGTH_CM = Object.freeze({ tee: 22, longsleeve: 62, crewneck: 62, hoodie: 62 });

/** Pattern pieces for one garment in one size: [{name, w, l, qty}] in cm, seam allowance included. */
export function patternPieces(garment, size, fit = "regular", sizeChart = BODY_CHEST_CM, seam = SEAM_ALLOWANCE_CM) {
  const g = garmentMeasurements(garment, fit, sizeChart)[size];
  if (!g) return null;
  if (!(garment in SLEEVE_LENGTH_CM)) return null;
  const a = 2 * seam;
  const P = (name, w, l, qty) => ({ name, w: round1(w + a), l: round1(l + a), qty });
  const out = [
    P("front", g.flatWidth, g.length, 1),
    P("back", g.flatWidth, g.length, 1),
    P("sleeve", 0.34 * g.chest, SLEEVE_LENGTH_CM[garment], 2),
    P("neck band", 4.5, 0.45 * g.bodyChest, 1),
  ];
  if (garment === "crewneck" || garment === "hoodie") {
    out.push(P("cuff", 8, 0.2 * g.chest, 2));
    out.push(P("waistband", 9, g.flatWidth, 2));
  }
  if (garment === "hoodie") {
    out.push(P("hood", 34, 30 + (g.bodyChest - 100) * 0.1, 2));
    out.push(P("pocket", 32, 22, 1));
  }
  return out;
}

/**
 * Pack rectangles onto a strip `width` wide, first-fit-decreasing by length.
 * Returns the marker length and the cloth the pieces cover.
 */
export function packStrip(rects, width) {
  const items = [];
  for (const r of rects) for (let i = 0; i < r.qty; i++) items.push({ name: r.name, size: r.size, w: r.w, l: r.l });
  const tooWide = items.find(it => it.w > width);
  if (tooWide) return { ok: false, error: `A ${tooWide.name} piece is ${tooWide.w} cm wide, wider than the ${width} cm of usable cloth.` };
  items.sort((x, y) => y.l - x.l || y.w - x.w);
  const shelves = [];
  for (const it of items) {
    const s = shelves.find(sh => sh.used + it.w <= width + 1e-9);
    if (s) { s.used += it.w; s.items.push(it); } else shelves.push({ l: it.l, used: it.w, items: [it] });
  }
  const length = shelves.reduce((a, s) => a + s.l, 0);
  const area = items.reduce((a, it) => a + it.w * it.l, 0);
  const placed = [];
  let y = 0;
  for (const sh of shelves) {
    let x = 0;
    for (const it of sh.items) { placed.push({ name: it.name, size: it.size, x: round1(x), y: round1(y), w: it.w, l: it.l }); x += it.w; }
    y += sh.l;
  }
  return { ok: true, length: round1(length), pieces: items.length, shelves: shelves.length, coveredArea: area, placed };
}

/**
 * One marker for a ratio of sizes, e.g. { S: 1, M: 2, L: 1 }.
 * Pieces of all sizes in the ratio are packed together.
 */
export function markerFor(garment, ratio, { fit = "regular", sizeChart = BODY_CHEST_CM, fabricWidthCm = 150, edgeCm = 1.5, seam = SEAM_ALLOWANCE_CM, nested = false } = {}) {
  const usable = fabricWidthCm - 2 * edgeCm;
  // nested: lay the real drafted outlines (nest.mjs) instead of rectangles; only for the drafted garments, up to 20 of a size
  if (nested && DRAFTED.includes(garment) && Object.values(ratio).every(n => !(n > 0) || (Number.isInteger(n) && n <= 20))) {
    const r = nestRatio(garment, Object.fromEntries(Object.entries(ratio).filter(([, n]) => n > 0)), { fit, widthCm: fabricWidthCm, edgeCm, endLossCm: 0, draftOpts: { sizeChart } });
    if (r.ok) return { ok: true, markerLengthCm: r.lengthCm, usableWidthCm: usable, utilisationPct: round1(r.efficiencyPct), pieces: r.pieces.length, edgeCm, nested: r };
    // a piece wider than the cloth etc.: fall through to rectangles, which report the same limits in their own words
  }
  const rects = [];
  for (const [size, n] of Object.entries(ratio)) {
    if (!(n > 0)) continue;
    const ps = patternPieces(garment, size, fit, sizeChart, seam);
    if (!ps) return { ok: false, error: `No pattern for ${garment} in size ${size}.` };
    for (const p of ps) rects.push({ ...p, size, qty: p.qty * n });
  }
  const packed = packStrip(rects, usable);
  if (!packed.ok) return packed;
  const utilisation = packed.coveredArea / (packed.length * fabricWidthCm);
  return { ok: true, markerLengthCm: packed.length, usableWidthCm: usable, utilisationPct: round1(utilisation * 100), pieces: packed.pieces, edgeCm, placed: packed.placed };
}

/**
 * Cutting plan for a run. A lay is one marker (a ratio of sizes) spread `plies`
 * deep; a group is `lays` identical lays. Sizes are split into at most two
 * groups, the thinly-ordered sizes cut apart from the bulk, because one ratio
 * for all sizes would cut piles of spares for an XXL order of three. Within a
 * group every combination of lays and plies that covers the order is tried;
 * the marker must fit the cutting table, and the cheapest in cloth wins among
 * those whose spare pieces (from rounding the ratio up) stay within
 * `maxSparePct` of the group, at least 2; if none does, the fewest spares
 * wins. Spares are cloth, so they are paid for.
 * @param {string} garment
 * @param {Record<string, number>} counts  pieces wanted per size
 * @param {{fit?:string, sizeChart?:object, fabricWidthCm?:number, maxPlies?:number, maxMarkerCm?:number, endLossCm?:number, nestingGainPct?:number, maxSparePct?:number}} [opts]
 */
export function cuttingPlan(garment, counts, { fit = "regular", sizeChart = BODY_CHEST_CM, fabricWidthCm = 150, maxPlies = 60, maxMarkerCm = 1000, endLossCm = 6, nestingGainPct = 0, maxSparePct = 5, seam = SEAM_ALLOWANCE_CM, nested = false } = {}) {
  const want = Object.fromEntries(Object.entries(counts || {}).map(([k, v]) => [k, Math.max(0, Math.round(Number(v) || 0))]).filter(([, v]) => v > 0));
  const total = Object.values(want).reduce((a, b) => a + b, 0);
  if (!total) return { ok: false, error: "Give at least one piece." };
  if (!(fabricWidthCm >= 60 && fabricWidthCm <= 300)) return { ok: false, error: "Fabric width should be between 60 and 300 cm." };
  if (!(maxPlies >= 1 && maxPlies <= 200)) return { ok: false, error: "The ply limit must be between 1 and 200." };
  if (!(maxMarkerCm >= 100)) return { ok: false, error: "The cutting table must take a marker of at least 100 cm." };
  if (!(nestingGainPct >= 0 && nestingGainPct <= 30)) return { ok: false, error: "A nesting gain above 30% is not credible; use the factory's figure." };
  const gain = 1 - nestingGainPct / 100;
  const cache = new Map();
  const solve = sub => {
    const subTotal = Object.values(sub).reduce((a, b) => a + b, 0);
    const allowed = Math.max(2, Math.ceil(subTotal * maxSparePct / 100));
    const biggest = Math.max(...Object.values(sub));
    let best = null;
    for (let lays = 1; lays <= Math.min(24, biggest); lays++) {
      for (let plies = 1; plies <= maxPlies; plies++) {
        const ratio = Object.fromEntries(Object.entries(sub).map(([s, n]) => [s, Math.ceil(n / (lays * plies))]));
        const key = JSON.stringify(ratio);
        let m = cache.get(key);
        if (!m) { m = markerFor(garment, ratio, { fit, sizeChart, fabricWidthCm, seam }); cache.set(key, m); }
        if (!m.ok) return m;
        if (m.markerLengthCm * gain > maxMarkerCm) continue;
        const metres = lays * plies * (m.markerLengthCm * gain + endLossCm) / 100;
        const spares = Object.entries(ratio).reduce((a, [s, r]) => a + r * lays * plies - sub[s], 0);
        const ok = spares <= allowed;
        const better = !best ? true : ok !== best.ok ? ok : ok ? metres < best.metres - 1e-9 : (spares < best.spares || (spares === best.spares && metres < best.metres - 1e-9));
        if (better) best = { ok, lays, plies, ratio, m, metres, spares };
      }
    }
    return best ? { ok: true, best } : { ok: false, error: `No marker fits a ${maxMarkerCm} cm table within ${maxPlies} plies and 24 lays; raise the table length or the ply limit.` };
  };
  const bySmall = Object.keys(want).sort((x, y) => want[x] - want[y]);
  let chosen = null;
  for (let k = 0; k < bySmall.length; k++) {
    const groups = k === 0 ? [bySmall] : [bySmall.slice(0, k), bySmall.slice(k)];
    const solved = [];
    for (const sizes of groups) {
      const r = solve(Object.fromEntries(sizes.map(s => [s, want[s]])));
      if (!r.ok) { if (k === 0) return r; solved.length = 0; break; }
      solved.push({ sizes, ...r.best });
    }
    if (!solved.length) continue;
    const metres = solved.reduce((a, g) => a + g.metres, 0);
    const spares = solved.reduce((a, g) => a + g.spares, 0);
    const cand = { solved, metres, spares, ok: solved.every(g => g.ok) };
    const better = !chosen ? true : cand.ok !== chosen.ok ? cand.ok : cand.ok ? cand.metres < chosen.metres - 1e-9 : (cand.spares < chosen.spares || (cand.spares === chosen.spares && cand.metres < chosen.metres - 1e-9));
    if (better) chosen = cand;
  }
  // Lays and plies are chosen on the fast rectangle packing; with `nested` each chosen marker is then re-laid from the real outlines
  // (a raster nest costs seconds, far too many to run for every lays x plies candidate).
  if (nested) {
    const re = chosen.solved.map(g => markerFor(garment, g.ratio, { fit, sizeChart, fabricWidthCm, seam, nested: true }));
    if (re.every(m => m.ok && m.nested)) {
      chosen.solved.forEach((g, i) => { g.m = re[i]; g.metres = g.lays * g.plies * (re[i].markerLengthCm * gain + endLossCm) / 100; });
      chosen.metres = chosen.solved.reduce((a, g) => a + g.metres, 0);
    }
  }
  const groups = chosen.solved.map(g => ({
    sizes: g.sizes, lays: g.lays, plies: g.plies, ratio: g.ratio,
    placed: g.m.placed, nested: g.m.nested, edgeCm: g.m.edgeCm, usableWidthCm: g.m.usableWidthCm, fabricWidthCm, nestingGainPct,
    markerLengthCm: round1(g.m.markerLengthCm * gain), utilisationPct: g.m.utilisationPct,
    metres: round2(g.metres), extraPieces: Object.fromEntries(Object.entries(g.ratio).map(([s, r]) => [s, r * g.lays * g.plies - want[s]]).filter(([, v]) => v > 0)),
  }));
  const over = Object.assign({}, ...groups.map(g => g.extraPieces));
  const area = chosen.solved.reduce((a, g) => a + g.m.utilisationPct * g.lays * g.plies * g.m.markerLengthCm, 0) / chosen.solved.reduce((a, g) => a + g.lays * g.plies * g.m.markerLengthCm, 0);
  const notes = [];
  if (Object.keys(over).length) notes.push(`Rounding a ratio up cuts spares: ${Object.entries(over).map(([s, v]) => `${v} ${s}`).join(", ")}. They are in the cloth to buy; keep them as stock or trim the order.`);
  if (area < 75) notes.push(`Only ${round1(area)}% of the cloth is covered by pattern pieces; a CAD marker nests the curves and usually does better.`);
  const isNested = groups.every(g => g.nested);
  notes.push(isNested ? "Pieces are the drafted outlines laid on the grain by a greedy raster nest; a CAD marker usually does a few points better. It is not the factory's cutting plan." : "Pieces are rectangles on the grain, so this errs towards more cloth than a CAD marker. It is not the factory's cutting plan.");
  return {
    ok: true,
    pieces: total,
    groups,
    utilisationPct: round1(area),
    nested: isNested,
    metresToBuy: round2(chosen.metres),
    metresPerPiece: round2(chosen.metres / total),
    extraPieces: over,
    notes,
  };
}

const escXml = v => String(v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * One group's marker drawn to scale as SVG: the cloth, its selvedge margins and
 * every rectangle where the packer put it, labelled with size and piece.
 * The drawing is the rectangle packing; a nesting gain shortens the quoted
 * length but not the drawing, and the caption says so.
 */
export function markerSvg(group, { pxPerCm = 3 } = {}) {
  if (group && group.nested) return nestSvg(group.nested, { pxPerCm });
  if (!group || !Array.isArray(group.placed)) return "";
  const W = group.fabricWidthCm, edge = group.edgeCm ?? 0;
  const L = Math.max(...group.placed.map(p => p.y + p.l), 0);
  const palette = ["#e8d5b5", "#c9d8c5", "#d6c4de", "#f0c9c0", "#bcd4e6", "#e9e1a8", "#d9d9d9", "#f3d3a2"];
  const sizes = Object.keys(group.ratio || {});
  const fill = s => palette[Math.max(0, sizes.indexOf(s)) % palette.length];
  const rects = group.placed.map(p => {
    const w = p.w * pxPerCm, h = p.l * pxPerCm;
    const label = w > 38 && h > 14 ? `<text x="${(edge + p.x) * pxPerCm + w / 2}" y="${p.y * pxPerCm + h / 2 + 3}" font-size="9" text-anchor="middle" fill="#333">${escXml(p.size)} ${escXml(p.name)}</text>` : "";
    return `<rect x="${(edge + p.x) * pxPerCm}" y="${p.y * pxPerCm}" width="${w}" height="${h}" fill="${fill(p.size)}" stroke="#555" stroke-width="0.6"><title>${escXml(p.size)} ${escXml(p.name)}: ${p.w} x ${p.l} cm</title></rect>${label}`;
  }).join("");
  const pw = W * pxPerCm, ph = L * pxPerCm;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pw} ${ph}" width="${pw}" height="${ph}" role="img" aria-label="Cutting marker, ${W} cm cloth, ${round1(L)} cm long, rectangles on the grain"><rect width="${pw}" height="${ph}" fill="#fbf8f1" stroke="#999"/><rect x="0" width="${edge * pxPerCm}" height="${ph}" fill="#e5e0d4"/><rect x="${(W - edge) * pxPerCm}" width="${edge * pxPerCm}" height="${ph}" fill="#e5e0d4"/>${rects}</svg>`;
}

const csvCell = v => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/** A cut ticket for the factory: one row per lay group, one per size in its ratio. */
export function cutTicketCsv(plan) {
  if (!plan || !plan.ok) return "";
  const rows = [["group", "size", "pieces_per_marker", "lays", "plies", "garments_cut", "wanted", "spares", "marker_cm", "cloth_m"]];
  plan.groups.forEach((g, i) => {
    for (const [size, r] of Object.entries(g.ratio)) {
      const cut = r * g.lays * g.plies, spare = g.extraPieces[size] || 0;
      rows.push([i + 1, size, r, g.lays, g.plies, cut, cut - spare, spare, g.markerLengthCm, g.metres]);
    }
  });
  rows.push(["total", "", "", "", "", "", plan.pieces, Object.values(plan.extraPieces).reduce((a, b) => a + b, 0), "", plan.metresToBuy]);
  return rows.map(r => r.map(csvCell).join(",")).join("\n") + "\n";
}
