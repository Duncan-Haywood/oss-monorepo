// Texas electricity plan checker: the engine.
//
// A plan is the terms printed on its Electricity Facts Label (EFL). A month's
// bill is
//
//   base charge + TDU fixed charge
//   + energy charge (flat, or tiered by kWh, with optional time-of-use windows)
//   + TDU per-kWh charge x kWh
//   - every bill credit whose kWh condition the month meets
//   + every minimum-usage fee whose condition it meets
//
// in dollars, before taxes and fees the label itself excludes. Nothing here
// knows any provider's prices: every number comes from the label the user
// pastes or types, and `labelCheck` re-derives the label's own average prices
// at 500, 1,000 and 2,000 kWh from the parsed terms so a misread label shows
// up as a mismatch instead of a wrong ranking.

export const LABEL_POINTS = [500, 1000, 2000];

const num = (s) => Number(String(s).replace(/,/g, ''));
const round2 = (x) => Math.round(x * 100) / 100;

/** Normalise a plan object, filling defaults. Throws on nonsense. */
export function normalisePlan(p) {
  const plan = {
    name: String(p.name || 'Plan'),
    base: Number(p.base) || 0,
    energy: (p.energy && p.energy.length ? p.energy : [{ upTo: null, cents: 0 }]).map((t) => ({
      upTo: t.upTo == null || t.upTo === '' ? null : Number(t.upTo),
      cents: Number(t.cents),
    })),
    tduFixed: Number(p.tduFixed) || 0,
    tduCents: Number(p.tduCents) || 0,
    credits: (p.credits || []).map((c) => ({
      amount: Number(c.amount),
      min: c.min == null || c.min === '' ? 0 : Number(c.min),
      max: c.max == null || c.max === '' ? null : Number(c.max),
    })),
    fees: (p.fees || []).map((f) => ({ amount: Number(f.amount), below: Number(f.below) })),
    tou: (p.tou || []).map((w) => ({
      name: String(w.name || 'window'),
      days: w.days || 'all',
      start: Number(w.start),
      end: Number(w.end),
      cents: Number(w.cents),
    })),
    touShare: p.touShare == null || p.touShare === '' ? null : Number(p.touShare),
    termMonths: p.termMonths == null || p.termMonths === '' ? null : Number(p.termMonths),
    etf: p.etf == null || p.etf === '' ? null : Number(p.etf),
    label: p.label ? { 500: num(p.label[500]), 1000: num(p.label[1000]), 2000: num(p.label[2000]) } : null,
  };
  for (const t of plan.energy) if (!Number.isFinite(t.cents) || t.cents < 0) throw new Error(`${plan.name}: energy charge must be a number of cents per kWh`);
  for (let i = 0; i < plan.energy.length - 1; i++) {
    if (plan.energy[i].upTo == null) throw new Error(`${plan.name}: only the last energy tier can be open-ended`);
    if (i > 0 && plan.energy[i].upTo <= plan.energy[i - 1].upTo) throw new Error(`${plan.name}: energy tiers must rise`);
  }
  plan.energy[plan.energy.length - 1].upTo = null;
  for (const c of plan.credits) if (!Number.isFinite(c.amount) || !Number.isFinite(c.min)) throw new Error(`${plan.name}: a credit needs an amount and a kWh threshold`);
  for (const f of plan.fees) if (!Number.isFinite(f.amount) || !Number.isFinite(f.below)) throw new Error(`${plan.name}: a minimum-usage fee needs an amount and a kWh threshold`);
  for (const w of plan.tou) {
    if (![w.start, w.end, w.cents].every(Number.isFinite) || w.start < 0 || w.start > 24 || w.end < 0 || w.end > 24 || w.start === w.end) throw new Error(`${plan.name}: a time-of-use window needs a start hour, an end hour and a price`);
    if (!['all', 'weekdays', 'weekends'].includes(w.days)) throw new Error(`${plan.name}: window days must be all, weekdays or weekends`);
  }
  return plan;
}

/** Dollars of tiered energy charge for `kwh` (tiers are marginal: the first upTo kWh at the first price...). */
export function tieredEnergy(energy, kwh) {
  let cents = 0;
  let prev = 0;
  for (const t of energy) {
    const top = t.upTo == null ? Infinity : t.upTo;
    if (kwh <= prev) break;
    cents += (Math.min(kwh, top) - prev) * t.cents;
    prev = top;
  }
  return cents / 100;
}

