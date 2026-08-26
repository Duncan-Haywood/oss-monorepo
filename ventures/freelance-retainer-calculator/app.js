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

export const USAGE_FRACTIONS = [0.5, 0.75, 1, 1.25];

function round2(value) {
  return Math.round(value * 100) / 100;
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
  return { capacity, remainingCapacity: capacity - retainerHours, target, rate, retainer, retainerHours };
}

/**
 * A monthly retainer price is not cash. Days until first payment times
 * the monthly revenue target / 30 is the working capital this client
 * asks you to lend. Prepaid is zero. Month-end plus Net 30 is ~60 days.
 */
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

export function comparePaymentTerms(target) {
  return Object.keys(PAYMENT_TERMS).map((key) => calculateCashFloat(target, key));
}

function moneyText(value, currency = 'USD') {
  const symbol = symbols[usableCurrency(currency) || 'USD'] || symbols.USD;
  return `${symbol}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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

/**
 * Show whether the quoted retainer still pays the hourly floor when the
 * client uses half the block, the full block, or more than they bought.
 *
 * Light use leaves unused-hour cash (the usual renewal risk). Use above
 * break-even without billed overage drops the effective rate below the floor.
 */
export function compareRetainerUsage(plan, options = {}) {
  const rate = Number(plan?.rate);
  const retainer = Number(plan?.retainer);
  const retainerHours = Number(options.retainerHours ?? plan?.retainerHours);
  if (![rate, retainer, retainerHours].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Need a priced retainer and a positive hourly floor to compare usage.');
  }

  const fractions = Array.isArray(options.fractions) && options.fractions.length
    ? options.fractions
    : USAGE_FRACTIONS;
  if (fractions.some((fraction) => !Number.isFinite(fraction) || fraction <= 0)) {
    throw new Error('Usage fractions must be positive numbers.');
  }

  const breakEvenHours = round2(retainer / rate);
  const bufferHours = round2(breakEvenHours - retainerHours);
  const rows = fractions.map((fraction) => {
    const hoursUsed = round2(retainerHours * fraction);
    const hourlyAtFloor = round2(rate * hoursUsed);
    const effectiveRate = round2(retainer / hoursUsed);
    const unusedHours = round2(Math.max(0, retainerHours - hoursUsed));
    const overageHours = round2(Math.max(0, hoursUsed - retainerHours));
    const overageBill = round2(overageHours * rate);
    const withOverageRevenue = round2(retainer + overageBill);
    const withOverageEffectiveRate = round2(withOverageRevenue / hoursUsed);
    const percent = Math.round(fraction * 100);
    return {
      fraction,
      label: `${percent}% of the block`,
      hoursUsed,
      retainerRevenue: round2(retainer),
      hourlyAtFloor,
      freelancerDelta: round2(retainer - hourlyAtFloor),
      effectiveRate,
      coversFloor: effectiveRate + 1e-9 >= rate,
      unusedHours,
      overageHours,
      withOverageRevenue,
      withOverageEffectiveRate,
      withOverageCoversFloor: withOverageEffectiveRate + 1e-9 >= rate,
      withOverageDelta: round2(withOverageRevenue - hourlyAtFloor),
    };
  });

  const overageRisk = rows.find((row) => row.overageHours > 0 && !row.coversFloor);
  const unusedRisk = rows.find((row) => row.unusedHours > 0 && row.fraction <= 0.5);
  const parts = [];
  if (bufferHours >= 0) {
    parts.push(`This retainer covers your ${round2(rate)}/hr floor up to ${breakEvenHours} hours. The ${retainerHours}-hour block still has ${bufferHours} hours of buffer before unpaid extras drop you below that floor.`);
  } else {
    parts.push(`The quoted price already sits below your hourly floor at full use (${round2(retainer / retainerHours)}/hr vs ${round2(rate)}/hr). Raise the retainer or cut included hours before you send it.`);
  }
  if (overageRisk) {
    parts.push(`At ${overageRisk.hoursUsed} hours with no overage you are at ${overageRisk.effectiveRate}/hr. Bill those extra hours at the floor rate and the same month still covers (${overageRisk.withOverageEffectiveRate}/hr).`);
  }
  if (unusedRisk && unusedRisk.freelancerDelta > 0) {
    parts.push(`At ${unusedRisk.hoursUsed} hours they paid the full retainer for work that would have billed ${unusedRisk.hourlyAtFloor} at your floor rate. That unused-hour cash is why light-use retainers often fail to renew — shorten the block or sell hourly if that is the real pattern.`);
  }

  return {
    quotedHourlyRate: round2(rate),
    retainerPrice: round2(retainer),
    includedHours: retainerHours,
    breakEvenHours,
    bufferHours,
    rows,
    recommendation: parts.join(' '),
  };
}

export function formatProposalSummary(input, plan, currency = 'USD', comparison = null) {
  const money = (value) => moneyText(value, currency);
  const usage = comparison ?? compareRetainerUsage(plan, { retainerHours: Number(input.retainerHours) });
  const float = calculateCashFloat(plan.target, input.paymentTerms);
  return `Monthly retainer proposal\n\nIncluded: ${input.retainerHours} hours per month\nMonthly price: ${money(plan.retainer)}\nAdditional work: ${money(plan.rate)} per hour\nCapacity left after retainer: ${plan.remainingCapacity.toFixed(1)} hours\nUnpaid extras drop below the floor after: ${usage.breakEvenHours} hours\n${formatCashFloatAdvice(float, currency)}\n\nPricing assumptions\nTake-home goal: ${money(Number(input.income))} per month\nBusiness costs and taxes: ${money(Number(input.costs))} per month\nAvailable work hours: ${input.hours} per month\nBillable utilization: ${input.utilization}%\nScope / revision buffer: ${input.buffer}%\n\nResponse time and out-of-scope work: define in the agreement.\n\n${DISCLAIMER}`;
}

if (typeof document !== 'undefined') {
  const track = (event) => {
    if ($('optOut')?.checked || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    try {
      const events = JSON.parse(localStorage.getItem('frc-events') || '{}');
      events[event] = (events[event] || 0) + 1;
      localStorage.setItem('frc-events', JSON.stringify(events));
    } catch {
      // Usage measurement is best-effort and must never block the calculator.
    }
  };

  if ($('calculator')) {
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
        inputIds.forEach((id) => { if (draft[id] !== '' && $(id)) $(id).value = draft[id]; });
        $('draftStatus').textContent = 'Restored your last draft from this browser.';
      }
      inputIds.forEach((id) => {
        if (!$(id)) return;
        $(id).addEventListener('input', save);
        $(id).addEventListener('change', save);
      });
    }
    $('currency').addEventListener('change', syncCurrencyLabels);
    syncCurrencyLabels();
    const renderUsage = (comparison) => {
      const tbody = $('usageRows');
      tbody.replaceChildren();
      for (const row of comparison.rows) {
        const tr = document.createElement('tr');
        if (!row.coversFloor) tr.className = 'warn-row';
        const cells = [
          row.label,
          `${row.hoursUsed} h`,
          money(row.retainerRevenue),
          money(row.hourlyAtFloor),
          money(row.effectiveRate),
          row.coversFloor ? 'Yes — at or above floor' : 'No — below floor',
        ];
        for (const text of cells) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      $('usageBreakEven').textContent = `${comparison.breakEvenHours} hours`;
      $('usageVerdict').textContent = comparison.recommendation;
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const input = read();
        const plan = calculatePlan(input);
        const comparison = compareRetainerUsage(plan);
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
        renderUsage(comparison);
        $('summary').value = formatProposalSummary(input, plan, input.currency, comparison);
        $('copyStatus').textContent = '';
        track('calculate');
        track('retainer_usage_compared');
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

  if ($('floatForm')) {
    const renderTerms = (target, currency) => {
      const tbody = $('floatRows');
      tbody.replaceChildren();
      for (const row of comparePaymentTerms(target)) {
        const tr = document.createElement('tr');
        if (!row.prepaid) tr.className = 'needs-float';
        const cells = [row.label, `${row.days} days`, moneyText(row.cashToFloat, currency)];
        for (const text of cells) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      $('floatVerdict').textContent = formatArrearsComparison(target, currency);
    };
    $('floatForm').addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const target = Number($('floatTarget').value);
        const currency = $('floatCurrency').value;
        const rows = comparePaymentTerms(target);
        $('floatErrors').hidden = true;
        $('floatResults').hidden = false;
        renderTerms(target, currency);
        track('payment_terms_compared');
        if (rows.some((row) => !row.prepaid && row.cashToFloat > 0)) track('payment-terms-float');
      } catch (error) {
        $('floatErrors').textContent = error.message;
        $('floatErrors').hidden = false;
        $('floatResults').hidden = true;
      }
    });
  }
}
