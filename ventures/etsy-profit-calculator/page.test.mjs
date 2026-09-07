// Structural checks on the pages. calc.test.mjs never reads the HTML, so a
// column mismatch or an advertised-but-unrendered figure would stay green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { compareEtsyPlus, comparePersonalization, compareEtsyAds, compareOffsiteAdRates, maxAffordableOffsiteRate, compareProductionPartner, compareStarSeller, compareShopSale, compareFreeShipping, compareEtsyLabels } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./is-etsy-plus-worth-it.html', import.meta.url), 'utf8');
const personalizationSeo = readFileSync(new URL('./should-i-charge-for-etsy-personalization.html', import.meta.url), 'utf8');
const adsSeo = readFileSync(new URL('./is-etsy-ads-worth-it.html', import.meta.url), 'utf8');
const offsiteSeo = readFileSync(new URL('./are-etsy-offsite-ads-worth-it.html', import.meta.url), 'utf8');
const partnerSeo = readFileSync(new URL('./should-i-use-an-etsy-production-partner.html', import.meta.url), 'utf8');
const starSeo = readFileSync(new URL('./is-etsy-star-seller-worth-it.html', import.meta.url), 'utf8');
const saleSeo = readFileSync(new URL('./should-i-put-my-etsy-shop-on-sale.html', import.meta.url), 'utf8');
const freeShipSeo = readFileSync(new URL('./should-i-offer-free-shipping-on-etsy.html', import.meta.url), 'utf8');
const labelsSeo = readFileSync(new URL('./should-i-buy-etsy-shipping-labels.html', import.meta.url), 'utf8');
const vsEtsySeo = readFileSync(new URL('./vs-etsys-listing-form-calculator.html', import.meta.url), 'utf8');

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
  assert.match(featureList[1], /Etsy Ads ACOS comparison/i);
  assert.match(featureList[1], /Offsite Ads 12%\/15% comparison/i);
  assert.match(featureList[1], /production partner vs handmade comparison/i);
  assert.match(featureList[1], /Star Seller vs unsigned comparison/i);
  assert.match(featureList[1], /shop sale vs full price comparison/i);
  assert.match(featureList[1], /free shipping vs charged shipping comparison/i);
  assert.match(featureList[1], /listing auto-renew allocation/i);
  assert.match(markup, /listing-renewal\.html/);
  assert.match(markup, /what-price-keeps-this-etsy-profit\.html/);
  assert.match(markup, /id="target-profit"/);
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
  const tableMarkup = (markup.split('id="personalizationTable"')[1] || '').split('id="adsTable"')[0];
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

