// @ts-check
// Wall sheathing: panel layout per wall and the sheet order for the house.
//
// Panels run vertically, full wall height, from the wall's start end. Every
// panel edge but the two wall ends lands on the centre of a full-height stud
// (a stud, king, corner or tee backing stud), so the edge has framing to
// nail to. That is the point of "breaks on stud centres": at 16 or 24 on
// centre a 4 ft panel ends on a stud; at 19.2 it does not, and the panel is
// ripped short to the last stud that fits. Openings are cut out of the panel
// that covers them (sheathe over, then cut the rough opening out).
//
// Because every panel is full height, a sheet's length is fixed by the wall
// height (the cheapest sheet at least that long) and what is left to decide
// is the width: which strips share a 4 ft sheet. That is a one-dimensional
// cutting-stock problem over a stock of 48 in boards, so it goes through the
// same optimiser as the lumber, across every wall of the house at once. A
// strip's remainder is the offcut the next wall's strip is cut from.
import { THICK, EPS, optimizeStock, formatInches } from "./engine.mjs";

export const SHEET_WIDTH = 48;

/**
 * Sheets listed until the user types their own. Price is 1 per square foot,
 * so the default order minimises area bought; type yours to minimise cost.
 */
export function defaultSheathing() {
  const sheet = (name, len) => ({ label: name, width: SHEET_WIDTH, length: len, price: (SHEET_WIDTH * len) / 144 });
  return {
    sheets: [sheet("4x8", 96), sheet("4x9", 108), sheet("4x10", 120), sheet("4x12", 144)],
    // Height to cover, from the underside of the bottom plate. Blank: the full wall.
    coverHeight: null,
    // A panel narrower than this is flagged; the last joint is pulled back to avoid one.
    minStrip: 12,
  };
}

/**
 * Places a panel edge may land, from the wall start. A centre qualifies when
 * the framing under the edge covers the whole panel height, apart from the
 * rough openings the edge crosses (those are cut out): a full-height stud,
 * king, corner or tee backing stud, or a column of top cripples, header,
 * sill and bottom cripples around an opening.
 */
function bearingCentres(plan, w, ops, cover) {
  const cand = new Set();
  for (const m of w.members) if (m.orient === "v") cand.add(Math.round((m.x + THICK / 2) * 16) / 16);
  const out = [];
  for (const c of [...cand].sort((a, b) => a - b)) {
    const iv = [];
    for (const m of w.members) {
      const hit = m.orient === "v" ? Math.abs(Math.round((m.x + THICK / 2) * 16) / 16 - c) < 1e-6 : c >= m.x - EPS && c <= m.x + m.w + EPS;
      if (hit) iv.push([m.y, m.y + m.h]);
    }
    for (const op of ops) {
      if (c > op.offset + EPS && c < op.offset + op.width - EPS) {
        const hh = op.headerHeight ?? plan.defaultHeaderHeight;
        iv.push([Math.max(0, hh - op.height), hh]);
      }
    }
    iv.sort((a, b) => a[0] - b[0]);
    let top = 0;
    for (const [lo, hi] of iv) {
      if (lo > top + 0.5) break;
      top = Math.max(top, hi);
    }
    if (top >= cover - 0.5) out.push(c);
  }
  return out;
}

/**
 * Panel x-ranges for one wall: joints at the furthest stud centre within one
 * sheet width. When no framing is in reach, the joint goes over an opening
 * (`spans`, the open stretches of the walls' rough openings) and a nailer is
 * needed there between the header and the top plate; those joints come back
 * in `nailers`.
 */
export function panelBreaks(length, centres, width = SHEET_WIDTH, minStrip = 12, spans = []) {
  const joints = [];
  const nailers = [];
  let at = 0;
  while (length - at > width + EPS) {
    let reach = centres.filter((c) => c > at + EPS && c <= at + width + EPS).pop();
    if (reach === undefined) {
      const span = spans.filter(([a, b]) => b > at + 1 && a < at + width).pop();
      if (!span) return null;
      reach = Math.round(Math.min(at + width, span[1] - 1) * 16) / 16;
      nailers.push(reach);
    }
    joints.push(reach);
    at = reach;
  }
  // Avoid a sliver at the far end by pulling the last joint back to an earlier stud.
  if (joints.length && length - joints[joints.length - 1] < minStrip) {
    const prev = joints.length > 1 ? joints[joints.length - 2] : 0;
    const back = centres.filter((c) => c > prev + EPS && c <= length - minStrip + EPS).pop();
    if (back !== undefined) {
      const old = joints[joints.length - 1];
      joints[joints.length - 1] = back;
      const k = nailers.indexOf(old);
      if (k >= 0) nailers.splice(k, 1);
    }
  }
  const edges = [0, ...joints, length];
  return { breaks: edges.slice(1).map((e, i) => [edges[i], e]), nailers };
}

