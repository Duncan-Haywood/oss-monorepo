// Browser check: every handoff link lands with the values it carried.
//
// handoff.test.mjs proves the field names match each target's own field list.
// This opens each target page in Chromium and reads the inputs back, so a
// target that renames an input id or stops reading the URL fragment fails here.
//
//   (cd ventures && python3 -m http.server 8765) &
//   PLAYWRIGHT_MODULE=/path/to/node_modules node handoff-arrival.check.mjs
//
// Not a *.test.mjs file on purpose: it needs a browser and a server, which
// `node --test` runs elsewhere do not have.
import { createRequire } from 'node:module';
import { handoffUrl, HANDOFFS } from './handoff.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:8765';
const require = createRequire(`${process.env.PLAYWRIGHT_MODULE ?? process.cwd() + '/node_modules'}/`);
const { chromium } = require('playwright');

const shared = { price: 40, shippingCharged: 6, shippingCost: 5.2, itemCost: 12, packagingCost: 1.1, otherCost: 0.9 };
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
let failed = 0;
for (const entry of HANDOFFS) {
  const page = await (await browser.newContext()).newPage(); // fresh storage per target
  const url = `${base}/where-to-sell-calculator/${handoffUrl(entry.channel, shared)}`;
  await page.goto(url);
  await page.waitForTimeout(300);
  const got = await page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('input,select')].filter((el) => el.id).map((el) => [el.id, el.value])),
  );
  const bad = [...new URLSearchParams(url.split('#')[1])].filter(([k, v]) => got[k] === undefined || Number(got[k]) !== Number(v));
  if (bad.length) failed += 1;
  console.log(bad.length ? `FAIL ${entry.slug} ${JSON.stringify(bad)}` : `ok   ${entry.slug}`);
}
await browser.close();
process.exit(failed ? 1 : 0);
