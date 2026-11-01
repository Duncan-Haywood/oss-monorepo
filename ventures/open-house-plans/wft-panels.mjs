// Vendored from ventures/wall-framing-takeoff/panels.mjs by vendor-framing.mjs; edit the source, then run it.
// @ts-check
// Panelizing: split a laid-out wall into shop-built panels no longer than a
// limit (a truck bed, a table, what two people can carry), cutting only where
// no stud, king, jack, cripple, header, sill or block crosses the line, so
// every panel is built from whole members and the plates are cut to panel
// length. Fewest panels first, then the most even widths. Pure functions;
// inches throughout. A layout aid, not engineering: lifting, bracing and
// shipping are for the builder.
import { formatLength, DEPTH, mergeCuts, optimizeStock } from "./wft-engine.mjs";

const EPS = 1e-6;
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {{length: number, members: any[], id: string}} w laid-out wall from takeoff()
 * @param {number} maxWidth longest panel allowed, inches
 * @returns {{id: string, panels: {name: string, x0: number, x1: number, width: number, members: number[], over: boolean}[], cuts: number[], over: boolean}}
 */
export function panelizeWall(w, maxWidth) {
  const L = w.length;
  const framing = w.members.filter((m) => m.kind !== "plate");
  const edges = new Set();
  for (const m of framing) { edges.add(r3(m.x)); edges.add(r3(m.x + m.w)); }
  const open = (c) => c > EPS && c < L - EPS && framing.every((m) => !(m.x + EPS < c && c < m.x + m.w - EPS));
  const pts = [0, ...[...edges].filter(open).sort((a, b) => a - b), L];
  // best[j] = [panel count, sum of squared widths, previous index] to reach pts[j]
  const best = new Array(pts.length).fill(null);
  best[0] = [0, 0, -1];
  for (let j = 1; j < pts.length; j++) {
    for (let i = 0; i < j; i++) {
      if (!best[i]) continue;
      const width = pts[j] - pts[i];
      if (width > maxWidth + EPS && !(j === i + 1)) continue; // a wider hop is allowed only when no cut lies inside it
      const cand = [best[i][0] + 1, best[i][1] + width * width, i];
      if (!best[j] || cand[0] < best[j][0] || (cand[0] === best[j][0] && cand[1] < best[j][1] - EPS)) best[j] = cand;
    }
  }
  const idx = [];
  for (let j = pts.length - 1; j >= 0; j = best[j][2]) { idx.unshift(j); if (j === 0) break; }
  const cuts = idx.slice(1, -1).map((j) => pts[j]);
  const bounds = [0, ...cuts, L];
  const panels = bounds.slice(1).map((x1, k) => {
    const x0 = bounds[k];
    const members = w.members.map((m, i) => ({ m, i })).filter(({ m }) => {
      const c = m.x + m.w / 2;
      return c >= x0 - EPS && (c < x1 - EPS || (k === bounds.length - 2 && c <= x1 + EPS));
    }).map(({ i }) => i);
    return { name: String.fromCharCode(65 + (k % 26)) + (k >= 26 ? Math.floor(k / 26) : ""), x0, x1, width: r3(x1 - x0), members, over: x1 - x0 > maxWidth + EPS };
  });
  return { id: w.id, panels, cuts, over: panels.some((p) => p.over) };
}

/** A line per wall: panel names and widths, left to right. */
export function panelsText(set) {
  return set.map((s) => `${s.id}: ${s.panels.map((p) => `${p.name} ${formatLength(p.width)}${p.over ? " (OVER LIMIT: no cut line is clear)" : ""}`).join(" | ")}`);
}

// Weights are a handling estimate, not a load figure: kiln-dried SPF at about
// 28 lb/ft3 and treated bottom plates at about 40 lb/ft3 (wet treated stock
// runs heavier). Override with opts.pcf / opts.ptPcf.
export const SPF_PCF = 28;
export const PT_PCF = 40;
// Structural panels (7/16 in OSB, 1/2 in plywood) run about 1.4 to 1.6 lb per
// square foot; 1.5 is the figure to type when you have no data sheet.
export const SHEATH_PSF = 1.5;

/**
 * Per-panel parts: every framing member whole, every plate trimmed to the
 * panel's span, and the panel's lumber weight.
 * @param {{id: string, length: number, height?: number, gable?: any, members: any[]}} w laid-out wall from takeoff()
 * @param {ReturnType<typeof panelizeWall>} pan
 * With opts.sheathPsf (lb per sq ft of sheathing) each panel also carries the
 * sheathing on its span: width times wall height less the openings' rough
 * sizes inside the span (door and window height as typed; none on a gable
 * wall, whose triangle is not in the sheet order). opts.openings is the
 * wall's `openings` list from the plan.
 * @param {{pcf?: number, ptPcf?: number, sheathPsf?: number, openings?: {offset: number, width: number, height: number}[]}} [opts]
 * @returns {{name: string, width: number, pieces: {size: string, length: number, kind: string, label: string, qty: number}[], pieceCount: number, lb: number, sheathLb: number, totalLb: number}[]}
 */
