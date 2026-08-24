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
 */
export function optimizeCutList({ stockLength, kerf, cuts, onHand = [], stockPrice = null }) {
  if (!(stockLength > 0) || kerf < 0) throw new Error('Stock length must be positive and kerf cannot be negative');
  if (!Array.isArray(cuts) || cuts.length === 0) throw new Error('Add at least one required cut');
  const sorted = [...cuts].sort((a, b) => b - a);
  const onHandSorted = [...onHand].sort((a, b) => a - b);
  const longestBin = Math.max(stockLength, ...onHandSorted);
  if (sorted.some(cut => cut <= 0 || cut > longestBin)) throw new Error('Every required cut must fit inside one stock length');

  const bins = onHandSorted.map(length => ({ cuts: [], remaining: length, used: 0, length, source: 'on-hand' }));
  for (const cut of sorted) {
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
      // A cut longer than new stock is only ever satisfiable from a long
      // offcut. If none is still free, buying more stock cannot help, so say
      // that rather than opening a bar the cut does not fit in.
      if (cut > stockLength) throw new Error(`No on-hand piece is long enough for the ${cut} cut, and it will not fit a new ${stockLength} stock piece`);
      bins.push({ cuts: [cut], remaining: stockLength - cut, used: cut, length: stockLength, source: 'purchase' });
    }
  }

  // An untouched offcut is still on the rack, so it is neither consumed stock
  // nor waste. Only bins that took a cut belong in the plan or the totals.
  const bars = bins.filter(bin => bin.cuts.length);
  const purchased = bars.filter(bin => bin.source === 'purchase').length;
  const onHandUsed = bars.length - purchased;
  const totalStock = bars.reduce((sum, bin) => sum + bin.length, 0);
  const totalCuts = sorted.reduce((sum, cut) => sum + cut, 0);
  const kerfAllowance = Math.max(0, sorted.length - bars.length) * kerf;

  const result = {
    bars,
    purchased,
    onHandUsed,
    totalStock,
    totalCuts,
    waste: totalStock - totalCuts - kerfAllowance,
    utilization: totalCuts / totalStock,
    cost: stockPrice > 0 ? purchased * stockPrice : null,
    purchasesAvoided: 0,
    savings: null,
  };

  // What the same job would cost buying everything new. This is the number
  // that answers "was it worth digging through the rack?". Skipped when a cut
  // only fits an offcut, because then the all-new plan does not exist.
  if (onHandSorted.length && sorted[0] <= stockLength) {
    const baseline = optimizeCutList({ stockLength, kerf, cuts, stockPrice });
    result.purchasesAvoided = Math.max(0, baseline.purchased - purchased);
    result.savings = stockPrice > 0 ? result.purchasesAvoided * stockPrice : null;
  }
  return result;
}

export function formatCutPlan(result, { stockUnit = 'units', stockLength, kerf, currency = '' } = {}) {
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
    ...(result.cost !== null ? [`Material cost: ${money(result.cost)}`] : []),
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
  return lines.join('\n');
}
