const $ = (id) => document.getElementById(id);
const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: '$', AUD: '$' };

export function calculatePlan(values) {
  const income = Number(values.income), costs = Number(values.costs), hours = Number(values.hours);
  const utilization = Number(values.utilization) / 100, retainerHours = Number(values.retainerHours);
  const buffer = Number(values.buffer) / 100;
  if (![income, costs, hours, utilization, retainerHours, buffer].every(Number.isFinite) || income < 0 || costs < 0 || hours <= 0 || utilization <= 0 || utilization > 1 || retainerHours <= 0 || buffer < 0 || buffer > 1) throw new Error('Enter valid positive values. Utilization and buffer must be percentages from 0 to 100.');
  const capacity = hours * utilization;
  const target = income + costs;
  const rate = target / capacity;
  const retainer = Math.round(rate * retainerHours * (1 + buffer) * 100) / 100;
  return { capacity, target, rate, retainer };
}

if (typeof document !== 'undefined') {
  const form = $('calculator');
  const money = (n) => `${symbols[$('currency').value]}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const read = () => Object.fromEntries(['income', 'costs', 'hours', 'utilization', 'retainerHours', 'buffer'].map((id) => [id, $(id).value]));
  const track = (event) => {
    if ($('optOut').checked || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    try {
      const events = JSON.parse(localStorage.getItem('frc-events') || '{}');
      events[event] = (events[event] || 0) + 1;
      localStorage.setItem('frc-events', JSON.stringify(events));
    } catch {
      // Usage measurement is best-effort and must never block the calculator.
    }
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); try { const input = read(); const plan = calculatePlan(input); $('errors').hidden = true; $('results').hidden = false; $('rate').textContent = money(plan.rate); $('retainer').textContent = money(plan.retainer); $('capacity').textContent = `${plan.capacity.toFixed(1)} hrs`; $('target').textContent = money(plan.target); $('explanation').textContent = `Your ${input.utilization}% utilization leaves ${plan.capacity.toFixed(1)} billable hours from ${input.hours} available hours. The retainer includes a ${input.buffer}% buffer for scope drift; it is a planning floor, not a promise of results.`; $('summary').value = `Monthly retainer proposal\n\nIncluded: ${input.retainerHours} hours per month\nMonthly price: ${money(plan.retainer)}\nAdditional work: ${money(plan.rate)} per hour\nResponse time and out-of-scope work: define in the agreement.`; track('calculate'); } catch (error) { $('errors').textContent = error.message; $('errors').hidden = false; $('results').hidden = true; } });
  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('summary').value);
      $('copyStatus').textContent = ' Copied.';
      track('copy-summary');
    } catch {
      $('copyStatus').textContent = ' Copy was blocked. Select the summary and copy it manually.';
    }
  });
}