export function panelParts(w, pan, opts = {}) {
  const pcf = opts.pcf ?? SPF_PCF, ptPcf = opts.ptPcf ?? PT_PCF;
  const weigh = (size, len) => {
    const base = size.split(" ")[0];
    const depth = DEPTH[base] ?? 3.5;
    return (1.5 * depth * len / 1728) * (/\bPT\b/.test(size) ? ptPcf : pcf);
  };
  return pan.panels.map((p) => {
    const rows = new Map();
    let lb = 0;
    const add = (m, len) => {
      const label = m.kind === "plate" ? m.label : m.label.replace(/,.*$/, "");
      const key = `${m.size}|${r3(len)}|${m.kind}|${label}`;
      const row = rows.get(key) || { size: m.size, length: r3(len), kind: m.kind, label, qty: 0 };
      row.qty++;
      rows.set(key, row);
      lb += weigh(m.size, len);
    };
    for (const i of p.members) if (w.members[i].kind !== "plate") add(w.members[i], w.members[i].length);
    for (const m of w.members) {
      if (m.kind !== "plate") continue;
      const a = Math.max(m.x, p.x0), b = Math.min(m.x + m.w, p.x1);
      // a plate on a gable's slope is measured along the slope: its run times the secant (length / w)
      if (b - a > EPS) add(m, m.sloped && m.w > 0 ? (b - a) * m.length / m.w : b - a);
    }
    const pieces = [...rows.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.length - a.length);
    let sheathLb = 0;
    const g = w.gable;
    if (opts.sheathPsf > 0 && w.height > 0 && (!g || g.eave > 0)) {
      let area = p.width * w.height;
      if (g) {
        // a gable wall is sheathed up to its roof line: the eave rectangle plus the triangle's area under this panel's span
        const mid = g.peak, L = w.length;
        const rise = (x) => (x <= mid ? g.peakRise * x / mid : g.peakRise * (L - x) / (L - mid));
        const tri = (a, b) => (b - a) * (rise(a) + rise(b)) / 2; // linear between a and b when both lie on one slope
        area = p.width * g.eave + (p.x1 <= mid || p.x0 >= mid ? tri(p.x0, p.x1) : tri(p.x0, mid) + tri(mid, p.x1));
      }
      for (const o of opts.openings || []) {
        const ov = Math.min(o.offset + o.width, p.x1) - Math.max(o.offset, p.x0);
        if (ov > EPS) area -= ov * Math.min(o.height, w.height);
      }
      sheathLb = Math.max(0, area) / 144 * opts.sheathPsf;
    }
    const r1 = (v) => Math.round(v * 10) / 10;
    return { name: p.name, width: p.width, pieces, pieceCount: pieces.reduce((t, x) => t + x.qty, 0), lb: r1(lb), sheathLb: r1(sheathLb), totalLb: r1(lb + sheathLb) };
  });
}

/**
 * The lumber order for the shop panels: every panel's pieces (plates trimmed
 * to panel length) pooled and cut from stock, beside the order for the same
 * house built as whole walls. Plates cut at the panel breaks pack differently
 * and each break costs a saw kerf, so the two orders can differ by a board.
 * Lengths round up to 1/16 in. Pass nailer cuts (nailerCuts()) as `extra`.
 * @param {{ok: boolean, walls: any[], orders: any[], summary: any}} result from takeoff()
 * @param {{stock: any[], kerf?: number}} plan
 * @param {number} panelMax longest panel, inches
 * @param {any[]} [extra] cuts to pool in unchanged
 */
