// Loads every published tool in a real browser and checks that it still works.
//
// Why this exists
// ---------------
// `check.mjs` proves the files are right and `journey.mjs` drives the hub and a
// few tools deeply. Neither answers the question that matters most on a site
// assembled from ~60 independently-written ventures: **does each one still
// compute?**
//
// That failure is silent and this repo has shipped it before — a page whose
// markup swallowed its own app script rendered perfectly and did nothing. Under
// one origin it is worse than it was: a visitor arriving from a search result
// meets one tool, and if that tool is dead they have met the whole portfolio.
//
// So this is deliberately shallow and total, where `journey.mjs` is deep and
// narrow. For each tool: load it, watch for page and console errors, change its
// inputs, and require the page to respond. A tool that only recalculates on a
// button press gets its button pressed — several here work that way, and
// treating that as a failure would train everyone to ignore the output.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   python3 -m http.server 8793 --directory platform/pages/dist &
//   node platform/pages/sweep.mjs
//
//   # or against production once the owner flip lands:
//   BASE_URL=https://duncan-haywood.github.io/monorepo-projects node platform/pages/sweep.mjs
//
// Not part of CI: it needs Playwright, which is not a dependency of this repo.
// PLAYWRIGHT overrides the module path for a global install.

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

// Buttons that produce a file, the clipboard, or an empty form rather than a
// result. Clicking one proves nothing about whether the tool computes, and
// "Clear" actively destroys the evidence.
const NOT_AN_ACTION = /copy|download|print|clear|export|reset|share/i;

// Several tools open on an empty form and offer their own worked example. That
// button is the shortest path this product has to first value, so a sweep that
// skipped it would leave the most important click on each of those tools
// untested.
const LOADS_AN_EXAMPLE = /example|sample|fixture|demo|try it/i;

const browser = await chromium.launch(LAUNCH);
// A phone viewport, because that is where this audience is: a van, a job site,
// a warehouse aisle. A tool that only works at desktop width fails here.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(`${BASE}/`, { waitUntil: 'load' });
const slugs = await page.$$eval('[data-tool]', (links) => [
  ...new Set(links.map((link) => link.dataset.tool)),
]);

if (slugs.length === 0) {
  console.error('No tools found on the hub — is the site built and served at BASE_URL?');
  process.exit(1);
}
console.log(`Sweeping ${slugs.length} tools at ${BASE}\n`);

/** Change up to `limit` inputs; returns how many actually took a new value. */
async function perturb(limit = 4) {
  let touched = 0;
  for (const el of (await page.$$('input[type=number], select')).slice(0, limit)) {
    try {
      if ((await el.evaluate((node) => node.tagName)) === 'SELECT') {
        const options = await el.$$eval('option', (os) => os.map((o) => o.value));
        const current = await el.inputValue();
        const next = options.find((o) => o !== current);
        if (next === undefined) continue;
        await el.selectOption(next);
      } else {
        const current = Number(await el.inputValue());
        if (Number.isNaN(current)) continue;
        // A value unlike the default, and unlikely to be a no-op: doubling a
        // zero leaves a zero, and a tool would look dead for the wrong reason.
        await el.fill(String(current ? current * 2 + 7 : 137));
        await el.dispatchEvent('input');
        await el.dispatchEvent('change');
      }
      touched += 1;
    } catch {
      // Not interactable (hidden behind a disclosure, readonly). Try the next.
    }
  }
  return touched;
}

async function pressMatching(pattern) {
  for (const button of await page.$$('button')) {
    const label = (await button.textContent())?.trim() ?? '';
    if (!pattern.test(label)) continue;
    try {
      await button.click({ timeout: 2000 });
      return label;
    } catch {
      // Disabled or covered; keep looking.
    }
  }
  return '';
}

