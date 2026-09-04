const LINE = /^(\d+(?:\.\d+)?)\s*(?:x|\*|,)?\s*(\d+)?$/i;

function parseLengthList(text, label) {
  const lengths = [];
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = line.trim().match(LINE);
    if (!match) throw new Error(`${label} ${index + 1}: enter length and optional quantity, such as 24 x 3`);
    const length = Number(match[1]);
    const quantity = Number(match[2] || 1);
    if (!(length > 0) || !Number.isInteger(quantity) || quantity < 1) throw new Error(`${label} ${index + 1}: length must be positive and quantity must be a whole number`);
    for (let i = 0; i < quantity; i += 1) lengths.push(length);
  }
  return lengths;
}

export function parseCuts(text) {
  const cuts = parseLengthList(text, 'Line').sort((a, b) => b - a);
  if (!cuts.length) throw new Error('Add at least one required cut');
  return cuts;
}

/**
 * Offcuts already in the rack. Unlike the required cuts, an empty list is the
 * normal case, so this returns [] instead of throwing.
 */
export function parseStock(text) {
  return parseLengthList(text ?? '', 'On-hand line').sort((a, b) => a - b);
}

/**
 * First-fit decreasing over a bin list that is seeded with the maker's own
 * offcuts before any new stock is opened.
 *
 * On-hand pieces are offered shortest-first on purpose: consuming the scrap
 * that barely fits keeps the longer pieces whole for the next job, which is
 * how a shop actually wants its rack drawn down. With no on-hand stock the
 * bin list is empty at the start and this reduces exactly to the original
 * plain first-fit-decreasing packing.
 *
 * A cut that cannot be placed — too long for any stock this plan could buy or
 * has on the rack, or one that would fit some on-hand piece in principle but
 * every long-enough one is already claimed by an earlier, larger cut — is
 * returned in `oversize` rather than thrown. A single mistyped length (a
 * comma where a decimal point belonged, an extra digit) used to erase the
 * plan for every other, correctly-sized cut on the list; now the rest still
 * gets a real cutting plan and the bad line is called out on its own, the
 * same trade-off `optimizeSheets` already makes for sheet goods.
 */
export function optimizeCutList({ stockLength, kerf, cuts, onHand = [], stockCost = null }) {
  if (!Number.isFinite(stockLength) || stockLength <= 0 || !Number.isFinite(kerf) || kerf < 0) {
    throw new Error('Stock length must be positive and kerf must be a finite, non-negative number');
  }
  if (!Array.isArray(cuts) || cuts.length === 0) throw new Error('Add at least one required cut');
  if (stockCost !== null && (!Number.isFinite(Number(stockCost)) || Number(stockCost) < 0)) throw new Error('Stock cost must be a non-negative number');
  if (cuts.some(cut => !Number.isFinite(cut) || cut <= 0)) throw new Error('Every required cut must be a positive, finite number');
  const sorted = [...cuts].sort((a, b) => b - a);
  const onHandSorted = [...onHand].sort((a, b) => a - b);
  const longestBin = Math.max(stockLength, ...onHandSorted, 0);

  const bins = onHandSorted.map(length => ({ cuts: [], remaining: length, used: 0, length, source: 'on-hand' }));
  const oversize = [];
  for (const cut of sorted) {
    if (cut > longestBin) {
      // Too long for new stock and for the longest offcut on the rack — no
      // reordering of the rest of the list changes that.
      oversize.push(cut);
      continue;
    }
    let placed = false;
    for (const bin of bins) {
      const added = cut + (bin.cuts.length ? kerf : 0);
      if (bin.remaining >= added) {
        bin.cuts.push(cut);
        bin.remaining -= added;
        bin.used += added;
        placed = true;
        break;
      }
    }
    if (!placed) {
      if (cut > stockLength) {
        // Fits some on-hand piece in principle, but every long-enough one is
        // already claimed by an earlier, larger cut, and new stock is too
        // short to help. Report it and keep packing the rest of the list.
        oversize.push(cut);
        continue;
      }
      bins.push({ cuts: [cut], remaining: stockLength - cut, used: cut, length: stockLength, source: 'purchase' });
    }
  }

  // An untouched offcut is still on the rack, so it is neither consumed stock
  // nor waste. Only bins that took a cut belong in the plan or the totals.
  const bars = bins.filter(bin => bin.cuts.length);
  const purchased = bars.filter(bin => bin.source === 'purchase').length;
  const onHandUsed = bars.length - purchased;
  const placedCount = bars.reduce((sum, bin) => sum + bin.cuts.length, 0);
  const totalStock = bars.reduce((sum, bin) => sum + bin.length, 0);
  // Only cuts actually placed count as required material — an oversize line
  // was never cut from anything, so it must not inflate what this plan used.
  const totalCuts = bars.reduce((sum, bin) => sum + bin.cuts.reduce((s, c) => s + c, 0), 0);
  const kerfAllowance = Math.max(0, placedCount - bars.length) * kerf;

  const result = {
    bars,
    oversize,
    purchased,
    onHandUsed,
    totalStock,
    totalCuts,
    waste: totalStock - totalCuts - kerfAllowance,
    utilization: totalStock > 0 ? totalCuts / totalStock : 0,
    stockCost: stockCost === null ? null : Number(stockCost),
    // Only pieces actually bought cost money. An offcut off the rack is already
    // paid for, so it must not be multiplied into the total — that difference
    // is the whole reason to plan against the rack in the first place.
    totalCost: stockCost === null ? null : purchased * Number(stockCost),
    purchasesAvoided: 0,
    savings: null,
  };

  // What the same job would cost buying everything new. This is the number
  // that answers "was it worth digging through the rack?". `optimizeCutList`
  // never throws on its own oversize cuts any more, so this can run
  // unconditionally whenever the rack was actually used.
  if (onHandUsed > 0) {
    const baseline = optimizeCutList({ stockLength, kerf, cuts, stockCost });
    result.purchasesAvoided = Math.max(0, baseline.purchased - purchased);
    result.savings = stockCost === null ? null : result.purchasesAvoided * Number(stockCost);
  }
  return result;
}

