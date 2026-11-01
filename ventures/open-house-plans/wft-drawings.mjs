// Vendored from ventures/wall-framing-takeoff/drawings.mjs by vendor-framing.mjs; edit the source, then run it.
// Shop drawings: one sheet per wall, a dimensioned elevation with a mark on
// every member, the plate joints and a parts table, for a crew or a panel shop
// to build from. Pure functions (no DOM): the page, the CLI and agents share them.
// Inches throughout; the drawing is a plan-derived picture, not engineering.
import { formatLength, formatInches, verifyWall } from "./wft-engine.mjs";
import { panelizeWall, panelParts } from "./wft-panels.mjs";

const PREFIX = { plate: "P", stud: "S", king: "K", jack: "J", header: "H", cripple: "C", sill: "L", blocking: "B" };
const FILL = { plate: "#a3824f", stud: "#d9b97c", king: "#c48a3a", jack: "#8d6a2f", header: "#6f4e22", cripple: "#e4cf9f", sill: "#b88d4a", blocking: "#c9b48a" };

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r3 = (n) => Math.round(n * 1000) / 1000;
const sixteenth = (n) => Math.round(n * 16);

/**
 * Give every member of a wall a mark. Members of the same kind, lumber size, length
 * and label share a mark (S1, S2 ... in order of first appearance, left to right),
 * so the parts table has one row per mark and the crew cuts a mark once per count.
 * @param {{members: any[]}} w a laid-out wall
 * @returns {{marks: any[], parts: {mark: string, qty: number, size: string, length: number, label: string, kind: string}[]}}
 */
export function markMembers(w) {
  const order = w.members.map((m, i) => ({ m, i })).sort((a, b) => a.m.x - b.m.x || a.m.y - b.m.y || a.i - b.i);
  const keyToMark = new Map();
  const count = {};
  const parts = [];
  const marks = new Array(w.members.length);
  for (const { m, i } of order) {
    const base = m.label.replace(/ply, .*$/, "ply").replace(/, .*$/, "");
    const key = [m.kind, m.size, sixteenth(m.length), base, m.sloped ? "s" : ""].join("|");
    let mark = keyToMark.get(key);
    if (!mark) {
      const p = PREFIX[m.kind] || "X";
      count[p] = (count[p] || 0) + 1;
      mark = `${p}${count[p]}`;
      keyToMark.set(key, mark);
      parts.push({ mark, qty: 0, size: m.size, length: m.length, label: base, kind: m.kind });
    }
    parts.find((p) => p.mark === mark).qty++;
    marks[i] = mark;
  }
  return { marks, parts };
}

/** A member's outline: a rectangle, or a parallelogram for a plate that follows a gable's slope. */
function shape(m, H, peak) {
  const X = (v) => r3(v);
  const Y = (v) => r3(H - v);
  if (m.sloped) {
    const t = 1.5;
    const rising = m.x < peak - 1e-6;
    const pts = rising
      ? [[m.x, m.y], [m.x + m.w, m.y + m.h], [m.x + m.w, m.y + m.h + t], [m.x, m.y + t]]
      : [[m.x, m.y + m.h], [m.x + m.w, m.y], [m.x + m.w, m.y + t], [m.x, m.y + m.h + t]];
    return { tag: "polygon", attrs: `points="${pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")}"`, cx: m.x + m.w / 2, cy: m.y + m.h / 2 + t / 2 };
  }
  return { tag: "rect", attrs: `x="${X(m.x)}" y="${Y(m.y + m.h)}" width="${X(m.w)}" height="${X(m.h)}"`, cx: m.x + m.w / 2, cy: m.y + m.h / 2 };
}

/**
 * The elevation of one wall as a standalone SVG: members drawn to scale and marked,
 * rough openings dashed and labelled, plate joints in red, and a dimension chain
 * under the wall for the left edge of every full-height stud and opening edge.
 * @param {any} w laid-out wall from takeoff()
 * @param {any} wall the plan's wall (for rough openings)
 * @param {{defaultHeaderHeight?: number}} plan
 * @param {{panels: any[]}|null} [sheathing] when given (a wall of `sheathe()`'s result), each sheet is outlined in green with its mark (e.g. W1-2); gable walls carry no sheet heights and draw none
 * @param {ReturnType<typeof panelizeWall>|null} [panels] when given, panel joints are drawn as purple dash-dot lines with a letter per panel
 */
