/**
 * Where a law firm's billable time goes between the timesheet and the bank.
 *
 * Every hour a lawyer records is worth a standard rate on the day it is
 * recorded. Between that moment and the day the client pays, three things
 * happen to it that no timekeeping report states as one number:
 *
 *   1. pre-bill write-down  — the partner trims the draft invoice
 *   2. post-bill write-off  — the client disputes it and it is discounted
 *   3. uncollected          — billed, never paid
 *
 * The standard names are *realization* (billed over standard value),
 * *collection* (collected over billed) and their product, the *yield*
 * (collected over standard value). Billing systems print the dollars; almost
 * none divide them per timekeeper, and a rate is the only form in which two
 * lawyers, or this year and last, can be compared.
 *
 * ## Load-bearing decisions
 *
 * **Everything is dollars at standard rate, not hours.** Hours billed is not a
 * figure every system can produce after a discount is applied as a lump sum,
 * but "value of time recorded", "amount billed" and "amount collected" are on
 * every WIP, billing and receipts report. Hours worked appears only to give the
 * effective hourly rate, which is what the owner actually earned per hour.
 *
 * **Leakage is ranked in dollars, not in rate.** A 70% yield on 300 hours is
 * a smaller problem than an 85% yield on 1,900, and a reader sorted by rate
 * works on the wrong person.
 *
 * **Billed above standard is legal and is not an error.** Fixed fees and
 * premiums bill over the hourly value; realization above 100% is reported as
 * such. Collected above billed is an error, because it almost always means the
 * two columns cover different periods.
 *
 * **The target answer is given both ways**: the hours needed at today's
 * effective rate and the yield needed at today's hours, so the reader sees
 * whether the gap is a volume problem or a leakage problem.
 *
 * Nothing here is legal, tax or accounting advice, an ethics opinion about
 * fees, or a statement about what a client may be charged. It is division on
 * the figures the user typed. No client or matter data is an input: every
 * figure is a timekeeper total for a period.
 */

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

export const ROW_FIELDS = ['name', 'hoursWorked', 'standardRate', 'billed', 'collected', 'hoursAvailable'];
export const FIRM_FIELDS = ['periodMonths', 'wipBalance', 'receivables', 'targetCollected'];

