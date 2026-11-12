// Result findings drawn by a tool page's script use <h3>, not <h4>.
//
// Why: most tool pages put their findings straight under <h2>Result</h2>. A
// script that draws each finding as <div class="finding"><h4> makes the
// rendered page jump from h2 to h4 once the result appears. Lighthouse's
// accessibility audit counts it (axe `heading-order`) and a screen-reader user
// moving by heading hears a section that seems to be missing its parent. The
// static heading scan (heading-order.mjs) strips <script>, so it never sees
// these. On 2026-11-12 a rendered sweep (rendered-headings.mjs) found the skip
// on 270 of 300 such pages; they were moved to h3 with no computed-style
// change (docs/reports/polish-2026-11-12-finding-headings.md).
//
// A static scan can't reliably tell where the script writes its findings (it
// agreed with the browser on 87% of pages), so this is a ratchet: the pages
// below still draw .finding <h4>, mostly because their findings sit under an
// <h3> where h4 is right. A new page should draw h3; if its findings really
// sit under an h3, add it here after checking with rendered-headings.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VENTURES = fileURLToPath(new URL('../../ventures/', import.meta.url));

const KNOWN_H4 = new Set([
  'apparel-decoration-price-calculator',
  'bonus-depreciation-calculator', 'business-loan-offer-comparator',
  'charitable-deduction-calculator', 'childcare-center-break-even-calculator',
  'chiropractor-new-patient-roi-calculator', 'cnc-machining-quote-calculator', 'coi-expiry-gap-checker',
  'commercial-lease-effective-rent-calculator', 'contractor-wip-schedule', 'depreciation-recapture-calculator',
  'donor-acknowledgment-letter-generator', 'eu-vat-oss-calculator',
  'exemption-certificate-audit-check', 'fractional-executive-rate-calculator',
  'freight-broker-load-margin-calculator', 'gitignore-explainer',
  'grant-writer-proposal-price-calculator', 'inherited-ira-10-year-withdrawal-planner',
  'insurance-commission-reconciler', 'med-spa-treatment-profit-calculator',
  'payroll-tax-deposit-penalty-calculator', 'pg-stat-statements-analyzer',
  'physician-wrvu-compensation-calculator',
  'roth-conversion-bracket-fill-calculator',
  'rsu-withholding-gap-calculator', 'section-174a-catchup-calculator',
  'startup-exit-waterfall-calculator', 'supplier-price-creep-checker',
  'syndication-waterfall-calculator', 'tow-truck-rate-calculator',
  'usage-based-pricing-simulator', 'wash-and-fold-price-calculator',
]);

/** True when an inline script on the page draws `<... class="finding..."><h4>`. */
export function drawsFindingH4(html) {
  for (const m of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (/class=\\?"finding[^"\\]*\\?"[^<]*<h4[\s>]/.test(m[1])) return true;
  }
  return false;
}

test('drawsFindingH4 sees script-drawn finding h4s only', () => {
  assert.equal(drawsFindingH4('<script>x.innerHTML = `<div class="finding"><h4>${t}</h4></div>`</script>'), true);
  assert.equal(drawsFindingH4('<script>h += "<div class=\\"finding warn\\"><h4>" + t</script>'), true);
  assert.equal(drawsFindingH4('<script>x.innerHTML = `<div class="finding"><h3>${t}</h3></div>`</script>'), false);
  assert.equal(drawsFindingH4('<div class="finding"><h4>static</h4></div>'), false, 'static markup is heading-order.mjs territory');
  assert.equal(drawsFindingH4('<style>.finding h4 { margin: 0 }</style>'), false);
});

test('no new tool page draws its result findings as h4', () => {
  const offenders = [];
  const stale = [];
  for (const slug of fs.readdirSync(VENTURES).sort()) {
    const file = path.join(VENTURES, slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const h4 = drawsFindingH4(fs.readFileSync(file, 'utf8'));
    if (h4 && !KNOWN_H4.has(slug)) offenders.push(slug);
    if (!h4 && KNOWN_H4.has(slug)) stale.push(slug);
  }
  assert.deepEqual(offenders, [], 'draw these findings as <h3> (and rename the page CSS .finding h4 to .finding h3); see the comment at the top of this file');
  assert.deepEqual(stale, [], 'these no longer draw .finding h4: drop them from KNOWN_H4');
});