export function wallElevationSvg(w, wall, plan = {}, panels = null, sheathing = null) {
  const H = w.height;
  const L = w.length;
  const { marks } = markMembers(w);
  const peak = w.gable?.peak ?? L / 2;
  const padL = 14, padR = 14, padT = panels ? 22 : 14, padB = 46;
  const members = w.members.map((m, i) => {
    const s = shape(m, H, peak);
    const tiny = (m.kind === "plate" ? m.h : Math.min(m.w, m.h)) < 3;
    // one label per mark run is plenty: label studs/cripples/jacks/kings upright, headers and plates along
    const label = m.orient === "v" && m.h >= 14 ? `<text x="${r3(s.cx)}" y="${r3(H - s.cy)}" transform="rotate(-90 ${r3(s.cx)} ${r3(H - s.cy)})" class="mk">${marks[i]}</text>` : m.orient === "h" && m.w >= 14 && !tiny ? `<text x="${r3(s.cx)}" y="${r3(H - s.cy + 1.6)}" class="mk">${marks[i]}</text>` : "";
    return `<${s.tag} ${s.attrs} fill="${FILL[m.kind] || "#ccc"}" stroke="#3b2d14" stroke-width="0.3"><title>${esc(marks[i])} ${esc(m.size)} ${esc(m.label)}: ${esc(formatInches(m.length))}</title></${s.tag}>${label}`;
  }).join("");

  const headerH = plan.defaultHeaderHeight ?? 82.5;
  const openings = (wall?.openings || []).map((o) => {
    const top = o.headerHeight ?? headerH;
    const x = o.offset, y = H - top;
    return `<rect x="${x}" y="${r3(y)}" width="${o.width}" height="${o.height}" fill="none" stroke="#1d5c7a" stroke-dasharray="3 2" stroke-width="0.7"/>`
      + `<text x="${r3(x + o.width / 2)}" y="${r3(y + o.height / 2)}" class="ro">${esc(o.label || o.kind)}</text>`
      + `<text x="${r3(x + o.width / 2)}" y="${r3(y + o.height / 2 + 5)}" class="ro sm">${esc(formatInches(o.width))} x ${esc(formatInches(o.height))}</text>`;
  }).join("");

  const joints = Object.entries(w.joints || {}).flatMap(([k, list]) => list.map((j) => {
    const y = k === "bottom" ? H - 1.5 : k === "top" ? 1.5 : 0;
    const yy = w.gable && k !== "bottom" ? null : y;
    return yy === null ? "" : `<line x1="${j}" x2="${j}" y1="${yy - 1}" y2="${yy + 2.5}" stroke="#b3261e" stroke-width="0.9"/>`;
  })).join("");

  // Dimension chain: consecutive full-height verticals' left edges, plus opening edges, under the wall.
  const stops = new Set([0, L]);
  for (const m of w.members) if (m.orient === "v" && (m.kind === "stud" || m.kind === "king")) stops.add(r3(m.x));
  const xs = [...stops].sort((a, b) => a - b);
  const baseY = H + 8;
  const ticks = xs.map((x) => `<line x1="${x}" x2="${x}" y1="${H + 2}" y2="${baseY + 3}" class="dim"/>`).join("");
  const chain = xs.slice(1).map((x, i) => {
    const a = xs[i];
    const d = x - a;
    return d >= 9 ? `<text x="${r3((a + x) / 2)}" y="${baseY}" class="dt">${esc(formatInches(d))}</text>` : "";
  }).join("");
  const overall = `<line x1="0" x2="${L}" y1="${baseY + 12}" y2="${baseY + 12}" class="dim"/><line x1="0" x2="0" y1="${baseY + 9}" y2="${baseY + 15}" class="dim"/><line x1="${L}" x2="${L}" y1="${baseY + 9}" y2="${baseY + 15}" class="dim"/><text x="${r3(L / 2)}" y="${baseY + 22}" class="dt big">${esc(w.id)}: ${esc(formatLength(L))} overall</text>`;
  const hdim = `<line x1="-6" x2="-6" y1="0" y2="${H}" class="dim"/><text x="-8" y="${r3(H / 2)}" transform="rotate(-90 -8 ${r3(H / 2)})" class="dt">${esc(formatInches(H))}</text>`;

  const panelLines = !panels ? "" : panels.cuts.map((c) => `<line x1="${c}" x2="${c}" y1="-4" y2="${H + 2}" stroke="#6a2c91" stroke-width="0.8" stroke-dasharray="4 1.5 1 1.5"/>`).join("")
    + panels.panels.map((p) => `<text x="${r3((p.x0 + p.x1) / 2)}" y="-5" class="pn">Panel ${esc(p.name)}</text>`).join("");

  const sheetBoxes = (sheathing?.panels || []).filter((p) => Number.isFinite(p.y0) && p.height > 0).map((p) => {
    const x0 = Math.max(0, p.x0), x1 = Math.min(L, p.x0 + p.width);
    if (x1 - x0 <= 0) return "";
    const y = H - (p.y0 + p.height);
    return `<rect x="${r3(x0)}" y="${r3(y)}" width="${r3(x1 - x0)}" height="${r3(p.height)}" fill="none" stroke="#2e7d32" stroke-width="0.5" stroke-dasharray="6 2"><title>Sheet ${esc(p.id)}: ${esc(formatInches(p.width))} x ${esc(formatInches(p.height))}</title></rect><text x="${r3((x0 + x1) / 2)}" y="${r3(y + 5)}" class="sh">${esc(p.id)}</text>`;
  }).join("");

  const vb = `${-padL} ${-padT} ${r3(L + padL + padR)} ${r3(H + padT + padB)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Shop drawing of wall ${esc(w.id)}, ${esc(formatLength(L))} long, ${esc(formatInches(H))} high">`
    + `<style>.mk{font:3.4px sans-serif;text-anchor:middle;dominant-baseline:middle;fill:#1b1306}.ro{font:4.4px sans-serif;text-anchor:middle;fill:#1d5c7a}.ro.sm{font-size:3.4px}.dt{font:3.6px sans-serif;text-anchor:middle;fill:#222}.dt.big{font-size:5px;font-weight:700}.dim{stroke:#444;stroke-width:0.3}.sh{font:3.6px sans-serif;text-anchor:middle;fill:#2e7d32;font-weight:700}.pn{font:4px sans-serif;text-anchor:middle;fill:#6a2c91;font-weight:700}</style>`
    + `${members}${openings}${joints}${sheetBoxes}${panelLines}${ticks}${chain}${overall}${hdim}</svg>`;
}