export function formatCutPlan(result, { stockUnit = 'units', stockLength, kerf, currency = '$' } = {}) {
  const money = value => `${currency}${value.toFixed(2)}`;
  // Two decimals is right for lengths but wrong for kerf: the common 1/8"
  // blade is 0.125, and rounding it to 0.13 on a job ticket misstates the
  // allowance the plan was actually built on. Give kerf a third decimal only
  // when it carries one.
  const kerfText = value => Number(value).toFixed(3).endsWith('0') ? Number(value).toFixed(2) : Number(value).toFixed(3);
  const lines = [
    `Cut plan: ${result.bars.length} stock piece${result.bars.length === 1 ? '' : 's'}`,
    ...(stockLength ? [`Stock length: ${Number(stockLength).toFixed(2)} ${stockUnit}`] : []),
    ...(kerf !== undefined ? [`Kerf per cut: ${kerfText(kerf)} ${stockUnit}`] : []),
    ...(result.onHandUsed ? [`From your on-hand stock: ${result.onHandUsed}`, `To buy: ${result.purchased}`] : []),
    `Required material: ${result.totalCuts.toFixed(2)} ${stockUnit}`,
    `Offcut after kerf allowance: ${result.waste.toFixed(2)} ${stockUnit}`,
    ...(result.totalCost !== null ? [`Material cost: ${money(result.totalCost)} (${result.purchased} × ${money(result.stockCost)})`] : []),
    ...(result.purchasesAvoided ? [`On-hand stock avoided buying ${result.purchasesAvoided} piece${result.purchasesAvoided === 1 ? '' : 's'}${result.savings !== null ? ` (${money(result.savings)})` : ''}`] : []),
    '',
  ];
  // With no offcuts in play every row is a bought bar, so plain "Stock N"
  // numbering reads fine. Once the rack is involved the two kinds have to be
  // told apart at the saw, and a bought piece is numbered among the pieces
  // actually being bought rather than by its position in the plan.
  let purchaseNumber = 0;
  result.bars.forEach((bar, index) => {
    let label = `Stock ${index + 1}`;
    if (result.onHandUsed) {
      purchaseNumber += bar.source === 'purchase' ? 1 : 0;
      label = bar.source === 'on-hand' ? `From your rack (${bar.length.toFixed(2)} ${stockUnit})` : `New piece ${purchaseNumber}`;
    }
    lines.push(`${label}: ${bar.cuts.map((cut) => cut.toFixed(2)).join(' + ')} ${stockUnit}`);
    lines.push(`  ${bar.remaining.toFixed(2)} ${stockUnit} remaining after kerf allowance`);
  });

  if (result.oversize && result.oversize.length) {
    lines.push('');
    lines.push('Does not fit any stock length on hand or to buy — check the length:');
    result.oversize.forEach((cut) => lines.push(`  ${cut.toFixed(2)} ${stockUnit}`));
  }

  return lines.join('\n');
}

const LENGTH_EPS = 1e-9;

