const $ = (id) => document.getElementById(id);
const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: '$', AUD: '$' };
export const CURRENCIES = Object.keys(symbols);
export const PAYMENT_TERMS = {
  prepaid: { days: 0, label: 'Prepaid on kickoff' },
  net15: { days: 15, label: 'Invoice on kickoff, Net 15' },
  net30: { days: 30, label: 'Invoice on kickoff, Net 30' },
  arrears15: { days: 45, label: 'Invoice at month-end, Net 15' },
  arrears30: { days: 60, label: 'Invoice at month-end, Net 30' },
};
export const inputIds = ['income', 'costs', 'hours', 'utilization', 'retainerHours', 'buffer', 'currency', 'paymentTerms'];
export const DRAFT_KEY = 'frc-draft-v1';
export const DISCLAIMER = 'Planning aid only. No warranty. Review and verify this output before relying on it; it is not financial advice.';

export function usableCurrency(value) {
  const key = String(value || '').trim().toUpperCase();
  return CURRENCIES.includes(key) ? key : '';
}

export function usablePaymentTerms(value) {
  const key = String(value || '').trim();
  return Object.hasOwn(PAYMENT_TERMS, key) ? key : '';
}

function draftField(id, raw) {
  if (typeof raw !== 'string') return '';
  if (id === 'currency') return usableCurrency(raw);
  if (id === 'paymentTerms') return usablePaymentTerms(raw);
  return raw;
}

export function saveDraft(values, storage) {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(inputIds.map((id) => [id, draftField(id, String(values[id] ?? ''))]))));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage) {
  try {
    const draft = JSON.parse(storage.getItem(DRAFT_KEY) || 'null');
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
    return Object.fromEntries(inputIds.map((id) => [id, draftField(id, draft[id])]));
  } catch {
    return null;
  }
}

export function calculatePlan(values) {
  const income = Number(values.income), costs = Number(values.costs), hours = Number(values.hours);
  const utilization = Number(values.utilization) / 100, retainerHours = Number(values.retainerHours);
  const buffer = Number(values.buffer) / 100;
  if (![income, costs, hours, utilization, retainerHours, buffer].every(Number.isFinite) || income < 0 || costs < 0 || hours <= 0 || utilization <= 0 || utilization > 1 || retainerHours <= 0 || buffer < 0 || buffer > 1) throw new Error('Enter valid positive values. Utilization and buffer must be percentages from 0 to 100.');
  const capacity = hours * utilization;
  if (retainerHours > capacity) throw new Error(`The retainer needs ${retainerHours} hours, but your plan has only ${capacity.toFixed(1)} billable hours available.`);
  const target = income + costs;
  const rate = target / capacity;
  const retainer = Math.round(rate * retainerHours * (1 + buffer) * 100) / 100;
  return { capacity, remainingCapacity: capacity - retainerHours, target, rate, retainer };
}

export function calculateCashFloat(target, paymentTerms = 'prepaid') {
  if (!Number.isFinite(Number(target)) || Number(target) < 0) {
    throw new Error('Enter a valid monthly revenue target before estimating cash you must float.');
  }
  const key = usablePaymentTerms(paymentTerms) || 'prepaid';
  const term = PAYMENT_TERMS[key];
  return {
    paymentTerms: key,
    days: term.days,
    cashToFloat: Math.round(Number(target) * (term.days / 30) * 100) / 100,
    label: term.label,
    prepaid: term.days === 0,
  };
}

