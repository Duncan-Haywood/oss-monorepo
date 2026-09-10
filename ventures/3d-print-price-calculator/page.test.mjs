import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrice, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculatePrice from calc.mjs', () => {
  assert.match(html, /import \{ calculatePrice \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the suggested price and the price check', () => {
  assert.match(html, /recordEvent\('price-calculated'\)/);
  assert.match(html, /recordEvent\('price-checked'\)/);
  assert.match(html, /<code>price-calculated<\/code>, <code>price-checked<\/code>/);
});

test('the default inputs on the page match calc.mjs DEFAULTS and produce a profitable suggested price', () => {
  const result = calculatePrice(DEFAULTS);
  assert.match(html, new RegExp(`id="filamentUsedGrams" type="number" min="0" step="1" value="${DEFAULTS.filamentUsedGrams}"`));
  assert.match(html, new RegExp(`id="printerCost" type="number" min="0" step="1" value="${DEFAULTS.printerCost}"`));
  assert.ok(result.suggestedProfit > 0);
});

test('the price-check panel is hidden until a value is entered', () => {
  assert.match(html, /id="actualResult" hidden/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names both stored event types and says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('the result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updatePrice[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updatePrice() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden = true/, 'the price hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

// The comparison page names slicers to say what this tool is *not*, so the
// two lines that keep it honest are the ones most likely to be lost in a
// later edit: the not-affiliated statement, and the reverse link from index.
// Without the link a crawler entering on the hub never reaches it, which is
// the one-way orphan class this portfolio has shipped before.
test('the comparison page disclaims affiliation and is reachable from index', () => {
  const compare = readFileSync(new URL('./vs-slicer-cost-estimate.html', import.meta.url), 'utf8');
  assert.match(compare, /not affiliated with, endorsed by, or sponsored by any slicer vendor/i);
  assert.match(compare, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(compare, /<meta property="og:title" content="[^"]+">/);
  assert.match(compare, /<meta property="og:description" content="[^"]+">/);
  assert.match(compare, /href="\.\/"/, 'must link back to the calculator');
  assert.match(
    html,
    /href="\.\/vs-slicer-cost-estimate\.html"/,
    'index must link the comparison page so crawlers can reach it',
  );
});

// The FAQ answers are duplicated between visible copy and the JSON-LD block.
// Structured data disagreeing with the visible page is the defect CLAUDE.md
// records from #3671, so pin that the two stay identical.
test('comparison page FAQ structured data matches the visible answers', () => {
  const compare = readFileSync(new URL('./vs-slicer-cost-estimate.html', import.meta.url), 'utf8');
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(compare)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  const visible = compare.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const entry of ld.mainEntity) {
    assert.ok(
      visible.includes(`<h3>${entry.name}</h3>`),
      `structured-data question is not on the page: ${entry.name}`,
    );
    assert.ok(
      visible.includes(`<p>${entry.acceptedAnswer.text}</p>`),
      `structured-data answer does not match the visible copy for: ${entry.name}`,
    );
  }
});

// Every .html in the venture must be advertised by the sitemap; the venture
// had exactly one page until now, so nothing here enforced that yet.
test('every page in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const name of readdirSync(new URL('./', import.meta.url)).filter(n => n.endsWith('.html'))) {
    if (name === 'index.html') {
      assert.match(sitemap, /3d-print-price-calculator\/<\/loc>/);
      continue;
    }
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

test('the page ships save, forget, and copy-link controls, matching sibling calculators', () => {
  assert.match(html, /id="save">Save this scenario on this device/);
  assert.match(html, /id="forget">Forget my saved scenario/);
  assert.match(html, /id="copyLink">Copy shareable link/);
  assert.match(html, /id="linkStatus" class="note" role="status" aria-live="polite"/);
});

test('the page imports share.mjs rather than restating its own encode/decode logic', () => {
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues, REQUIRED_FIELD_IDS \} from '\.\/share\.mjs'/);
});

// The exact bug this venture shipped and then re-shipped in miniature: a
// share link that carries every DEFAULTS field but silently drops the one
// optional "price I'm checking" field, so a co-seller opening the link sees
// no price-check panel at all with nothing on screen to say why it vanished.
test('the copied link and the shared-link restore both carry actualSellingPrice, not just the DEFAULTS fields', () => {
  assert.match(html, /encodeInputs\(\{ \.\.\.fieldInputs\(\), actualSellingPrice: el\('actualSellingPrice'\)\.value \}\)/);
  assert.match(html, /el\('actualSellingPrice'\)\.value = shared\.actualSellingPrice/);
});

// The exact silent-divergence defect this portfolio has shipped before: a
// shared link applied with only the fields it carried leaves the rest of the
// form holding whatever a saved draft or mid-edit session already put there,
// so the recipient's price silently mixes the sender's numbers with a
// stranger's. `formValues` is the guard, and this pins that the page uses it
// rather than writing a decoded link straight onto the form.
test('a shared link is applied through formValues, never written to the form directly', () => {
  assert.doesNotMatch(html, /writeInputs\(fromLink\)/);
  assert.match(html, /const shared = formValues\(fromLink\);\s*\n\s*writeInputs\(shared\);/);
});

test('a shared link takes priority over a saved draft on load', () => {
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const body = scriptMatch[1];
  const draftIdx = body.indexOf('localStorage.getItem(DRAFT_KEY)');
  const linkIdx = body.indexOf('decodeInputs(location.hash');
  assert.ok(draftIdx >= 0 && linkIdx >= 0, 'draft restore or link restore code is missing');
  assert.ok(draftIdx < linkIdx, 'the link restore must run after (and so override) the draft restore');
});

test('the privacy copy explains save, forget, and the shareable link consistently in both places', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/)[1]);
  const answer = ld.mainEntity.find((q) => q.name === 'Does anything I type get uploaded?').acceptedAnswer.text;
  assert.match(answer, /Save button writes your scenario to this browser's own local storage/);
  assert.match(answer, /Copy shareable link puts the same numbers in the page's URL fragment/);
  const visible = html.match(/<h3>Does anything I type get uploaded\?<\/h3><p>([^<]+)<\/p>/)[1];
  assert.equal(visible, answer, 'visible FAQ answer must match its JSON-LD twin exactly');
});

test("index links one hop to the apparel-decoration-price-calculator sibling", () => {
  assert.ok(
    html.includes('href="../apparel-decoration-price-calculator/"'),
    "index must link ../apparel-decoration-price-calculator/ so a crawler reaches that tool in one hop",
  );
});
