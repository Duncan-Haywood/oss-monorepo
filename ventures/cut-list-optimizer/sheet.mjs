// Sheet-goods (2D) cutting plans for panel stock: plywood, MDF, acrylic, ACM.
//
// The packer only ever produces *guillotine* layouts — every cut runs edge to
// edge across whatever is left of the sheet. That is a real constraint, not a
// simplification: a table saw, track saw, or panel saw cannot do anything else,
// so a layout that needs an interior notch is a layout the shop cannot cut.
// Nesting packers that allow interior cuts score better on paper and are
// useless on the machines this venture's users own.
//
// Pure functions, no DOM, no I/O — the page and the tests share them.

const EPS = 1e-9;

// A single browser tab planning a job will not legitimately exceed this, and it
// keeps a pasted-by-accident spreadsheet from freezing the page.
export const MAX_PANELS = 2000;

const SEP = '[x*×]';
const PANEL_LINE = new RegExp(
  '^' +
  '(?:(.+?)\\s*:\\s*)?' +                       // optional "Label:"
  '(\\d+(?:\\.\\d+)?)\\s*' + SEP + '\\s*' +     // width
  '(\\d+(?:\\.\\d+)?)' +                        // height
  '(?:\\s*' + SEP + '\\s*(\\d+))?' +            // optional quantity
  '(?:\\s+(grain))?' +                          // optional grain lock
  '$',
  'i',
);

const ONHAND_LINE = new RegExp(
  '^' +
  '(\\d+(?:\\.\\d+)?)\\s*' + SEP + '\\s*' +   // width
  '(\\d+(?:\\.\\d+)?)' +                      // height
  '(?:\\s*' + SEP + '\\s*(\\d+))?' +          // optional quantity
  '$',
  'i',
);

/**
 * Parses one panel per line: `24 x 12`, `24 x 12 x 3`, `Shelf: 24 x 12 x 3`,
 * and a trailing `grain` to pin a piece's orientation (a face-grain part cannot
 * be turned 90° however well it would pack).
 */
export function parsePanels(text) {
  const panels = [];
  for (const [index, rawLine] of String(text ?? '').split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(PANEL_LINE);
    if (!match) {
      throw new Error(`Line ${index + 1}: enter width and height, such as 24 x 12, or 24 x 12 x 3 for three of them`);
    }
    const [, rawLabel, rawWidth, rawHeight, rawQuantity, grain] = match;
    const width = Number(rawWidth);
    const height = Number(rawHeight);
    const quantity = rawQuantity === undefined ? 1 : Number(rawQuantity);
    if (!(width > 0) || !(height > 0)) {
      throw new Error(`Line ${index + 1}: width and height must both be greater than zero`);
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`Line ${index + 1}: quantity must be a whole number of one or more`);
    }
    const label = (rawLabel || `${rawWidth}×${rawHeight}`).trim();
    if (panels.length + quantity > MAX_PANELS) {
      throw new Error(`That is more than ${MAX_PANELS} pieces. Split the job into separate cut lists.`);
    }
    for (let i = 0; i < quantity; i += 1) {
      panels.push({ label, width, height, grainLocked: Boolean(grain) });
    }
  }
  if (!panels.length) throw new Error('Add at least one panel');
  return panels;
}

/**
 * Offcut panels already on the rack. Unlike the required list, an empty
 * input is the normal case, so this returns [] instead of throwing. An
 * offcut is placed by size alone — no label, and no grain lock, since a
 * scrap that small rarely carries a face direction worth pinning.
 */
export function parseOnHandSheets(text) {
  const pieces = [];
  for (const [index, rawLine] of String(text ?? '').split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(ONHAND_LINE);
    if (!match) {
      throw new Error(`On-hand line ${index + 1}: enter width and height, such as 24 x 12, or 24 x 12 x 3 for three of them`);
    }
    const [, rawWidth, rawHeight, rawQuantity] = match;
    const width = Number(rawWidth);
    const height = Number(rawHeight);
    const quantity = rawQuantity === undefined ? 1 : Number(rawQuantity);
    if (!(width > 0) || !(height > 0)) {
      throw new Error(`On-hand line ${index + 1}: width and height must both be greater than zero`);
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`On-hand line ${index + 1}: quantity must be a whole number of one or more`);
    }
    for (let i = 0; i < quantity; i += 1) pieces.push({ width, height });
  }
  return pieces;
}

