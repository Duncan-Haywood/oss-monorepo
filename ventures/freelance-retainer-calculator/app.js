const $ = (id) => document.getElementById(id);
const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: '$', AUD: '$' };
export const inputIds = ['income', 'costs', 'hours', 'utilization', 'retainerHours', 'buffer'];
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
  const symbol = symbols[currency] || symbols.USD;
  const money = (value) => `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const usage = comparison ?? compareRetainerUsage(plan, { retainerHours: Number(input.retainerHours) });
  return `Monthly retainer proposal\n\nIncluded: ${input.retainerHours} hours per month\nMonthly price: ${money(plan.retainer)}\nAdditional work: ${money(plan.rate)} per hour\nCapacity left after retainer: ${plan.remainingCapacity.toFixed(1)} hours\nUnpaid extras drop below the floor after: ${usage.breakEvenHours} hours\n\nPricing assumptions\nTake-home goal: ${money(Number(input.income))} per month\nBusiness costs and taxes: ${money(Number(input.costs))} per month\nAvailable work hours: ${input.hours} per month\nBillable utilization: ${input.utilization}%\nScope / revision buffer: ${input.buffer}%\n\nResponse time and out-of-scope work: define in the agreement.\n\n${DISCLAIMER}`;
}

if (typeof document !== 'undefined') {
  const form = $('calculator');
  const money = (n) => `${symbols[$('currency').value]}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const read = () => Object.fromEntries(inputIds.map((id) => [id, $(id).value]));
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const save = () => storage && saveDraft(read(), storage) && ($('draftStatus').textContent = 'Draft saved locally.');
  if (storage) {
    const draft = loadDraft(storage);
    if (draft) {
      inputIds.forEach((id) => { if (draft[id] !== '') $(id).value = draft[id]; });
      $('draftStatus').textContent = 'Restored your last draft from this browser.';
    }
    inputIds.forEach((id) => $(id).addEventListener('input', save));
  }
  const moneyExact = (n) => `${symbols[$('currency').value]}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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
  const renderUsage = (comparison) => {
    const tbody = $('usageRows');
    tbody.replaceChildren();
    for (const row of comparison.rows) {
      const tr = document.createElement('tr');
      if (!row.coversFloor) tr.className = 'warn-row';
      const cells = [
        row.label,
        `${row.hoursUsed} h`,
        moneyExact(row.retainerRevenue),
        moneyExact(row.hourlyAtFloor),
        moneyExact(row.effectiveRate),
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
      $('errors').hidden = true;
      $('results').hidden = false;
      $('rate').textContent = money(plan.rate);
      $('retainer').textContent = money(plan.retainer);
      $('capacity').textContent = `${plan.capacity.toFixed(1)} hrs`;
      $('remaining').textContent = `${plan.remainingCapacity.toFixed(1)} hrs`;
      $('target').textContent = money(plan.target);
      $('explanation').textContent = `Your ${input.utilization}% utilization leaves ${plan.capacity.toFixed(1)} billable hours from ${input.hours} available hours. After this retainer, ${plan.remainingCapacity.toFixed(1)} hours remain for other work, admin, and recovery. The retainer includes a ${input.buffer}% buffer for scope drift; it is a planning floor, not a promise of results.`;
      renderUsage(comparison);
      $('summary').value = formatProposalSummary(input, plan, $('currency').value, comparison);
      $('copyStatus').textContent = '';
      track('calculate');
      track('retainer_usage_compared');
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
