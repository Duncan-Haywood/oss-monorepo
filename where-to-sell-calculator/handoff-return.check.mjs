// Browser check, the reverse direction: every channel calculator's own
// "compare on other channels" link lands here with its item and its channel on.
//
// handoff-arrival.check.mjs covers where-to-sell -> channel calculator. This
// covers channel calculator -> where-to-sell: each venture's
// to-where-to-sell.mjs builds a link, this opens it in Chromium and reads back
// the shared inputs and the channel's "Compare this channel" box.
//
//   (cd ventures && python3 -m http.server 8765) &
//   PLAYWRIGHT_MODULE=/path/to/node_modules node handoff-return.check.mjs
//
// Not a *.test.mjs file on purpose: it needs a browser and a server.
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:8765';
const require = createRequire(`${process.env.PLAYWRIGHT_MODULE ?? process.cwd() + '/node_modules'}/`);
const { chromium } = require('playwright');

// Each module reads its own calculator's field names, so offer every name in use.
const item = {
  price: 40, salePrice: 40, itemPrice: 40,
  shippingCharged: 6, buyerShipping: 6,
  shippingCost: 5.2, labelCost: 5.2, sellerShippingCost: 5.2,
  itemCost: 12, costOfGoods: 12, materialCost: 12,
  packagingCost: 1.1, otherCost: 0.9,
};

const ventures = readdirSync('..').filter((d) => existsSync(`../${d}/to-where-to-sell.mjs`)).sort();
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
let failed = 0;
for (const slug of ventures) {
  // A fresh context each time: the page saves its inputs, and a leftover from the
  // previous venture would mask a link that fails to set a field.
  const page = await (await browser.newContext()).newPage();
  const { whereToSellPayload, whereToSellUrl } = await import(`../${slug}/to-where-to-sell.mjs`);
  const payload = whereToSellPayload(item);
  const url = `${base}/${slug}/${whereToSellUrl(item)}`.replace(`/${slug}/../`, '/');
  await page.goto(url);
  await page.waitForTimeout(300);
  const got = await page.evaluate(() => ({
    inputs: Object.fromEntries([...document.querySelectorAll('input,select')].filter((el) => el.id).map((el) => [el.id, el.value])),
    enabled: Object.fromEntries([...document.querySelectorAll('input[data-enable]')].map((el) => [el.closest('details').querySelector('summary').textContent.trim(), el.checked])),
  }));
  const bad = Object.entries(payload.shared).filter(([k, v]) => Number(got.inputs[k]) !== Number(v)).map(([k]) => `input ${k}`);
  if (!Object.keys(payload.shared).length) bad.push('payload carried no item values');
  for (const channel of payload.channels.filter((c) => c.enabled)) {
    const hit = Object.entries(got.enabled).find(([label]) => label.toLowerCase().replace(/[^a-z]/g, '').includes(channel.id.replace(/[^a-z]/g, '')));
    if (!hit || !hit[1]) bad.push(`channel ${channel.id} not switched on`);
  }
  if (bad.length) failed += 1;
  console.log(bad.length ? `FAIL ${slug} ${JSON.stringify(bad)}` : `ok   ${slug}`);
}
await browser.close();
process.exit(failed ? 1 : 0);