// Descending by area, then by longest side, then by label — so the same cut
// list always produces the same plan and a shop can re-open a saved ticket and
// see the layout it cut from last time.
function packingOrder(panels) {
  return panels
    .map((panel, index) => ({ ...panel, index }))
    .sort((a, b) => {
      const areaDelta = b.width * b.height - a.width * a.height;
      if (Math.abs(areaDelta) > EPS) return areaDelta;
      const sideDelta = Math.max(b.width, b.height) - Math.max(a.width, a.height);
      if (Math.abs(sideDelta) > EPS) return sideDelta;
      return a.label.localeCompare(b.label) || a.index - b.index;
    });
}

function orientations(panel, allowRotation) {
  const upright = { width: panel.width, height: panel.height, rotated: false };
  if (!allowRotation || panel.grainLocked || Math.abs(panel.width - panel.height) < EPS) return [upright];
  return [upright, { width: panel.height, height: panel.width, rotated: true }];
}

// Guillotine split. Placing a `w × h` panel in the top-left of a free rect
// leaves two rectangles, and which way the cut runs decides how usable they
// are. Splitting along the *longer* leftover axis keeps the bigger offcut in
// one piece rather than dicing it into two thin strips.
function splitFreeRect(rect, width, height, kerf) {
  const rightWidth = rect.width - width - kerf;
  const bottomHeight = rect.height - height - kerf;
  const splitVertically = rect.width - width > rect.height - height;
  const right = splitVertically
    ? { x: rect.x + width + kerf, y: rect.y, width: rightWidth, height: rect.height }
    : { x: rect.x + width + kerf, y: rect.y, width: rightWidth, height };
  const bottom = splitVertically
    ? { x: rect.x, y: rect.y + height + kerf, width, height: bottomHeight }
    : { x: rect.x, y: rect.y + height + kerf, width: rect.width, height: bottomHeight };
  return [right, bottom].filter((r) => r.width > EPS && r.height > EPS);
}

/**
 * Packs panels onto as few sheets as possible.
 *
 * `trim` is stock removed from all four edges before anything is laid out — the
 * factory edge on a sheet of ply is rarely square enough to reference off.
 * Pieces that cannot fit the usable area in any allowed orientation are
 * returned in `oversize` rather than throwing, so one bad line does not hide a
 * usable plan for the rest of the list.
 *
 * `onHand` seeds the layout with offcuts already in the rack, each opened as
 * its own free rectangle before any new sheet is bought. Trim does not apply
 * to an offcut — its edges were already squared on a prior cut — and
 * best-area-fit already prefers whichever open rectangle wastes the least,
 * on-hand or purchased, so a piece lands on the rack offcut whenever one
 * fits and a new sheet is opened only once none of them do.
 */
