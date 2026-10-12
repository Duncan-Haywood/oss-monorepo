// Patent maintenance-fee planner: pure functions, no I/O.
//
// Rules modelled (35 U.S.C. 41(b), 37 CFR 1.362) for utility patents granted on or after 1980-12-12:
//   fee 1 due 3y6m after grant, payable without surcharge from 3y0m;
//   fee 2 due 7y6m, window opens 7y0m;  fee 3 due 11y6m, window opens 11y0m;
//   a further 6-month grace period carries a surcharge, and the patent expires at the end of
//   the 4th, 8th or 12th anniversary of grant if the fee is still unpaid.
// A deadline that falls on a Saturday or Sunday rolls to the next Monday. Federal holidays are not modelled.

export const FIRST_FEE_GRANT_DATE = '1980-12-12';
export const ENTITIES = ['large', 'small', 'micro'];

export const STAGES = [
  { n: 1, label: '3.5-year', openMonths: 36, dueMonths: 42, graceMonths: 48 },
  { n: 2, label: '7.5-year', openMonths: 84, dueMonths: 90, graceMonths: 96 },
  { n: 3, label: '11.5-year', openMonths: 132, dueMonths: 138, graceMonths: 144 },
];

// USPTO schedule effective 2025-01-19 as the tool author understood it. Editable on the page because
// the schedule changes; the page tells the user to confirm against the USPTO fee schedule.
export const DEFAULT_FEE_TEXT = [
  'large, 2150, 4040, 8280, 540',
  'small, 860, 1616, 3312, 216',
  'micro, 430, 808, 1656, 108',
].join('\n');

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(text) {
  const s = String(text ?? '').trim();
  let m = ISO.exec(s);
  if (!m) {
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (us) m = [s, us[3], us[1].padStart(2, '0'), us[2].padStart(2, '0')];
  }
  if (!m) throw new Error(`"${s}" is not a date; use YYYY-MM-DD or MM/DD/YYYY.`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) throw new Error(`"${s}" is not a real calendar date.`);
  return fmt(t);
}

const fmt = (t) => t.toISOString().slice(0, 10);
const toUtc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

// Month arithmetic that clamps to the end of a short month (grant 08-31 + 6 months = 02-28 or 02-29).
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12); const nm = idx % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(ny, nm, Math.min(d, last))));
}

export function addDays(iso, n) { const t = toUtc(iso); t.setUTCDate(t.getUTCDate() + n); return fmt(t); }

export function rollWeekend(iso) {
  const dow = toUtc(iso).getUTCDay();
  if (dow === 6) return addDays(iso, 2);
  if (dow === 0) return addDays(iso, 1);
  return iso;
}

export function daysBetween(fromIso, toIso) { return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86400000); }

export function parseFees(text) {
  const fees = {};
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,;\t]+/).map((p) => p.trim());
    const entity = parts[0].toLowerCase();
    if (!ENTITIES.includes(entity)) throw new Error(`Fee line "${line}": the first field must be large, small or micro.`);
    if (parts.length !== 5) throw new Error(`Fee line "${line}": expected entity, 3.5-year fee, 7.5-year fee, 11.5-year fee, surcharge.`);
    const nums = parts.slice(1).map(Number);
    if (nums.some((x) => !Number.isFinite(x) || x < 0)) throw new Error(`Fee line "${line}": amounts must be non-negative numbers.`);
    fees[entity] = { stage: nums.slice(0, 3), surcharge: nums[3] };
  }
  for (const e of ENTITIES) if (!fees[e]) throw new Error(`The fee table has no "${e}" line.`);
  return fees;
}

export function parsePatents(text) {
  const patents = [];
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const m = /^(.*?)[,;\t ]+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})(?:[,;\t ]+(large|small|micro|undiscounted))?(?:[,;\t ]+(drop))?\s*$/i.exec(line);
    if (!m) throw new Error(`Line ${i + 1} ("${line}"): expected "patent number or label, grant date, entity size, optional drop".`);
    const label = m[1].trim().replace(/[,;]+$/, '');
    if (!label) throw new Error(`Line ${i + 1}: the patent needs a number or label before the grant date.`);
    const entity = (m[3] || 'large').toLowerCase().replace('undiscounted', 'large');
    patents.push({ label, grantDate: parseDate(m[2]), entity, drop: Boolean(m[4]) });
  });
  if (!patents.length) throw new Error('Enter at least one patent.');
  if (patents.length > 500) throw new Error('At most 500 patents at a time.');
  return patents;
}