export function panelOrder(result, plan, panelMax, extra = []) {
  const rows = [];
  const demand = new Map(); // size|length|kind -> [{panel, left}] in wall order
  const want = (panel, size, length, kind, qty) => {
    const key = `${size}|${length}|${kind}`;
    if (!demand.has(key)) demand.set(key, []);
    demand.get(key).push({ panel, left: qty });
  };
  const panelNames = [];
  let panels = 0, over = false;
  for (const w of result.walls) {
    const pan = panelizeWall(w, panelMax);
    over = over || pan.over;
    panels += pan.panels.length;
    for (const p of panelParts(w, pan)) {
      const name = `${w.id} ${p.name}`;
      panelNames.push(name);
      for (const x of p.pieces) {
        const length = Math.ceil(x.length * 16 - 1e-6) / 16;
        rows.push({ size: x.size, length, kind: x.kind, qty: x.qty, walls: [w.id] });
        want(name, x.size, length, x.kind, x.qty);
      }
    }
  }
  if (extra.length) panelNames.push(NAILERS);
  for (const e of extra) want(NAILERS, e.size, e.length, e.kind, e.qty);
  const cuts = mergeCuts([], [...rows, ...extra]);
  const orders = [], barsBySize = [];
  for (const size of [...new Set(cuts.map((c) => c.size))]) {
    const stock = plan.stock.filter((s) => s.size === size);
    const pieces = cuts.filter((c) => c.size === size).map((c) => ({ length: c.length, qty: c.qty, ref: c.kind }));
    const res = optimizeStock(pieces, stock, plan.kerf);
    const lines = new Map();
    for (const b of res.bars) {
      const key = `${b.length}|${b.label || ""}`;
      const row = lines.get(key) || { size, length: b.length, label: b.label || "", price: b.price, qty: 0 };
      row.qty++;
      lines.set(key, row);
    }
    barsBySize.push({ size, bars: res.bars });
    orders.push({ size, ...res, lines: [...lines.values()].sort((a, b) => b.length - a.length) });
  }
  const cost = orders.reduce((t, o) => t + o.cost, 0);
  const boards = orders.reduce((t, o) => t + o.bars.length, 0);
  const assignment = assignBoards(barsBySize, demand, panelNames);
  return { panels, over, cuts, orders, cost, boards, assignment, wholeWallCost: result.summary.cost, wholeWallBoards: result.summary.boards, extraCost: cost - result.summary.cost };
}

const NAILERS = "(sheathing nailers)";

/**
 * Hand each cut of each ordered board to the panel that needs that piece, so
 * a shop can build panel by panel. Greedy: a cut goes to a panel the board
 * already feeds when one still needs the piece (fewer boards walk between
 * stations), else to the panel with the most of that piece still to come.
 * Every piece of every panel is placed exactly once (the cut list is the sum
 * of the panels' pieces), so no panel is short.
 */
function assignBoards(barsBySize, demand, panelNames) {
  const byPanel = new Map(panelNames.map((n) => [n, []]));
  let shared = 0, boardCount = 0;
  for (const { size, bars } of barsBySize) {
    bars.forEach((b, bi) => {
      boardCount++;
      const fed = new Map();
      for (const c of b.cuts) {
        const slots = (demand.get(`${size}|${c.length}|${c.ref}`) || []).filter((d) => d.left > 0);
        if (!slots.length) continue;
        const pick = slots.find((d) => fed.has(d.panel)) || slots.reduce((a, d) => (d.left > a.left ? d : a));
        pick.left--;
        if (!fed.has(pick.panel)) fed.set(pick.panel, []);
        fed.get(pick.panel).push(c.length);
      }
      if (fed.size > 1) shared++;
      for (const [panel, lens] of fed) byPanel.get(panel).push({ size, board: bi + 1, boardLength: b.length, label: b.label || "", cuts: lens, sharedWith: fed.size - 1 });
    });
  }
  return { panels: [...byPanel].map(([panel, boards]) => ({ panel, boards })), sharedBoards: shared, boards: boardCount };
}

/** Text lines for panelOrder(). */
export function panelOrderText(po) {
  const lines = [`${po.panels} shop panels: ${po.boards} boards, cost ${po.cost.toFixed(2)} (whole walls: ${po.wholeWallBoards} boards, ${po.wholeWallCost.toFixed(2)}; difference ${po.extraCost >= 0 ? "+" : ""}${po.extraCost.toFixed(2)})`];
  for (const o of po.orders) for (const l of o.lines) lines.push(`  ${String(l.qty).padStart(4)}  ${o.size.padEnd(7)} ${formatLength(l.length).padEnd(10)} ${l.label}`);
  lines.push(`  ${po.assignment.sharedBoards} of ${po.assignment.boards} boards feed more than one panel`);
  if (po.over) lines.push("  At least one panel is over the limit: no clear cut line exists within it.");
  return lines;
}

/** Per-panel pull lists: which boards (size, length, cuts) a panel is built from. */
export function panelPullText(po) {
  const lines = [];
  for (const p of po.assignment.panels) {
    lines.push(`${p.panel}: ${p.boards.length} boards`);
    for (const b of p.boards) lines.push(`  ${b.size} ${formatLength(b.boardLength)} #${b.board}: cut ${b.cuts.map((c) => formatLength(c)).join(", ")}${b.sharedWith ? ` (board also feeds ${b.sharedWith} other panel${b.sharedWith > 1 ? "s" : ""})` : ""}`);
  }
  return lines;
}