test('the Ads row template has one cell per column', () => {
  const tableMarkup = (markup.split('id="adsTable"')[1] || '').split('id="offsiteTable"')[0];
  const headers = [...tableMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.equal(headers.length, 5, `expected 5 Ads columns, found ${headers.join(' | ')}`);
  assert.match(scriptSource, /compareEtsyAds/);
  assert.match(scriptSource, /etsyAdsNote/);
  assert.match(scriptSource, /etsy_ads_compared/);
  assert.match(markup, /id="etsyAdsAcosPct"/);
  assert.match(markup, /id="etsy-ads"/);
});

test('the Etsy Ads SEO page uses the same worked examples the calculator defaults produce', () => {
  assert.match(adsSeo, /Is Etsy Ads worth it/i);
  assert.match(adsSeo, /href="\.\/#etsy-ads"/);
  assert.match(adsSeo, /No warranty/);
  assert.match(adsSeo, /no SLA/i);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  const pageOrder = {
    price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, offsiteAdRate: 0, shippingCost: 6,
    materialCost: 4, otherCost: 0, monthlyAdSpend: 5,
  };
  const defaults = compareEtsyAds(pageOrder);
  const highAcos = compareEtsyAds({ ...pageOrder, etsyAdsAcosPct: 70 });
  const offsite = compareEtsyAds({ ...pageOrder, offsiteAdRate: 15 });
  assert.ok(adsSeo.includes(money(defaults.organic.profit)), `missing default organic ${money(defaults.organic.profit)}`);
  assert.ok(adsSeo.includes(money(defaults.advertised.profit)), `missing default advertised ${money(defaults.advertised.profit)}`);
  assert.ok(adsSeo.includes(money(defaults.adsCost)), `missing default ads cost ${money(defaults.adsCost)}`);
  assert.ok(adsSeo.includes(signed(defaults.extraKept)), `missing default extra ${signed(defaults.extraKept)}`);
  assert.ok(adsSeo.includes(`${defaults.breakEvenAcosPct.toFixed(2)}%`), `missing break-even ${defaults.breakEvenAcosPct.toFixed(2)}%`);
  assert.ok(adsSeo.includes(money(defaults.monthlyIncrementalKept)), `missing monthly ${money(defaults.monthlyIncrementalKept)}`);
  assert.ok(adsSeo.includes(money(highAcos.advertised.profit)), `missing 70% profit ${money(highAcos.advertised.profit)}`);
  assert.ok(adsSeo.includes(money(highAcos.adsCost)), `missing 70% ads ${money(highAcos.adsCost)}`);
  assert.ok(adsSeo.includes(money(offsite.organic.profit)), `missing offsite organic ${money(offsite.organic.profit)}`);
  assert.ok(adsSeo.includes(money(offsite.advertised.profit)), `missing offsite advertised ${money(offsite.advertised.profit)}`);
  assert.ok(adsSeo.includes(`${offsite.breakEvenAcosPct.toFixed(2)}%`), `missing offsite ceiling ${offsite.breakEvenAcosPct.toFixed(2)}%`);
});

test('the Offsite Ads row template has one cell per column', () => {
  const tableMarkup = (markup.split('id="offsiteTable"')[1] || '').split('id="partnerTable"')[0];
  const headers = [...tableMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.equal(headers.length, 5, `expected 5 Offsite Ads columns, found ${headers.join(' | ')}`);
  assert.match(scriptSource, /compareOffsiteAdRates/);
  assert.match(scriptSource, /offsiteAdsNote/);
  assert.match(scriptSource, /offsite_ads_compared/);
  assert.match(markup, /id="offsite-ads"/);
  assert.match(markup, /id="cashInvested"/);
  assert.match(markup, /id="roi"/);
});

test('the Offsite Ads SEO page uses the same worked examples the calculator defaults produce', () => {
  assert.match(offsiteSeo, /Are Etsy Offsite Ads worth it/i);
  assert.match(offsiteSeo, /href="\.\/#offsite-ads"/);
  assert.match(offsiteSeo, /No warranty/);
  assert.match(offsiteSeo, /no SLA/i);
  const money = (value) => {
    const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    const sign = rounded < 0 ? '−' : '';
    return `${sign}$${Math.abs(rounded).toFixed(2)}`;
  };
  const tight = {
    price: 14, shippingCharged: 3, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, shippingCost: 5.5, materialCost: 7,
  };
  const rows = compareOffsiteAdRates(tight);
  const cap = maxAffordableOffsiteRate(tight);
  const organic = rows.find((row) => row.offsiteAdRate === 0);
  const at12 = rows.find((row) => row.offsiteAdRate === 12);
  const at15 = rows.find((row) => row.offsiteAdRate === 15);
  assert.ok(offsiteSeo.includes(money(organic.profit)), `missing organic ${money(organic.profit)}`);
  assert.ok(offsiteSeo.includes(money(at12.profit)), `missing 12% ${money(at12.profit)}`);
  assert.ok(offsiteSeo.includes(money(at15.profit)), `missing 15% ${money(at15.profit)}`);
  assert.ok(offsiteSeo.includes(`${cap.toFixed(1)}%`), `missing ceiling ${cap.toFixed(1)}%`);
});

test('the production-partner row template has one cell per column', () => {
  const tableMarkup = (markup.split('id="partnerTable"')[1] || '').split('id="starTable"')[0];
  const headers = [...tableMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.equal(headers.length, 6, `expected 6 partner columns, found ${headers.join(' | ')}`);
  assert.match(scriptSource, /compareProductionPartner/);
  assert.match(scriptSource, /productionPartnerNote/);
  assert.match(scriptSource, /production_partner_compared/);
  assert.match(markup, /id="yourTimeCost"/);
  assert.match(markup, /id="partnerUnitCost"/);
  assert.match(markup, /id="partnerHandlingCost"/);
  assert.match(markup, /id="yourMonthlyCapacity"/);
  assert.match(markup, /id="monthlyDemand"/);
  assert.match(markup, /id="partnerRejectRatePercent"/);
});

test('the production-partner SEO page uses the same worked examples the calculator defaults produce', () => {
  assert.match(partnerSeo, /Should I use an Etsy production partner/i);
  assert.match(partnerSeo, /href="\.\/#production-partner"/);
  assert.match(partnerSeo, /No warranty/);
  assert.match(partnerSeo, /no SLA/i);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  const pageOrder = {
    price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, offsiteAdRate: 0, shippingCost: 6,
    materialCost: 4, otherCost: 0,
  };
  const defaults = compareProductionPartner(pageOrder);
  const cheap = compareProductionPartner({ ...pageOrder, partnerUnitCost: 10 });
  const reject = compareProductionPartner({ ...pageOrder, partnerRejectRatePercent: 10 });
  const fits = compareProductionPartner({ ...pageOrder, monthlyDemand: 15 });
  assert.ok(partnerSeo.includes(money(defaults.youMake.profit)), `missing handmade ${money(defaults.youMake.profit)}`);
  assert.ok(partnerSeo.includes(money(defaults.partner.profit)), `missing partner ${money(defaults.partner.profit)}`);
  assert.ok(partnerSeo.includes(signed(defaults.perUnitDelta)), `missing per-unit ${signed(defaults.perUnitDelta)}`);
  assert.ok(partnerSeo.includes(money(defaults.youMake.monthly)), `missing handmade month ${money(defaults.youMake.monthly)}`);
  assert.ok(partnerSeo.includes(money(defaults.partner.monthly)), `missing partner month ${money(defaults.partner.monthly)}`);
  assert.ok(partnerSeo.includes(money(defaults.hybrid.monthly)), `missing hybrid month ${money(defaults.hybrid.monthly)}`);
  assert.ok(partnerSeo.includes(money(defaults.breakEvenPartnerUnit)), `missing break-even ${money(defaults.breakEvenPartnerUnit)}`);
  assert.ok(partnerSeo.includes(money(defaults.matchYouMakePrice)), `missing reprice ${money(defaults.matchYouMakePrice)}`);
  assert.ok(partnerSeo.includes(money(cheap.partner.profit)), `missing $10 profit ${money(cheap.partner.profit)}`);
  assert.ok(partnerSeo.includes(signed(cheap.perUnitDelta)), `missing $10 extra ${signed(cheap.perUnitDelta)}`);
  assert.ok(partnerSeo.includes(money(cheap.partner.monthly)), `missing $10 month ${money(cheap.partner.monthly)}`);
  assert.ok(partnerSeo.includes(money(reject.effectivePartnerCost)), `missing reject cost ${money(reject.effectivePartnerCost)}`);
  assert.ok(partnerSeo.includes(money(reject.partner.profit)), `missing reject profit ${money(reject.partner.profit)}`);
  assert.ok(partnerSeo.includes(money(reject.breakEvenPartnerUnit)), `missing reject break-even ${money(reject.breakEvenPartnerUnit)}`);
  assert.ok(partnerSeo.includes(money(fits.youMake.monthly)), `missing fit handmade ${money(fits.youMake.monthly)}`);
  assert.ok(partnerSeo.includes(money(fits.partner.monthly)), `missing fit partner ${money(fits.partner.monthly)}`);
});

test('the Star Seller row template has one cell per column', () => {
  const tableMarkup = (markup.split('id="starTable"')[1] || '').split('id="saleTable"')[0];
  const headers = [...tableMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.equal(headers.length, 6, `expected 6 Star Seller columns, found ${headers.join(' | ')}`);
  assert.match(scriptSource, /compareStarSeller/);
  assert.match(scriptSource, /starSellerNote/);
  assert.match(scriptSource, /star_seller_compared/);
  assert.match(markup, /id="starSellerShippingCost"/);
  assert.match(markup, /id="starSellerMessageMinutes"/);
  assert.match(markup, /id="starSellerHourlyWage"/);
  assert.match(markup, /id="unsignedSellThroughPct"/);
  assert.match(markup, /id="starSellerSellThroughPct"/);
  assert.match(markup, /id="starSellerListings"/);
  assert.match(markup, /id="star-seller"/);
});

test('the Star Seller SEO page uses the same worked examples the calculator defaults produce', () => {
  assert.match(starSeo, /Is Etsy Star Seller worth it/i);
  assert.match(starSeo, /href="\.\/#star-seller"/);
  assert.match(starSeo, /No warranty/);
  assert.match(starSeo, /no SLA/i);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  const pageOrder = {
    price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, offsiteAdRate: 0, shippingCost: 6,
    materialCost: 4, otherCost: 0,
  };
  const defaults = compareStarSeller(pageOrder);
  const lift = compareStarSeller({ ...pageOrder, starSellerSellThroughPct: 60 });
  const cheap = compareStarSeller({ ...pageOrder, starSellerShippingCost: 7 });
  const already = compareStarSeller({
    ...pageOrder,
    unsignedSellThroughPct: 70,
    starSellerSellThroughPct: 75,
  });
  const low = compareStarSeller({
    ...pageOrder,
    unsignedSellThroughPct: 20,
    starSellerSellThroughPct: 35,
  });
  assert.ok(starSeo.includes(money(defaults.unsigned.profit)), `missing unsigned packed ${money(defaults.unsigned.profit)}`);
  assert.ok(starSeo.includes(money(defaults.starSeller.profit)), `missing star packed ${money(defaults.starSeller.profit)}`);
  assert.ok(starSeo.includes(money(defaults.unsigned.expected)), `missing unsigned expected ${money(defaults.unsigned.expected)}`);
  assert.ok(starSeo.includes(money(defaults.starSeller.expected)), `missing star expected ${money(defaults.starSeller.expected)}`);
  assert.ok(starSeo.includes(signed(defaults.extraExpected)), `missing default extra ${signed(defaults.extraExpected)}`);
  assert.ok(starSeo.includes(money(Math.abs(defaults.extraAcrossListings))), `missing across ${money(Math.abs(defaults.extraAcrossListings))}`);
  assert.ok(starSeo.includes(`${defaults.breakEvenSellThroughPct.toFixed(1)}%`), `missing break-even ${defaults.breakEvenSellThroughPct.toFixed(1)}%`);
  assert.ok(starSeo.includes(money(defaults.starPostageCeiling)), `missing postage ceiling ${money(defaults.starPostageCeiling)}`);
  assert.ok(starSeo.includes(signed(lift.extraExpected)), `missing 60% extra ${signed(lift.extraExpected)}`);
  assert.ok(starSeo.includes(signed(lift.extraAcrossListings)), `missing 60% across ${signed(lift.extraAcrossListings)}`);
  assert.ok(starSeo.includes(money(cheap.starSeller.profit)), `missing $7 packed ${money(cheap.starSeller.profit)}`);
  assert.ok(starSeo.includes(signed(cheap.extraExpected)), `missing $7 extra ${signed(cheap.extraExpected)}`);
  assert.ok(starSeo.includes(money(already.unsigned.expected)), `missing 70% unsigned ${money(already.unsigned.expected)}`);
  assert.ok(starSeo.includes(money(already.starSeller.expected)), `missing 75% star ${money(already.starSeller.expected)}`);
  assert.ok(starSeo.includes(signed(already.extraExpected)), `missing 70-75 extra ${signed(already.extraExpected)}`);
  assert.ok(starSeo.includes(money(low.unsigned.expected)), `missing 20% unsigned ${money(low.unsigned.expected)}`);
  assert.ok(starSeo.includes(money(low.starSeller.expected)), `missing 35% star ${money(low.starSeller.expected)}`);
  assert.ok(starSeo.includes(signed(low.extraExpected)), `missing 20-35 extra ${signed(low.extraExpected)}`);
});

test('the shop-sale row template has one cell per column', () => {
  const tableMarkup = (markup.split('id="saleTable"')[1] || '').split('id="freeShipTable"')[0];
  const headers = [...tableMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.equal(headers.length, 6, `expected 6 shop-sale columns, found ${headers.join(' | ')}`);
  assert.match(scriptSource, /compareShopSale/);
  assert.match(scriptSource, /shopSaleNote/);
  assert.match(scriptSource, /shop_sale_compared/);
  assert.match(markup, /id="salePercent"/);
  assert.match(markup, /id="saleDollar"/);
  assert.match(markup, /id="listedSellThroughPct"/);
  assert.match(markup, /id="saleSellThroughPct"/);
  assert.match(markup, /id="saleListings"/);
  assert.match(markup, /id="shop-sale"/);
});

test('the shop-sale SEO page uses the same worked examples the calculator defaults produce', () => {
  assert.match(saleSeo, /Should I put my Etsy shop on sale/i);
  assert.match(saleSeo, /href="\.\/#shop-sale"/);
  assert.match(saleSeo, /No warranty/);
  assert.match(saleSeo, /no SLA/i);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  const pageOrder = {
    price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, offsiteAdRate: 0, shippingCost: 6,
    materialCost: 4, otherCost: 0,
  };
  const defaults = compareShopSale(pageOrder);
  const tenPoint = compareShopSale({ ...pageOrder, saleSellThroughPct: 50 });
  const lift = compareShopSale({ ...pageOrder, saleSellThroughPct: 70 });
  const ads = compareShopSale({ ...pageOrder, offsiteAdRate: 15 });
  const shallow = compareShopSale({ ...pageOrder, salePercent: 10 });
  assert.ok(saleSeo.includes(money(defaults.asListed.profit)), `missing listed packed ${money(defaults.asListed.profit)}`);
  assert.ok(saleSeo.includes(money(defaults.percent.profit)), `missing 20% packed ${money(defaults.percent.profit)}`);
  assert.ok(saleSeo.includes(money(defaults.dollar.profit)), `missing $5 packed ${money(defaults.dollar.profit)}`);
  assert.ok(saleSeo.includes(money(defaults.asListed.expected)), `missing listed expected ${money(defaults.asListed.expected)}`);
  assert.ok(saleSeo.includes(money(defaults.percent.expected)), `missing 20% expected ${money(defaults.percent.expected)}`);
  assert.ok(saleSeo.includes(money(defaults.dollar.expected)), `missing $5 expected ${money(defaults.dollar.expected)}`);
  assert.ok(saleSeo.includes(signed(defaults.percentExtraExpected)), `missing 20% extra ${signed(defaults.percentExtraExpected)}`);
  assert.ok(saleSeo.includes(signed(defaults.dollarExtraExpected)), `missing $5 extra ${signed(defaults.dollarExtraExpected)}`);
  assert.ok(saleSeo.includes(money(Math.abs(defaults.dollarExtraAcrossListings))), `missing $5 across ${money(Math.abs(defaults.dollarExtraAcrossListings))}`);
  assert.ok(saleSeo.includes(`${defaults.breakEvenPercentSellThroughPct.toFixed(1)}%`), `missing 20% break-even ${defaults.breakEvenPercentSellThroughPct.toFixed(1)}%`);
  assert.ok(saleSeo.includes(`${defaults.breakEvenDollarSellThroughPct.toFixed(1)}%`), `missing $5 break-even ${defaults.breakEvenDollarSellThroughPct.toFixed(1)}%`);
  assert.ok(saleSeo.includes(money(defaults.dollarCeiling)), `missing dollar ceiling ${money(defaults.dollarCeiling)}`);
  assert.ok(saleSeo.includes(signed(tenPoint.percentExtraExpected)), `missing 50% 20-extra ${signed(tenPoint.percentExtraExpected)}`);
  assert.ok(saleSeo.includes(signed(tenPoint.dollarExtraExpected)), `missing 50% $5-extra ${signed(tenPoint.dollarExtraExpected)}`);
  assert.ok(saleSeo.includes(money(lift.dollar.expected)), `missing 70% $5 ${money(lift.dollar.expected)}`);
  assert.ok(saleSeo.includes(signed(lift.dollarExtraExpected)), `missing 70% extra ${signed(lift.dollarExtraExpected)}`);
  assert.ok(saleSeo.includes(money(ads.asListed.expected)), `missing ads listed ${money(ads.asListed.expected)}`);
  assert.ok(saleSeo.includes(money(ads.percent.expected)), `missing ads 20% ${money(ads.percent.expected)}`);
  assert.ok(saleSeo.includes(signed(ads.percentExtraExpected)), `missing ads 20-extra ${signed(ads.percentExtraExpected)}`);
  assert.ok(saleSeo.includes(signed(ads.dollarExtraExpected)), `missing ads $5-extra ${signed(ads.dollarExtraExpected)}`);
  assert.ok(saleSeo.includes(money(shallow.percent.profit)), `missing 10% packed ${money(shallow.percent.profit)}`);
  assert.ok(saleSeo.includes(money(shallow.percent.expected)), `missing 10% expected ${money(shallow.percent.expected)}`);
  assert.ok(saleSeo.includes(signed(shallow.percentExtraExpected)), `missing 10% extra ${signed(shallow.percentExtraExpected)}`);
});

test('the free-shipping row template has one cell per column', () => {
  const tableMarkup = (markup.split('id="freeShipTable"')[1] || '').split('id="labelsTable"')[0];
  const headers = [...tableMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.equal(headers.length, 5, `expected 5 free-shipping columns, found ${headers.join(' | ')}`);
  assert.match(scriptSource, /compareFreeShipping/);
  assert.match(scriptSource, /freeShippingNote/);
  assert.match(scriptSource, /free_shipping_compared/);
  assert.match(markup, /id="freeShipPrice"/);
  assert.match(markup, /id="monthlyOrders"/);
  assert.match(markup, /id="free-shipping"/);
});

test('the free-shipping SEO page uses the same worked examples the calculator defaults produce', () => {
  assert.match(freeShipSeo, /Should I offer free shipping on Etsy/i);
  assert.match(freeShipSeo, /href="\.\/#free-shipping"/);
  assert.match(freeShipSeo, /No warranty/);
  assert.match(freeShipSeo, /no SLA/i);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  const pageOrder = {
    price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, offsiteAdRate: 0, shippingCost: 6,
    materialCost: 4, otherCost: 0,
  };
  const defaults = compareFreeShipping(pageOrder);
  const eat = compareFreeShipping({ ...pageOrder, freeShipPrice: 30 });
  const raised = compareFreeShipping({ ...pageOrder, freeShipPrice: 40 });
  const ads = compareFreeShipping({ ...pageOrder, offsiteAdRate: 15 });
  assert.ok(freeShipSeo.includes(money(defaults.charged.profit)), `missing charged ${money(defaults.charged.profit)}`);
  assert.ok(freeShipSeo.includes(money(defaults.eatLabel.profit)), `missing eat ${money(defaults.eatLabel.profit)}`);
  assert.ok(freeShipSeo.includes(money(defaults.raised.profit)), `missing $32 ${money(defaults.raised.profit)}`);
  assert.ok(freeShipSeo.includes(signed(defaults.perOrderDelta)), `missing $32 delta ${signed(defaults.perOrderDelta)}`);
  assert.ok(freeShipSeo.includes(money(defaults.monthlyCharged)), `missing monthly ${money(defaults.monthlyCharged)}`);
  assert.ok(freeShipSeo.includes(`${defaults.extraOrdersNeeded.toFixed(1)} extra orders`), `missing lift ${defaults.extraOrdersNeeded.toFixed(1)}`);
  assert.ok(freeShipSeo.includes(money(eat.raised.profit)), `missing $30 leftover ${money(eat.raised.profit)}`);
  assert.ok(freeShipSeo.includes(`${eat.extraOrdersNeeded.toFixed(1)} extra orders`), `missing $30 lift ${eat.extraOrdersNeeded.toFixed(1)}`);
  assert.ok(freeShipSeo.includes(money(raised.raised.profit)), `missing $40 leftover ${money(raised.raised.profit)}`);
  assert.ok(freeShipSeo.includes(signed(raised.perOrderDelta)), `missing $40 delta ${signed(raised.perOrderDelta)}`);
  assert.ok(freeShipSeo.includes(money(ads.charged.profit)), `missing ads charged ${money(ads.charged.profit)}`);
  assert.ok(freeShipSeo.includes(money(ads.raised.profit)), `missing ads raised ${money(ads.raised.profit)}`);
  assert.ok(freeShipSeo.includes(signed(ads.perOrderDelta)), `missing ads delta ${signed(ads.perOrderDelta)}`);
});

test('the Etsy-labels row template has one cell per column', () => {
  const tableMarkup = markup.split('id="labelsTable"')[1] || '';
  const headers = [...tableMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.equal(headers.length, 6, `expected 6 label columns, found ${headers.join(' | ')}`);
  assert.match(scriptSource, /compareEtsyLabels/);
  assert.match(scriptSource, /etsyLabelsNote/);
  assert.match(scriptSource, /etsy_labels_compared/);
  assert.match(markup, /id="etsyLabelCost"/);
  assert.match(markup, /id="thirdPartyLabelCost"/);
  assert.match(markup, /id="etsy-labels"/);
});

test('the Etsy-labels SEO page uses the same worked examples the calculator defaults produce', () => {
  assert.match(labelsSeo, /Should I buy Etsy shipping labels or use Pirate Ship/i);
  assert.match(labelsSeo, /href="\.\/#etsy-labels"/);
  assert.match(labelsSeo, /No warranty/);
  assert.match(labelsSeo, /no SLA/i);
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  const pageOrder = {
    price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, offsiteAdRate: 0, shippingCost: 6,
    materialCost: 4, otherCost: 0,
  };
  const defaults = compareEtsyLabels(pageOrder);
  const zeroTime = compareEtsyLabels({ ...pageOrder, labelUploadMinutes: 0 });
  const ads = compareEtsyLabels({ ...pageOrder, offsiteAdRate: 15 });
  assert.ok(labelsSeo.includes(money(defaults.etsy.expectedProfit)), `missing Etsy ${money(defaults.etsy.expectedProfit)}`);
  assert.ok(labelsSeo.includes(money(defaults.third.expectedProfit)), `missing third ${money(defaults.third.expectedProfit)}`);
  assert.ok(labelsSeo.includes(money(defaults.postageOnly.expectedProfit)), `missing postage ${money(defaults.postageOnly.expectedProfit)}`);
  assert.ok(labelsSeo.includes(signed(defaults.extraKeptOnThird)), `missing extra ${signed(defaults.extraKeptOnThird)}`);
  assert.ok(labelsSeo.includes(money(Math.abs(defaults.monthlyExtraOnThird))), `missing monthly ${money(Math.abs(defaults.monthlyExtraOnThird))}`);
  assert.ok(labelsSeo.includes(money(defaults.breakEvenThirdPartyLabelCost)), `missing ceiling ${money(defaults.breakEvenThirdPartyLabelCost)}`);
  assert.ok(labelsSeo.includes(money(zeroTime.third.expectedProfit)), `missing zero-time ${money(zeroTime.third.expectedProfit)}`);
  assert.ok(labelsSeo.includes(money(ads.etsy.expectedProfit)), `missing ads Etsy ${money(ads.etsy.expectedProfit)}`);
  assert.ok(labelsSeo.includes(money(ads.third.expectedProfit)), `missing ads third ${money(ads.third.expectedProfit)}`);
});

test('Copy order summary is wired to the calculated result', () => {
  assert.match(html, /id="copySummary"/);
  assert.match(scriptSource, /formatOrderSummary/);
  assert.match(scriptSource, /summary_copied/);
});

test('the incumbent-comparison page links back, names Etsy\'s own tool honestly, and gives no unverifiable Etsy dollar figures', () => {
  assert.match(html, /vs-etsys-listing-form-calculator\.html/);
  assert.match(vsEtsySeo, /<a href="\.\/">/);
  // Names Etsy's own tool and links to Etsy's own domain so a reader can
  // check the source directly -- this page must never claim a dollar or
  // percentage figure for Etsy's own calculator that only Etsy's live
  // schedule could confirm.
  assert.match(vsEtsySeo, /etsy\.com\/seller-handbook/);
  // This page must never claim a dollar or percentage figure as something
  // Etsy's own calculator charges or shows -- only structural facts about
  // where it lives and what it estimates. The 12%/15% mentioned on the page
  // describe this calculator's own Offsite Ads comparison (already on
  // index.html), not a number attributed to Etsy's tool, so those stay
  // narrowly scoped rather than banned outright.
  assert.doesNotMatch(vsEtsySeo, /Etsy('s)? (charges|fee is|costs?) \$/i);
  assert.doesNotMatch(vsEtsySeo, /Etsy('s)? (own )?(Profit )?Calculator[^.]*\d+(\.\d+)?%/i);
  assert.match(vsEtsySeo, /not affiliated with, endorsed by, or sponsored by Etsy/i);
  assert.match(vsEtsySeo, /trademarks of Etsy, Inc\./i);
});

test('the incumbent-comparison page carries the standard disclaimer and sponsor link', () => {
  assert.match(vsEtsySeo, /No warranty/);
  assert.match(vsEtsySeo, /Best-effort hosting, no SLA/);
  assert.match(vsEtsySeo, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the result panel is announced to screen readers when it updates', () => {
  // The result section re-renders the hero profit number, the dl
  // breakdown, and the reprice-for-a-goal scenario table in place on every
  // keystroke, with no page reload. Before this fix the only aria-live
  // element on the page was #status (a copy/share message render() never
  // writes the result figures into), so a screen-reader user changing an
  // input got no announcement that the readout had changed.
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    'the result section is not a live region, so updates are never announced',
  );
});

// Regression: sitemap.xml was missing vs-etsys-listing-form-calculator.html,
// a real page linked from index.html, so a crawler following robots.txt ->
// sitemap.xml never discovered it. Same defect class fixed for
// public-record-watch in #3289.
test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

// where-to-sell-calculator already hands an Etsy comparison into this page;
// without a crawlable link back, a visitor who landed on Etsy first has no
// path to the multi-channel ranking that owns the handoff. Amazon, Reverb,
// and Shopify already close this loop; Etsy was the remaining gap with eBay.
test('index links to the where-to-sell calculator', () => {
  assert.match(html, /href="\.\.\/where-to-sell-calculator\/"/);
});
