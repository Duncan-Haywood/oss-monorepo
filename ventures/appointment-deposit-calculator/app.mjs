import { parseInputs, plan, policyDraft, comparisonNote } from './calc.mjs';
import { recordUsage, isUsageEnabled, setUsageEnabled } from './usage.mjs';

const form = document.querySelector('#deposit-form');
const money = (value, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);

function render() {
  const parsed = parseInputs(Object.fromEntries(new FormData(form)));
  const errors = document.querySelector('#errors');
  const results = document.querySelector('#results');
  if (!parsed.ok) {
    errors.textContent = parsed.errors.join(' ');
    errors.hidden = false;
    results.hidden = true;
    return null;
  }
  errors.hidden = true;
  const modeled = plan(parsed.values);
  const format = (n) => money(n, parsed.values.currency);
  document.querySelector('#deposit').textContent = format(modeled.deposit);
  document.querySelector('#balance').textContent = format(modeled.balance);
  document.querySelector('#annual').textContent = format(modeled.annual);
  document.querySelector('#bookings').textContent = `${modeled.weeklyBookings.toFixed(1)} / week (${modeled.annualBookings.toFixed(0)} / year)`;
  document.querySelector('#comparison').textContent = comparisonNote(parsed.values, modeled, format);
  document.querySelector('#policy').value = policyDraft(parsed.values, modeled, format);
  results.hidden = false;
  return modeled;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (render()) recordUsage('deposit_calculated');
});

document.querySelector('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#policy').value);
    document.querySelector('#status').textContent = ' Policy copied.';
    recordUsage('policy_copied');
  } catch {
    document.querySelector('#status').textContent = ' Select the policy text and copy it manually.';
  }
});

const optout = document.querySelector('#optout');
optout.checked = !isUsageEnabled();
if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) {
  optout.checked = true;
  optout.disabled = true;
}
optout.addEventListener('change', (event) => setUsageEnabled(!event.target.checked));