// Lengths a lumberyard or metals supplier actually sells. The labels are
// what the shop asks for; the numbers are in the same unit as the cut list.
export const COMMON_STOCK_LENGTHS = {
  in: [
    { id: '8ft', label: '8 ft', length: 96 },
    { id: '10ft', label: '10 ft', length: 120 },
    { id: '12ft', label: '12 ft', length: 144 },
    { id: '16ft', label: '16 ft', length: 192 },
  ],
  ft: [
    { id: '8ft', label: '8 ft', length: 8 },
    { id: '10ft', label: '10 ft', length: 10 },
    { id: '12ft', label: '12 ft', length: 12 },
    { id: '16ft', label: '16 ft', length: 16 },
  ],
  cm: [
    { id: '240', label: '240 cm', length: 240 },
    { id: '300', label: '300 cm', length: 300 },
    { id: '360', label: '360 cm', length: 360 },
    { id: '400', label: '400 cm', length: 400 },
  ],
  mm: [
    { id: '2400', label: '2400 mm', length: 2400 },
    { id: '3000', label: '3000 mm', length: 3000 },
    { id: '3600', label: '3600 mm', length: 3600 },
    { id: '4000', label: '4000 mm', length: 4000 },
  ],
};

export function sameStockLength(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < LENGTH_EPS;
}

function rankStockRows(a, b) {
  if (a.fits !== b.fits) return a.fits ? -1 : 1;
  if (Math.abs(a.buyLength - b.buyLength) > LENGTH_EPS) return a.buyLength - b.buyLength;
  if (a.bars !== b.bars) return a.bars - b.bars;
  return a.waste - b.waste;
}

function packStockCandidate(size, { cuts, kerf }) {
  try {
    const result = optimizeCutList({ stockLength: size.length, kerf, cuts });
    return {
      id: size.id,
      label: size.label,
      length: size.length,
      current: Boolean(size.current),
      bars: result.bars.length,
      buyLength: result.bars.length * size.length,
      waste: result.waste,
      utilization: result.utilization,
      fits: result.bars.length > 0,
    };
  } catch (error) {
    return {
      id: size.id,
      label: size.label,
      length: size.length,
      current: Boolean(size.current),
      bars: Infinity,
      buyLength: Infinity,
      waste: Infinity,
      utilization: 0,
      fits: false,
      error: error.message,
    };
  }
}

/**
 * Packs the same cut list onto common sold lengths, plus the length already
 * on the form when it is not one of those. Ranked by purchased length among
 * sizes that can take every piece — the money, not the bar count.
 */
export function compareStockLengths({ cuts, kerf = 0, unit = 'in', current = null }) {
  if (!Array.isArray(cuts) || cuts.length === 0) throw new Error('Add at least one required cut');

  const sizes = (COMMON_STOCK_LENGTHS[unit] || COMMON_STOCK_LENGTHS.in).map((size) => ({ ...size }));
  if (Number.isFinite(current) && current > 0) {
    const match = sizes.find((size) => sameStockLength(size.length, current));
    if (match) {
      match.current = true;
    } else {
      sizes.unshift({
        id: 'current',
        label: 'Your stock',
        length: current,
        current: true,
      });
    }
  }

  const rows = sizes.map((size) => packStockCandidate(size, { cuts, kerf })).sort(rankStockRows);
  const winner = rows.find((row) => row.fits) || null;
  return { unit, rows, winner };
}

export function formatStockComparison(comparison, { unit = 'in' } = {}) {
  const usedUnit = comparison.unit || unit;
  const lines = [
    `Stock length comparison (${usedUnit}) — ranked by material you would buy`,
    '',
  ];
  for (const row of comparison.rows) {
    const marker = comparison.winner && row.id === comparison.winner.id ? ' ← buy this' : '';
    const yours = row.current ? ' (the length on the form)' : '';
    if (!row.fits) {
      lines.push(`${row.label}${yours}: at least one cut does not fit ${row.length.toFixed(2)} ${usedUnit} stock`);
      continue;
    }
    lines.push(
      `${row.label}${yours}: ${row.bars} piece${row.bars === 1 ? '' : 's'} of ${row.length.toFixed(2)} ${usedUnit}`
      + ` (${row.buyLength.toFixed(2)} ${usedUnit} bought, ${(row.utilization * 100).toFixed(1)}% used, ${row.waste.toFixed(2)} ${usedUnit} offcut)${marker}`,
    );
  }
  lines.push('');
  lines.push('Verify every length against your own stock and saw before cutting.');
  return lines.join('\n');
}
