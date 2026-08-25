const $ = (id) => document.getElementById(id);
const symbols = { USD: '$', EUR: '€', GBP: '£', CAD: '$', AUD: '$' };
export const inputIds = ['income', 'costs', 'hours', 'utilization', 'retainerHours', 'buffer'];
export const DRAFT_KEY = 'frc-draft-v1';
export const DISCLAIMER = 'Planning aid only. No warranty. Review and verify this output before relying on it; it is not financial advice.';
export const DEFAULT_RETAINER_HOURS = [10, 15, 20, 25, 30];

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

export function retainerHourOptions(currentHours, defaults = DEFAULT_RETAINER_HOURS) {
  const hours = Number(currentHours);
  const options = defaults.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (Number.isFinite(hours) && hours > 0) options.push(hours);
  return [...new Set(options)].sort((left, right) => left - right);
}

export function compareRetainerScenarios(values, hourOptions) {
  const selectedHours = Number(values.retainerHours);
  return retainerHourOptions(values.retainerHours, hourOptions ?? DEFAULT_RETAINER_HOURS).map((retainerHours) => {
    try {
      const plan = calculatePlan({ ...values, retainerHours });
      const shareOfCapacity = plan.capacity > 0 ? retainerHours / plan.capacity : 0;
      return {
        retainerHours,
        ok: true,
        selected: selectedHours === retainerHours,
        capacity: plan.capacity,
        remainingCapacity: plan.remainingCapacity,
        target: plan.target,
        rate: plan.rate,
        retainer: plan.retainer,
        shareOfCapacity,
        annual: Math.round(plan.retainer * 12 * 100) / 100,
        effectiveRate: plan.retainer / retainerHours,
      };
    } catch (error) {
      return {
        retainerHours,
        ok: false,
        selected: selectedHours === retainerHours,
        error: error.message,
      };
    }
  });
}

export function formatScenarioComparison(scenarios, currency = 'USD') {
  const symbol = symbols[currency] || symbols.USD;
  const money = (value) => `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const lines = ['Package options from the same assumptions'];
  for (const row of scenarios) {
    if (!row.ok) {
      lines.push(`${row.retainerHours} hours — exceeds billable capacity`);
      continue;
    }
    const mark = row.selected ? '  ← this proposal' : '';
    lines.push(`${row.retainerHours} hours — ${money(row.retainer)} / month — ${row.remainingCapacity.toFixed(1)} hours left${mark}`);
  }
  return lines.join('\n');
}

export function scenarioInsight(scenarios) {
  const selected = scenarios.find((row) => row.selected && row.ok);
  if (!selected) {
    const largestFit = [...scenarios].reverse().find((row) => row.ok);
    return largestFit
      ? `That package does not fit this month. The largest size that does is ${largestFit.retainerHours} hours.`
      : '';
  }
  const pct = Math.round(selected.shareOfCapacity * 100);
  const half = scenarios.filter((row) => row.ok && row.shareOfCapacity <= 0.5).at(-1);
  if (pct > 50) {
    return `This ${selected.retainerHours}-hour package uses ${pct}% of your billable capacity. One client would take more than half your month; leave room for other work or raise the price to compensate for concentration risk.`;
  }
  if (half && half.retainerHours !== selected.retainerHours) {
    return `This ${selected.retainerHours}-hour package uses ${pct}% of your billable capacity. You could include up to ${half.retainerHours} hours and still keep at least half your capacity for other clients.`;
  }
  return `This ${selected.retainerHours}-hour package uses ${pct}% of your billable capacity. That leaves room for other clients, admin, and recovery.`;
}

if (typeof document !== 'undefined') {
  const form = $('calculator');
  const money = (n) => `${symbols[$('currency').value]}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
  const renderScenarios = (input, scenarios) => {
    const tbody = $('scenarioRows');
    tbody.replaceChildren();
    for (const row of scenarios) {
      const tr = document.createElement('tr');
      if (row.selected) tr.classList.add('selected');
      if (!row.ok) tr.classList.add('overflow');
      const cells = row.ok
        ? [
            `${row.retainerHours} hrs`,
            money(row.retainer),
            money(row.effectiveRate),
            `${row.remainingCapacity.toFixed(1)} hrs`,
            `${Math.round(row.shareOfCapacity * 100)}%`,
          ]
        : [`${row.retainerHours} hrs`, '—', '—', 'Exceeds capacity', '—'];
      for (const text of cells) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
      const action = document.createElement('td');
      if (row.ok && !row.selected) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary apply';
        button.textContent = 'Use this package';
        button.addEventListener('click', () => {
          $('retainerHours').value = String(row.retainerHours);
          save();
          form.requestSubmit();
          track('apply-scenario');
        });
        action.appendChild(button);
      } else {
        action.textContent = row.selected ? 'This proposal' : '';
      }
      tr.appendChild(action);
      tbody.appendChild(tr);
    }
    $('scenarioInsight').textContent = scenarioInsight(scenarios);
    $('scenarios').hidden = false;
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = read();
    const scenarios = compareRetainerScenarios(input);
    const anyOk = scenarios.some((row) => row.ok);
    let plan = null;
    try {
      plan = calculatePlan(input);
    } catch (error) {
      $('errors').textContent = error.message;
      $('errors').hidden = false;
      $('results').hidden = true;
    }
    if (plan) {
      $('errors').hidden = true;
      $('results').hidden = false;
      $('rate').textContent = money(plan.rate);
      $('retainer').textContent = money(plan.retainer);
      $('capacity').textContent = `${plan.capacity.toFixed(1)} hrs`;
      $('remaining').textContent = `${plan.remainingCapacity.toFixed(1)} hrs`;
      $('target').textContent = money(plan.target);
      $('explanation').textContent = `Your ${input.utilization}% utilization leaves ${plan.capacity.toFixed(1)} billable hours from ${input.hours} available hours. After this retainer, ${plan.remainingCapacity.toFixed(1)} hours remain for other work, admin, and recovery. The retainer includes a ${input.buffer}% buffer for scope drift; it is a planning floor, not a promise of results. Compare the packages below before you lock one number into a proposal.`;
      $('summary').value = `${formatProposalSummary(input, plan, $('currency').value)}\n\n${formatScenarioComparison(scenarios, $('currency').value)}`;
      $('copyStatus').textContent = '';
      track('calculate');
    }
    if (anyOk) {
      renderScenarios(input, scenarios);
      track('scenario_table_viewed');
    } else {
      $('scenarios').hidden = true;
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