/**
 * Panels and sheet order for a laid-out house.
 * @param {any} plan a plan with a `sheathing` block (see defaultSheathing)
 * @param {any} result the output of takeoff() (its `walls`)
 */
export function sheathe(plan, result) {
  const cfg = { ...defaultSheathing(), ...(plan.sheathing || {}) };
  const notes = [];
  const sheets = (cfg.sheets || []).filter((s) => s.width > 0 && s.length > 0 && s.price >= 0);
  if (!sheets.length) return { ok: false, errors: ["List at least one sheet size for sheathing."] };
  const wallHeight = result.walls[0]?.height ?? 0;
  const cover = cfg.coverHeight > 0 ? cfg.coverHeight : wallHeight;
  const eligible = sheets.filter((s) => s.length + EPS >= cover && s.width <= SHEET_WIDTH + EPS);
  if (!eligible.length) {
    const longest = Math.max(...sheets.map((s) => s.length));
    return { ok: false, errors: [`No sheet is long enough: the walls need ${formatInches(cover)} and the longest listed is ${formatInches(longest)}. List a longer sheet, or set the height to cover (two courses with a blocked joint are not modelled yet).`] };
  }
  const sheet = eligible.reduce((a, b) => (b.price < a.price ? b : a));
  const width = sheet.width;

  const walls = [];
  const pieces = [];
  for (const w of result.walls) {
    if (plan.walls.find((x) => x.id === w.id)?.sheathed === false) continue; // interior walls
    const ops = (plan.walls.find((x) => x.id === w.id)?.openings || []).slice().sort((a, b) => a.offset - b.offset);
    const centres = bearingCentres(plan, w, ops, cover);
    const found = panelBreaks(w.length, centres, width, cfg.minStrip, ops.map((o) => [o.offset, o.offset + o.width]));
    if (!found) {
      notes.push(`${w.id}: no framing within ${formatInches(width)} of a panel edge; sheathe this wall by hand.`);
      continue;
    }
    const { breaks, nailers } = found;
    // A nailer is a block of the wall's stud size on end between the header and the top plate, centred on the joint so each panel gets half its face.
    const nailerPieces = nailers.map((n) => {
      const hdr = w.members.filter((m) => m.kind === "header" && m.x - EPS <= n && n <= m.x + m.length + EPS).sort((a, b) => b.y + b.h - (a.y + a.h))[0];
      const plateY = Math.min(...w.members.filter((m) => m.kind === "plate" && m.y > w.height / 2 && m.x - EPS <= n && n <= m.x + m.length + EPS).map((m) => m.y));
      const length = hdr && Number.isFinite(plateY) ? Math.round((plateY - (hdr.y + hdr.h)) * 16) / 16 : null;
      return { wall: w.id, x: n, size: w.stud, length };
    });
    for (const p of nailerPieces) notes.push(`${w.id}: a panel joint at ${formatInches(p.x)} falls over an opening with no cripple under it; fit a ${p.size} nailer${p.length > EPS ? ` ${formatInches(p.length)} long` : ""} on end between the header and the top plate there.`);
    const panels = breaks.map(([a, b], i) => {
      const cutouts = [];
      for (const op of ops) {
        const x0 = Math.max(a, op.offset);
        const x1 = Math.min(b, op.offset + op.width);
        if (x1 - x0 > EPS) {
          const headerHeight = op.headerHeight ?? plan.defaultHeaderHeight;
          cutouts.push({ label: op.label || op.kind, x0: x0 - a, x1: x1 - a, y0: Math.max(0, headerHeight - op.height), y1: Math.min(cover, headerHeight) });
        }
      }
      return { id: `${w.id}-${i + 1}`, x0: a, x1: b, width: b - a, height: cover, cutouts };
    });
    for (const p of panels) pieces.push({ length: p.width, qty: 1, ref: p.id });
    walls.push({ id: w.id, panels, joints: breaks.slice(1).map(([a]) => a), nailers, nailerPieces, check: checkWall(w, panels, [...centres, ...nailers], width, cover, ops, plan) });
  }
  for (const w of walls) for (const p of w.panels) if (p.width < cfg.minStrip - EPS) notes.push(`${p.id} is only ${formatInches(p.width)} wide: a sliver to cut and nail; consider moving a stud or a joint.`);

  const rip = [{ length: width, price: sheet.price }];
  const res = pieces.length ? optimizeStock(pieces, rip, 0.125) : { bars: [], cost: 0, bound: 0, proven: true, method: "none" };
  const area = (w, h) => (w * h) / 144;
  const panelArea = walls.reduce((s, w) => s + w.panels.reduce((t, p) => t + area(p.width, p.height) - p.cutouts.reduce((u, c) => u + area(c.x1 - c.x0, c.y1 - c.y0), 0), 0), 0);
  const bought = res.bars.length * area(width, sheet.length);
  const cutoutArea = walls.reduce((s, w) => s + w.panels.reduce((t, p) => t + p.cutouts.reduce((u, c) => u + area(c.x1 - c.x0, c.y1 - c.y0), 0), 0), 0);
  const stripArea = panelArea + cutoutArea;
  const naive = pieces.length * sheet.price;
  const ripBound = res.bound ?? 0;
  if (sheet.length - cover > 24 + EPS) notes.push(`${sheet.label || "the sheet"} is ${formatInches(sheet.length - cover)} longer than the wall; that top band is cut off and left over. A shorter sheet or a taller wall would waste less.`);
  const strips = res.bars.map((b, i) => ({
    n: i + 1,
    cuts: b.cuts.map((c) => ({ width: c.length, ref: c.ref })),
    ripOffcut: b.offcut,
    topOffcut: sheet.length - cover,
  }));
  return {
    ok: true,
    sheet,
    cover,
    walls,
    strips,
    order: { label: sheet.label || `${formatInches(width)} x ${formatInches(sheet.length)}`, qty: res.bars.length, price: sheet.price, cost: res.cost },
    summary: {
      panels: pieces.length,
      sheets: res.bars.length,
      cost: res.cost,
      bound: ripBound,
      gap: ripBound > 0 ? (res.cost - ripBound) / ripBound : 0,
      method: res.method,
      proven: res.proven,
      naiveSheets: pieces.length,
      naiveCost: naive,
      areaCovered: panelArea,
      areaCutOut: cutoutArea,
      areaBought: bought,
      waste: bought > 0 ? (bought - panelArea) / bought : 0,
      stripArea,
    },
    notes,
  };
}

