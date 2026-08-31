import { buildReport } from './calc.mjs';

export const DEFAULT_HOURLY_RATE = 150;
export const DEFAULT_BUFFER_PERCENT = 20;
export const DEFAULT_THEME_MULTIPLIER = 1;
export const USAGE_KEY = 'shopify-a11y-evidence-usage';

/** Hours for the first affected node, then each extra node of the same rule. */
export const IMPACT_HOURS = {
  critical: { firstNode: 1.5, extraNode: 0.35 },
  serious: { firstNode: 1, extraNode: 0.25 },
  moderate: { firstNode: 0.5, extraNode: 0.15 },
  minor: { firstNode: 0.25, extraNode: 0.08 },
  unknown: { firstNode: 0.75, extraNode: 0.2 },
};

const IMPACT_WEIGHT = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
  unknown: 2,
};

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundHours(value) {
  return Math.round(value * 100) / 100;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

export function hoursForItem(item) {
  const impact = IMPACT_HOURS[item?.impact] || IMPACT_HOURS.unknown;
  const nodes = Math.max(0, Number(item?.nodes) || 0);
  if (nodes === 0) return impact.firstNode;
  return impact.firstNode + impact.extraNode * Math.max(0, nodes - 1);
}

export function money(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

/**
 * Turn one axe-core JSON export (or a buildReport() result) into a
 * remediation-hour and quote range. This is a planning estimate, not a
 * compliance determination or a promise that the hours will close the issues.
 */
export function quoteRemediation(input, options = {}) {
  const report = input && Array.isArray(input.items) && input.counts
    ? input
    : buildReport(input);

  const hourlyRate = finiteNumber(options.hourlyRate, DEFAULT_HOURLY_RATE);
  const bufferPercent = finiteNumber(options.bufferPercent, DEFAULT_BUFFER_PERCENT);
  const themeMultiplier = finiteNumber(options.themeMultiplier, DEFAULT_THEME_MULTIPLIER);

  if (hourlyRate <= 0) throw new Error('Hourly rate must be a positive number.');
  if (bufferPercent < 0 || bufferPercent > 100) throw new Error('Buffer percent must be between 0 and 100.');
  if (themeMultiplier < 0.5 || themeMultiplier > 2.5) throw new Error('Theme complexity must be between 0.5 and 2.5.');

  const items = report.items.map((item) => {
    const hours = roundHours(hoursForItem(item) * themeMultiplier);
    const weight = (IMPACT_WEIGHT[item.impact] || IMPACT_WEIGHT.unknown) * Math.max(1, item.nodes);
    return { ...item, hours, weight };
  });
  const ranked = [...items].sort((a, b) => b.weight - a.weight || b.hours - a.hours || a.id.localeCompare(b.id));
  const rawHours = roundHours(items.reduce((sum, item) => sum + item.hours, 0));
  const bufferedHours = roundHours(rawHours * (1 + bufferPercent / 100));
  const mid = roundMoney(bufferedHours * hourlyRate);
  const byImpact = {};
  for (const item of items) {
    const bucket = byImpact[item.impact] || { rules: 0, nodes: 0, hours: 0 };
    bucket.rules += 1;
    bucket.nodes += item.nodes;
    bucket.hours = roundHours(bucket.hours + item.hours);
    byImpact[item.impact] = bucket;
  }

  return {
    date: report.date,
    url: report.url,
    hourlyRate,
    bufferPercent,
    themeMultiplier,
    rawHours,
    bufferedHours,
    quote: { low: roundMoney(mid * 0.85), mid, high: roundMoney(mid * 1.25), currency: 'USD' },
    items: ranked,
    byImpact,
    counts: report.counts,
    empty: items.length === 0,
  };
}

export function quoteAsText(quote) {
  const lines = [
    'Shopify accessibility remediation quote (planning estimate)',
    `Checked: ${quote.date}`,
    `URL: ${quote.url}`,
    '',
    `Violation rules: ${quote.counts.violations} / affected nodes: ${quote.counts.nodes}`,
    `Estimated hours: ${quote.rawHours} raw, ${quote.bufferedHours} with ${quote.bufferPercent}% buffer`,
    `Assumed rate: ${money(quote.hourlyRate)}/hr · theme multiplier ${quote.themeMultiplier}`,
    `Quote range: ${money(quote.quote.low)} – ${money(quote.quote.high)} (mid ${money(quote.quote.mid)})`,
    '',
  ];
  if (quote.empty) {
    lines.push('No violations were present in this supplied result. Hours and quote are $0.');
    lines.push('Manual and assistive-technology review is still required.');
  } else {
    lines.push('Fix first (highest impact × node count):');
    for (const item of quote.items) {
      lines.push(`- [${item.impact}] ${item.id}: ${item.help} (${item.nodes} node${item.nodes === 1 ? '' : 's'}, ${item.hours} h)`);
    }
  }
  lines.push('');
  lines.push('This is a planning estimate from an automated scan, not a compliance determination, not a fixed bid, and not a promise that these hours will close the issues.');
  return lines.join('\n');
}

export function recordQuoteUsage(storage = globalThis.localStorage, optOut = false, event = 'quote_generated') {
  if (optOut || !storage) return;
  let current = {};
  try {
    current = JSON.parse(storage.getItem(USAGE_KEY) || '{}');
  } catch {
    current = {};
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
  current[event] = Number(current[event] || 0) + 1;
  try {
    storage.setItem(USAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage is optional */
  }
}