/**
 * One month's bill. `usage` is a number (kWh) or {kwh, windows: [kWh in each
 * time-of-use window]}. For a time-of-use plan given a bare number,
 * `touShare` (the caller's, else the plan's) is the share of the month's kWh
 * assumed to fall in the plan's windows, priced at the first window's price;
 * with neither, the month cannot be billed and an error is thrown.
 */
export function monthBill(planIn, usage, opts = {}) {
  const plan = planIn.energy && planIn.credits && planIn.fees && planIn.tou ? planIn : normalisePlan(planIn);
  const kwh = typeof usage === 'number' ? usage : Number(usage.kwh);
  if (!Number.isFinite(kwh) || kwh < 0) throw new Error('usage must be a non-negative number of kWh');
  let windowKwh = 0;
  let windowDollars = 0;
  if (plan.tou.length) {
    let parts = typeof usage === 'object' && Array.isArray(usage.windows) ? usage.windows : null;
    if (!parts) {
      const share = opts.touShare ?? plan.touShare;
      if (share == null) throw new Error(`${plan.name} prices some hours differently: it needs interval data or an assumed share of use in those hours`);
      parts = plan.tou.map((_, i) => (i === 0 ? kwh * share : 0));
    }
    plan.tou.forEach((w, i) => {
      const k = Number(parts[i]) || 0;
      windowKwh += k;
      windowDollars += (k * w.cents) / 100;
    });
    if (windowKwh > kwh + 1e-6) throw new Error('kWh in the time-of-use windows exceed the month total');
  }
  const energy = tieredEnergy(plan.energy, kwh - windowKwh) + windowDollars;
  const tdu = plan.tduFixed + (plan.tduCents * kwh) / 100;
  let credits = 0;
  const creditsMet = [];
  plan.credits.forEach((c, i) => {
    if (kwh >= c.min && (c.max == null || kwh <= c.max)) {
      credits += c.amount;
      creditsMet.push(i);
    }
  });
  let fees = 0;
  for (const f of plan.fees) if (kwh < f.below) fees += f.amount;
  const total = plan.base + energy + tdu - credits + fees;
  return { kwh, base: plan.base, energy, tdu, credits, fees, total, creditsMet, windowKwh };
}

/** Average price in cents per kWh at a usage, as the label states it. */
export function averageCents(plan, kwh, opts) {
  return (monthBill(plan, kwh, opts).total / kwh) * 100;
}

/**
 * Re-derive the label's three average prices from the parsed terms. A label
 * rounds to 0.1 cents, so a correct parse lands within 0.05 cents of each
 * (0.06 allowed for rates printed to fewer digits than the REP used).
 */
export function labelCheck(planIn, tolerance = 0.06) {
  const plan = normalisePlan(planIn);
  if (!plan.label || !LABEL_POINTS.every((k) => Number.isFinite(plan.label[k]))) return { status: 'no-label', rows: [] };
  if (plan.tou.length && plan.touShare == null) return { status: 'needs-share', rows: [] };
  const rows = LABEL_POINTS.map((k) => {
    const model = averageCents(plan, k);
    return { kwh: k, stated: plan.label[k], model, diff: model - plan.label[k], ok: Math.abs(model - plan.label[k]) <= tolerance + 1e-9 };
  });
  return { status: rows.every((r) => r.ok) ? 'match' : 'mismatch', rows };
}

/**
 * What the three label prices alone imply. A plan with no credits, fees or
 * tiers costs a + b*kWh, so its three label points lie on one line. Draw the
 * line through the 500 and 2,000 kWh points and see where 1,000 kWh falls:
 * below the line by D dollars means something pays out near 1,000 kWh (a bill
 * credit, or an energy charge that rises above it) worth about D. This is
 * all a plan list (Power to Choose) shows, so it works before you open the EFL.
 */
export function shapeFromLabel(label) {
  const p = LABEL_POINTS.map((k) => num(label[k]));
  if (!p.every((x) => Number.isFinite(x) && x > 0)) throw new Error('need the three average prices in cents per kWh');
  const t = LABEL_POINTS.map((k, i) => (k * p[i]) / 100);
  const b = (t[2] - t[0]) / 1500; // dollars per kWh
  const a = t[0] - 500 * b; // dollars per month
  const lineAt1000 = a + 1000 * b;
  const dip = lineAt1000 - t[1];
  return {
    fixedPerMonth: a,
    centsPerKwh: b * 100,
    billAt: t,
    lineAt1000,
    dip,
    flag: dip > 5 ? 'dip' : dip < -5 ? 'bump' : 'straight',
  };
}