export function optimizeSheets({ sheetWidth, sheetHeight, kerf = 0, trim = 0, panels, allowRotation = true, onHand = [] }) {
  if (!(sheetWidth > 0) || !(sheetHeight > 0)) throw new Error('Sheet width and height must both be greater than zero');
  if (!(kerf >= 0)) throw new Error('Saw kerf cannot be negative');
  if (!(trim >= 0)) throw new Error('Edge trim cannot be negative');
  if (!Array.isArray(panels) || panels.length === 0) throw new Error('Add at least one panel');
  if (panels.length > MAX_PANELS) throw new Error(`That is more than ${MAX_PANELS} pieces. Split the job into separate cut lists.`);
  if (!Array.isArray(onHand)) throw new Error('On-hand offcuts must be a list');
  if (onHand.some((piece) => !(piece.width > 0) || !(piece.height > 0))) {
    throw new Error('Each on-hand offcut needs a width and height greater than zero');
  }

  const usableWidth = sheetWidth - 2 * trim;
  const usableHeight = sheetHeight - 2 * trim;
  if (usableWidth <= EPS || usableHeight <= EPS) {
    throw new Error('Edge trim removes the whole sheet. Lower the trim or use a larger sheet.');
  }

  // Smallest offcut first purely so the plan's sheet numbering is stable and
  // reads the way a shop draws down its rack — best-area-fit below already
  // finds the tightest rectangle regardless of this order.
  const sheets = [...onHand]
    .sort((a, b) => a.width * a.height - b.width * b.height)
    .map((piece) => ({
      placements: [],
      free: [{ x: 0, y: 0, width: piece.width, height: piece.height }],
      source: 'on-hand',
      width: piece.width,
      height: piece.height,
    }));
  const oversize = [];
  const newFreeRect = () => ({ x: trim, y: trim, width: usableWidth, height: usableHeight });

  // A piece only has to fit a purchasable sheet's usable area or one on-hand
  // offcut — an on-hand piece can be larger than the configured sheet size
  // (a leftover full sheet, say), and a piece too big for a fresh sheet
  // should not be marked oversize when a big enough offcut is on the rack.
  const candidateBlanks = [{ width: usableWidth, height: usableHeight }, ...onHand];

  for (const panel of packingOrder(panels)) {
    const options = orientations(panel, allowRotation);
    const fitsSomewhere = options.some((o) => candidateBlanks.some(
      (b) => o.width <= b.width + EPS && o.height <= b.height + EPS,
    ));
    if (!fitsSomewhere) {
      oversize.push({ label: panel.label, width: panel.width, height: panel.height, grainLocked: panel.grainLocked });
      continue;
    }

    // Best-area-fit: the tightest free rect that still holds the piece, so the
    // large offcuts stay large for the pieces still to come.
    let best = null;
    for (const sheet of sheets) {
      for (const rect of sheet.free) {
        for (const option of options) {
          if (option.width > rect.width + EPS || option.height > rect.height + EPS) continue;
          const slack = rect.width * rect.height - option.width * option.height;
          if (!best || slack < best.slack - EPS) best = { sheet, rect, option, slack };
        }
      }
    }
    if (!best) {
      const sheet = { placements: [], free: [newFreeRect()], source: 'purchase', width: sheetWidth, height: sheetHeight };
      sheets.push(sheet);
      const rect = sheet.free[0];
      const option = options.find((o) => o.width <= rect.width + EPS && o.height <= rect.height + EPS);
      best = { sheet, rect, option, slack: 0 };
    }

    const { sheet, rect, option } = best;
    sheet.placements.push({
      label: panel.label,
      x: rect.x,
      y: rect.y,
      width: option.width,
      height: option.height,
      rotated: option.rotated,
    });
    sheet.free = sheet.free.filter((r) => r !== rect).concat(splitFreeRect(rect, option.width, option.height, kerf));
  }

  // An on-hand offcut nothing was cut from is still sitting on the rack —
  // it is neither consumed stock nor part of this plan, same as the linear
  // planner leaving an untouched offcut out of its bars.
  const usedSheets = sheets.filter((sheet) => sheet.placements.length);
  const purchasedSheets = usedSheets.filter((sheet) => sheet.source === 'purchase');
  const onHandUsed = usedSheets.length - purchasedSheets.length;

  const panelArea = usedSheets.reduce(
    (sum, sheet) => sum + sheet.placements.reduce((s, p) => s + p.width * p.height, 0),
    0,
  );
  // Each sheet's own area, not a fixed sheetWidth×sheetHeight times a count —
  // an on-hand offcut rarely matches the configured sheet size.
  const totalArea = usedSheets.reduce((sum, sheet) => sum + sheet.width * sheet.height, 0);
  const purchasedArea = purchasedSheets.reduce((sum, sheet) => sum + sheet.width * sheet.height, 0);
  const purchasedPanelArea = purchasedSheets.reduce(
    (sum, sheet) => sum + sheet.placements.reduce((s, p) => s + p.width * p.height, 0),
    0,
  );

  // What buying every sheet new, with no rack to draw from, would have taken.
  // Skipped when nothing on hand was actually usable, because then the
  // all-new plan is just this plan and the comparison says nothing.
  let purchasesAvoided = 0;
  if (onHandUsed > 0) {
    const baseline = optimizeSheets({ sheetWidth, sheetHeight, kerf, trim, panels, allowRotation });
    purchasesAvoided = Math.max(0, baseline.sheetsPurchased - purchasedSheets.length);
  }

  return {
    sheets: usedSheets.map((sheet) => ({
      placements: sheet.placements,
      // Offcuts worth keeping — the free space still standing as whole
      // rectangles, largest first. A shop racks these, so naming them is the
      // difference between an offcut and a scrap.
      offcuts: [...sheet.free].sort((a, b) => b.width * b.height - a.width * a.height),
      usedArea: sheet.placements.reduce((s, p) => s + p.width * p.height, 0),
      source: sheet.source,
      width: sheet.width,
      height: sheet.height,
    })),
    oversize,
    sheetWidth,
    sheetHeight,
    kerf,
    trim,
    panelCount: panels.length - oversize.length,
    totalArea,
    panelArea,
    // Kerf and edge trim are waste. Counting them as anything else would
    // flatter the number the user is here to reduce.
    wasteArea: totalArea - panelArea,
    utilization: totalArea > 0 ? panelArea / totalArea : 0,
    sheetsPurchased: purchasedSheets.length,
    onHandUsed,
    purchasesAvoided,
    // Utilization of only the sheets that cost money — the number "cost of
    // the offcut" below should be built on, since a free on-hand offcut's
    // waste costs nothing.
    purchasedUtilization: purchasedArea > 0 ? purchasedPanelArea / purchasedArea : 0,
  };
}

