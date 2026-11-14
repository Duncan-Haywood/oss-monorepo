// Short text forms for the parts of a plan that are lists, so a plan fits in
// one small form and survives a copy-paste:
//
//   energy  "8.2 to 1000, 12.9"            tiers: price, "to" breakpoint; last open
//   credits "125 at 1000-2000; 15 at 2000+" amount at min-max (inclusive) or min+
//   fees    "9.95 under 1000"               amount when usage is under a kWh
//   tou     "0 all 21-6; 5 weekends 0-24"   cents, days (all|weekdays|weekends), start-end hours
//   label   "21.0 8.1 14.1"                 average cents at 500, 1,000, 2,000 kWh

// A number as people type one: digits, commas only between thousands groups, an optional decimal part.
// Anything else ("," alone, "1,,0", "1.2.3") is NaN, never a silent 0 (red team 2026-11-14).
const NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/;
const n = (s) => {
  const v = String(s).replace(/[$¢]/g, '').trim();
  return v && /\d/.test(v) && NUMBER.test(v) ? Number(v.replace(/,/g, '')) : NaN;
};
const finite = (o, msg) => {
  if (!Object.values(o).every((x) => typeof x !== 'number' || Number.isFinite(x))) throw new Error(msg);
  return o;
};
const parts = (s) => String(s || '').split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);

export function energyToText(energy) {
  return (energy || []).map((t) => (t.upTo == null ? `${t.cents}` : `${t.cents} to ${t.upTo}`)).join(', ');
}
export function textToEnergy(s) {
  const tiers = String(s || '').split(/(?:[;\n]|,(?!\d{3}(?!\d)))+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^([\d.]+)\s*(?:¢)?\s*(?:to|up to|<=?)\s*([\d,]+)$/i.exec(x);
    const msg = `energy charge "${x}": write cents, or "cents to kWh" for a tier`;
    if (m) return finite({ cents: n(m[1]), upTo: n(m[2]) }, msg);
    if (/^[\d.]+\s*¢?$/.test(x)) return finite({ cents: n(x), upTo: null }, msg);
    throw new Error(msg);
  });
  return tiers.length ? tiers : [{ cents: 0, upTo: null }];
}

export function creditsToText(credits) {
  return (credits || []).map((c) => `${c.amount} at ${c.min}${c.max == null ? '+' : `-${c.max}`}`).join('; ');
}
export function textToCredits(s) {
  return parts(s).map((x) => {
    const m = /^\$?([\d.,]+)\s*(?:at|@|for)\s*([\d,]+)\s*(?:(\+)|(?:-|–|to)\s*([\d,]+))?\s*(?:kWh)?$/i.exec(x);
    const msg = `credit "${x}": write "amount at min-max" or "amount at min+"`;
    if (!m) throw new Error(msg);
    return finite({ amount: n(m[1]), min: n(m[2]), max: m[4] ? n(m[4]) : null }, msg);
  });
}

export function feesToText(fees) {
  return (fees || []).map((f) => `${f.amount} under ${f.below}`).join('; ');
}
export function textToFees(s) {
  return parts(s).map((x) => {
    const m = /^\$?([\d.,]+)\s*(?:under|below|<)\s*([\d,]+)\s*(?:kWh)?$/i.exec(x);
    const msg = `fee "${x}": write "amount under kWh"`;
    if (!m) throw new Error(msg);
    return finite({ amount: n(m[1]), below: n(m[2]) }, msg);
  });
}

export function touToText(tou) {
  return (tou || []).map((w) => `${w.cents} ${w.days} ${w.start}-${w.end}`).join('; ');
}
export function textToTou(s) {
  return parts(s).map((x) => {
    const m = /^([\d.]+)\s*¢?\s*(all|weekdays|weekends)\s*([\d.]+)\s*(?:-|–|to)\s*([\d.]+)$/i.exec(x);
    const msg = `time-of-use "${x}": write "cents days start-end", e.g. "0 all 21-6"`;
    if (!m) throw new Error(msg);
    return finite({ name: x, cents: n(m[1]), days: m[2].toLowerCase(), start: n(m[3]), end: n(m[4]) }, msg);
  });
}

export function labelToText(label) {
  return label ? [label[500], label[1000], label[2000]].join(' ') : '';
}
export function textToLabel(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  const xs = v.split(/[\s,;/]+/).filter(Boolean).map(n);
  if (xs.length !== 3 || !xs.every(Number.isFinite)) throw new Error('label prices: write the three average prices, e.g. "21.0 8.1 14.1"');
  return { 500: xs[0], 1000: xs[1], 2000: xs[2] };
}

/** Plan -> flat string fields for a form. */
export function planToFields(p) {
  return {
    name: p.name || '',
    base: String(p.base ?? 0),
    energy: energyToText(p.energy),
    tduFixed: String(p.tduFixed ?? 0),
    tduCents: String(p.tduCents ?? 0),
    credits: creditsToText(p.credits),
    fees: feesToText(p.fees),
    tou: touToText(p.tou),
    touShare: p.touShare == null ? '' : String(Math.round(p.touShare * 1000) / 10),
    label: labelToText(p.label),
    termMonths: p.termMonths == null ? '' : String(p.termMonths),
    etf: p.etf == null ? '' : String(p.etf),
  };
}

/** Flat string fields -> plan (throws with a readable message). */
export function fieldsToPlan(f) {
  const num = (k, d = 0) => {
    const v = String(f[k] ?? '').trim();
    if (!v) return d;
    const x = n(v);
    if (!Number.isFinite(x)) throw new Error(`${k}: "${v}" is not a number`);
    return x;
  };
  return {
    name: String(f.name || 'Plan').trim() || 'Plan',
    base: num('base'),
    energy: textToEnergy(f.energy),
    tduFixed: num('tduFixed'),
    tduCents: num('tduCents'),
    credits: textToCredits(f.credits),
    fees: textToFees(f.fees),
    tou: textToTou(f.tou),
    touShare: String(f.touShare ?? '').trim() ? num('touShare') / 100 : null,
    label: textToLabel(f.label),
    termMonths: num('termMonths', null),
    etf: num('etf', null),
  };
}