/**
 * One shop panel of a wall as its own SVG: the wall elevation cropped to the panel's span
 * (plates and openings are clipped at the cut lines) with the panel's name and width on top.
 */
export function panelElevationSvg(w, wall, plan, pan, k) {
  const p = pan.panels[k];
  const svg = wallElevationSvg(w, wall, plan, pan);
  const H = w.height;
  const vb = `${r3(p.x0 - 1)} -22 ${r3(p.width + 2)} ${r3(H + 22 + 46)}`;
  const label = `<text x="${r3((p.x0 + p.x1) / 2)}" y="${r3(H + 30)}" style="font:5px sans-serif;text-anchor:middle;font-weight:700">${esc(w.id)} panel ${esc(p.name)}: ${esc(formatLength(p.width))}</text>`;
  return svg.replace(/<text [^>]*class="dt big">[^<]*<\/text>/, "").replace(/viewBox="[^"]*"/, `viewBox="${vb}"`).replace(/aria-label="[^"]*"/, `aria-label="Shop drawing of panel ${esc(p.name)} of wall ${esc(w.id)}, ${esc(formatLength(p.width))} wide"`).replace("</svg>", `${label}</svg>`);
}

/** The parts table of one wall as HTML. */
export function partsTableHtml(w) {
  const { parts } = markMembers(w);
  return `<table><thead><tr><th>Mark</th><th class="n">Qty</th><th>Size</th><th class="n">Cut length</th><th>Member</th></tr></thead><tbody>`
    + parts.map((p) => `<tr><td><b>${esc(p.mark)}</b></td><td class="n">${p.qty}</td><td>${esc(p.size)}</td><td class="n">${esc(formatInches(p.length))}</td><td>${esc(p.label)}</td></tr>`).join("")
    + `</tbody></table>`;
}

