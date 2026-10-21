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
import { THICK, EPS, DEPTH, optimizeStock, formatInches } from "./engine.mjs";

/**
 * Sheathing past a wall's end at a corner (`sheathing.overhang`). The walls are
 * read as in `plateLaps`: a wall with `corner: true` meets the end of the wall
 * before it, so the earlier wall's sheathing runs on past its end by the later
 * wall's depth and covers that wall's end stud; the later wall's sheathing
 * starts at its own first stud. Returns the inches added at this wall's end.
 */
export function cornerOverhang(plan, wall) {
  const walls = plan.walls || [];
  const i = walls.indexOf(wall);
  if (i < 0 || walls.length < 2) return 0;
  const next = walls[(i + 1) % walls.length];
  return next.corner && next.sheathed !== false ? DEPTH[next.stud || "2x4"] ?? 3.5 : 0;
}

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
    // A wall taller than every sheet goes in two courses; the upper one is at least this high.
    minCourse: 12,
    // Run each wall's sheathing past its end at a corner to cover the next wall's end stud.
    overhang: false,
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
export function panelBreaks(length, centres, width = SHEET_WIDTH, minStrip = 12, spans = [], lead = 0) {
  const joints = [];
  const nailers = [];
  let at = 0;
  // A first panel shorter than the sheet staggers this course's joints against its neighbours' (horizontal sheets).
  if (lead > EPS && length - lead > EPS) {
    const first = centres.filter((c) => c > EPS && c <= lead + EPS).pop();
    if (first !== undefined) { joints.push(first); at = first; }
  }
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
 * How to cover `cover` inches: one sheet when one is long enough, otherwise a
 * lower sheet and an upper course (at least `minCourse` high). The pair with the
 * lowest price per 48 in strip wins; ties go to the longer lower sheet.
 * Returns courses `{y0, y1, sheet, perSheet}` (`perSheet` = bands cut crosswise
 * from one sheet), or null when no pair works.
 */
export function chooseCourses(sheets, cover, minCourse = 12, kerf = 0.125) {
  const one = sheets.filter((s) => s.length + EPS >= cover);
  if (one.length) {
    const sheet = one.reduce((a, b) => (b.price < a.price ? b : a));
    return [{ y0: 0, y1: cover, sheet, perSheet: 1 }];
  }
  let best = null;
  for (const lower of sheets) {
    const rest = cover - lower.length;
    if (rest < minCourse - EPS) continue;
    for (const upper of sheets) {
      if (upper.length + EPS < rest) continue;
      const perSheet = Math.max(1, Math.floor((upper.length + kerf) / (rest + kerf)));
      const cost = lower.price + upper.price / perSheet;
      if (!best || cost < best.cost - EPS || (Math.abs(cost - best.cost) <= EPS && lower.length > best.lower.length)) best = { cost, lower, upper, rest, perSheet };
    }
  }
  if (!best) return null;
  return [
    { y0: 0, y1: best.lower.length, sheet: best.lower, perSheet: 1 },
    { y0: best.lower.length, y1: cover, sheet: best.upper, perSheet: best.perSheet },
  ];
}

/**
 * Blocking for the horizontal joint at height `y`: a piece of the wall's stud
 * size on edge in every bay between framing that runs through `y`, apart from
 * bays an opening cuts out at that height and bays that already have a blocking
 * row there. Each piece is centred on the joint, so each sheet gets half the face.
 */
export function jointBlocking(w, ops, plan, y) {
  const through = w.members.filter((m) => m.orient === "v" && m.y < y - EPS && m.y + m.h > y + EPS).sort((a, b) => a.x - b.x);
  const blocks = [];
  let existing = 0;
  for (let i = 0; i + 1 < through.length; i++) {
    const x0 = through[i].x + through[i].w;
    const x1 = through[i + 1].x;
    if (x1 - x0 < 1 - EPS) continue;
    const open = ops.some((op) => {
      const hh = op.headerHeight ?? plan.defaultHeaderHeight;
      return y > hh - op.height + EPS && y < hh - EPS && x0 < op.offset + op.width - EPS && x1 > op.offset + EPS;
    });
    if (open) continue;
    if (w.members.some((m) => m.orient === "h" && m.kind === "blocking" && Math.abs(m.y + m.h / 2 - y) <= m.h / 2 + EPS && m.x <= x0 + EPS && m.x + m.w >= x1 - EPS)) { existing++; continue; }
    blocks.push({ wall: w.id, x: x0, y, size: w.stud, length: Math.round((x1 - x0) * 16) / 16, depth: DEPTH[w.stud] ?? 3.5 });
  }
  return { blocks, existing };
}

/**
 * Panels and sheet order for a laid-out house.
 * @param {any} plan a plan with a `sheathing` block (see defaultSheathing)
 * @param {any} result the output of takeoff() (its `walls`)
 */
export function sheathe(plan, result) {
  const cfg = { ...defaultSheathing(), ...(plan.sheathing || {}) };
  const notes = [];
  const sheets = (cfg.sheets || []).filter((s) => s.width > 0 && s.length > 0 && s.price >= 0 && s.width <= SHEET_WIDTH + EPS);
  if (!sheets.length) return { ok: false, errors: ["List at least one sheet size for sheathing."] };
  const wallHeight = result.walls[0]?.height ?? 0;
  const cover = cfg.coverHeight > 0 ? cfg.coverHeight : wallHeight;
  if (cfg.orientation === "horizontal" && cfg.overhang) notes.push("Corner overhang is for vertical sheets; the horizontal layout ignores it.");
  if (cfg.orientation === "horizontal") return sheatheHorizontal(plan, result, cfg, sheets, cover);
  const courses = chooseCourses(sheets, cover, cfg.minCourse, 0.125);
  if (!courses) {
    const longest = Math.max(...sheets.map((s) => s.length));
    return { ok: false, errors: [`No sheet is long enough: the walls need ${formatInches(cover)} and the longest listed is ${formatInches(longest)}. List a longer sheet, or a second sheet that leaves an upper course of at least ${formatInches(cfg.minCourse)} (two courses with a blocked joint).`] };
  }
  const two = courses.length === 2;
  const sheet = courses[0].sheet;
  const width = Math.min(...courses.map((c) => c.sheet.width));
  const jointY = two ? courses[0].y1 : null;

  const walls = [];
  const piecesBy = courses.map(() => []);
  for (const w of result.walls) {
    if (plan.walls.find((x) => x.id === w.id)?.sheathed === false) continue; // interior walls
    if (plan.walls.find((x) => x.id === w.id)?.gable) { notes.push(`${w.id}: gable wall; sheathe it by hand (its triangle is not in the sheet order).`); continue; }
    const ops = (plan.walls.find((x) => x.id === w.id)?.openings || []).slice().sort((a, b) => a.offset - b.offset);
    const centres = bearingCentres(plan, w, ops, cover);
    const over = cfg.overhang ? cornerOverhang(plan, plan.walls.find((x) => x.id === w.id)) : 0;
    const len = w.length + over;
    const found = panelBreaks(len, centres, width, cfg.minStrip, ops.map((o) => [o.offset, o.offset + o.width]));
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
    const panels = [];
    courses.forEach((course, ci) => {
      breaks.forEach(([a, b], i) => {
        const cutouts = [];
        for (const op of ops) {
          const x0 = Math.max(a, op.offset);
          const x1 = Math.min(b, op.offset + op.width);
          if (x1 - x0 > EPS) {
            const headerHeight = op.headerHeight ?? plan.defaultHeaderHeight;
            const y0 = Math.max(course.y0, headerHeight - op.height);
            const y1 = Math.min(course.y1, headerHeight);
            if (two && y1 - y0 <= EPS) continue;
            cutouts.push({ label: op.label || op.kind, x0: x0 - a, x1: x1 - a, y0: two ? y0 : Math.max(0, headerHeight - op.height), y1: two ? y1 : Math.min(cover, headerHeight) });
          }
        }
        panels.push({ id: `${w.id}-${i + 1}${ci ? "U" : ""}`, course: ci, x0: a, x1: b, y0: course.y0, width: b - a, height: course.y1 - course.y0, cutouts });
      });
    });
    for (const p of panels) piecesBy[p.course].push({ length: p.width, qty: 1, ref: p.id });
    let jointBlocks = [];
    if (two) {
      const jb = jointBlocking(w, ops, plan, jointY);
      jointBlocks = jb.blocks;
      if (jb.existing) notes.push(`${w.id}: ${jb.existing} bay${jb.existing > 1 ? "s" : ""} already have a blocking row at the joint (${formatInches(jointY)}); the joint rests on it.`);
    }
    walls.push({ id: w.id, panels, joints: breaks.slice(1).map(([a]) => a), overhang: over, nailers, nailerPieces, jointBlocks, check: checkWall(w, panels, [...centres, ...nailers], width, cover, ops, plan, courses, jointBlocks, len) });
  }
  for (const w of walls) if (w.overhang > EPS) notes.push(`${w.id}: sheathing runs ${formatInches(w.overhang)} past the wall end to cover the next wall's end stud.`);
  for (const w of walls) for (const p of w.panels) if (p.width < cfg.minStrip - EPS) notes.push(`${p.id} is only ${formatInches(p.width)} wide: a sliver to cut and nail; consider moving a stud or a joint.`);

  const area = (w, h) => (w * h) / 144;
  const orders = [];
  const strips = [];
  let totalSheets = 0, totalCost = 0, totalBound = 0, naive = 0, bought = 0, proven = true;
  const methods = [];
  courses.forEach((course, ci) => {
    const pieces = piecesBy[ci];
    const per = course.perSheet;
    const stock = [{ length: width, price: course.sheet.price / per }];
    const res = pieces.length ? optimizeStock(pieces, stock, 0.125) : { bars: [], cost: 0, bound: 0, proven: true, method: "none" };
    const qty = Math.ceil(res.bars.length / per - 1e-9);
    const cost = qty * course.sheet.price;
    const label = course.sheet.label || `${formatInches(course.sheet.width)} x ${formatInches(course.sheet.length)}`;
    orders.push({ course: ci, label, qty, price: course.sheet.price, cost, bands: res.bars.length, perSheet: per, height: course.y1 - course.y0 });
    totalSheets += qty;
    totalCost += cost;
    totalBound += res.bound ?? 0;
    naive += pieces.length * course.sheet.price;
    bought += qty * area(course.sheet.width, course.sheet.length);
    proven = proven && res.proven;
    methods.push(res.method);
    for (const b of res.bars) strips.push({ n: strips.length + 1, course: ci, cuts: b.cuts.map((c) => ({ width: c.length, ref: c.ref })), ripOffcut: b.offcut, topOffcut: per === 1 ? course.sheet.length - (course.y1 - course.y0) : 0 });
    if (per === 1 && course.sheet.length - (course.y1 - course.y0) > 24 + EPS) notes.push(`${course.sheet.label || "the sheet"} is ${formatInches(course.sheet.length - (course.y1 - course.y0))} longer than the ${two ? "course" : "wall"}; that top band is cut off and left over. A shorter sheet or a taller wall would waste less.`);
    if (per > 1) notes.push(`The upper course is ${formatInches(course.y1 - course.y0)} high: ${per} bands of ${label} are cut crosswise from each sheet.`);
  });
  const panelAll = walls.flatMap((w) => w.panels);
  const cutoutArea = panelAll.reduce((t, p) => t + p.cutouts.reduce((u, c) => u + area(c.x1 - c.x0, c.y1 - c.y0), 0), 0);
  const panelArea = panelAll.reduce((t, p) => t + area(p.width, p.height), 0) - cutoutArea;
  const stripArea = panelArea + cutoutArea;
  if (two) notes.push(`Walls are ${formatInches(cover)} to cover and no sheet is that long: two courses, a ${formatInches(courses[0].y1)} lower sheet and a ${formatInches(cover - courses[0].y1)} upper course, with the horizontal joint at ${formatInches(jointY)} on blocking set on edge between the studs.`);
  const nailerLumber = nailerOrder(walls, plan);
  return {
    ok: true,
    sheet,
    cover,
    courses: courses.map((c, i) => ({ y0: c.y0, y1: c.y1, sheet: c.sheet, perSheet: c.perSheet, order: orders[i] })),
    jointY,
    walls,
    strips,
    nailerLumber,
    order: two
      ? { label: orders.map((o) => o.label).join(" + "), qty: totalSheets, price: null, cost: totalCost }
      : { label: orders[0].label, qty: orders[0].qty, price: orders[0].price, cost: orders[0].cost },
    orders,
    summary: {
      panels: panelAll.length,
      sheets: totalSheets,
      cost: totalCost,
      bound: totalBound,
      gap: totalBound > 0 ? (totalCost - totalBound) / totalBound : 0,
      method: methods.join(" + "),
      proven,
      naiveSheets: panelAll.length,
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

/**
 * Sheets laid long side along the wall (`sheathing.orientation: "horizontal"`).
 * Courses are one sheet width high (the last one ripped to what is left); end
 * joints land on stud centres and alternate courses start half a sheet in so
 * the joints are staggered; every course boundary gets blocking between studs.
 * One sheet length is used for the whole house: each listed length is tried and
 * the cheapest order wins (ties go to the longer sheet).
 */
function sheatheHorizontal(plan, result, cfg, sheets, cover) {
  const notes = [];
  const area = (w, h) => (w * h) / 144;
  let best = null;
  for (const sheet of sheets) {
    const ch = sheet.width;
    const nFull = Math.floor((cover + EPS) / ch);
    const rem = cover - nFull * ch;
    const heights = Array(nFull).fill(ch);
    if (rem > EPS) heights.push(rem);
    // A last course under minCourse is a sliver: take the difference off the course below it instead.
    if (rem > EPS && rem < cfg.minCourse - EPS && nFull > 0) { heights[nFull - 1] = ch - (cfg.minCourse - rem); heights[nFull] = cfg.minCourse; }
    if (heights.length && heights[heights.length - 1] < 6) continue;
    const courses = [];
    let y = 0;
    for (const h of heights) {
      courses.push({ y0: y, y1: y + h, sheet, perSheet: h >= ch - EPS ? 1 : Math.max(1, Math.floor((ch + 0.125) / (h + 0.125))) });
      y += h;
    }
    const walls = [];
    const skipped = [];
    const piecesBy = courses.map(() => []);
    for (const w of result.walls) {
      const pw = plan.walls.find((x) => x.id === w.id);
      if (pw?.sheathed === false || pw?.gable) continue;
      const ops = (pw?.openings || []).slice().sort((a, b) => a.offset - b.offset);
      const centres = bearingCentres(plan, w, ops, cover);
      const even = panelBreaks(w.length, centres, sheet.length, cfg.minStrip, [], 0);
      const odd = panelBreaks(w.length, centres, sheet.length, cfg.minStrip, [], sheet.length / 2);
      if (!even || !odd) { skipped.push(w.id); continue; }
      const panels = [];
      courses.forEach((course, ci) => {
        (ci % 2 ? odd : even).breaks.forEach(([a, b], i) => {
          const cutouts = [];
          for (const op of ops) {
            const x0 = Math.max(a, op.offset);
            const x1 = Math.min(b, op.offset + op.width);
            const hh = op.headerHeight ?? plan.defaultHeaderHeight;
            const y0 = Math.max(course.y0, hh - op.height);
            const y1 = Math.min(course.y1, hh);
            if (x1 - x0 > EPS && y1 - y0 > EPS) cutouts.push({ label: op.label || op.kind, x0: x0 - a, x1: x1 - a, y0, y1 });
          }
          panels.push({ id: `${w.id}-C${ci + 1}.${i + 1}`, course: ci, x0: a, x1: b, y0: course.y0, width: b - a, height: course.y1 - course.y0, cutouts });
        });
      });
      for (const p of panels) piecesBy[p.course].push({ length: p.width, qty: 1, ref: p.id });
      const jointBlocks = [];
      let existing = 0;
      for (let ci = 1; ci < courses.length; ci++) {
        const jb = jointBlocking(w, ops, plan, courses[ci].y0);
        jointBlocks.push(...jb.blocks);
        existing += jb.existing;
      }
      walls.push({ id: w.id, panels, joints: [...new Set(panels.flatMap((p) => [p.x0, p.x1]))].filter((x) => x > EPS && x < w.length - EPS).sort((a, b) => a - b), nailers: [], nailerPieces: [], jointBlocks, existing, check: checkWall(w, panels, centres, sheet.length, cover, ops, plan, courses, jointBlocks) });
    }
    // Full courses pool into one order; the ripped course is cut crosswise into bands.
    const groups = [];
    for (const [i, c] of courses.entries()) {
      const g = groups.find((x) => Math.abs(courses[x[0]].y1 - courses[x[0]].y0 - (c.y1 - c.y0)) < EPS);
      if (g) g.push(i); else groups.push([i]);
    }
    let cost = 0, bound = 0, sheetsBought = 0, bought = 0, proven = true;
    const orders = [], strips = [], methods = [];
    const label = sheet.label || `${formatInches(sheet.width)} x ${formatInches(sheet.length)}`;
    for (const idxs of groups) {
      const per = courses[idxs[0]].perSheet;
      const pieces = idxs.flatMap((i) => piecesBy[i]);
      const res = pieces.length ? optimizeStock(pieces, [{ length: sheet.length, price: sheet.price / per }], 0.125) : { bars: [], cost: 0, bound: 0, proven: true, method: "none" };
      const qty = Math.ceil(res.bars.length / per - 1e-9);
      const height = courses[idxs[0]].y1 - courses[idxs[0]].y0;
      orders.push({ course: idxs[0], courses: idxs, label, qty, price: sheet.price, cost: qty * sheet.price, bands: res.bars.length, perSheet: per, height });
      cost += qty * sheet.price; bound += res.bound ?? 0; sheetsBought += qty; bought += qty * area(sheet.width, sheet.length);
      proven = proven && res.proven; methods.push(res.method);
      for (const b of res.bars) strips.push({ n: strips.length + 1, course: idxs[0], cuts: b.cuts.map((c) => ({ width: c.length, ref: c.ref })), ripOffcut: b.offcut, topOffcut: 0 });
    }
    const cand = { sheet, courses, walls, skipped, orders, strips, cost, bound, sheetsBought, bought, proven, methods, label };
    if (!best || cost < best.cost - EPS || (Math.abs(cost - best.cost) <= EPS && sheet.length > best.sheet.length)) best = cand;
  }
  if (!best) return { ok: false, errors: [`No listed sheet leaves courses of at least ${formatInches(cfg.minCourse)} for a ${formatInches(cover)} wall.`] };
  const { sheet, courses, walls, orders, strips, label } = best;
  for (const id of best.skipped) notes.push(`${id}: no framing within ${formatInches(sheet.length)} of a panel edge; sheathe this wall by hand.`);
  for (const w of walls) {
    if (w.existing) notes.push(`${w.id}: ${w.existing} bay${w.existing > 1 ? "s" : ""} already have a blocking row at a course joint; the joint rests on it.`);
    for (const p of w.panels) if (p.width < cfg.minStrip - EPS) notes.push(`${p.id} is only ${formatInches(p.width)} long: a sliver to cut and nail; consider moving a stud.`);
  }
  for (const [i, c] of courses.entries()) if (c.y1 - c.y0 < sheet.width - EPS) notes.push(`Course ${i + 1} is ripped to ${formatInches(c.y1 - c.y0)}${c.perSheet > 1 ? `: ${c.perSheet} bands are cut crosswise from each sheet` : ""}.`);
  notes.push(`Sheets run long side along the wall: ${courses.length} course${courses.length > 1 ? "s" : ""}, end joints on stud centres, alternate courses start half a sheet in to stagger them, and each course joint (${courses.slice(1).map((c) => formatInches(c.y0)).join(", ") || "none"}) is blocked between studs. Check the nailing and blocking against your shear-wall schedule.`);
  const panelAll = walls.flatMap((w) => w.panels);
  const cutoutArea = panelAll.reduce((t, p) => t + p.cutouts.reduce((u, c) => u + area(c.x1 - c.x0, c.y1 - c.y0), 0), 0);
  const panelArea = panelAll.reduce((t, p) => t + area(p.width, p.height), 0) - cutoutArea;
  const naive = panelAll.reduce((t, p) => t + sheet.price * (p.height < sheet.width - EPS ? 1 / courses[p.course].perSheet : 1), 0);
  return {
    ok: true,
    orientation: "horizontal",
    sheet,
    cover,
    courses: courses.map((c, i) => ({ y0: c.y0, y1: c.y1, sheet: c.sheet, perSheet: c.perSheet, order: orders.find((o) => o.courses.includes(i)) })),
    jointY: courses.length > 1 ? courses[1].y0 : null,
    jointYs: courses.slice(1).map((c) => c.y0),
    walls,
    strips,
    nailerLumber: nailerOrder(walls, plan),
    order: { label, qty: best.sheetsBought, price: sheet.price, cost: best.cost },
    orders,
    summary: {
      panels: panelAll.length,
      sheets: best.sheetsBought,
      cost: best.cost,
      bound: best.bound,
      gap: best.bound > 0 ? (best.cost - best.bound) / best.bound : 0,
      method: best.methods.join(" + "),
      proven: best.proven,
      naiveSheets: panelAll.length,
      naiveCost: naive,
      areaCovered: panelArea,
      areaCutOut: cutoutArea,
      areaBought: best.bought,
      waste: best.bought > 0 ? (best.bought - panelArea) / best.bought : 0,
      stripArea: panelArea + cutoutArea,
    },
    notes,
  };
}

/** Sheathing nailers as cut-list rows, for `takeoff(plan, nailerCuts(s))`. Pieces with no length (no header found) are left out. */
export function nailerCuts(s) {
  if (!s || !s.ok) return [];
  const map = new Map();
  for (const w of s.walls) {
    for (const [p, kind] of extraPieces(w)) {
      if (!(p.length > EPS)) continue;
      const key = `${kind}|${p.size}|${p.length}`;
      const row = map.get(key) || { size: p.size, length: p.length, kind: `sheathing ${kind}`, qty: 0, walls: [] };
      row.qty++;
      if (!row.walls.includes(p.wall)) row.walls.push(p.wall);
      map.set(key, row);
    }
  }
  return [...map.values()];
}

/** A wall's extra lumber pieces as [piece, kind]: nailers over openings and the blocks under a horizontal sheathing joint. */
function extraPieces(w) {
  return [...w.nailerPieces.map((p) => [p, "nailer"]), ...(w.jointBlocks || []).map((p) => [p, "joint block"])];
}

/**
 * Extra lumber for the nailers and horizontal-joint blocks: a cut list in the main list's shape and a board
 * order per stud size from the plan's stock, so the lumber order can be added
 * to the framing order (or the pieces cut from its offcuts).
 */
function nailerOrder(walls, plan) {
  const map = new Map();
  for (const w of walls) {
    for (const [p, kind] of extraPieces(w)) {
      if (!(p.length > EPS)) continue;
      const key = `${kind}|${p.size}|${p.length}`;
      const row = map.get(key) || { size: p.size, length: p.length, kind, qty: 0, walls: new Set() };
      row.qty++;
      row.walls.add(w.id);
      map.set(key, row);
    }
  }
  const cuts = [...map.values()].map((r) => ({ ...r, walls: [...r.walls] })).sort((a, b) => a.size.localeCompare(b.size) || b.length - a.length || a.kind.localeCompare(b.kind));
  const orders = [];
  for (const size of [...new Set(cuts.map((c) => c.size))]) {
    const stock = (plan.stock || []).filter((s) => s.size === size);
    if (!stock.length) continue;
    const res = optimizeStock(cuts.filter((c) => c.size === size).map((c) => ({ length: c.length, qty: c.qty, ref: c.kind })), stock, plan.kerf ?? 0.125);
    const lines = new Map();
    for (const b of res.bars) {
      const key = `${b.length}|${b.label || ""}`;
      const row = lines.get(key) || { size, length: b.length, label: b.label || "", price: b.price, qty: 0 };
      row.qty++;
      lines.set(key, row);
    }
    orders.push({ size, cost: res.cost, bound: res.bound, boards: res.bars.length, lines: [...lines.values()].sort((a, b) => b.length - a.length) });
  }
  return { cuts, orders, cost: orders.reduce((t, o) => t + o.cost, 0) };
}

/** Self-check one wall's panels. Returns a list of problems; empty means it passes. */
function checkWall(w, panels, centres, width, cover, ops, plan, courses, jointBlocks, len = w.length) {
  const bad = [];
  let at = 0;
  let course = 0;
  for (const p of panels) {
    if (p.course !== course) {
      if (Math.abs(at - len) > EPS) bad.push("panels do not reach the wall end");
      course = p.course;
      at = 0;
    }
    if (Math.abs(p.x0 - at) > EPS) bad.push(`gap or overlap before ${p.id}`);
    at = p.x1;
    if (p.width > width + EPS) bad.push(`${p.id} is wider than a sheet`);
    for (const e of [p.x0, p.x1]) {
      if (e < EPS || e > len - EPS) continue;
      if (!centres.some((c) => Math.abs(c - e) < EPS)) bad.push(`${p.id} has an edge at ${formatInches(e)} with no framing under it that runs the panel's height`);
    }
    for (const c of p.cutouts) if (c.x0 < -EPS || c.x1 > p.width + EPS || c.y0 < -EPS || c.y1 > cover + EPS) bad.push(`${p.id}: cutout ${c.label} leaves the panel`);
  }
  if (Math.abs(at - len) > EPS) bad.push("panels do not reach the wall end");
  courses.forEach((course, ci) => {
    const mine = panels.filter((p) => p.course === ci);
    if (Math.abs(mine.reduce((t, p) => t + p.width, 0) - len) > 1e-6) bad.push(`course ${ci + 1} does not span the wall`);
    const open = ops.reduce((t, op) => {
      const hh = op.headerHeight ?? plan.defaultHeaderHeight;
      return t + (courses.length > 1 && Math.min(course.y1, hh) - Math.max(course.y0, hh - op.height) <= EPS ? 0 : op.width);
    }, 0);
    const cut = mine.reduce((t, p) => t + p.cutouts.reduce((u, c) => u + (c.x1 - c.x0), 0), 0);
    if (Math.abs(open - cut) > 1e-6) bad.push("cutout widths do not add up to the openings");
  });
  for (let ci = 1; ci < courses.length; ci++) {
    // Each horizontal joint needs something to nail to along its whole length, except where an opening is cut out there.
    const y = courses[ci].y0;
    const spans = [
      ...w.members.filter((m) => m.orient === "v" && m.y < y - EPS && m.y + m.h > y + EPS).map((m) => [m.x, m.x + m.w]),
      ...w.members.filter((m) => m.orient === "h" && m.kind === "blocking" && Math.abs(m.y + m.h / 2 - y) <= m.h / 2 + EPS).map((m) => [m.x, m.x + m.w]),
      ...jointBlocks.filter((b) => Math.abs(b.y - y) < EPS).map((b) => [b.x, b.x + b.length]),
      ...ops.filter((op) => { const hh = op.headerHeight ?? plan.defaultHeaderHeight; return y > hh - op.height + EPS && y < hh - EPS; }).map((op) => [op.offset, op.offset + op.width]),
    ].sort((a, b) => a[0] - b[0]);
    let at = 0;
    for (const [lo, hi] of spans) {
      if (lo > at + 1 + EPS) break;
      at = Math.max(at, hi);
    }
    if (at < w.length - 1 - EPS) bad.push(`the horizontal joint at ${formatInches(y)} has nothing to nail to past ${formatInches(at)}`);
  }
  if (courses.length > 1) for (const p of panels.filter((q) => q.course === courses.length - 1)) if (p.height < 6) bad.push(`${p.id} is only ${formatInches(p.height)} high`);
  return bad;
}

/** Text lines for the CLI. */
export function sheathingText(s) {
  if (!s.ok) return s.errors.map((e) => `  ${e}`);
  const q = s.summary;
  const out = [];
  out.push(`${q.panels} panels from ${q.sheets} sheets of ${s.order.label}${s.orders.length > 1 ? ` (${s.orders.map((o) => `${o.qty} x ${o.label}`).join(", ")})` : ""}; cost ${q.cost.toFixed(2)} (lower bound ${q.bound.toFixed(2)}, gap ${(100 * q.gap).toFixed(2)}%); one sheet per panel would cost ${q.naiveCost.toFixed(2)}`);
  out.push(`Bought ${q.areaBought.toFixed(0)} sq ft for ${q.areaCovered.toFixed(0)} sq ft on the walls: ${(100 * q.waste).toFixed(1)}% offcut, opening cut-outs and kerf`);
  for (const w of s.walls) {
    out.push(`  ${w.id}: ${w.panels.map((p) => `${formatInches(p.width)}${p.cutouts.length ? ` (cut ${p.cutouts.map((c) => c.label).join(", ")})` : ""}`).join(" | ")}`);
    for (const b of w.check) out.push(`    CHECK FAILED: ${b}`);
  }
  const nl = s.nailerLumber;
  if (nl && nl.cuts.length) {
    out.push("  Nailers to add to the lumber order:");
    for (const c of nl.cuts) out.push(`    ${c.qty} x ${c.size} ${formatInches(c.length)} (${c.walls.join(", ")})`);
    for (const o of nl.orders) out.push(`    buy ${o.lines.map((l) => `${l.qty} x ${l.size} ${formatInches(l.length)}`).join(", ")}; ${o.cost.toFixed(2)}`);
  }
  for (const n of s.notes) out.push(`  - ${n}`);
  return out;
}
