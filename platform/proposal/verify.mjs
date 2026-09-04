#!/usr/bin/env node
// Drive the customer proposal in a real browser and check what a customer
// would actually receive.
//
// Why a browser
// -------------
// Every check that already exists here reads the page as *text*. That is why
// the same defect keeps shipping: `readInputs` is present as a substring of
// `readInput`, `result.doorClass` resolves to `undefined` instead of throwing,
// and `#proposalDoc` outranks `body.printing-proposal .pr-shell` only once a
// cascade exists to resolve. None of those are visible without running the
// page. All three are invisible to a green test suite and obvious in one click.
//
// So this clicks the button. It fills the two fields the proposal refuses to
// print without, presses "Print proposal", and then asserts against the
// rendered document and its computed styles:
//
//   1. Nothing on the customer's sheet reads `undefined`, `NaN`, or `null`.
//   2. The scope is not empty — `scopeLines` drops a line whose figure is
//      missing, so an empty scope is how a wholly mis-named template looks.
//   3. The price on the sheet is the price on the screen.
//   4. No cost, wage, burden, overhead, margin, or break-even figure appears.
//   5. In print, the calculator is hidden and the proposal is visible.
//   6. The status line is legible against what is actually behind it.
//
// Run it against the built site, not the venture directory: `build.mjs`
// injects a nav, an aside and a saved-rates panel as siblings of `<main>`, and
// the rates panel carries the contractor's wage. Printing from
// `ventures/<slug>/index.html` cannot see any of that.
//
// Usage
//   node platform/pages/build.mjs
//   node platform/proposal/verify.mjs                 every adopted calculator
//   node platform/proposal/verify.mjs <slug>...       just these

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DIST = path.join(ROOT, 'platform/pages/dist');
const trades = JSON.parse(fs.readFileSync(path.join(HERE, 'trades.json'), 'utf8'));

/** Playwright is a global install here, not a repo dependency. */
function loadChromium() {
  const require = createRequire(import.meta.url);
  for (const specifier of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
    try { return require(specifier).chromium; } catch { /* try the next */ }
  }
  throw new Error('playwright not found; install it or run with --skip');
}

/**
 * Words that must never reach a customer's copy.
 *
 * The print stylesheet hides `main` outright, so this is a second, independent
 * check on the same property: if a future edit renders a cost into the
 * proposal document itself, no stylesheet will save it.
 */
const FORBIDDEN_ON_CUSTOMER_SHEET = [
  /\bwage\b/i, /\bburden\b/i, /\bmargin\b/i,
  /\bbreak[- ]?even\b/i, /\bwalk[- ]?away\b/i, /\bprofit\b/i, /\bcrew hours?\b/i,
  /\byour cost\b/i, /\btotal cost\b/i, /\bloaded labou?r\b/i,
  // "Overhead" is the cost line here and a perfectly ordinary noun in half
  // these trades — an overhead mast, an overhead door, the overhead service
  // drop. Match the cost sense only.
  /\boverhead\b(?!\s+(mast|service|door|line|feed|conductor|wire|drop|garage|rail|track|lighting|cabinet))/i,
];

/**
 * A price anywhere but the price table.
 *
 * Preset labels are written for the contractor and several of them carry the
 * shorthand rate the contractor thinks in — `metal-roof` shipped a job title
 * reading "40×30 ranch, 4/12, 5V overlay (the $950/square special)". A homeowner
 * reading that gets the contractor's internal per-square number and a nickname
 * for their own house. The price belongs in the price table and nowhere else.
 */
const MONEY = /\$\s?[\d,]+(?:\.\d+)?/;

/**
 * Contractor shorthand that carries no dollar sign and so slips past MONEY.
 *
 * The preset labels in this portfolio are deliberately written in the voice of
 * the person bidding — "the cheap special", "the brochure special", "the
 * cheap-special assumption" — because they name the lowball number the
 * calculator exists to argue with. That is the right label in the dropdown and
 * the wrong one on a homeowner's quote, where it reads as the contractor
 * calling their job cheap.
 */
const CONTRACTOR_SHORTHAND = /\bcheap\b|\bspecial\b|\bbrochure\b|\blowball\b|\bthe assumption\b/i;

/**
 * A raw float where a figure should be.
 *
 * `{billYards}` printed "48.888888888888886 yd² ordered including waste" on a
 * customer's quote. Three or more decimals is never a measurement anyone took;
 * it is a derived number rendered without `{field~2}`, and it tells the
 * customer nobody read the sheet before it was handed over.
 */