const round = (n) => Number(n).toFixed(2);

/** Plain-text plan for pasting into a job ticket or shop note. */
export function formatSheetPlan(result, { unit = 'in', sheetCost = null } = {}) {
  const count = result.sheets.length;
  const lines = [
    `Sheet cut plan: ${count} sheet${count === 1 ? '' : 's'} of ${round(result.sheetWidth)} × ${round(result.sheetHeight)} ${unit}`,
    `Saw kerf: ${round(result.kerf)} ${unit}`,
    ...(result.trim > 0 ? [`Edge trim per side: ${round(result.trim)} ${unit}`] : []),
    // An on-hand offcut is rarely sized like the sheet just named above, so
    // say so explicitly rather than let the headline size stand for every row.
    ...(result.onHandUsed ? [`From your on-hand offcuts: ${result.onHandUsed} (its own size, not necessarily the sheet size above)`, `New sheets to buy: ${result.sheetsPurchased}`] : []),
    `Pieces placed: ${result.panelCount}`,
    `Material used: ${(result.utilization * 100).toFixed(1)}% of the sheets in this plan`,
    `Offcut area: ${round(result.wasteArea)} sq ${unit}`,
    ...(Number.isFinite(sheetCost) && sheetCost > 0
      ? [
        `Material cost: ${round(result.sheetsPurchased * sheetCost)} at ${round(sheetCost)} per sheet`,
        `Cost of the offcut: ${round(result.sheetsPurchased * sheetCost * (1 - result.purchasedUtilization))}`,
      ]
      : []),
    ...(result.purchasesAvoided
      ? [`On-hand offcuts avoided buying ${result.purchasesAvoided} sheet${result.purchasesAvoided === 1 ? '' : 's'}${Number.isFinite(sheetCost) && sheetCost > 0 ? ` (${round(result.purchasesAvoided * sheetCost)})` : ''}`]
      : []),
    '',
  ];

  result.sheets.forEach((sheet, index) => {
    const tag = sheet.source === 'on-hand' ? ' (your on-hand offcut)' : '';
    lines.push(`Sheet ${index + 1}${tag}`);
    sheet.placements.forEach((p) => {
      lines.push(
        `  ${p.label}: ${round(p.width)} × ${round(p.height)} ${unit}` +
        ` at x ${round(p.x)}, y ${round(p.y)}${p.rotated ? ' (rotated 90°)' : ''}`,
      );
    });
    const keepers = sheet.offcuts.slice(0, 3);
    if (keepers.length) {
      lines.push(`  Offcuts: ${keepers.map((o) => `${round(o.width)} × ${round(o.height)}`).join(', ')} ${unit}`);
    }
    lines.push('');
  });

  if (result.oversize.length) {
    lines.push('Does not fit on a sheet — check the size, the trim, or allow rotation:');
    result.oversize.forEach((p) => lines.push(`  ${p.label}: ${round(p.width)} × ${round(p.height)} ${unit}`));
    lines.push('');
  }

  lines.push('Verify every dimension against your own stock and saw before cutting.');
  return lines.join('\n');
}

export const MAX_SHEET_CANDIDATES = 6;