/** Bill every month of a usage series on every plan; rank by total. */
export function compare(plansIn, months, opts = {}) {
  const plans = plansIn.map(normalisePlan);
  const results = plans.map((plan) => {
    let error = null;
    const rows = [];
    for (const m of months) {
      try {
        const usage = plan.tou.length && m.hours ? { kwh: m.kwh, windows: windowKwh(plan, m) } : m.kwh;
        rows.push({ month: m.month, ...monthBill(plan, usage, opts) });
      } catch (e) {
        error = e.message;
        break;
      }
    }
    if (error) return { plan, error };
    const total = rows.reduce((s, r) => s + r.total, 0);
    const kwh = rows.reduce((s, r) => s + r.kwh, 0);
    const creditMonths = rows.filter((r) => r.creditsMet.length).length;
    const feeMonths = rows.filter((r) => r.fees > 0).length;
    const credited = rows.reduce((s, r) => s + r.credits, 0);
    const maxCredit = plan.credits.length ? Math.max(...plan.credits.map((c) => c.amount)) : 0;
    return {
      plan,
      rows,
      total,
      kwh,
      cents: kwh > 0 ? (total / kwh) * 100 : null,
      creditMonths,
      feeMonths,
      credited,
      // Credit a plan advertises at 1,000 kWh that this usage did not collect.
      creditsMissed: plan.credits.length ? rows.filter((r) => !r.creditsMet.length).length : 0,
      maxCredit,
      advertised1000: plan.label ? plan.label[1000] : null,
      check: labelCheck(plan),
    };
  });
  const ok = results.filter((r) => !r.error).sort((x, y) => x.total - y.total);
  const best = ok[0]?.total;
  for (const r of ok) r.extra = r.total - best;
  return [...ok, ...results.filter((r) => r.error)];
}

/** Monthly bill across a kWh range, for the price-curve chart. */
export function curve(planIn, { from = 100, to = 3000, step = 25, touShare } = {}) {
  const plan = normalisePlan(planIn);
  const out = [];
  for (let k = from; k <= to; k += step) {
    try {
      const b = monthBill(plan, k, { touShare });
      out.push({ kwh: k, total: b.total, cents: (b.total / k) * 100 });
    } catch {
      return [];
    }
  }
  return out;
}

/** Usage levels where the bill jumps (a credit starts or stops, a fee stops). */
export function cliffs(planIn) {
  const plan = normalisePlan(planIn);
  const out = [];
  for (const c of plan.credits) {
    if (c.min > 0) out.push({ kwh: c.min, change: -c.amount, what: `$${c.amount.toFixed(2)} credit starts` });
    if (c.max != null) out.push({ kwh: c.max, change: c.amount, what: `$${c.amount.toFixed(2)} credit stops above ${c.max} kWh` });
  }
  for (const f of plan.fees) out.push({ kwh: f.below, change: -f.amount, what: `$${f.amount.toFixed(2)} fee stops` });
  return out.sort((a, b) => a.kwh - b.kwh);
}

// ---------------------------------------------------------------------------
// Usage input

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseDate(s) {
  s = String(s).trim().replace(/^"|"$/g, '');
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return { y, mo: Number(m[1]), d: Number(m[2]) };
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
  return null;
}

function parseTime(s) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(s));
  if (!m) return null;
  let h = Number(m[1]);
  const pm = /pm/i.test(s);
  const am = /am/i.test(s);
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return h + Number(m[2]) / 60;
}

function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Read usage. Accepts:
 *  - a Smart Meter Texas interval CSV (USAGE_DATE, USAGE_START_TIME, USAGE_KWH,
 *    CONSUMPTION_SURPLUSGENERATION), or any CSV with a date column, an optional
 *    start-time column and a kWh column; surplus-generation rows are dropped;
 *  - month lines such as "Jan 2025, 1243" or "2025-01 1243";
 *  - or bare numbers, one per month.
 * Returns {months: [{month, kwh, days, hours?}], kind, warnings}. With interval
 * rows, `hours` holds kWh by [weekday?0:1][hour of day] for time-of-use billing.
 */
