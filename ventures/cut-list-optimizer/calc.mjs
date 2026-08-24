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
