// From DXF files to a cut-ready nest: read, find the parts, nest, check,
// report, and write the sheets back out as DXF and SVG.

import { parseDxf, writeDxf, previewPoints } from "./dxf.mjs";
import { chain, partsFromLoops, rectEdges, circleEdge, polyEdges, finishPart, partRings } from "./geom.mjs";
import { nest, verify, report, placedEdges } from "./nest.mjs";

/**
 * Read one DXF file into parts. Each closed outline (with the holes inside it)
 * is one part; identical parts in a file are not merged (give each a quantity).
 */
export function partsFromDxf(text, fileName = "part", { tol = 0.01, joinTol, skipLayers = null } = {}) {
  const d = parseDxf(text, { tol, skipLayers });
  if (!d.edges.length) return { ok: false, error: d.warnings.join(" ") || "No geometry found.", ...d };
  let ext = 0;
  for (const e of d.edges) {
    const v = e.t === "L" ? Math.max(Math.abs(e.x1), Math.abs(e.y1), Math.abs(e.x2), Math.abs(e.y2)) : Math.abs(e.cx) + Math.abs(e.cy) + e.r;
    ext = Math.max(ext, v);
  }
  const jt = joinTol > 0 ? joinTol : Math.max(1e-6, ext * 1e-6, tol / 10);
  const { loops, chains } = chain(d.edges, jt);
  const { parts, strayChains } = partsFromLoops(loops, chains, tol, jt);
  const warnings = d.warnings.slice();
  if (strayChains) warnings.push(`${strayChains} open contour${strayChains > 1 ? "s" : ""} (lines that do not close and are not inside a part) skipped. A part's outline must be closed to be nested; a gap larger than ${fmt(jt)} between ends breaks it.`);
  const skippedList = Object.entries(d.skipped).map(([k, v]) => `${v} ${k}`);
  if (skippedList.length) warnings.push(`Not read: ${skippedList.join(", ")}.`);
  const base = fileName.replace(/\.dxf$/i, "");
  return {
    ok: parts.length > 0,
    error: parts.length ? null : "No closed outlines found. " + warnings.join(" "),
    units: d.units,
    insunits: d.insunits,
    layers: d.layers,
    warnings,
    parts: parts.map((p, i) => ({ name: parts.length > 1 ? `${base} #${i + 1}` : base, part: p })),
  };
}

const fmt = (x) => String(Math.round(x * 1e6) / 1e6);

/** A worked example in millimetres: flanges, gussets, brackets and washers for a 1250 x 2500 mm sheet. */
export function exampleParts(tol = 0.01) {
  const flange = () => {
    // 200 mm square plate, R20 corners, 110 mm bore, four 14 mm bolt holes on a 150 mm square
    const r = 20, w = 200;
    const out = [
      { t: "L", x1: r, y1: 0, x2: w - r, y2: 0 },
      { t: "A", cx: w - r, cy: r, r, a0: -Math.PI / 2, sw: Math.PI / 2 },
      { t: "L", x1: w, y1: r, x2: w, y2: w - r },
      { t: "A", cx: w - r, cy: w - r, r, a0: 0, sw: Math.PI / 2 },
      { t: "L", x1: w - r, y1: w, x2: r, y2: w },
      { t: "A", cx: r, cy: w - r, r, a0: Math.PI / 2, sw: Math.PI / 2 },
      { t: "L", x1: 0, y1: w - r, x2: 0, y2: r },
      { t: "A", cx: r, cy: r, r, a0: Math.PI, sw: Math.PI / 2 },
    ];
    const holes = [[circleEdge(100, 100, 55)], ...[[25, 25], [175, 25], [175, 175], [25, 175]].map(([x, y]) => [circleEdge(x, y, 7)])];
    return finishPart({ outer: out, holes, marks: [] }, tol);
  };
  const gusset = () => finishPart({ outer: polyEdges([[0, 0], [300, 0], [300, 40], [40, 300], [0, 300]]), holes: [[circleEdge(60, 60, 9)]], marks: [] }, tol);
  const bracket = () =>
    // L bracket 250 x 160, 60 wide legs, two slots drawn as circles
    finishPart({ outer: polyEdges([[0, 0], [250, 0], [250, 60], [60, 60], [60, 160], [0, 160]]), holes: [[circleEdge(200, 30, 8)], [circleEdge(30, 120, 8)]], marks: [] }, tol);
  const washer = () => finishPart({ outer: [circleEdge(40, 40, 40)], holes: [[circleEdge(40, 40, 17)]], marks: [] }, tol);
  const plate = () => finishPart({ outer: rectEdges(0, 0, 600, 140), holes: [[circleEdge(40, 70, 11)], [circleEdge(560, 70, 11)]], marks: [] }, tol);
  return [
    { name: "Flange 200", part: flange(), qty: 12 },
    { name: "Gusset 300", part: gusset(), qty: 16 },
    { name: "Bracket 250x160", part: bracket(), qty: 10 },
    { name: "Washer 80", part: washer(), qty: 30 },
    { name: "Base plate 600x140", part: plate(), qty: 4 },
  ];
}