const UNROUNDED = /\d\.\d{3,}/;

const NOT_A_FIGURE = /\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]/;

/** WCAG relative luminance, for the status-line contrast check. */
function luminance(rgb) {
  const channel = (value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrastRatio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function parseRgb(value) {
  const parts = /rgba?\(([^)]+)\)/.exec(value);
  if (!parts) return null;
  const [r, g, b] = parts[1].split(',').map((n) => Number.parseFloat(n));
  return [r, g, b];
}

async function verifyOne(browser, slug, { origin }) {
  const failures = [];
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error.message)));

  try {
    await page.goto(`${origin}/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('#printProposal', { timeout: 10000 });

    // The price the contractor sees, before anything is printed. Read from the
    // result panel rather than recomputed, so this compares two independent
    // paths to the same number.
    //
    // The headline figure is the quoted price on nearly every calculator here,
    // but not on all of them: `lawn-care` leads with a per-visit price while
    // the thing being sold — and the thing its own proposed-price field asks
    // for — is the monthly contract. Comparing the sheet against the headline
    // there would fail a correct proposal, so a trade may name the element
    // that actually carries the price it quotes.
    const priceSelector = trades[slug]?.screenPriceSelector
      ?? '#price, #bidPrice, #quotedPrice, #visitPrice, #monthlyPrice';
    const onScreenPrice = await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      return node ? node.textContent.trim() : null;
    }, priceSelector);

    // The proposal refuses to print without these two, by design.
    await page.fill('#companyName', 'Verification Trades LLC');
    await page.fill('#clientName', 'A. Customer');

    // Printing is stubbed: the assertions are about the rendered document and
    // the print cascade, and a real print dialogue would hang a headless run.
    await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
    await page.click('#printProposal');
    await page.waitForFunction(
      () => { const d = document.getElementById('proposalDoc'); return d && !d.hidden; },
      { timeout: 5000 },
    );

    const status = await page.textContent('#proposalStatus');
    if (!/ready/i.test(status ?? '')) {
      failures.push(`the print button did not produce a proposal: status was "${status}"`);
    }

    const doc = await page.evaluate(() => {
      const shell = document.getElementById('proposalDoc');
      const scope = shell.querySelector('.pr-block ul');
      // The print hint is a screen-only note to the *contractor* ("your costs
      // and margin are not on this") and is display:none in print. Reading it
      // as part of the customer's sheet would flag the reassurance itself as
      // the leak it exists to deny.
      const customerCopy = shell.cloneNode(true);
      customerCopy.querySelectorAll('.pr-print-hint').forEach((node) => node.remove());
      const priceRow = [...shell.querySelectorAll('.pr-price .pr-total td')].pop();
      return {
        text: customerCopy.innerText,
        scopeItems: scope ? [...scope.querySelectorAll('li')].map((li) => li.textContent.trim()) : [],
        jobTitle: shell.querySelector('.pr-block p')?.textContent?.trim() ?? '',
        totalPrice: priceRow ? priceRow.textContent.trim() : null,
      };
    });

    // 1. Nothing reads as a hole.
    if (NOT_A_FIGURE.test(doc.text)) {
      const offending = doc.text.split('\n').filter((line) => NOT_A_FIGURE.test(line));
      failures.push(`the customer's sheet reads as a hole: ${offending.join(' | ')}`);
    }

    // 2. A scope that describes the job, not just a closing platitude.
    //
    //    "Not empty" is too weak a bar: a trade entry whose every figure-bearing
    //    template misses still leaves the one line that has no placeholders in
    //    it ("site left clean"), and the scope looks populated while saying
    //    nothing about what was priced. So require that at least one line
    //    carrying a resolved figure survived.
    if (doc.scopeItems.length === 0) {
      failures.push('the drafted scope is empty — every template resolved to nothing, '
        + 'which means the field names in trades.json are not the ones the result carries');
    } else if (!doc.scopeItems.some((line) => /\d/.test(line))) {
      failures.push('no line of the drafted scope carries a figure — the templates that describe '
        + `the job all dropped, leaving only: ${doc.scopeItems.join(' | ')}`);
    }

    // 3. The customer is quoted the price on the screen.
    //
    //    Compared as numbers: several calculators show a rounded price in the
    //    result panel and the proposal prints cents, which is a display choice
    //    rather than a different price. A dollar apart is the same price; ten
    //    dollars apart is not.
    //    Read from the total row, not the first `$` in the document: a scope
    //    line carrying a figure would otherwise be compared instead of the price.
    const printedPrice = doc.totalPrice;
    const asNumber = (value) => Number.parseFloat(String(value).replace(/[^0-9.]/g, ''));
    if (!printedPrice) {
      failures.push('no total price row on the customer sheet');
    } else if (onScreenPrice && Number.isFinite(asNumber(onScreenPrice))) {
      const drift = Math.abs(asNumber(printedPrice) - asNumber(onScreenPrice));
      if (drift >= 1) {
        failures.push(`the sheet quotes ${printedPrice} but the calculator shows ${onScreenPrice}`);
      }
    }

    // 3b. No money outside the price table. This is where a contractor's own
    //     shorthand rate reaches the customer, via a preset label.
    for (const [where, value] of [['job title', doc.jobTitle], ...doc.scopeItems.map((s) => ['scope', s])]) {
      if (MONEY.test(value)) {
        failures.push(`the ${where} quotes money outside the price table — "${value}". `
          + 'That is a contractor-facing preset label reaching the customer.');
      }
      if (CONTRACTOR_SHORTHAND.test(value)) {
        failures.push(`the ${where} carries contractor shorthand — "${value}". `
          + 'Map that preset to customer wording in trades.json.');
      }
      if (UNROUNDED.test(value)) {
        failures.push(`the ${where} prints an unrounded figure — "${value}". `
          + 'Use {field~2} in trades.json so the customer sees a number, not a float.');
      }
    }

    // 4. No cost, wage, or margin figure.
    for (const pattern of FORBIDDEN_ON_CUSTOMER_SHEET) {
      if (pattern.test(doc.text)) failures.push(`the customer's sheet carries ${pattern} — it must not`);
    }

    // 4b. Every option, not just the one the page loads with.
    //
    //     Checking the defaults proves nothing about the contractor who picks
    //     the second entry in a dropdown. Most preset labels in this portfolio
    //     are written in the bidder's voice on purpose — they name the lowball
    //     number the calculator argues with — so the ones that reach a customer
    //     have to be mapped, and which ones reach a customer depends on what is
    //     selected. Walk each select's options one at a time, leaving the others
    //     at their defaults: linear in the number of options, and enough to
    //     catch a label that only appears on the third choice.
    const sweep = await page.evaluate(() => {
      const rendered = [];
      const button = document.getElementById('printProposal');
      const shell = document.getElementById('proposalDoc');
      const read = () => {
        const scope = shell.querySelector('.pr-block ul');
        return {
          jobTitle: shell.querySelector('.pr-block p')?.textContent?.trim() ?? '',
          scopeItems: scope ? [...scope.querySelectorAll('li')].map((li) => li.textContent.trim()) : [],
        };
      };
      for (const select of document.querySelectorAll('main select')) {
        const original = select.value;
        for (const option of [...select.options]) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          // The scope is only redrafted while the contractor has not edited it;
          // clearing the flag is what makes each option's draft observable.
          const scopeField = document.getElementById('proposalScope');
          delete scopeField.dataset.edited;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          button.click();
          rendered.push({ select: select.id, option: option.textContent.trim(), ...read() });
        }
        select.value = original;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return rendered;
    });

    const sweepSeen = new Set();
    for (const state of sweep) {
      for (const [where, value] of [['job title', state.jobTitle], ...state.scopeItems.map((s) => ['scope', s])]) {
        const complaint = MONEY.test(value) ? 'quotes money outside the price table'
          : CONTRACTOR_SHORTHAND.test(value) ? 'carries contractor shorthand'
            : NOT_A_FIGURE.test(value) ? 'reads as a hole'
              : UNROUNDED.test(value) ? 'prints an unrounded figure' : null;
        if (!complaint) continue;
        // One report per offending line, however many options reproduce it.
        const key = `${complaint}:${value}`;
        if (sweepSeen.has(key)) continue;
        sweepSeen.add(key);
        failures.push(`with #${state.select} set to "${state.option}", the ${where} ${complaint} — "${value}"`);
      }
    }

    // 5. The print cascade: calculator hidden, proposal visible, and — the one
    //    that shipped broken before — the saved-rates panel gone too.
    //
    //    Re-render first: the sweep above restores each select to its default,
    //    and any recalculation retires the rendered document by design. Without
    //    this the cascade is checked against a proposal that is hidden because
    //    the sweep hid it, which reads as every page printing blank.
    await page.click('#printProposal');
    await page.waitForFunction(
      () => { const d = document.getElementById('proposalDoc'); return d && !d.hidden; },
      { timeout: 5000 },
    );
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => {
      // Visibility, not the element's own `display`. `.pf-rates-list` is
      // `display: flex` in print and invisible anyway, because the panel around
      // it is hidden — asking the node alone reports a leak that is not there.
      const shown = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        for (let at = node; at && at !== document.documentElement; at = at.parentElement) {
          const style = getComputedStyle(at);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
      };
      return {
        main: shown('main'),
        header: shown('header'),
        footer: shown('footer'),
        rates: shown('.pf-rates-list'),
        nav: shown('nav'),
        doc: shown('#proposalDoc'),
      };
    });
    for (const [what, visible] of Object.entries(printed)) {
      if (what === 'doc') {
        if (visible === false) failures.push('the proposal is hidden when printing — the customer gets a blank page');
      } else if (visible === true) {
        failures.push(`<${what}> still prints alongside the customer's copy`);
      }
    }
    await page.emulateMedia({ media: 'screen' });

    // 6. The status line has to be readable, because it is where "add your
    //    business name" appears when nothing printed.
    const legibility = await page.evaluate(() => {
      const node = document.getElementById('proposalStatus');
      let behind = node.parentElement;
      let background = 'rgba(0, 0, 0, 0)';
      while (behind && background === 'rgba(0, 0, 0, 0)') {
        background = getComputedStyle(behind).backgroundColor;
        behind = behind.parentElement;
      }
      return { color: getComputedStyle(node).color, background };
    });
    const fore = parseRgb(legibility.color);
    const back = parseRgb(legibility.background);
    if (fore && back) {
      const ratio = contrastRatio(fore, back);
      if (ratio < 4.5) {
        failures.push(`the status line is ${ratio.toFixed(1)}:1 against its background `
          + `(${legibility.color} on ${legibility.background}); it needs 4.5:1 to be read`);
      }
    }

    if (pageErrors.length) failures.push(`the page threw: ${pageErrors.join(' | ')}`);
  } catch (error) {
    failures.push(`${String(error.message).split('\n')[0]}${pageErrors.length ? ` (page threw: ${pageErrors[0]})` : ''}`);
  } finally {
    await page.close();
  }

  return { slug, failures };
}

