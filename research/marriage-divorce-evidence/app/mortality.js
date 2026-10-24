// Competing risks for the lifelong-marriage estimate: divorce (annual rates from a model lens)
// against the death of either partner (UN WPP 2024 U.S. death rates, data/us_mortality_wpp2024.json).
// Mirrors competing() in ../reproducibility/un_wpp2024_mortality/extract.py; tests/mortality.test.mjs
// checks it against Python. No dependencies.

// Central death rate for one sex ('M' or 'F'), calendar year and age; years and ages outside the
// table use its nearest edge (2024 or 2100; 15 or the open group 100+).
export function deathRate(table, sex, year, age) {
  const y = Math.min(Math.max(year, table.years[0]), table.years[table.years.length - 1]) - table.years[0];
  const a = Math.min(Math.max(age, table.ages[0]), table.ages[table.ages.length - 1]) - table.ages[0];
  return table[`mx${sex}`][y][a];
}

// a, b: { sex: 'M' | 'F', age } at the wedding; divorceRates[k]: annual divorce rate in marriage
// year k (null where the model gives no number, which stops the calculation there).
// Hazards are constant within each year, so each year's split is exact:
// P(first event is divorce in year k) = married(k-1) * hd / h * (1 - exp(-h)).
// Deaths are independent and follow the calendar year (cohort rates).
export function competingRisks(table, a, b, startYear, divorceRates, horizon = 80) {
  let married = 1;
  const out = { divorce: [], widowhood: [], married: [] };
  for (let k = 0; k < horizon; k++) {
    const hd = divorceRates[k];
    if (hd === null || hd === undefined) break;
    const ha = deathRate(table, a.sex, startYear + k, a.age + k);
    const hb = deathRate(table, b.sex, startYear + k, b.age + k);
    const h = hd + ha + hb;
    const pAny = 1 - Math.exp(-h);
    out.divorce.push((married * hd * pAny) / h);
    out.widowhood.push((married * (ha + hb) * pAny) / h);
    married *= Math.exp(-h);
    out.married.push(married);
  }
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  return {
    p_divorce: sum(out.divorce),
    p_widowhood: sum(out.widowhood),
    p_still_married: married,
    years: out.married.length,
    ...out,
  };
}
