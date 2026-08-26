export function planCashflow(input) {
  const invoice = Math.max(0, Number(input.invoice) || 0);
  const materials = Math.max(0, Number(input.materials) || 0);
  const weeklyBurn = Math.max(0, Number(input.weeklyBurn) || 0);
  const terms = Math.max(0, Math.round(Number(input.terms) || 0));
  const retention = Math.min(99, Math.max(0, Number(input.retention) || 0));
  const delay = Math.max(0, Math.round(Number(input.delay) || 0));
  const startingCash = Math.max(0, Number(input.startingCash) || 0);
  const collectable = invoice * (1 - retention / 100);
  const expectedCashDay = terms + delay;
  const cashNeeded = materials + weeklyBurn * (expectedCashDay / 7);
  const gap = Math.max(0, cashNeeded - startingCash);
  const surplus = Math.max(0, startingCash - cashNeeded);
  return { invoice, materials, weeklyBurn, terms, retention, delay, startingCash, collectable, expectedCashDay, cashNeeded, gap, surplus, safe: gap === 0 };
}

export function csvRow(plan) {
  return ['invoice', 'materials', 'weeklyBurn', 'terms', 'retention', 'delay', 'startingCash', 'collectable', 'expectedCashDay', 'cashNeeded', 'gap', 'surplus'].map((key) => plan[key]).join(',');
}
