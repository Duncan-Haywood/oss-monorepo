export function planCashflow(input) {
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const invoice = Math.max(0, number(input.invoice));
  const materials = Math.max(0, number(input.materials));
  const weeklyBurn = Math.max(0, number(input.weeklyBurn));
  const terms = Math.max(0, Math.round(number(input.terms)));
  const retention = Math.min(99, Math.max(0, number(input.retention)));
  const delay = Math.max(0, Math.round(number(input.delay)));
  const retentionRelease = Math.max(0, Math.round(number(input.retentionRelease)));
  const startingCash = Math.max(0, number(input.startingCash));
  const collectable = invoice * (1 - retention / 100);
  const expectedCashDay = terms + delay;
  const retentionAmount = invoice - collectable;
  const retentionCashDay = expectedCashDay + retentionRelease;
  const cashNeeded = materials + weeklyBurn * (expectedCashDay / 7);
  const gap = Math.max(0, cashNeeded - startingCash);
  const surplus = Math.max(0, startingCash - cashNeeded);
  return { invoice, materials, weeklyBurn, terms, retention, delay, retentionRelease, startingCash, collectable, retentionAmount, expectedCashDay, retentionCashDay, cashNeeded, gap, surplus, safe: gap === 0 };
}

export function csvRow(plan) {
  return ['invoice', 'materials', 'weeklyBurn', 'terms', 'retention', 'delay', 'retentionRelease', 'startingCash', 'collectable', 'retentionAmount', 'expectedCashDay', 'retentionCashDay', 'cashNeeded', 'gap', 'surplus'].map((key) => plan[key]).join(',');
}