async function pressPrimaryAction() {
  for (const button of await page.$$('button')) {
    const label = (await button.textContent())?.trim() ?? '';
    if (!label || NOT_AN_ACTION.test(label)) continue;
    try {
      await button.click({ timeout: 2000 });
      return label;
    } catch {
      // Disabled or covered; the next one may be the real action.
    }
  }
  return '';
}

const results = [];
for (const slug of slugs) {
  const errors = [];
  const onPageError = (error) => errors.push(`pageerror: ${error.message}`);
  const onConsole = (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 160)}`);
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  let verdict = 'ok';
  let detail = '';

  try {
    await page.goto(`${BASE}/${slug}/`, { waitUntil: 'load' });
    await page.waitForTimeout(150);

    const before = await page.evaluate(() => document.body.innerText);
    const touched = await perturb();
    await page.waitForTimeout(300);
    let after = await page.evaluate(() => document.body.innerText);

    // Live recalculation is the common shape here, but not the only one.
    const presses = [];
    if (before === after) {
      // A tool whose inputs are pasted text rather than numbers has nothing for
      // `perturb` to change; its own example button is how a visitor starts too.
      if (touched === 0) {
        const loaded = await pressMatching(LOADS_AN_EXAMPLE);
        if (loaded) {
          presses.push(loaded);
          await page.waitForTimeout(300);
        }
      }
      const pressed = await pressPrimaryAction();
      if (pressed) presses.push(pressed);
      if (presses.length) {
        await page.waitForTimeout(400);
        after = await page.evaluate(() => document.body.innerText);
        detail = `via ${presses.map((p) => `"${p}"`).join(' → ')}`;
      }
    }

    const interactive = await page.$$eval(
      'input, select, textarea, button',
      (nodes) => nodes.length,
    );

    // One tool opens with its example already loaded and its record already
    // computed, so the text after an interaction is legitimately the text
    // before it. "Output never changed" and "output was right on arrival" look
    // identical to a diff and are opposites to a visitor, so ask the page which
    // one it is rather than calling the second a failure.
    const showsResult = await page.$$eval(
      'output, [role="status"], [class*="result"], [id*="result"]',
      (nodes) => nodes.some((node) => (node.textContent ?? '').trim().length > 20),
    );

    if (errors.length) {
      verdict = 'ERRORS';
      detail = errors.slice(0, 2).join(' | ');
    } else if (before !== after) {
      // Responded — nothing more to say than how.
    } else if (showsResult) {
      detail = 'computed on arrival; unchanged because the answer was already right';
    } else if (interactive === 0) {
      // A page that is only links (the nested academy hub) is doing its job by
      // rendering. Reported, not failed: calling it broken would train everyone
      // to ignore this output.
      verdict = 'links-only';
      detail = 'no form controls; renders as a landing page';
    } else {
      verdict = touched === 0 && presses.length === 0 ? 'NO-CONTROLS' : 'NO-RESPONSE';
      detail = touched === 0 && presses.length === 0
        ? `${interactive} control(s) on the page, none of them usable`
        : `changed ${touched} control(s), pressed ${presses.length || 'no'} button(s); output identical`;
    }
  } catch (error) {
    verdict = 'LOAD-FAILED';
    detail = error.message.slice(0, 160);
  }

  page.off('pageerror', onPageError);
  page.off('console', onConsole);

  results.push({ slug, verdict, detail });
  const flag = verdict === 'ok' || verdict === 'links-only' ? '   ' : '>> ';
  console.log(`${flag}${verdict.padEnd(12)} ${slug}${detail ? `  — ${detail}` : ''}`);
}

await browser.close();

const broken = results.filter((r) => r.verdict !== 'ok' && r.verdict !== 'links-only');
console.log(`\n${results.length - broken.length}/${results.length} tools answered with no errors`);
if (broken.length) {
  console.log('\nNeeds a look — a tool that does not respond is a dead product to whoever lands on it:');
  for (const { slug, verdict, detail } of broken) console.log(`  ${slug}: ${verdict} — ${detail}`);
}
process.exit(broken.length ? 1 : 0);