/** Self-check one wall's panels. Returns a list of problems; empty means it passes. */
function checkWall(w, panels, centres, width, cover, ops, plan) {
  const bad = [];
  let at = 0;
  for (const p of panels) {
    if (Math.abs(p.x0 - at) > EPS) bad.push(`gap or overlap before ${p.id}`);
    at = p.x1;
    if (p.width > width + EPS) bad.push(`${p.id} is wider than a sheet`);
    for (const e of [p.x0, p.x1]) {
      if (e < EPS || e > w.length - EPS) continue;
      if (!centres.some((c) => Math.abs(c - e) < EPS)) bad.push(`${p.id} has an edge at ${formatInches(e)} with no framing under it that runs the panel's height`);
    }
    for (const c of p.cutouts) if (c.x0 < -EPS || c.x1 > p.width + EPS || c.y0 < -EPS || c.y1 > cover + EPS) bad.push(`${p.id}: cutout ${c.label} leaves the panel`);
  }
  if (Math.abs(at - w.length) > EPS) bad.push("panels do not reach the wall end");
  const open = ops.reduce((s, op) => s + op.width, 0);
  const cut = panels.reduce((s, p) => s + p.cutouts.reduce((t, c) => t + (c.x1 - c.x0), 0), 0);
  if (Math.abs(open - cut) > 1e-6) bad.push("cutout widths do not add up to the openings");
  return bad;
}

/** Text lines for the CLI. */
export function sheathingText(s) {
  if (!s.ok) return s.errors.map((e) => `  ${e}`);
  const q = s.summary;
  const out = [];
  out.push(`${q.panels} panels from ${q.sheets} sheets of ${s.order.label}; cost ${q.cost.toFixed(2)} (lower bound ${q.bound.toFixed(2)}, gap ${(100 * q.gap).toFixed(2)}%); one sheet per panel would cost ${q.naiveCost.toFixed(2)}`);
  out.push(`Bought ${q.areaBought.toFixed(0)} sq ft for ${q.areaCovered.toFixed(0)} sq ft on the walls: ${(100 * q.waste).toFixed(1)}% offcut, opening cut-outs and kerf`);
  for (const w of s.walls) {
    out.push(`  ${w.id}: ${w.panels.map((p) => `${formatInches(p.width)}${p.cutouts.length ? ` (cut ${p.cutouts.map((c) => c.label).join(", ")})` : ""}`).join(" | ")}`);
    for (const b of w.check) out.push(`    CHECK FAILED: ${b}`);
  }
  for (const n of s.notes) out.push(`  - ${n}`);
  return out;
}
