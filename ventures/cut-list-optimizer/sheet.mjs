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
 */
export function optimizeSheets({ sheetWidth, sheetHeight, kerf = 0, trim = 0, panels, allowRotation = true }) {
  if (!(sheetWidth > 0) || !(sheetHeight > 0)) throw new Error('Sheet width and height must both be greater than zero');
  if (!(kerf >= 0)) throw new Error('Saw kerf cannot be negative');
  if (!(trim >= 0)) throw new Error('Edge trim cannot be negative');
  if (!Array.isArray(panels) || panels.length === 0) throw new Error('Add at least one panel');
  if (panels.length > MAX_PANELS) throw new Error(`That is more than ${MAX_PANELS} pieces. Split the job into separate cut lists.`);

  const usableWidth = sheetWidth - 2 * trim;
  const usableHeight = sheetHeight - 2 * trim;
  if (usableWidth <= EPS || usableHeight <= EPS) {
    throw new Error('Edge trim removes the whole sheet. Lower the trim or use a larger sheet.');
  }

  const sheets = [];
  const oversize = [];
  const newFreeRect = () => ({ x: trim, y: trim, width: usableWidth, height: usableHeight });

  for (const panel of packingOrder(panels)) {
    const options = orientations(panel, allowRotation);
    const fitsSomewhere = options.some((o) => o.width <= usableWidth + EPS && o.height <= usableHeight + EPS);
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
      const sheet = { placements: [], free: [newFreeRect()] };
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

  const sheetArea = sheetWidth * sheetHeight;
  const panelArea = sheets.reduce(
    (sum, sheet) => sum + sheet.placements.reduce((s, p) => s + p.width * p.height, 0),
    0,
  );
  const totalArea = sheets.length * sheetArea;

  return {
    sheets: sheets.map((sheet) => ({
      placements: sheet.placements,
      // Offcuts worth keeping — the free space still standing as whole
      // rectangles, largest first. A shop racks these, so naming them is the
      // difference between an offcut and a scrap.
      offcuts: [...sheet.free].sort((a, b) => b.width * b.height - a.width * a.height),
      usedArea: sheet.placements.reduce((s, p) => s + p.width * p.height, 0),
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
    `Pieces placed: ${result.panelCount}`,
    `Material used: ${(result.utilization * 100).toFixed(1)}% of the sheets bought`,
    `Offcut area: ${round(result.wasteArea)} sq ${unit}`,
    ...(Number.isFinite(sheetCost) && sheetCost > 0
      ? [
        `Material cost: ${round(count * sheetCost)} at ${round(sheetCost)} per sheet`,
        `Cost of the offcut: ${round(count * sheetCost * (1 - result.utilization))}`,
      ]
      : []),
    '',
  ];

  result.sheets.forEach((sheet, index) => {
    lines.push(`Sheet ${index + 1}`);
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
