const $ = (id) => document.getElementById(id);
const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: '$', AUD: '$' };
export const inputIds = ['income', 'costs', 'hours', 'utilization', 'retainerHours', 'buffer', 'committedHours', 'offeredPrice'];
export const SHARE_FIELDS = [...inputIds, 'currency'];
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

export function encodeShare(values) {
  const params = new URLSearchParams();
  for (const field of SHARE_FIELDS) {
    const value = values?.[field];
    if (value === '' || value == null) continue;
    params.set(field, String(value));
  }
  return params.toString();
}

export function decodeShare(raw) {
  const params = new URLSearchParams(String(raw || '').replace(/^[?#]/, ''));
  const result = {};
  for (const field of SHARE_FIELDS) {
    if (!params.has(field)) continue;
    const value = params.get(field);
    if (value !== '') result[field] = value;
  }
  return result;
}

function optionalNumber(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  return Number(value);
}

export function compareOffer(plan, offeredPriceRaw) {
  if (offeredPriceRaw === '' || offeredPriceRaw == null) return null;
  const offeredPrice = Number(offeredPriceRaw);
  if (!Number.isFinite(offeredPrice) || offeredPrice < 0) {
    throw new Error('Enter a valid offered monthly price, or leave it blank.');
  }
  const loadedRate = plan.rate * (1 + plan.buffer);
  const bufferedHours = plan.retainerHours * (1 + plan.buffer);
  const hoursAtFloor = loadedRate > 0 ? Math.round((offeredPrice / loadedRate) * 10) / 10 : 0;
  const gap = Math.round((offeredPrice - plan.retainer) * 100) / 100;
  return {
    offeredPrice,
    gap,
    belowFloor: offeredPrice + 0.005 < plan.retainer,
    effectiveIncluded: offeredPrice / plan.retainerHours,
    effectiveBuffered: bufferedHours > 0 ? offeredPrice / bufferedHours : 0,
    hoursAtFloor,
  };
}

export function calculatePlan(values) {
  const income = Number(values.income), costs = Number(values.costs), hours = Number(values.hours);
  const utilization = Number(values.utilization) / 100, retainerHours = Number(values.retainerHours);
  const buffer = Number(values.buffer) / 100;
  const committedHours = optionalNumber(values.committedHours, 0);
  if (![income, costs, hours, utilization, retainerHours, buffer, committedHours].every(Number.isFinite) || income < 0 || costs < 0 || hours <= 0 || utilization <= 0 || utilization > 1 || retainerHours <= 0 || buffer < 0 || buffer > 1 || committedHours < 0) throw new Error('Enter valid positive values. Utilization and buffer must be percentages from 0 to 100. Hours already sold cannot be negative.');
  const capacity = hours * utilization;
  if (committedHours > capacity) throw new Error(`You already committed ${committedHours} hours, but your plan has only ${capacity.toFixed(1)} billable hours.`);
  const remainingAfterCommitted = capacity - committedHours;
  if (retainerHours > remainingAfterCommitted) {
    throw new Error(committedHours > 0
      ? `The retainer needs ${retainerHours} hours, but only ${remainingAfterCommitted.toFixed(1)} billable hours remain after existing clients.`
      : `The retainer needs ${retainerHours} hours, but your plan has only ${capacity.toFixed(1)} billable hours available.`);
  }
  const target = income + costs;
  const rate = target / capacity;
  const retainer = Math.round(rate * retainerHours * (1 + buffer) * 100) / 100;
  const remainingCapacity = remainingAfterCommitted - retainerHours;
  const identicalRetainersThatFit = Math.floor(remainingAfterCommitted / retainerHours);
  const fillRevenue = Math.round(identicalRetainersThatFit * retainer * 100) / 100;
  const bookedHours = committedHours + retainerHours;
  const plan = {
    capacity,
    remainingCapacity,
    remainingAfterCommitted,
    target,
    rate,
    retainer,
    buffer,
    retainerHours,
    committedHours,
    bookedHours,
    bookedShare: bookedHours / capacity,
    concentration: retainerHours / capacity,
    identicalRetainersThatFit,
    fillRevenue,
  };
  plan.offer = compareOffer(plan, values.offeredPrice);
  return plan;
}

export function formatProposalSummary(input, plan, currency = 'USD') {
  const symbol = symbols[currency] || symbols.USD;
  const money = (value) => `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const moneyExact = (value) => `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const lines = [
    'Monthly retainer proposal',
    '',
    `Included: ${input.retainerHours} hours per month`,
    `Monthly price: ${money(plan.retainer)}`,
    `Additional work: ${money(plan.rate)} per hour`,
    `Capacity left after retainer: ${plan.remainingCapacity.toFixed(1)} hours`,
    '',
    'Book this month',
    `Hours already sold to other clients: ${plan.committedHours}`,
    `Hours booked after this retainer: ${plan.bookedHours.toFixed(1)} (${Math.round(plan.bookedShare * 100)}% of billable capacity)`,
    `Identical retainers that fit remaining capacity: ${plan.identicalRetainersThatFit}`,
    `If you filled remaining capacity with this retainer: ${money(plan.fillRevenue)}`,
  ];
  if (plan.concentration >= 0.4) {
    lines.push(`This one client would be ${Math.round(plan.concentration * 100)}% of billable capacity — a planning observation, not a recommendation.`);
  }
  if (plan.offer) {
    lines.push(
      '',
      'Client offer comparison',
      `Offered monthly price: ${moneyExact(plan.offer.offeredPrice)}`,
      `Gap to your planning floor: ${plan.offer.gap >= 0 ? '+' : ''}${moneyExact(plan.offer.gap)}`,
      `Effective rate on included hours: ${money(plan.offer.effectiveIncluded)}`,
      `Effective rate if the buffer is used: ${money(plan.offer.effectiveBuffered)}`,
      `Hours you can include at your floor: ${plan.offer.hoursAtFloor}`,
      plan.offer.belowFloor
        ? 'This offer is below your planning floor.'
        : 'This offer meets or exceeds your planning floor.',
    );
  }
  lines.push(
    '',
    'Pricing assumptions',
    `Take-home goal: ${money(Number(input.income))} per month`,
    `Business costs and taxes: ${money(Number(input.costs))} per month`,
    `Available work hours: ${input.hours} per month`,
    `Billable utilization: ${input.utilization}%`,
    `Scope / revision buffer: ${input.buffer}%`,
    '',
    'Response time and out-of-scope work: define in the agreement.',
    '',
    DISCLAIMER,
  );
  return lines.join('\n');
}

if (typeof document !== 'undefined') {
  const form = $('calculator');
  const money = (n) => `${symbols[$('currency').value]}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const moneyExact = (n) => `${symbols[$('currency').value]}${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const read = () => Object.fromEntries(inputIds.map((id) => [id, $(id).value]));
  const snapshot = () => ({ ...read(), currency: $('currency').value });
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const save = () => storage && saveDraft(read(), storage) && ($('draftStatus').textContent = 'Draft saved locally.');
  const shared = decodeShare(location.hash || location.search);
  if (Object.keys(shared).length) {
    inputIds.forEach((id) => { if (shared[id] != null) $(id).value = shared[id]; });
    if (shared.currency && symbols[shared.currency]) $('currency').value = shared.currency;
    $('draftStatus').textContent = 'Restored a shared planning link. Nothing was uploaded.';
  } else if (storage) {
    const draft = loadDraft(storage);
    if (draft) {
      inputIds.forEach((id) => { if (draft[id] !== '') $(id).value = draft[id]; });
      $('draftStatus').textContent = 'Restored your last draft from this browser.';
    }
  }
  if (storage) {
    inputIds.forEach((id) => $(id).addEventListener('input', save));
    $('currency').addEventListener('change', save);
  }
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
  const renderOffer = (offer) => {
    const block = $('offerBlock');
    if (!offer) {
      block.hidden = true;
      return;
    }
    block.hidden = false;
    block.classList.toggle('below-floor', offer.belowFloor);
    $('offered').textContent = moneyExact(offer.offeredPrice);
    $('offerGap').textContent = `${offer.gap >= 0 ? '+' : ''}${moneyExact(offer.gap)}`;
    $('offerIncluded').textContent = money(offer.effectiveIncluded);
    $('offerBuffered').textContent = money(offer.effectiveBuffered);
    $('offerHours').textContent = `${offer.hoursAtFloor} hrs`;
    $('offerVerdict').textContent = offer.belowFloor
      ? 'This offer is below your planning floor. Cut included hours, drop the buffer, or walk away — the arithmetic does not choose for you.'
      : 'This offer meets or exceeds your planning floor on the assumptions you entered.';
    track('compare-offer');
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
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
      $('committedOut').textContent = `${plan.committedHours} hrs`;
      $('bookedOut').textContent = `${plan.bookedHours.toFixed(1)} hrs (${Math.round(plan.bookedShare * 100)}%)`;
      $('fillCount').textContent = String(plan.identicalRetainersThatFit);
      $('fillRevenue').textContent = money(plan.fillRevenue);
      const concentrationNote = plan.concentration >= 0.4
        ? ` This one client would be ${Math.round(plan.concentration * 100)}% of billable capacity — a planning observation, not a recommendation.`
        : '';
      $('explanation').textContent = `Your ${input.utilization}% utilization leaves ${plan.capacity.toFixed(1)} billable hours from ${input.hours} available hours. After existing clients (${plan.committedHours} hrs) and this retainer, ${plan.remainingCapacity.toFixed(1)} hours remain. ${plan.identicalRetainersThatFit} identical retainer${plan.identicalRetainersThatFit === 1 ? '' : 's'} fit the remaining capacity after existing clients. The retainer includes a ${input.buffer}% buffer for scope drift; it is a planning floor, not a promise of results.${concentrationNote}`;
      $('summary').value = formatProposalSummary(input, plan, $('currency').value);
      $('copyStatus').textContent = '';
      renderOffer(plan.offer);
      const encoded = encodeShare(snapshot());
      if (encoded && history.replaceState) {
        const url = new URL(location.href);
        url.hash = encoded;
        history.replaceState(null, '', url);
      }
      track('calculate');
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
  $('share').addEventListener('click', async () => {
    const encoded = encodeShare(snapshot());
    const url = new URL(location.href);
    url.hash = encoded;
    if (history.replaceState) history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      $('copyStatus').textContent = ' Private planning link copied. It never leaves this browser unless you send it.';
      track('copy-share-link');
    } catch {
      $('copyStatus').textContent = ' Copy was blocked. The address bar now holds the planning link — copy it from there.';
    }
  });
}