/**
 * Remnants from a DXF: each closed outline (with its cut-outs) is one
 * remnant sheet, in the drawing's units, moved so its bounding box starts at
 * (0, 0). Returns { ok, error, remnants: [{ name, outline, qty: 1 }], warnings }.
 */
export function remnantsFromDxf(text, fileName = "remnant", { tol = 0.01 } = {}) {
  const r = partsFromDxf(text, fileName, { tol });
  if (!r.ok) return { ok: false, error: r.error, remnants: [], warnings: r.warnings || [] };
  const remnants = r.parts.map((p) => ({ name: p.name, outline: partRings(p.part, tol), qty: 1 }));
  return { ok: true, remnants, warnings: r.warnings, insunits: r.insunits };
}

/**
 * The worked example's offcut, as DXF (mm): a 1600 x 1000 sheet end with a
 * 700 x 450 corner already cut away and a 250 mm hole where a disc came out.
 */
export function exampleRemnantDxf() {
  const outer = polyEdges([[0, 0], [1600, 0], [1600, 550], [900, 550], [900, 1000], [0, 1000]]);
  return writeDxf([{ layer: "REMNANT", edges: [...outer, circleEdge(400, 450, 125)] }], 4);
}

/**
 * Stock lines as text, one per line: "LENGTH x WIDTH [x QTY] [name]", e.g.
 * "1200 x 800 x 2 offcut rack A" or "2500x1250" (no quantity: unlimited).
 * Returns { ok, error, stock }.
 */
export function parseStock(text) {
  const stock = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const [n, raw] of lines.entries()) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = /^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*[x×*]\s*(\d+))?(?:\s+(.+))?$/i.exec(line);
    if (!m) return { ok: false, error: `Stock line ${n + 1} ("${raw.trim()}"): write it as LENGTH x WIDTH, optionally x QUANTITY and a name, e.g. 1200 x 800 x 2 offcut A.` };
    stock.push({ w: parseFloat(m[1]), h: parseFloat(m[2]), qty: m[3] ? parseInt(m[3], 10) : Infinity, name: m[4] ? m[4].trim() : undefined });
  }
  return { ok: true, stock };
}

/**
 * Nest a job. items: [{ name, part, qty }]. Returns the nest, its check, the
 * report, and functions to write each sheet.
 */
export function runJob(items, opts) {
  const list = items.filter((x) => x.qty > 0).map((x, i) => ({ id: i, name: x.name, qty: Math.floor(x.qty), part: x.part }));
  if (!list.length) return { ok: false, error: "Give at least one part a quantity of 1 or more." };
  const total = list.reduce((s, x) => s + x.qty, 0);
  if (total > 5000) return { ok: false, error: "More than 5,000 parts in one job; split it." };
  const result = nest(list, opts);
  if (!result.ok) return result;
  const parts = new Map(list.map((x) => [x.id, x.part]));
  const check = verify(result, parts);
  const rep = report(result, parts);
  return { ok: true, result, check, report: rep, parts };
}

