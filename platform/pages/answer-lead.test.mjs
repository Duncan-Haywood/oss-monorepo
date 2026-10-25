// Pilot pages (backlog P054) open with a one-sentence direct answer that names
// its primary source and an as-of date. AI answer engines quote a page that
// states a fact plainly with its provenance; a lead whose number drifts from
// the venture's calculator would quote a wrong figure. So each dollar figure in
// a lead must be one the venture's own calc module exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../ventures/', import.meta.url);

// slug -> figures (from the venture's calc module) that the lead may state.
const PILOTS = {
  '1099-k-threshold-checker': async (m) => {
    const t = m.federalThreshold(2026);
    const y24 = m.federalThreshold(2024);
    return [t.amount, y24.amount];
  },
  'hsa-contribution-limit-calculator': async (m) => [
    m.LIMITS_2026.self.annual, m.LIMITS_2026.family.annual, m.CATCH_UP_55_PLUS,
  ],
  'exempt-salary-threshold-checker': async (m) => [
    m.FEDERAL_WEEKLY_THRESHOLD, m.weeklyToAnnual(m.FEDERAL_WEEKLY_THRESHOLD),
    ...Object.values(m.STATE_THRESHOLDS).filter((s) => s.weekly).map((s) => s.weekly),
  ],
  'discogs-fee-calculator': async (m) => [m.SELLING_FEE_MIN, m.SELLING_FEE_MAX],
  'grailed-fee-calculator': async (m) => [m.TIER_THRESHOLD, m.MIN_COMMISSION],
  'facebook-marketplace-fee-calculator': async (m) => [m.MIN_FEE, 0], // 0: local pickup carries no fee
  'depop-fee-calculator': async (m) => [m.REGIONS.us.processingFixed],
  'mercari-fee-calculator': async (m) => [m.LEGACY_PROCESSING_FIXED],
  'kickstarter-fee-calculator': async (m) => [
    m.MICRO_PLEDGE_THRESHOLD, m.STANDARD_PROCESSING_FLAT, m.MICRO_PROCESSING_FLAT,
  ],
  'poshmark-fee-calculator': async (m) => [m.FLAT_FEE, m.COMMISSION_THRESHOLD, m.BREAK_EVEN_PRICE],
};

for (const [slug, figures] of Object.entries(PILOTS)) {
  test(`${slug}: lead is sourced, dated and matches the calc module`, async () => {
    const html = readFileSync(new URL(`${slug}/index.html`, root), 'utf8');
    const m = html.match(/<p[^>]*data-answer-lead[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(m, 'no data-answer-lead paragraph');
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(text, /Source:/);
    assert.match(text, /(?:verified|as of) \d{4}-\d{2}-\d{2}/i);
    const allowed = (await figures(await import(new URL(`${slug}/calc.mjs`, root)))).map(Number);
    const stated = [...text.matchAll(/\$([\d,]+(?:\.\d+)?)/g)].map((x) => Number(x[1].replace(/,/g, '')));
    assert.ok(stated.length > 0, 'lead states no figure');
    for (const n of stated) assert.ok(allowed.includes(n), `$${n} is not a figure exported by ${slug}/calc.mjs`);
  });
}