export function normalizeInputs(raw) {
  const asOf = parseDate(raw.asOf);
  const patents = Array.isArray(raw.patents) ? raw.patents : parsePatents(raw.patents);
  const fees = typeof raw.fees === 'string' ? parseFees(raw.fees) : raw.fees;
  const horizonYears = raw.horizonYears === undefined || raw.horizonYears === '' ? 5 : Number(raw.horizonYears);
  if (!Number.isInteger(horizonYears) || horizonYears < 1 || horizonYears > 20) throw new Error('Budget horizon must be a whole number of years from 1 to 20.');
  const warnDays = raw.warnDays === undefined || raw.warnDays === '' ? 90 : Number(raw.warnDays);
  if (!Number.isInteger(warnDays) || warnDays < 0 || warnDays > 730) throw new Error('Reminder lead time must be a whole number of days from 0 to 730.');
  for (const p of patents) {
    if (p.grantDate < FIRST_FEE_GRANT_DATE) throw new Error(`${p.label}: patents granted before ${FIRST_FEE_GRANT_DATE} have no maintenance fees.`);
    if (p.grantDate > asOf) throw new Error(`${p.label}: the grant date ${p.grantDate} is after the as-of date ${asOf}.`);
  }
  return { asOf, patents, fees, horizonYears, warnDays };
}

// Deadlines for one stage of one patent.
export function stageDates(grantDate, stage) {
  return {
    opens: addMonths(grantDate, stage.openMonths),
    due: rollWeekend(addMonths(grantDate, stage.dueMonths)),
    graceEnds: rollWeekend(addMonths(grantDate, stage.graceMonths)),
    expiresIfUnpaid: addMonths(grantDate, stage.graceMonths),
  };
}

export function stageStatus(asOf, d) {
  if (asOf < d.opens) return 'upcoming';
  if (asOf <= d.due) return 'window-open';
  if (asOf <= d.graceEnds) return 'surcharge';
  return 'past';
}

export function planPortfolio(raw) {
  const n = normalizeInputs(raw);
  const { asOf, fees } = n;
  const horizonEnd = addMonths(asOf, n.horizonYears * 12);
  const rows = []; const payments = [];

  for (const p of n.patents) {
    const open = [];
    for (const stage of STAGES) {
      const d = stageDates(p.grantDate, stage);
      const status = stageStatus(asOf, d);
      if (status === 'past') continue; // earlier fees are assumed paid
      const base = fees[p.entity].stage[stage.n - 1];
      const surcharge = status === 'surcharge' ? fees[p.entity].surcharge : 0;
      open.push({ stage, d, status, base, surcharge, amount: base + surcharge });
    }
    const next = open[0] || null;
    const remainingTotal = open.reduce((s, o) => s + o.base, 0);
    rows.push({
      label: p.label, grantDate: p.grantDate, entity: p.entity, drop: p.drop,
      complete: !next,
      next: next && {
        fee: next.stage.label, status: next.status, opens: next.d.opens, due: next.d.due, graceEnds: next.d.graceEnds,
        expiresIfUnpaid: next.d.expiresIfUnpaid, amount: next.amount, surcharge: next.surcharge,
        daysToDue: daysBetween(asOf, next.d.due), daysToGraceEnd: daysBetween(asOf, next.d.graceEnds),
        daysToOpen: daysBetween(asOf, next.d.opens),
      },
      remainingTotal,
      remainingFees: open.map((o) => ({ fee: o.stage.label, due: o.d.due, amount: o.base })),
    });
    for (const o of open) {
      // Planned on the no-surcharge due date; a fee already past it is payable now with its surcharge.
      const payOn = o.status === 'surcharge' ? asOf : o.d.due;
      if (payOn <= horizonEnd) payments.push({ label: p.label, drop: p.drop, fee: o.stage.label, payOn, amount: o.amount });
    }
  }

  const kept = payments.filter((x) => !x.drop);
  const dropped = payments.filter((x) => x.drop);
  const byYear = new Map();
  for (const x of kept) { const y = x.payOn.slice(0, 4); byYear.set(y, (byYear.get(y) || 0) + x.amount); }
  const yearly = [...byYear.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, amount]) => ({ year, amount }));
  const sum = (a) => a.reduce((s, x) => s + x.amount, 0);

  const urgent = rows
    .filter((r) => !r.drop && r.next && (r.next.status !== 'upcoming' || r.next.daysToOpen <= n.warnDays))
    .sort((a, b) => a.next.due.localeCompare(b.next.due));

  rows.sort((a, b) => (a.next ? a.next.due : '9999').localeCompare(b.next ? b.next.due : '9999'));

  return {
    inputs: n, rows, payments: payments.sort((a, b) => a.payOn.localeCompare(b.payOn)), yearly,
    horizonEnd, budgetTotal: sum(kept), droppedSavings: sum(dropped), urgent,
    surchargeExposure: rows.filter((r) => r.next && r.next.status === 'surcharge' && !r.drop).reduce((s, r) => s + r.next.surcharge, 0),
    counts: {
      patents: rows.length,
      surcharge: rows.filter((r) => r.next?.status === 'surcharge').length,
      windowOpen: rows.filter((r) => r.next?.status === 'window-open').length,
      complete: rows.filter((r) => r.complete).length,
    },
  };
}