function normalizeSheetCost(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Names a common sheet in the shop's words — 96×48 in is a 4×8 — and falls
 * back to the raw dimensions when the size is not a standard foot increment.
 */
export function sheetSizeLabel(width, height, unit = 'in') {
  if (unit === 'in') {
    const toFeet = (n) => {
      const feet = n / 12;
      const nearest = Math.round(feet);
      return Math.abs(feet - nearest) < 0.02 && nearest > 0 ? nearest : null;
    };
    const short = toFeet(Math.min(width, height));
    const long = toFeet(Math.max(width, height));
    if (short && long) return `${short}×${long}`;
  }
  return `${round(width)} × ${round(height)}`;
}

function rankSheetRows(a, b) {
  // A size that cannot take every piece is never the buy, even if it is cheap.
  if (a.fitsAll !== b.fitsAll) return a.fitsAll ? -1 : 1;
  if (a.totalCost != null && b.totalCost != null) {
    const costDelta = a.totalCost - b.totalCost;
    if (Math.abs(costDelta) > EPS) return costDelta;
  }
  if (a.sheetCount !== b.sheetCount) return a.sheetCount - b.sheetCount;
  if (a.oversizeCount !== b.oversizeCount) return a.oversizeCount - b.oversizeCount;
  const utilDelta = b.utilization - a.utilization;
  if (Math.abs(utilDelta) > EPS) return utilDelta;
  return a.width * a.height - b.width * b.height;
}

/**
 * Runs the same cut list against two or more sheet sizes and ranks them by
 * what the shop actually pays — material cost when every size has a price,
 * otherwise sheets to buy. Used to answer "4×8 or 5×5?" before a store run.
 */
export function compareSheetSizes({
  panels,
  kerf = 0,
  trim = 0,
  allowRotation = true,
  unit = 'in',
  candidates,
  onHand = [],
}) {
  if (!Array.isArray(candidates) || candidates.length < 2) {
    throw new Error('Add at least two sheet sizes to compare');
  }
  if (candidates.length > MAX_SHEET_CANDIDATES) {
    throw new Error(`Compare at most ${MAX_SHEET_CANDIDATES} sheet sizes at a time`);
  }
  if (!Array.isArray(panels) || panels.length === 0) {
    throw new Error('Add at least one panel');
  }

  const rows = candidates.map((candidate, index) => {
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    if (!(width > 0) || !(height > 0)) {
      throw new Error(`Size ${index + 1}: sheet width and height must both be greater than zero`);
    }
    const costPerSheet = normalizeSheetCost(candidate.costPerSheet);
    const result = optimizeSheets({
      sheetWidth: width,
      sheetHeight: height,
      kerf,
      trim,
      panels,
      allowRotation,
      onHand,
    });
    // On-hand offcuts are already paid for, so ranking is against what a size
    // still costs to buy — sheets purchased, not every sheet in the plan.
    const sheetCount = result.sheetsPurchased;
    const totalCost = costPerSheet == null ? null : sheetCount * costPerSheet;
    return {
      label: String(candidate.label || sheetSizeLabel(width, height, unit)).trim(),
      width,
      height,
      costPerSheet,
      sheetCount,
      onHandUsed: result.onHandUsed,
      utilization: result.utilization,
      wasteArea: result.wasteArea,
      oversizeCount: result.oversize.length,
      fitsAll: result.oversize.length === 0 && result.sheets.length > 0,
      totalCost,
      wasteCost: totalCost == null ? null : totalCost * (1 - result.purchasedUtilization),
      result,
    };
  });

  const ranked = [...rows].sort(rankSheetRows);
  const winner = ranked[0];
  const runnerUp = ranked[1] ?? null;
  let savings = null;
  if (winner && runnerUp) {
    if (winner.totalCost != null && runnerUp.totalCost != null) {
      savings = { kind: 'cost', amount: runnerUp.totalCost - winner.totalCost };
    } else {
      savings = { kind: 'sheets', amount: runnerUp.sheetCount - winner.sheetCount };
    }
  }

  return {
    rows: ranked,
    winner,
    runnerUp,
    savings,
    priced: rows.every((row) => row.totalCost != null),
  };
}

/** Plain-text ranking for a job ticket: which size to buy, and why. */
export function formatSheetComparison(comparison, { unit = 'in' } = {}) {
  const lines = [
    'Sheet size comparison for this cut list',
    ...comparison.rows.map((row) => {
      const size = `${row.label} (${round(row.width)} × ${round(row.height)} ${unit})`;
      const sheets = `${row.sheetCount} sheet${row.sheetCount === 1 ? '' : 's'}`;
      const used = `${(row.utilization * 100).toFixed(1)}% used`;
      const cost = row.totalCost != null ? `, $${round(row.totalCost)}` : '';
      const fit = row.fitsAll ? '' : `, ${row.oversizeCount} piece${row.oversizeCount === 1 ? '' : 's'} will not fit`;
      const pick = row === comparison.winner ? '  ← buy this size' : '';
      return `${size}: ${sheets}${cost}, ${used}${fit}${pick}`;
    }),
  ];
  if (comparison.savings && comparison.savings.amount > EPS) {
    if (comparison.savings.kind === 'cost') {
      lines.push(`Buying ${comparison.winner.label} costs $${round(comparison.savings.amount)} less than ${comparison.runnerUp.label}.`);
    } else {
      lines.push(`Buying ${comparison.winner.label} uses ${comparison.savings.amount} fewer sheet${comparison.savings.amount === 1 ? '' : 's'} than ${comparison.runnerUp.label}.`);
    }
  }
  lines.push('Verify prices and dimensions against your own supplier before buying.');
  return lines.join('\n');
}