/** Every built directory that carries a proposal. */
function adoptedInDist() {
  if (!fs.existsSync(DIST)) {
    throw new Error(`no built site at ${DIST} — run: node platform/pages/build.mjs`);
  }
  return fs.readdirSync(DIST)
    .filter((slug) => fs.existsSync(path.join(DIST, slug, 'proposal.mjs')))
    .sort();
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const slugs = wanted.length ? wanted : adoptedInDist();
  if (!slugs.length) {
    console.log('no adopted calculators in the built site');
    return 0;
  }

  const chromium = loadChromium();
  // A static server, because `file://` blocks module imports between files in
  // some configurations and is not how anyone reaches the real site anyway.
  const { createServer } = await import('node:http');
  const server = createServer((request, response) => {
    const url = decodeURIComponent(request.url.split('?')[0]);
    let file = path.join(DIST, url);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(DIST) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    const type = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
      '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(file)]
      ?? 'application/octet-stream';
    response.writeHead(200, { 'content-type': type });
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch();
  const results = [];
  // Modest concurrency: enough to make 60 pages quick, not enough to make the
  // machine the bottleneck and turn a real failure into a timeout.
  const queue = [...slugs];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length) {
      const slug = queue.shift();
      results.push(await verifyOne(browser, slug, { origin }));
    }
  });
  await Promise.all(workers);
  await browser.close();
  server.close();

  results.sort((a, b) => a.slug.localeCompare(b.slug));
  const broken = results.filter((r) => r.failures.length);
  for (const result of broken) {
    console.log(`\n${result.slug}`);
    for (const failure of result.failures) console.log(`    ${failure}`);
  }
  console.log(`\n${results.length - broken.length}/${results.length} calculators hand the customer a sound proposal`);
  return broken.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(await main());
}

export { contrastRatio, luminance, parseRgb, FORBIDDEN_ON_CUSTOMER_SHEET, NOT_A_FIGURE };