const csvCell = (v) => {
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function toCsv(result) {
  const rows = [['patent', 'grant_date', 'entity', 'dropping', 'next_fee', 'status', 'window_opens', 'due_no_surcharge', 'grace_ends', 'expires_if_unpaid', 'amount_now']];
  for (const r of result.rows) {
    if (r.complete) rows.push([r.label, r.grantDate, r.entity, r.drop ? 'yes' : 'no', 'none (maintained to 12 years)']);
    else rows.push([r.label, r.grantDate, r.entity, r.drop ? 'yes' : 'no', r.next.fee, r.next.status, r.next.opens, r.next.due, r.next.graceEnds, r.next.expiresIfUnpaid, r.next.amount]);
  }
  rows.push([]);
  rows.push(['year', 'planned_fees_kept_patents']);
  for (const y of result.yearly) rows.push([y.year, y.amount]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const icsDate = (iso) => iso.replaceAll('-', '');
const icsText = (s) => String(s).replace(/[\;,]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');

// One all-day reminder per upcoming fee: `warnDays` before the no-surcharge due date (never before today), and the due date itself.
export function toIcs(result) {
  const { asOf, warnDays } = result.inputs;
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//patent-maintenance-fee-planner//EN', 'CALSCALE:GREGORIAN'];
  let i = 0;
  for (const r of result.rows) {
    if (r.drop || !r.next || r.next.status === 'surcharge') continue;
    const remind = addDays(r.next.due, -warnDays);
    const events = [
      [remind < asOf ? asOf : remind, `Patent ${r.label}: ${r.next.fee} maintenance fee due ${r.next.due}`],
      [r.next.due, `LAST DAY without surcharge: patent ${r.label} ${r.next.fee} maintenance fee`],
    ];
    for (const [date, summary] of events) {
      out.push('BEGIN:VEVENT', `UID:pmfp-${++i}-${icsDate(r.grantDate)}-${icsText(r.label).replace(/\s+/g, '')}@local`, `DTSTAMP:${icsDate(asOf)}T000000Z`,
        `DTSTART;VALUE=DATE:${icsDate(date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(date, 1))}`, `SUMMARY:${icsText(summary)}`,
        `DESCRIPTION:${icsText(`Fee ${r.next.amount}; surcharge period ends ${r.next.graceEnds}. Confirm dates and amounts with the USPTO before paying.`)}`, 'END:VEVENT');
    }
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}

const STATE_KEYS = ['asOf', 'horizonYears', 'warnDays'];

export function encodeState(values) {
  const p = new URLSearchParams();
  for (const k of STATE_KEYS) if (values[k] !== undefined && values[k] !== '') p.set(k, String(values[k]));
  for (const k of ['patents', 'fees']) {
    const compact = typeof values[k] === 'string' ? values[k].split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('|') : '';
    if (compact) p.set(k, compact);
  }
  return p.toString();
}

export function decodeState(search) {
  const p = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const out = {};
  for (const k of STATE_KEYS) if (p.has(k)) out[k] = p.get(k);
  for (const k of ['patents', 'fees']) if (p.has(k)) out[k] = p.get(k).split('|').join('\n');
  return out;
}
