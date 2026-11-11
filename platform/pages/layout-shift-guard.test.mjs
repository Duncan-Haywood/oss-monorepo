// Guards for the two layout shifts measured on wall-framing-takeoff on
// 2026-11-11 (docs/reports/polish-2026-11-11-tool-page-layout-shift.md):
//
// 1. The site band's "meet the top edge" rules key on the band being the
//    body's first child. The JavaScript-needed notice is inserted right after
//    <body>, so on every page that carries it the rules stopped matching and
//    pf-site.js pulled the band up after first paint (CLS 0.027).
// 2. The saved-bids and shop-rates bars ship `hidden` and their scripts
//    reveal them on 'load', pushing the venture's heading down by each bar's
//    height (CLS 0.056 from saved bids on wall-framing-takeoff; 0.069 from shop
//    rates on chimney-sweep-bid-calculator).
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import { renderChromeStyle, addNoscriptNotice } from './build.mjs';
import { renderSavedBidsStyle } from './jobs.mjs';
import { renderShopRatesStyle, renderShopRatesModule, injectShopRates, RATES_FIRST_VISIT_STATUS } from './rates.mjs';

const FIRST = 'body:has(> .pf-chrome-top[data-pfs-head]:first-child';
const AFTER_NOSCRIPT = '> noscript:first-child + .pf-chrome-top[data-pfs-head]';

test('every band rule that needs the band first also accepts a leading <noscript>', () => {
  const css = renderChromeStyle();
  const rules = css.split(FIRST).slice(1);
  assert.ok(rules.length >= 3, `expected the three band rules, found ${rules.length}`);
  for (const rest of rules) {
    assert.ok(rest.startsWith(`, ${AFTER_NOSCRIPT})`), `a band rule ignores the noscript notice: ${FIRST}${rest.slice(0, 80)}`);
  }
});

test('the noscript notice is what lands first in <body>, the case the band rule allows', () => {
  const html = '<html><head></head><body><nav class="pf-chrome pf-chrome-top" data-pfs-head></nav>'
    + '<input id="a"><script>1</script></body></html>';
  const out = addNoscriptNotice(html);
  const body = out.slice(out.indexOf('<body>') + '<body>'.length);
  assert.match(body, /^<noscript>[\s\S]*?<\/noscript>\s*<nav class="pf-chrome pf-chrome-top"/);
});

test('the saved-bids bar holds its space from first paint when scripting is on', () => {
  const css = renderSavedBidsStyle();
  const rule = css.match(/@media screen and \(scripting:enabled\)\{\.pf-jobs\[hidden\]\[data-pf-jobs-root\]\{([^}]*)\}\}/);
  assert.ok(rule, 'reservation rule missing from pf-jobs.css');
  // !important: ventures commonly declare [hidden]{display:none !important}.
  assert.match(rule[1], /display:block !important/);
  // Invisible, so nothing unwired can be focused or read before the script runs.
  assert.match(rule[1], /visibility:hidden/);
  // Print hides the bar; the reservation must not be in force there.
  assert.match(css, /@media print\{\.pf-jobs\{display:none !important\}\}/);
});

test('the shop-rates bar holds its space too, at the height it will be shown at', () => {
  const css = renderShopRatesStyle();
  const rule = css.match(/@media screen and \(scripting:enabled\)\{\.pf-rates\[hidden\]\[data-pf-rates-root\]\{([^}]*)\}\}/);
  assert.ok(rule, 'reservation rule missing from pf-rates.css');
  assert.match(rule[1], /display:block !important/);
  assert.match(rule[1], /visibility:hidden/);
  assert.match(css, /@media print\{\.pf-rates\{display:none !important\}\}/);
  // The held box is the shown box only if the markup already says what the
  // script will say to a first-time visitor.
  const script = renderShopRatesModule();
  assert.ok(script.includes(`status.textContent = ${JSON.stringify(RATES_FIRST_VISIT_STATUS).replace('\u2014', '\\u2014')};`));
});

test('the built shop-rates bar already carries the first-visit status line', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const slug = 'chimney-sweep-bid-calculator';
  const html = fs.readFileSync(path.join(here, '../../ventures', slug, 'index.html'), 'utf8');
  const out = injectShopRates(html, slug);
  assert.notEqual(out, html, `${slug} should carry the shop-rates bar`);
  const status = out.match(/<span class="pf-rates-status" id="pf-rates-status" role="status">([^<]*)<\/span>/);
  assert.ok(status, 'status span missing');
  assert.equal(status[1].replace('&mdash;', '\u2014'), RATES_FIRST_VISIT_STATUS);
});
