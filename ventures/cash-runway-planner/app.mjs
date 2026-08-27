export function forecast({ cash, weeklyIncome, collectionWeeks, weeklyCosts, weeks = 12 }) {
  const [startingCash, incomePerWeek, delayWeeks, costsPerWeek] = [cash, weeklyIncome, collectionWeeks, weeklyCosts].map(Number);
  const values = [startingCash, incomePerWeek, delayWeeks, costsPerWeek];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || delayWeeks > 52) {
    throw new Error('Enter non-negative numbers; collection delay must be 52 weeks or less.');
  }
  // The delay is compared against a whole-week index below, so a fraction is
  // silently rounded up: 1.5 weeks forecasts identically to 2 and the visitor
  // never learns their number was ignored. Reject it instead of quietly
  // answering a different question than the one they asked.
  if (!Number.isInteger(delayWeeks)) {
    throw new Error('Collection delay must be a whole number of weeks.');
  }
  if (!Number.isInteger(Number(weeks)) || Number(weeks) < 1) {
    throw new Error('Forecast length must be a whole number of weeks, at least 1.');
  }
  let balance = startingCash;
  return Array.from({ length: weeks }, (_, index) => {
    const income = index >= delayWeeks ? incomePerWeek : 0;
    balance += income - costsPerWeek;
    return { week: index + 1, income, costs: costsPerWeek, balance };
  });
}

export function status(rows) {
  if (!rows.length) throw new Error('At least one forecast week is required.');
  const low = rows.reduce((best, row) => row.balance < best.balance ? row : best, rows[0]);
  // The lowest week is not the week that matters. Cash runs out the first time
  // the balance goes negative, which can be weeks before the trough -- that is
  // the date the owner has to move an invoice or a bill in front of.
  const firstShortfall = rows.find((row) => row.balance < 0);
  return { lowest: low.balance, week: low.week, shortfall: low.balance < 0, shortfallWeek: firstShortfall?.week ?? null };
}

export function csv(rows) {
  return ['week,income,costs,projected_balance', ...rows.map((row) =>
    [row.week, row.income.toFixed(2), row.costs.toFixed(2), row.balance.toFixed(2)].join(','))].join('\n');
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#forecast');
  const output = document.querySelector('#output');
  const usage = document.querySelector('#usage');
  // Storage can throw outright when a browser is set to block site data. That
  // is a preference, not a failure: the forecast still works, so a blocked
  // write must never take down the render that follows it.
  const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* site data blocked */ } };
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const countable = () => usage.checked && !navigator.doNotTrack && !navigator.globalPrivacyControl;
  const bump = (key) => { if (countable()) store(key, String(Number(read(key) || 0) + 1)); };
  const showError = (error) => {
    output.innerHTML = `<strong>Check the figures</strong><p>${error.message}</p>`;
  };
  const save = (event) => {
    if (event) event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let rows;
    let result;
    try {
      rows = forecast(data);
      result = status(rows);
    } catch (error) {
      showError(error);
      return;
    }
    const action = result.shortfall
      ? `<p>First projected shortfall: <strong>week ${result.shortfallWeek}</strong>. Bring collection forward or move a cost out before that week.</p>`
      : `<p>No projected negative balance in this ${rows.length}-week window.</p>`;
    output.innerHTML = `<strong>${result.shortfall ? 'Cash shortfall' : 'Cash stays positive'}</strong><p>Lowest projected balance: $${result.lowest.toFixed(2)} in week ${result.week}.</p>${action}<ol>${rows.map((row) => `<li>Week ${row.week}: ${row.income ? `+$${row.income.toFixed(2)} collected, ` : ''}-$${row.costs.toFixed(2)} costs, balance $${row.balance.toFixed(2)}</li>`).join('')}</ol>`;
    store('cash-runway-draft', JSON.stringify(data));
    bump('cash-runway-events');
  };
  let saved = null;
  try { saved = JSON.parse(read('cash-runway-draft') || 'null'); } catch { saved = null; }
  if (saved) Object.entries(saved).forEach(([key, value]) => { const field = form.elements[key]; if (field) field.value = value; });
  form.addEventListener('submit', save);
  // Download is a plain button, so it bypasses the form's own validation. A
  // bad figure used to throw here and leave a button that visibly did nothing.
  document.querySelector('#download').addEventListener('click', () => {
    let rows;
    try {
      rows = forecast(Object.fromEntries(new FormData(form)));
    } catch (error) {
      showError(error);
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' }));
    link.download = 'cash-runway-forecast.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    bump('cash-runway-csv-events');
  });
  document.querySelector('#reset').addEventListener('click', () => {
    try { localStorage.removeItem('cash-runway-draft'); } catch { /* site data blocked; the reset still clears the form */ }
    form.reset();
    output.textContent = 'Enter your numbers to see the forecast.';
  });
}
