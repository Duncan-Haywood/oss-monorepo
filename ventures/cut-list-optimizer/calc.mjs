export function parseCuts(text) {
  const cuts = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = line.trim().match(/^(\d+(?:\.\d+)?)\s*(?:x|\*|,)?\s*(\d+)?$/i);
    if (!match) throw new Error(`Line ${index + 1}: enter length and optional quantity, such as 24 x 3`);
    const length = Number(match[1]);
    const quantity = Number(match[2] || 1);
    if (!(length > 0) || !Number.isInteger(quantity) || quantity < 1) throw new Error(`Line ${index + 1}: length must be positive and quantity must be a whole number`);
    for (let i = 0; i < quantity; i += 1) cuts.push(length);
  }
  if (!cuts.length) throw new Error('Add at least one required cut');
  return cuts.sort((a, b) => b - a);
}

export function optimizeCutList({ stockLength, kerf, cuts }) {
  if (!(stockLength > 0) || kerf < 0) throw new Error('Stock length must be positive and kerf cannot be negative');
  if (!Array.isArray(cuts) || cuts.length === 0) throw new Error('Add at least one required cut');
  const sorted = [...cuts].sort((a, b) => b - a);
  if (sorted.some(cut => cut <= 0 || cut > stockLength)) throw new Error('Every required cut must fit inside one stock length');
  const bars = [];
  for (const cut of sorted) {
    let placed = false;
    for (const bar of bars) {
      const added = cut + (bar.cuts.length ? kerf : 0);
      if (bar.remaining >= added) {
        bar.cuts.push(cut);
        bar.remaining -= added;
        bar.used += added;
        placed = true;
        break;
      }
    }
    if (!placed) bars.push({ cuts: [cut], remaining: stockLength - cut, used: cut });
  }
  const totalStock = bars.length * stockLength;
  const totalCuts = sorted.reduce((sum, cut) => sum + cut, 0);
  return { bars, totalStock, totalCuts, waste: totalStock - totalCuts - Math.max(0, sorted.length - bars.length) * kerf, utilization: totalCuts / totalStock };
}

export function formatCutPlan(result, { stockUnit = 'units', stockLength, kerf } = {}) {
  const lines = [
    `Cut plan: ${result.bars.length} stock piece${result.bars.length === 1 ? '' : 's'}`,
    ...(stockLength ? [`Stock length: ${Number(stockLength).toFixed(2)} ${stockUnit}`] : []),
    ...(kerf !== undefined ? [`Kerf per cut: ${Number(kerf).toFixed(2)} ${stockUnit}`] : []),
    `Required material: ${result.totalCuts.toFixed(2)} ${stockUnit}`,
    `Offcut after kerf allowance: ${result.waste.toFixed(2)} ${stockUnit}`,
    '',
  ];
  result.bars.forEach((bar, index) => {
    lines.push(`Stock ${index + 1}: ${bar.cuts.map((cut) => cut.toFixed(2)).join(' + ')} ${stockUnit}`);
    lines.push(`  ${bar.remaining.toFixed(2)} ${stockUnit} remaining after kerf allowance`);
  });
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