function moneyText(value, currency = 'USD') {
  const symbol = symbols[usableCurrency(currency) || 'USD'] || symbols.USD;
  return `${symbol}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatCashFloatAdvice(float, currency = 'USD') {
  if (float.prepaid) {
    return `Payment terms: ${float.label}. First cash arrives at kickoff, so you do not float this retainer.`;
  }
  return `Payment terms: ${float.label}. First cash is about ${float.days} days after kickoff. You need to float ${moneyText(float.cashToFloat, currency)} — one monthly revenue target times ${float.days}/30 — from savings or other clients. If you cannot float that, require prepaid or 50% on kickoff.`;
}

export function formatArrearsComparison(target, currency = 'USD') {
  const worst = calculateCashFloat(target, 'arrears30');
  return `If this client paid at month-end plus Net 30, you would float ${moneyText(worst.cashToFloat, currency)} for about 60 days.`;
}

export function formatProposalSummary(input, plan, currency = 'USD') {
  const money = (value) => moneyText(value, currency);
  const float = calculateCashFloat(plan.target, input.paymentTerms);
  return `Monthly retainer proposal\n\nIncluded: ${input.retainerHours} hours per month\nMonthly price: ${money(plan.retainer)}\nAdditional work: ${money(plan.rate)} per hour\nCapacity left after retainer: ${plan.remainingCapacity.toFixed(1)} hours\n${formatCashFloatAdvice(float, currency)}\n\nPricing assumptions\nTake-home goal: ${money(Number(input.income))} per month\nBusiness costs and taxes: ${money(Number(input.costs))} per month\nAvailable work hours: ${input.hours} per month\nBillable utilization: ${input.utilization}%\nScope / revision buffer: ${input.buffer}%\n\nResponse time and out-of-scope work: define in the agreement.\n\n${DISCLAIMER}`;
}

if (typeof document !== 'undefined') {
  const form = $('calculator');
  const money = (n) => moneyText(n, $('currency').value);
  const read = () => Object.fromEntries(inputIds.map((id) => [id, $(id).value]));
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const syncCurrencyLabels = () => {
    const symbol = symbols[$('currency').value] || symbols.USD;
    document.querySelectorAll('[data-currency-symbol]').forEach((el) => { el.textContent = symbol; });
  };
  const save = () => storage && saveDraft(read(), storage) && ($('draftStatus').textContent = 'Draft saved locally.');
  if (storage) {
    const draft = loadDraft(storage);
    if (draft) {
      inputIds.forEach((id) => { if (draft[id] !== '') $(id).value = draft[id]; });
      $('draftStatus').textContent = 'Restored your last draft from this browser.';
    }
    inputIds.forEach((id) => {
      $(id).addEventListener('input', save);
      $(id).addEventListener('change', save);
    });
  }
  $('currency').addEventListener('change', syncCurrencyLabels);
  syncCurrencyLabels();
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const input = read();
      const plan = calculatePlan(input);
      const float = calculateCashFloat(plan.target, input.paymentTerms);
      $('errors').hidden = true;
      $('results').hidden = false;
      $('rate').textContent = money(plan.rate);
      $('retainer').textContent = money(plan.retainer);
      $('capacity').textContent = `${plan.capacity.toFixed(1)} hrs`;
      $('remaining').textContent = `${plan.remainingCapacity.toFixed(1)} hrs`;
      $('target').textContent = money(plan.target);
      $('termsLabel').textContent = float.label;
      $('cashFloat').textContent = money(float.cashToFloat);
      $('cashFloat').classList.toggle('needs-float', !float.prepaid);
      $('explanation').textContent = `Your ${input.utilization}% utilization leaves ${plan.capacity.toFixed(1)} billable hours from ${input.hours} available hours. After this retainer, ${plan.remainingCapacity.toFixed(1)} hours remain for other work, admin, and recovery. The retainer includes a ${input.buffer}% buffer for scope drift; it is a planning floor, not a promise of results. ${formatCashFloatAdvice(float, input.currency)} ${formatArrearsComparison(plan.target, input.currency)}`;
      $('summary').value = formatProposalSummary(input, plan, input.currency);
      $('copyStatus').textContent = '';
      track('calculate');
      if (!float.prepaid) track('payment-terms-float');
    } catch (error) {
      $('errors').textContent = error.message;
      $('errors').hidden = false;
      $('results').hidden = true;
    }
  });
  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('summary').value);
      $('copyStatus').textContent = ' Copied.';
      track('copy-summary');
    } catch {
      $('copyStatus').textContent = ' Copy was blocked. Select the summary and copy it manually.';
    }
  });
  $('download').addEventListener('click', () => {
    if (!$('summary').value) return;
    const blob = new Blob([$('summary').value], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'freelance-retainer-proposal.txt';
    link.click();
    URL.revokeObjectURL(link.href);
    $('copyStatus').textContent = ' Proposal downloaded.';
    track('download-summary');
  });
}