/** One sheet as DXF groups: SHEET outline, CUT (outer and holes), MARK (open contours). */
export function sheetGroups(job, si, offsetY = 0) {
  const { result, parts } = job;
  const s = result.sheets[si];
  const sheet = s.outline
    ? s.outline.flatMap((r) => polyEdges(r.map(([x, y]) => [x, y + offsetY])))
    : rectEdges(0, offsetY, s.w ?? result.sheetW, s.h ?? result.sheetH);
  const cut = [], inner = [], mark = [];
  for (const pl of s.placements) {
    const e = placedEdges(parts.get(pl.id), { ...pl, ty: pl.ty + offsetY }, result.tol);
    cut.push(...e.outer);
    for (const h of e.holes) inner.push(...h);
    for (const h of e.marks) mark.push(...h);
  }
  return [
    { layer: "SHEET", edges: sheet },
    { layer: "CUT_INNER", edges: inner },
    { layer: "CUT_OUTER", edges: cut },
    { layer: "MARK", edges: mark },
  ];
}

export function sheetDxf(job, si, insunits = 0) {
  return writeDxf(sheetGroups(job, si), insunits);
}

/** Every sheet in one file, stacked with a gap of a tenth of a sheet. */
export function allSheetsDxf(job, insunits = 0) {
  const { result } = job;
  const groups = [];
  let y = 0;
  result.sheets.forEach((s, i) => {
    groups.push(...sheetGroups(job, i, y));
    y += (s.h ?? result.sheetH) * 1.1;
  });
  return writeDxf(groups, insunits);
}

/** SVG of one sheet, y up as in the DXF. */
export function sheetSvg(job, si, { px = 900 } = {}) {
  const { result, parts } = job;
  const s = result.sheets[si], W = s.w ?? result.sheetW, H = s.h ?? result.sheetH;
  const scale = px / W;
  const tol = Math.max(result.tol, W / 2000);
  const P = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * scale).toFixed(2)} ${((H - y) * scale).toFixed(2)}`).join("");
  const palette = ["#cfe3f7", "#f7dccf", "#d6efd2", "#efd6ee", "#f3edc4", "#d4eeee", "#e8dcc8"];
  let body = "";
  for (const pl of s.placements) {
    const e = placedEdges(parts.get(pl.id), pl, tol);
    const d = P(previewPoints(e.outer, tol)) + "Z" + e.holes.map((h) => P(previewPoints(h, tol)) + "Z").join("");
    const marks = e.marks.map((h) => P(previewPoints(h, tol))).join("");
    const fill = palette[pl.id % palette.length];
    body += `<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="#1d2b3a" stroke-width="0.8"><title>${esc(pl.name)} #${pl.copy + 1}, turned ${pl.angle}°</title></path>`;
    if (marks) body += `<path d="${marks}" fill="none" stroke="#b5482a" stroke-width="0.6"/>`;
  }
  const used = s.usedLength * scale;
  const label = `Sheet ${si + 1}${s.name ? ` (${esc(s.name)})` : ""}: ${s.placements.length} parts`;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(W * scale).toFixed(1)} ${(H * scale).toFixed(1)}" role="img" aria-label="${label}">`;
  if (s.outline) {
    // a remnant: its outline (and cut-outs) drawn as the sheet
    const d = s.outline.map((r) => P(r) + "Z").join("");
    return `${open}<path d="${d}" fill="#fafbfc" fill-rule="evenodd" stroke="#7b8794" stroke-width="1"/>${body}</svg>`;
  }
  return `${open}<rect width="${(W * scale).toFixed(1)}" height="${(H * scale).toFixed(1)}" fill="#fafbfc" stroke="#7b8794"/><rect x="${used.toFixed(1)}" width="${Math.max(0, W * scale - used).toFixed(1)}" height="${(H * scale).toFixed(1)}" fill="#eef3e6"/>${body}</svg>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** The report as CSV, one row per sheet. */
export function reportCsv(job, unit = "") {
  const rows = [["sheet", "stock", `sheet_area_${unit || "units"}2`, "parts", `used_length_${unit || "units"}`, "utilisation_pct", "utilisation_of_used_pct", `cut_length_${unit || "units"}`, "pierces", "part_counts"]];
  for (const s of job.report.sheets) {
    rows.push([s.sheet, s.stock ?? "", s.sheetArea.toFixed(0), s.parts, s.usedLength.toFixed(2), (s.utilisation * 100).toFixed(1), (s.utilisationOfUsed * 100).toFixed(1), s.cutLength.toFixed(1), s.pierces, Object.entries(s.counts).map(([k, v]) => `${v}x ${k}`).join("; ")]);
  }
  const q = (v) => {
    let t = String(v);
    if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t; // keep spreadsheet formulas out
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