/** Panel table: letter, span, width and the members each shop panel carries. */
function panelTableHtml(w, pan, max, wall = {}, psf = 0) {
  const parts = panelParts(w, pan, { sheathPsf: psf, openings: wall.openings });
  const rows = pan.panels.map((p, k) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(formatLength(p.x0))} to ${esc(formatLength(p.x1))}</td><td class="n">${esc(formatLength(p.width))}${p.over ? ' <span class="err">over limit</span>' : ""}</td><td class="n">${parts[k].pieceCount}</td><td class="n">${parts[k].lb} lb</td>${psf > 0 ? `<td class="n">${parts[k].sheathLb} lb</td><td class="n">${parts[k].totalLb} lb</td>` : ""}</tr>`).join("");
  const cutLists = parts.map((p) => `<h3>Panel ${esc(p.name)} cut list</h3><table><thead><tr><th class="n">Qty</th><th>Size</th><th class="n">Cut length</th><th>Member</th></tr></thead><tbody>${p.pieces.map((x) => `<tr><td class="n">${x.qty}</td><td>${esc(x.size)}</td><td class="n">${esc(formatInches(x.length))}</td><td>${esc(x.label)}</td></tr>`).join("")}</tbody></table>`).join("");
  return `<h2>Shop panels (up to ${esc(formatLength(max))})</h2><table><thead><tr><th>Panel</th><th>Span</th><th class="n">Width</th><th class="n">Pieces</th><th class="n">Lumber weight</th>${psf > 0 ? '<th class="n">Sheathing</th><th class="n">Total</th>' : ""}</tr></thead><tbody>${rows}</tbody></table>`
    + `<p class="chk">Cuts (purple) fall only where no stud, king, jack, cripple, header, sill or block crosses; plates are cut to panel length and the adjoining end studs are nailed together on site. ${psf > 0 ? `Weights: lumber SPF 28 lb/ft3, treated plate 40 lb/ft3; sheathing ${psf} lb per sq ft over the panel less the openings in it` : "Weights are lumber only (SPF 28 lb/ft3, treated plate 40 lb/ft3), before sheathing"}, before nails and connectors; a handling estimate, not a lifting plan.${pan.over ? ' <span class="err">At least one panel is over the limit: no clear cut line exists within it (a wide opening).</span>' : ""}</p>`
    + cutLists;
}

/** One printable sheet per shop panel: cropped elevation, weight and its own cut list. */
function panelSheetsHtml(w, wall, plan, pan, psf) {
  const parts = panelParts(w, pan, { sheathPsf: psf, openings: wall.openings });
  return pan.panels.map((p, k) => `<section class="sheet"><h1>${esc(w.id)} panel ${esc(p.name)}</h1><p class="sub">Panel ${k + 1} of ${pan.panels.length} of wall ${esc(w.id)} &middot; ${esc(formatLength(p.x0))} to ${esc(formatLength(p.x1))} from the wall start &middot; ${esc(formatLength(p.width))} wide &middot; ${esc(formatInches(w.height))} high${p.over ? ' &middot; <span class="err">over limit</span>' : ""} &middot; ${parts[k].pieceCount} pieces, ${psf > 0 ? parts[k].totalLb : parts[k].lb} lb</p>`
    + panelElevationSvg(w, wall, plan, pan, k)
    + `<h2>Cut list</h2><table><thead><tr><th class="n">Qty</th><th>Size</th><th class="n">Cut length</th><th>Member</th></tr></thead><tbody>${parts[k].pieces.map((x) => `<tr><td class="n">${x.qty}</td><td>${esc(x.size)}</td><td class="n">${esc(formatInches(x.length))}</td><td>${esc(x.label)}</td></tr>`).join("")}</tbody></table>`
    + `<p class="chk">Weights are a handling estimate (SPF 28 lb/ft3, treated plate 40 lb/ft3), not a lifting plan. Adjoining end studs are nailed together on site.</p><p class="foot">${esc(DISCLAIMER)}</p></section>`).join("");
}

const CSS = `body{font:14px/1.4 system-ui,sans-serif;margin:0;color:#1b1b1b;background:#fff}
.sheet{padding:14mm 12mm;page-break-after:always;break-after:page}.sheet:last-child{page-break-after:auto;break-after:auto}
h1{font-size:20px;margin:0 0 2px}h2{font-size:15px;margin:14px 0 4px}.sub{color:#555;margin:0 0 8px}
svg{width:100%;height:auto;border:1px solid #ccc;background:#fffdf8}
table{border-collapse:collapse;margin:6px 0;min-width:60%}th,td{border:1px solid #bbb;padding:3px 8px;text-align:left}td.n,th.n{text-align:right}
.chk{font-size:12px;color:#333}.err{color:#b3261e}.foot{font-size:11px;color:#555;margin-top:10px;border-top:1px solid #ccc;padding-top:6px}
@page{size:landscape;margin:8mm}`;

const DISCLAIMER = "No warranty. These drawings are a plan-derived picture of the layout you entered, not engineering, construction or building-code advice and not stamped; header sizes, jack counts and spacing are your inputs and are not checked against a span table or code. Check every dimension against your plans and your engineer before cutting or buying. To the maximum extent permitted by law the authors accept no liability for loss or damage arising from their use.";

/**
 * The whole drawing set as one printable HTML document, one sheet per wall.
 * @param {{ok: boolean, walls: any[]}} result from takeoff()
 * @param {any} plan the plan that produced it
 * @param {{title?: string, panelMax?: number, sheathPsf?: number, panelSheets?: boolean}} [opts] panelSheets (with panelMax) adds one sheet per panel; panelMax (inches) splits each wall into shop panels no longer than that; sheathPsf (lb per sq ft) adds sheathing weight to each panel
 */
export function drawingSetHtml(result, plan, opts = {}) {
  const title = opts.title || "Wall framing shop drawings";
  const sheets = result.walls.map((w, i) => {
    const wall = plan.walls[i];
    const problems = verifyWall(w, wall);
    const joints = ["bottom", "top", "cap"].map((k) => `${k} ${(w.joints?.[k] || []).map(formatLength).join(", ") || "none"}`).join("; ");
    const pan = opts.panelMax > 0 ? panelizeWall(w, opts.panelMax) : null;
    return `<section class="sheet"><h1>${esc(w.id)}</h1><p class="sub">Sheet ${i + 1} of ${result.walls.length} &middot; ${esc(formatLength(w.length))} long &middot; ${esc(formatInches(w.height))} high &middot; ${esc(w.stud)} studs at ${esc(formatInches(plan.studSpacing))} centres${w.gable ? ` &middot; gable ${w.gable.pitch}/12` : ""}</p>`
      + wallElevationSvg(w, wall, plan, pan, result.sheathing?.walls?.find((x) => x.id === w.id) || null)
      + (pan ? panelTableHtml(w, pan, opts.panelMax, wall, opts.sheathPsf > 0 ? opts.sheathPsf : 0) : "")
      + `<h2>Parts</h2>${partsTableHtml(w)}`
      + `<p class="chk">Plate joints (red) from the wall start: ${esc(joints)}. ${problems.length ? `<span class="err">Layout check found ${problems.length} problem(s): ${problems.map(esc).join("; ")}</span>` : "Layout check passed: every member inside the wall, none overlapping, every plate joint over a full stud."}</p>`
      + (w.notes?.length ? `<p class="chk">${w.notes.map(esc).join(" ")}</p>` : "")
      + `<p class="foot">${esc(DISCLAIMER)}</p></section>`
      + (pan && opts.panelSheets ? panelSheetsHtml(w, wall, plan, pan, opts.sheathPsf > 0 ? opts.sheathPsf : 0) : "");
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${sheets.join("")}</body></html>`;
}