function numeric(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function readRow(row, index) {
  const name = String(row.name ?? '').trim();
  const hours = numeric(row.hoursWorked);
  const rate = numeric(row.standardRate);
  const billed = numeric(row.billed);
  const collected = numeric(row.collected);
  const available = numeric(row.hoursAvailable);

  const empty = !name && hours === null && rate === null && billed === null && collected === null;
  if (empty) return { blank: true };

  const id = `row-${index}`;
  const errors = [];
  if (!name) errors.push({ id: `${id}-name`, message: 'Name this timekeeper so the rows can be told apart.' });
  if (hours === null) errors.push({ id: `${id}-hoursWorked`, message: 'Hours recorded for the period are needed.' });
  else if (hours <= 0) errors.push({ id: `${id}-hoursWorked`, message: 'Hours must be more than zero.' });
  if (rate === null) errors.push({ id: `${id}-standardRate`, message: 'The standard hourly rate is needed.' });
  else if (rate <= 0) errors.push({ id: `${id}-standardRate`, message: 'The standard rate must be more than zero.' });
  if (billed === null) errors.push({ id: `${id}-billed`, message: 'The amount billed for this time is needed.' });
  else if (billed < 0) errors.push({ id: `${id}-billed`, message: 'Billed cannot be negative.' });
  if (collected === null) errors.push({ id: `${id}-collected`, message: 'The amount collected is needed (enter 0 if nothing has been paid).' });
  else if (collected < 0) errors.push({ id: `${id}-collected`, message: 'Collected cannot be negative.' });
  else if (billed !== null && collected > billed) {
    errors.push({
      id: `${id}-collected`,
      message: 'Collected is larger than billed — check that both columns cover the same time, and that prepayments are not counted as collections.',
    });
  }
  if (available !== null && available <= 0) errors.push({ id: `${id}-hoursAvailable`, message: 'Available hours must be more than zero, or leave it blank.' });
  if (available !== null && hours !== null && hours > available) {
    errors.push({ id: `${id}-hoursAvailable`, message: 'Hours recorded exceed the hours available — check the period.' });
  }
  return { blank: false, name, hours, rate, billed, collected, available, errors };
}

function shape(name, hours, standard, billed, collected, available) {
  return {
    name,
    hoursWorked: hours,
    standardValue: round2(standard),
    billed: round2(billed),
    collected: round2(collected),
    preBillWriteDown: round2(standard - billed),
    postBillLoss: round2(billed - collected),
    leakage: round2(standard - collected),
    realization: standard > 0 ? round4(billed / standard) : 0,
    collection: billed > 0 ? round4(collected / billed) : 0,
    yield: standard > 0 ? round4(collected / standard) : 0,
    effectiveRate: round2(collected / hours),
    standardRate: round2(standard / hours),
    utilization: available ? round4(hours / available) : null,
  };
}

export function realization(input = {}) {
  const errors = [];
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const people = [];
  rows.forEach((row, index) => {
    const parsed = readRow(row, index);
    if (parsed.blank) return;
    errors.push(...parsed.errors);
    if (parsed.errors.length === 0) people.push(parsed);
  });
  if (people.length === 0 && errors.length === 0) {
    errors.push({ id: 'row-0-name', message: 'Add at least one timekeeper.' });
  }

  const periodMonths = numeric(input.periodMonths) ?? 12;
  const wip = numeric(input.wipBalance);
  const ar = numeric(input.receivables);
  const target = numeric(input.targetCollected);
  if (periodMonths < 1 || periodMonths > 60) errors.push({ id: 'periodMonths', message: 'Enter a period between 1 and 60 months.' });
  if (wip !== null && wip < 0) errors.push({ id: 'wipBalance', message: 'Unbilled time cannot be negative.' });
  if (ar !== null && ar < 0) errors.push({ id: 'receivables', message: 'Receivables cannot be negative.' });
  if (target !== null && target <= 0) errors.push({ id: 'targetCollected', message: 'A target must be more than zero, or leave it blank.' });
  if (errors.length > 0) return { ok: false, errors };

  const timekeepers = people.map((p) => shape(p.name, p.hours, p.hours * p.rate, p.billed, p.collected, p.available));
  const totalHours = people.reduce((s, p) => s + p.hours, 0);
  const standard = people.reduce((s, p) => s + p.hours * p.rate, 0);
  const billed = people.reduce((s, p) => s + p.billed, 0);
  const collected = people.reduce((s, p) => s + p.collected, 0);
  const allAvailable = people.every((p) => p.available);
  const available = allAvailable ? people.reduce((s, p) => s + p.available, 0) : null;
  const firm = shape('Firm', totalHours, standard, billed, collected, available);

  const ranked = [...timekeepers].sort((a, b) => b.leakage - a.leakage);
  const positiveLeak = ranked.filter((t) => t.leakage > 0).reduce((s, t) => s + t.leakage, 0);
  const topShare = positiveLeak > 0 && ranked[0].leakage > 0 ? round4(ranked[0].leakage / positiveLeak) : 0;

  const annualFactor = 12 / periodMonths;
  const annual = {
    standardValue: round2(standard * annualFactor),
    billed: round2(billed * annualFactor),
    collected: round2(collected * annualFactor),
    leakage: round2((standard - collected) * annualFactor),
    hours: round2(totalHours * annualFactor),
  };

  // Value of one more point of realization, holding collection rate fixed: one
  // point of standard value, collected at today's collection rate.
  const pointValue = round2(standard * 0.01 * firm.collection * annualFactor);
  const sensitivity = [1, 3, 5].map((points) => ({ points, annualValue: round2(pointValue * points) }));

  const days = periodMonths * (365 / 12);
  const lockup = {
    wipDays: wip !== null && standard > 0 ? round2(wip / (standard / days)) : null,
    receivableDays: ar !== null && billed > 0 ? round2(ar / (billed / days)) : null,
  };
  lockup.total = lockup.wipDays !== null && lockup.receivableDays !== null ? round2(lockup.wipDays + lockup.receivableDays) : null;

  let targetPlan = null;
  if (target !== null) {
    const collectedPerHour = collected / totalHours;
    targetPlan = {
      target: round2(target),
      gap: round2(target - annual.collected),
      hoursNeededAtCurrentYield: collectedPerHour > 0 ? round2(target / collectedPerHour) : null,
      yieldNeededAtCurrentHours: annual.standardValue > 0 ? round4(target / annual.standardValue) : null,
      currentYield: firm.yield,
    };
  }

  return {
    ok: true,
    periodMonths,
    firm,
    timekeepers: ranked,
    topLeakShare: topShare,
    annual,
    pointValue,
    sensitivity,
    lockup,
    targetPlan,
    findings: findings({ firm, ranked, topShare, lockup, annual }),
  };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const usd = (x) => {
  const format = (x) => `$${Math.round(x).toLocaleString('en-US')}`;
  const text = format(Math.abs(x));
  return x < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

function findings({ firm, ranked, topShare, lockup, annual }) {
  const out = [];
  const preBill = firm.preBillWriteDown;
  const post = firm.postBillLoss;
  if (firm.leakage <= 0) {
    out.push('Collected equals or exceeds the standard value of the time. Check that the three columns cover the same period before relying on this.');
    return out;
  }
  const bigger = preBill >= post ? 'before the invoice goes out (pre-bill write-downs)' : 'after the invoice goes out (disputes, discounts and unpaid balances)';
  out.push(
    `Of ${usd(firm.standardValue)} of recorded time, ${usd(firm.collected)} was collected: a ${pct(firm.yield)} yield. The larger half of the loss, ${usd(Math.max(preBill, post))}, happens ${bigger}.`,
  );
  out.push(`Annualised, the gap between standard value and cash is about ${usd(annual.leakage)}.`);
  if (ranked.length > 1 && ranked[0].leakage > 0) {
    out.push(`${ranked[0].name} accounts for ${pct(topShare)} of the dollars lost, at a ${pct(ranked[0].yield)} yield — the first conversation if you want the biggest recovery.`);
  }
  if (ranked.length > 1) {
    const worstRate = [...ranked].sort((a, b) => a.yield - b.yield)[0];
    if (worstRate.name !== ranked[0].name) {
      out.push(`${worstRate.name} has the lowest yield (${pct(worstRate.yield)}) but not the largest dollar loss — ranking by rate alone would send you to the wrong person first.`);
    }
  }
  if (lockup.total !== null) out.push(`Unbilled plus unpaid time is about ${Math.round(lockup.total)} days of work (${Math.round(lockup.wipDays)} unbilled, ${Math.round(lockup.receivableDays)} receivable).`);
  return out;
}

export function summaryText(result) {
  if (!result.ok) return '';
  const f = result.firm;
  const lines = [
    `Realization ${pct(f.realization)} · Collection ${pct(f.collection)} · Yield ${pct(f.yield)} · Effective rate ${usd(f.effectiveRate)}/hr vs standard ${usd(f.standardRate)}/hr`,
    ...result.findings,
  ];
  return lines.join('\n');
}

const csvCell = (v) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function resultCsv(result) {
  if (!result.ok) return '';
  const head = ['timekeeper', 'hours_worked', 'standard_value', 'billed', 'collected', 'pre_bill_write_down', 'post_bill_loss', 'realization', 'collection', 'yield', 'effective_rate'];
  const lines = [head.join(',')];
  for (const t of [...result.timekeepers, result.firm]) {
    lines.push([t.name, t.hoursWorked, t.standardValue, t.billed, t.collected, t.preBillWriteDown, t.postBillLoss, t.realization, t.collection, t.yield, t.effectiveRate].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

export function sampleRows() {
  return [
    { name: 'Partner A', hoursWorked: 1450, standardRate: 450, billed: 598000, collected: 561000, hoursAvailable: 2000 },
    { name: 'Partner B', hoursWorked: 1280, standardRate: 425, billed: 441000, collected: 372000, hoursAvailable: 2000 },
    { name: 'Associate C', hoursWorked: 1820, standardRate: 300, billed: 462000, collected: 431000, hoursAvailable: 2000 },
    { name: 'Associate D', hoursWorked: 1560, standardRate: 275, billed: 340000, collected: 268000, hoursAvailable: 2000 },
    { name: 'Paralegal E', hoursWorked: 1700, standardRate: 135, billed: 201000, collected: 192000, hoursAvailable: 2000 },
  ];
}