export function parseUsage(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('no usage to read');
  const warnings = [];
  const header = splitCsv(lines[0]).map((h) => h.replace(/^"|"$/g, '').toUpperCase());
  const dateCol = header.findIndex((h) => /DATE/.test(h) && !/REVISION/.test(h));
  const kwhCol = header.findIndex((h) => /KWH|USAGE$|CONSUMPTION$/.test(h) && !/DATE|TIME/.test(h));
  if (dateCol >= 0 && kwhCol >= 0) {
    const timeCol = header.findIndex((h) => /START/.test(h) || h === 'TIME');
    const kindCol = header.findIndex((h) => /SURPLUS|DIRECTION|CHANNEL/.test(h));
    const byMonth = new Map();
    let rows = 0;
    let dropped = 0;
    for (const line of lines.slice(1)) {
      const c = splitCsv(line).map((x) => x.replace(/^"|"$/g, ''));
      if (kindCol >= 0 && /surplus|generation|export|received/i.test(c[kindCol] || '')) {
        dropped++;
        continue;
      }
      const d = parseDate(c[dateCol]);
      const k = Number(String(c[kwhCol]).replace(/,/g, ''));
      if (!d || !Number.isFinite(k)) continue;
      const key = `${d.y}-${String(d.mo).padStart(2, '0')}`;
      if (!byMonth.has(key)) byMonth.set(key, { month: key, kwh: 0, daysSeen: new Set(), hours: timeCol >= 0 ? [new Array(24).fill(0), new Array(24).fill(0)] : null });
      const m = byMonth.get(key);
      m.kwh += k;
      m.daysSeen.add(d.d);
      if (m.hours) {
        const t = parseTime(c[timeCol]);
        if (t != null) {
          const dow = new Date(Date.UTC(d.y, d.mo - 1, d.d)).getUTCDay();
          m.hours[dow === 0 || dow === 6 ? 1 : 0][Math.floor(t) % 24] += k;
        }
      }
      rows++;
    }
    if (!rows) throw new Error('found the columns but no rows with a date and a kWh number');
    if (dropped) warnings.push(`${dropped} surplus-generation (export) rows left out: plans credit exports differently, and this tool bills consumption only`);
    const months = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).map((m) => {
      const [y, mo] = m.month.split('-').map(Number);
      const inMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const days = m.daysSeen.size;
      if (days < inMonth * 0.9) warnings.push(`${m.month} has ${days} of ${inMonth} days: its bill is for those days only`);
      const out = { month: m.month, kwh: m.kwh, days };
      if (m.hours) out.hours = m.hours;
      return out;
    });
    return { months, kind: timeCol >= 0 ? 'interval' : 'daily', warnings };
  }
  // Month lines or bare numbers.
  const months = [];
  let idx = 0;
  for (const line of lines) {
    const iso = /^(\d{4})-(\d{1,2})\b[\s,;:\t]+([\d,]+(?:\.\d+)?)/.exec(line);
    const named = /^([a-z]{3})[a-z]*\.?\s*(\d{4})?[\s,;:\t]+([\d,]+(?:\.\d+)?)/i.exec(line);
    const bare = /^([\d,]+(?:\.\d+)?)$/.exec(line);
    if (iso) months.push({ month: `${iso[1]}-${iso[2].padStart(2, '0')}`, kwh: num(iso[3]) });
    else if (named && MONTHS.includes(named[1].toLowerCase())) months.push({ month: named[2] ? `${named[2]}-${String(MONTHS.indexOf(named[1].toLowerCase()) + 1).padStart(2, '0')}` : named[1][0].toUpperCase() + named[1].slice(1, 3).toLowerCase(), kwh: num(named[3]) });
    else if (bare) months.push({ month: `Month ${++idx}`, kwh: num(bare[1]) });
    else if (/^[a-z_" ,]+$/i.test(line)) continue; // a header line
    else throw new Error(`could not read "${line.slice(0, 40)}" as a month of usage`);
  }
  for (const m of months) if (!Number.isFinite(m.kwh) || m.kwh < 0) throw new Error(`${m.month}: kWh must be a non-negative number`);
  if (!months.length) throw new Error('no usage to read');
  if (months.length < 12) warnings.push(`${months.length} months of usage: a plan's credits and tiers hit summer and winter differently, so a full year compares plans fairly`);
  return { months, kind: 'monthly', warnings };
}

function inWindow(w, weekend, hour) {
  if (w.days === 'weekdays' && weekend) return false;
  if (w.days === 'weekends' && !weekend) return false;
  return w.start < w.end ? hour >= w.start && hour < w.end : hour >= w.start || hour < w.end;
}

/** kWh of a month (with `hours`) that falls in each of a plan's windows; the first matching window wins. */
export function windowKwh(planIn, month) {
  const plan = planIn.tou ? planIn : normalisePlan(planIn);
  const out = plan.tou.map(() => 0);
  for (const weekend of [0, 1]) {
    for (let h = 0; h < 24; h++) {
      const i = plan.tou.findIndex((w) => inWindow(w, weekend === 1, h + 0.5));
      if (i >= 0) out[i] += month.hours[weekend][h];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// EFL text reader

function sentences(text) {
  return String(text)
    .replace(/¢/g, '¢')
    .replace(/(\d)\s*cents?\b/gi, '$1¢')
    .split(/(?<=[.;])\s+(?=[A-Z*•])|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const KWH = String.raw`(\d[\d,]*(?:\.\d+)?)\s*kWh`;

function lowerBound(s) {
  let m = new RegExp(String.raw`(?:greater than or equal to|at least|equal to or greater than|minimum of)\s*${KWH}`, 'i').exec(s);
  if (m) return num(m[1]);
  m = new RegExp(String.raw`${KWH}\s*(?:or more|or greater|and above|or higher)`, 'i').exec(s);
  if (m) return num(m[1]);
  m = new RegExp(String.raw`(?:more than|greater than|over|exceeds?|above|>)\s*${KWH}`, 'i').exec(s);
  if (m) return num(m[1]) + 1; // billed kWh are whole numbers
  m = new RegExp(String.raw`(?:between|from)\s*(\d[\d,]*)\s*(?:kWh)?\s*(?:and|to|-|–)\s*${KWH}`, 'i').exec(s);
  if (m) return num(m[1]);
  return null;
}

function upperBound(s) {
  let m = new RegExp(String.raw`(?:less than or equal to|up to|no more than|not more than|through|equal to or less than)\s*${KWH}`, 'i').exec(s);
  if (m) return num(m[1]);
  m = new RegExp(String.raw`(?:between|from)\s*(\d[\d,]*)\s*(?:kWh)?\s*(?:and|to|-|–)\s*${KWH}`, 'i').exec(s);
  if (m) return num(m[2]);
  return null;
}

/**
 * Read the terms off an EFL's text (copied from the PDF). Returns a plan plus
 * `found` (which terms were read) and `notes` (what to check by hand). The
 * result is only as good as the label's wording; `labelCheck` on it says
 * whether the terms reproduce the label's own averages.
 */
export function parseEFL(text) {
  const ss = sentences(text);
  const all = ss.join(' \n ');
  const notes = [];
  const found = {};
  const plan = { name: '', base: 0, energy: [], tduFixed: 0, tduCents: 0, credits: [], fees: [], tou: [], label: null, termMonths: null, etf: null };

  const nameLine = ss.find((s) => /\bplan\b/i.test(s) && !/average|price|charge|credit|fee|term|cancel/i.test(s) && s.length < 80);
  if (nameLine) plan.name = nameLine.replace(/electricity facts label/i, '').replace(/[:\-–]\s*$/, '').trim();

  // Average price table: the three cent figures after "Average price".
  const avg = /Average\s+(?:Monthly\s+)?Price[^¢\d]*?(?:per\s+kWh)?[^¢\d]*?([\d.]+)\s*¢[^¢\d]*?([\d.]+)\s*¢[^¢\d]*?([\d.]+)\s*¢/i.exec(all);
  if (avg) {
    plan.label = { 500: Number(avg[1]), 1000: Number(avg[2]), 2000: Number(avg[3]) };
    found.label = true;
  }

  for (const s of ss) {
    // TDU delivery: "$4.23 per month and 5.6264¢ per kWh" in one sentence.
    if (/(TDU|TDSP|delivery|Oncor|CenterPoint|AEP|TNMP|Texas-New Mexico)/i.test(s) && /¢/.test(s) && /\$/.test(s) && !found.tdu) {
      const fixed = /\$\s*([\d,]+(?:\.\d+)?)\s*(?:per|\/|each)\s*(?:month|billing cycle|bill)/i.exec(s);
      const cents = /([\d.]+)\s*¢\s*(?:per|\/)\s*kWh/i.exec(s);
      if (fixed && cents) {
        plan.tduFixed = num(fixed[1]);
        plan.tduCents = Number(cents[1]);
        found.tdu = true;
        continue;
      }
    }
    if (/base\s+(?:charge|fee)|customer charge|monthly service fee/i.test(s) && !/credit/i.test(s) && !found.base) {
      const m = /\$\s*([\d,]+(?:\.\d+)?)/.exec(s);
      if (m) {
        plan.base = num(m[1]);
        found.base = true;
        if (/(less than|below|under)\s*\d/i.test(s)) notes.push('the base charge sentence names a usage condition: check whether it is really a minimum-usage fee');
        continue;
      }
    }
    if (/(credit)/i.test(s) && /\$/.test(s) && /kWh/i.test(s) && !/termination|cancel|referral|autopay|paperless|deposit/i.test(s)) {
      // Possibly several credits in one sentence: split on "additional".
      for (const part of s.split(/(?=\b(?:an\s+)?additional\b)/i)) {
        const amt = /\$\s*([\d,]+(?:\.\d+)?)/.exec(part);
        const lo = lowerBound(part);
        if (amt && lo != null) {
          plan.credits.push({ amount: num(amt[1]), min: lo, max: upperBound(part) });
          found.credits = true;
        }
      }
      continue;
    }
    if (/(fee|charge)/i.test(s) && /\$/.test(s) && /(less than|below|under|fewer than)\s*\d[\d,]*\s*kWh/i.test(s) && !/termination|cancel|late|disconnect/i.test(s)) {
      const amt = /\$\s*([\d,]+(?:\.\d+)?)/.exec(s);
      const below = /(?:less than|below|under|fewer than)\s*(\d[\d,]*)\s*kWh/i.exec(s);
      if (amt && below) {
        plan.fees.push({ amount: num(amt[1]), below: num(below[1]) });
        found.fees = true;
        continue;
      }
    }
    if (/energy\s+charge|price per kwh|energy rate/i.test(s) && /¢/.test(s) && !/average/i.test(s)) {
      // Tier forms: "0 - 1,000 kWh: 9.8¢", "first 1,000 kWh 9.8¢", "> 1,000 kWh 14.5¢", "all kWh over 1,000 ... 14.5¢".
      const tierRe = /(?:(\d[\d,]*)\s*(?:-|–|to)\s*(\d[\d,]*)\s*kWh|first\s*(\d[\d,]*)\s*kWh|(?:>|over|above|greater than|more than|in excess of)\s*(\d[\d,]*)\s*kWh)[^¢]*?([\d.]+)\s*¢/gi;
      let m;
      let any = false;
      while ((m = tierRe.exec(s))) {
        any = true;
        const upTo = m[2] != null ? num(m[2]) : m[3] != null ? num(m[3]) : null;
        plan.energy.push({ upTo, cents: Number(m[5]), from: m[4] != null ? num(m[4]) : m[1] != null ? num(m[1]) : 0 });
      }
      const tou = /(night|weekend|off-?peak|free|on-?peak|peak|day)/i.test(s) && /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i.test(s);
      if (!any && tou) {
        const times = [...s.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/gi)].map((t) => {
          let h = Number(t[1]) % 12;
          if (/p/i.test(t[3])) h += 12;
          return h + (t[2] ? Number(t[2]) / 60 : 0);
        });
        const c = /([\d.]+)\s*¢/.exec(s);
        const days = /weekend|saturday|sunday/i.test(s) && !/weekday/i.test(s) ? 'weekends' : /weekday|monday/i.test(s) ? 'weekdays' : 'all';
        if (times.length >= 2 && c) {
          plan.tou.push({ name: s.slice(0, 40), days, start: times[0], end: times[1], cents: Number(c[1]) });
          found.tou = true;
          notes.push('a time-of-use window was read from text: check its hours and days against the label');
          continue;
        }
      }
      if (!any && !plan.energy.length) {
        const c = /([\d.]+)\s*¢/.exec(s);
        if (c) plan.energy.push({ upTo: null, cents: Number(c[1]) });
      }
      found.energy = plan.energy.length > 0;
      continue;
    }
    if (/contract term|term of (?:service|agreement)|term length|^term\b/i.test(s) && plan.termMonths == null) {
      const m = /(\d+)\s*months?/i.exec(s);
      if (m) plan.termMonths = Number(m[1]);
    }
    if (/(early )?(termination|cancellation) fee/i.test(s) && plan.etf == null) {
      const m = /\$\s*([\d,]+(?:\.\d+)?)/.exec(s);
      if (m) plan.etf = num(m[1]);
      if (/per (?:remaining )?month/i.test(s)) notes.push('the cancellation fee is charged per remaining month: the figure read is the monthly amount');
    }
    if (/assum\w*\s+(\d{1,2}(?:\.\d+)?)\s*%/i.test(s) && /(usage|consumption|use)/i.test(s) && /(night|weekend|free|off-?peak|hours)/i.test(s)) {
      plan.touShare = Number(/assum\w*\s+(\d{1,2}(?:\.\d+)?)\s*%/i.exec(s)[1]) / 100;
    }
  }

  // Order tiers: a ">N" tier opens above the previous one.
  if (plan.energy.length > 1) {
    plan.energy.sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
    const open = plan.energy.filter((t) => t.upTo == null);
    if (open.length > 1) notes.push('more than one open-ended energy charge was read: check the tiers');
  }
  plan.energy = plan.energy.map(({ upTo, cents }) => ({ upTo, cents }));
  if (!plan.energy.length) notes.push('no energy charge found: type it in');
  if (!found.tdu) notes.push('no TDU delivery charges found: type in the per-month and per-kWh delivery charges the label lists');
  if (!found.label) notes.push('no average price table found: the terms cannot be checked against the label');
  if (/(tiered|bundled|usage) credit|credit tier/i.test(all) && !found.credits) notes.push('the label mentions a credit but none was read: type it in');
  if (/(minimum usage|usage charge)/i.test(all) && !found.fees) notes.push('the label mentions a minimum usage charge but none was read: type it in');
  if (/(variable|indexed)/i.test(all) && /(rate|price) (type|may change)/i.test(all)) notes.push('this looks like a variable or indexed plan: its price can change after you sign, and this tool bills the label as printed');
  if (!plan.name) plan.name = 'Pasted plan';
  return { plan, found, notes };
}

// A worked example: three plans with terms in the shape EFLs print, invented
// for illustration (no provider's prices), and a year of monthly usage for a
// Texas house with a summer peak. The TDU numbers are placeholders too: use
// the ones on your own label.
export const EXAMPLE = {
  plans: [
    {
      name: 'Example A: flat rate',
      base: 9.95,
      energy: [{ upTo: null, cents: 9.1 }],
      tduFixed: 4.5,
      tduCents: 5.5,
      label: { 500: 17.5, 1000: 16.0, 2000: 15.3 },
      termMonths: 12,
      etf: 150,
    },
    {
      name: 'Example B: $125 credit at 1,000-2,000 kWh',
      base: 0,
      energy: [{ upTo: null, cents: 14.6 }],
      tduFixed: 4.5,
      tduCents: 5.5,
      credits: [{ amount: 125, min: 1000, max: 2000 }],
      label: { 500: 21.0, 1000: 8.1, 2000: 14.1 },
      termMonths: 12,
      etf: 150,
    },
    {
      name: 'Example C: two tiers',
      base: 0,
      energy: [
        { upTo: 1000, cents: 8.2 },
        { upTo: null, cents: 12.9 },
      ],
      tduFixed: 4.5,
      tduCents: 5.5,
      fees: [{ amount: 9.95, below: 1000 }],
      label: { 500: 16.6, 1000: 14.2, 2000: 16.3 },
      termMonths: 24,
      etf: 20,
    },
  ],
  usage: ['Jan 1180', 'Feb 1020', 'Mar 860', 'Apr 840', 'May 1150', 'Jun 1720', 'Jul 2240', 'Aug 2380', 'Sep 1890', 'Oct 1130', 'Nov 880', 'Dec 1060'].join('\n'),
};

export const _internal = { round2, sentences, lowerBound, upperBound, parseDate, parseTime, inWindow };
