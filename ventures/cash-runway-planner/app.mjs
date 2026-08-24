export function forecast({ cash, weeklyIncome, collectionWeeks, weeklyCosts, weeks = 12 }) {
  const [startingCash, incomePerWeek, delayWeeks, costsPerWeek] = [cash, weeklyIncome, collectionWeeks, weeklyCosts].map(Number);
  const values = [startingCash, incomePerWeek, delayWeeks, costsPerWeek];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || delayWeeks > 52) {
    throw new Error('Enter non-negative numbers; collection delay must be 52 weeks or less.');
  }
  return Array.from({ length: weeks }, (_, index) => {
    const income = index >= delayWeeks ? incomePerWeek : 0;
    const balance = startingCash + (income - costsPerWeek) * (index + 1);
    return { week: index + 1, income, costs: costsPerWeek, balance };
  });
}

export function status(rows) {
  const low = rows.reduce((best, row) => row.balance < best.balance ? row : best, rows[0]);
  return { lowest: low.balance, week: low.week, shortfall: low.balance < 0 };
}

export function csv(rows) {
  return ['week,income,costs,projected_balance', ...rows.map((row) =>
    [row.week, row.income.toFixed(2), row.costs.toFixed(2), row.balance.toFixed(2)].join(','))].join('\n');
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#forecast');
  const output = document.querySelector('#output');
  const usage = document.querySelector('#usage');
  const save = (event) => {
    if (event) event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const rows = forecast(data);
    const result = status(rows);
    output.innerHTML = `<strong>${result.shortfall ? 'Cash shortfall' : 'Cash stays positive'}</strong><p>Lowest projected balance: $${result.lowest.toFixed(2)} in week ${result.week}.</p><ol>${rows.map((row) => `<li>Week ${row.week}: $${row.balance.toFixed(2)}</li>`).join('')}</ol>`;
    localStorage.setItem('cash-runway-draft', JSON.stringify(data));
    if (usage.checked && !navigator.doNotTrack && !navigator.globalPrivacyControl) {
      localStorage.setItem('cash-runway-events', String(Number(localStorage.getItem('cash-runway-events') || 0) + 1));
    }
  };
  const saved = JSON.parse(localStorage.getItem('cash-runway-draft') || 'null');
  if (saved) Object.entries(saved).forEach(([key, value]) => { const field = form.elements[key]; if (field) field.value = value; });
  form.addEventListener('submit', save);
  document.querySelector('#download').addEventListener('click', () => {
    const rows = forecast(Object.fromEntries(new FormData(form)));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' }));
    link.download = 'cash-runway-forecast.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });
  document.querySelector('#reset').addEventListener('click', () => { localStorage.removeItem('cash-runway-draft'); form.reset(); output.textContent = 'Enter your numbers to see the forecast.'; });
}
