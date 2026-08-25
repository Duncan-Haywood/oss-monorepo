import { buildShareUrl, decodeInputs, FIELD_IDS } from './share.mjs';

const $ = (id) => document.getElementById(id);
const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: '$', AUD: '$' };
export const inputIds = ['income', 'costs', 'hours', 'utilization', 'retainerHours', 'buffer'];
export { FIELD_IDS };
export const DRAFT_KEY = 'frc-draft-v1';
export const DISCLAIMER = 'Planning aid only. No warranty. Review and verify this output before relying on it; it is not financial advice.';

export function saveDraft(values, storage) {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(inputIds.map((id) => [id, String(values[id] ?? '')]))));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage) {
  try {
    const draft = JSON.parse(storage.getItem(DRAFT_KEY) || 'null');
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
    return Object.fromEntries(inputIds.map((id) => [id, typeof draft[id] === 'string' ? draft[id] : '']));
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

export function formatProposalSummary(input, plan, currency = 'USD') {
  const symbol = symbols[currency] || symbols.USD;
  const money = (value) => `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `Monthly retainer proposal\n\nIncluded: ${input.retainerHours} hours per month\nMonthly price: ${money(plan.retainer)}\nAdditional work: ${money(plan.rate)} per hour\nCapacity left after retainer: ${plan.remainingCapacity.toFixed(1)} hours\n\nPricing assumptions\nTake-home goal: ${money(Number(input.income))} per month\nBusiness costs and taxes: ${money(Number(input.costs))} per month\nAvailable work hours: ${input.hours} per month\nBillable utilization: ${input.utilization}%\nScope / revision buffer: ${input.buffer}%\n\nResponse time and out-of-scope work: define in the agreement.\n\n${DISCLAIMER}`;
}

if (typeof document !== 'undefined') {
  const form = $('calculator');
  const money = (n) => `${symbols[$('currency').value]}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const read = () => ({
    ...Object.fromEntries(inputIds.map((id) => [id, $(id).value])),
    currency: $('currency').value,
  });
  const apply = (values) => {
    for (const id of FIELD_IDS) {
      if (values[id] === undefined || !$(id)) continue;
      $(id).value = String(values[id]);
    }
  };
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const save = () => storage && saveDraft(read(), storage) && ($('draftStatus').textContent = 'Draft saved locally.');
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
  const renderPlan = () => {
    try {
      const input = read();
      const plan = calculatePlan(input);
      $('errors').hidden = true;
      $('results').hidden = false;
      $('rate').textContent = money(plan.rate);
      $('retainer').textContent = money(plan.retainer);
      $('capacity').textContent = `${plan.capacity.toFixed(1)} hrs`;
      $('remaining').textContent = `${plan.remainingCapacity.toFixed(1)} hrs`;
      $('target').textContent = money(plan.target);
      $('explanation').textContent = `Your ${input.utilization}% utilization leaves ${plan.capacity.toFixed(1)} billable hours from ${input.hours} available hours. After this retainer, ${plan.remainingCapacity.toFixed(1)} hours remain for other work, admin, and recovery. The retainer includes a ${input.buffer}% buffer for scope drift; it is a planning floor, not a promise of results.`;
      $('summary').value = formatProposalSummary(input, plan, input.currency);
      $('copyStatus').textContent = '';
      track('calculate');
      return true;
    } catch (error) {
      $('errors').textContent = error.message;
      $('errors').hidden = false;
      $('results').hidden = true;
      return false;
    }
  };
  const copyShareLink = async () => {
    const link = buildShareUrl(location.href, read());
    try { history.replaceState(null, '', link); } catch { /* file URLs may reject it */ }
    try {
      await navigator.clipboard.writeText(link);
      $('copyStatus').textContent = ' Shareable link copied.';
      $('draftStatus').textContent = 'Shareable link copied. It carries only these planning numbers in the URL hash.';
      track('share-link');
    } catch {
      window.prompt('Copy this private link:', link);
      $('copyStatus').textContent = ' Copy was blocked. The link is in the prompt.';
    }
  };
  // A shared link wins over a local draft so the recipient always sees the
  // sender's numbers. HTML defaults fill any field the link omitted.
  const fromLink = decodeInputs(location.hash || location.search);
  const openedFromLink = Object.keys(fromLink).length > 0;
  if (openedFromLink) {
    apply(fromLink);
    $('draftStatus').textContent = 'Opened a shared plan. Review the numbers before you quote.';
    renderPlan();
  } else if (storage) {
    const draft = loadDraft(storage);
    if (draft) {
      inputIds.forEach((id) => { if (draft[id] !== '') $(id).value = draft[id]; });
      $('draftStatus').textContent = 'Restored your last draft from this browser.';
    }
  }
  if (storage) inputIds.forEach((id) => $(id).addEventListener('input', save));
  form.addEventListener('submit', (event) => { event.preventDefault(); renderPlan(); });
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
  $('share').addEventListener('click', copyShareLink);
  $('shareResult')?.addEventListener('click', copyShareLink);
}
