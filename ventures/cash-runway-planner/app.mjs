export function forecast({ cash, weeklyIncome, collectionWeeks, weeklyCosts, weeks = 12 }) {
  const [startingCash, incomePerWeek, delayWeeks, costsPerWeek] = [cash, weeklyIncome, collectionWeeks, weeklyCosts].map(Number);
  const values = [startingCash, incomePerWeek, delayWeeks, costsPerWeek];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || delayWeeks > 52) {
    throw new Error('Enter non-negative numbers; collection delay must be 52 weeks or less.');
  }
  let balance = startingCash;
  return Array.from({ length: weeks }, (_, index) => {
    const income = index >= delayWeeks ? incomePerWeek : 0;
    balance += income - costsPerWeek;
    return { week: index + 1, income, costs: costsPerWeek, balance };
  });
}

export function status(rows) {
  const low = rows.reduce((best, row) => row.balance < best.balance ? row : best, rows[0]);
  return { lowest: low.balance, week: low.week, shortfall: low.balance < 0 };
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
    if (usage.checked) localStorage.setItem('cash-runway-events', String(Number(localStorage.getItem('cash-runway-events') || 0) + 1));
  };
  const saved = JSON.parse(localStorage.getItem('cash-runway-draft') || 'null');
  if (saved) Object.entries(saved).forEach(([key, value]) => { const field = form.elements[key]; if (field) field.value = value; });
  form.addEventListener('submit', save);
  document.querySelector('#reset').addEventListener('click', () => { localStorage.removeItem('cash-runway-draft'); form.reset(); output.textContent = 'Enter your numbers to see the forecast.'; });
}
