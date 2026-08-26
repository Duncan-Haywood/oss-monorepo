// Structural checks on the pages. calc.test.mjs never reads the HTML, so a
// column mismatch or an advertised-but-unrendered figure would stay green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareEtsyPlus, comparePersonalization } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./is-etsy-plus-worth-it.html', import.meta.url), 'utf8');
const personalizationSeo = readFileSync(new URL('./should-i-charge-for-etsy-personalization.html', import.meta.url), 'utf8');

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('the Plus row template has one cell per column', () => {
  const plusMarkup = (markup.split('id="plusTable"')[1] || '').split('id="personalizationTable"')[0];
  const headers = [...plusMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.equal(headers.length, 6, `expected 6 Plus columns, found ${headers.join(' | ')}`);
  assert.match(scriptSource, /plusCell\(row, item\.label\)/);
  assert.match(scriptSource, /plusCell\(row, money\(item\.listing\)\)/);
  assert.match(scriptSource, /plusCell\(row, money\(item\.ads\)\)/);
  assert.match(scriptSource, /plusCell\(row, money\(item\.fee\)\)/);
  assert.match(scriptSource, /plusCell\(row, money\(item\.total\)\)/);
  assert.match(scriptSource, /signedMoney\(item\.delta\)/);
});

test('schema.org featureList names the Plus comparison the page actually renders', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  assert.match(featureList[1], /Etsy Plus credit comparison/i);
  assert.match(featureList[1], /personalization upcharge comparison/i);
  assert.match(markup, /id="plusTable"/);
  assert.match(markup, /id="listingsPerMonth"/);
  assert.match(markup, /id="monthlyPlusFee"/);
  assert.match(markup, /id="otherPlusValue"/);
  assert.match(scriptSource, /compareEtsyPlus/);
  assert.match(scriptSource, /etsy_plus_compared/);
  assert.match(markup, /no SLA/i);
  assert.match(markup, /GitHub Sponsors/);
});

test('the SEO page uses the same worked examples the calculator defaults produce', () => {
  assert.match(seo, /Is Etsy Plus worth it/i);
  assert.match(seo, /href="\.\/#etsy-plus"/);
  assert.match(seo, /No warranty/);
  assert.match(seo, /no SLA/i);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  const defaults = compareEtsyPlus({
    listingFee: 0.2, listingsPerMonth: 15, monthlyPlusFee: 10,
    listingCredits: 15, adsCredit: 5, monthlyAdSpend: 5,
  });
  const unused = compareEtsyPlus({
    listingFee: 0.2, listingsPerMonth: 5, monthlyPlusFee: 10,
    listingCredits: 15, adsCredit: 5, monthlyAdSpend: 0,
  });
  const features = compareEtsyPlus({
    listingFee: 0.2, listingsPerMonth: 15, monthlyPlusFee: 10,
    listingCredits: 15, adsCredit: 5, monthlyAdSpend: 5, otherPlusValue: 3,
  });
  const highFee = compareEtsyPlus({
    listingFee: 1, listingsPerMonth: 15, monthlyPlusFee: 10,
    listingCredits: 15, adsCredit: 5, monthlyAdSpend: 0,
  });
  assert.ok(seo.includes(money(defaults.withoutPlus.total)), `missing default stay-off total ${money(defaults.withoutPlus.total)}`);
  assert.ok(seo.includes(money(defaults.withPlus.total)), `missing default Plus total ${money(defaults.withPlus.total)}`);
  assert.ok(seo.includes(signed(defaults.monthlyDelta)), `missing default delta ${signed(defaults.monthlyDelta)}`);
  assert.ok(seo.includes(signed(unused.monthlyDelta)), `missing unused-credit delta ${signed(unused.monthlyDelta)}`);
  assert.ok(seo.includes(signed(features.monthlyDelta)), `missing feature-value delta ${signed(features.monthlyDelta)}`);
  assert.ok(seo.includes(signed(highFee.monthlyDelta)), `missing high-fee delta ${signed(highFee.monthlyDelta)}`);
});

test('the personalization row template has one cell per column', () => {
  const tableMarkup = markup.split('id="personalizationTable"')[1] || '';
  const headers = [...tableMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.equal(headers.length, 6, `expected 6 personalization columns, found ${headers.join(' | ')}`);
  assert.match(scriptSource, /comparePersonalization/);
  assert.match(scriptSource, /personalizationNote/);
  assert.match(scriptSource, /personalization_compared/);
  assert.match(markup, /id="personalizationUpcharge"/);
  assert.match(markup, /id="extraMaterialCost"/);
  assert.match(markup, /id="extraTimeCost"/);
  assert.match(markup, /id="monthlyCustomOrders"/);
});

test('the personalization SEO page uses the same worked examples the calculator defaults produce', () => {
  assert.match(personalizationSeo, /Should I charge for Etsy personalization/i);
  assert.match(personalizationSeo, /href="\.\/#personalization"/);
  assert.match(personalizationSeo, /No warranty/);
  assert.match(personalizationSeo, /no SLA/i);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  const pageOrder = {
    price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, offsiteAdRate: 0, shippingCost: 6,
    materialCost: 4, otherCost: 0,
  };
  const defaults = comparePersonalization(pageOrder);
  const noTime = comparePersonalization({ ...pageOrder, extraTimeCost: 0 });
  const twelve = comparePersonalization({ ...pageOrder, personalizationUpcharge: 12 });
  const ads = comparePersonalization({ ...pageOrder, offsiteAdRate: 15 });
  assert.ok(personalizationSeo.includes(money(defaults.asListed.profit)), `missing default as-listed ${money(defaults.asListed.profit)}`);
  assert.ok(personalizationSeo.includes(money(defaults.personalized.profit)), `missing default personalized ${money(defaults.personalized.profit)}`);
  assert.ok(personalizationSeo.includes(signed(defaults.extraKept)), `missing default extra ${signed(defaults.extraKept)}`);
  assert.ok(personalizationSeo.includes(money(defaults.breakEvenUpcharge)), `missing break-even ${money(defaults.breakEvenUpcharge)}`);
  assert.ok(personalizationSeo.includes(money(noTime.personalized.profit)), `missing no-time profit ${money(noTime.personalized.profit)}`);
  assert.ok(personalizationSeo.includes(signed(noTime.extraKept)), `missing no-time extra ${signed(noTime.extraKept)}`);
  assert.ok(personalizationSeo.includes(money(twelve.personalized.profit)), `missing $12 profit ${money(twelve.personalized.profit)}`);
  assert.ok(personalizationSeo.includes(signed(twelve.extraKept)), `missing $12 extra ${signed(twelve.extraKept)}`);
  assert.ok(personalizationSeo.includes(signed(ads.extraKept)), `missing ads extra ${signed(ads.extraKept)}`);
  assert.ok(personalizationSeo.includes(money(ads.breakEvenUpcharge)), `missing ads break-even ${money(ads.breakEvenUpcharge)}`);
});
