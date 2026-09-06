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
// **Check what is answering before you believe the result.** A server left
// running by an earlier build keeps the port, the second `http.server` exits
// with "Address already in use", and the run passes against the old tree
// without a word. It cost a false clean report on 2026-08-28. One curl settles
// it -- ask for something only the build under test has:
//
//   curl -s http://localhost:8793/<slug>/ | grep -c 'the thing you just added'
//
// Runs in CI nightly, not per-PR — see the CI note further down for why, and
// for how it gets Playwright without this repo depending on it.
// PLAYWRIGHT overrides the module path for a global install.
//
// ## Running it from a Claude-on-the-web session
//
// Which is where it usually runs, not the only place it can: the commands
// above work on any machine with Playwright, and `platform/pages/README.md`
// documents the global, `NODE_PATH` and in-repo installs for exactly that.
//
// This used to say **no CI workflow runs this sweep at all**, on the reasoning
// that it needs Playwright and Playwright is not a dependency of this repo.
// The second half is still true; the conclusion stopped being true on
// 2026-09-01, when `.github/workflows/browser-checks-ci.yml` (#2616) began
// running it nightly at 04:20 UTC, plus `workflow_dispatch`. It installs
// Playwright into `$RUNNER_TEMP`, outside the checkout, so the sweep gained CI
// coverage without the repo gaining a dependency.
//
// Nightly is not per-PR, though, and that is deliberate — a run is the whole
// site, and `platform/pages/` takes enough commits a day that gating on it
// would cost hours of metered Actions minutes. So the sweep still catches a
// break the morning after it lands rather than before, and running it by hand
// in a session is still worth doing. Those sessions ship Chromium
// at `/opt/pw-browsers` but no `playwright` module, and `npm i playwright`
// pulls a version whose pinned build number does not match what is on disk:
//
//   browserType.launch: Executable doesn't exist at
//   /opt/pw-browsers/chromium_headless_shell-1234/...
//
// That is a version mismatch, not a missing browser, and `npx playwright
// install` is refused in that environment. Point `CHROME_PATH` at the build
// that is actually there instead — the module and the binary do not have to
// agree on a number for the sweep to drive it:
//
//   npm --prefix /tmp/pw install playwright
//   node platform/pages/build.mjs --out=/tmp/site
//   python3 -m http.server 8793 --directory /tmp/site &
//   PLAYWRIGHT=/tmp/pw/node_modules/playwright/index.js \
//     CHROME_PATH="$(echo /opt/pw-browsers/chromium-*/chrome-linux/chrome)" \
//     node platform/pages/sweep.mjs
//
// Verified 2026-09-01: 175/175 tools answered with no errors — 169 from the
// catalog plus the six electronics calculators nested under
// `ai-engineering-academy`'s hub, which this sweep now follows into rather
// than stopping at (see `discoverChildTools` below).

// Playwright ships CommonJS, so a PLAYWRIGHT that names its entry *file*
// resolves the exports under `.default`, while a bare specifier on the
// resolution path gives them directly. Accept either, and say which it is when
// neither resolves.
//
// This file had the plain destructure until 2026-08-27, which meant it threw
// `Cannot read properties of undefined (reading 'launch')` for anyone following
// the `PLAYWRIGHT=/path/to/playwright/index.js` form documented above — so the
// whole-site sweep did not run at all. `journey.mjs` had already been fixed the
// same way; this file was missed, and the cost was real: `3pl-quote-normalizer`
// shipped to `main` with a module that failed to parse, which is precisely the
// defect a sweep exists to catch, and no sweep was running to catch it.
const playwright = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) {
  console.error('Could not load Playwright. Set PLAYWRIGHT to its entry point, ' +
    'e.g. PLAYWRIGHT=./node_modules/playwright/index.js');
  process.exit(2);
}

import { onlySlugs, keepSlug, describeFilter, requireNonEmpty } from './only-slugs.mjs';

const BASE = (process.env.BASE_URL || 'http://localhost:8793').replace(/\/$/, '');
// `CHROME_PATH` is the spelling `journey.mjs` and the README use; `CHROMIUM_PATH`
// was this file's own and is still honoured so an existing invocation keeps
// working. Two names for one knob is how a sweep gets run without the override
// it needed and dies on a browser download it cannot do.
const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const LAUNCH = chromePath ? { executablePath: chromePath } : {};

// Read once at module scope. `sweep` is the one check that discovers its slugs
// from the *rendered* hub rather than the built tree, so the filter is applied
// to what the catalogue reported rather than to a directory listing -- see
// only-slugs.mjs.
const only = onlySlugs();

// Buttons that produce a file, the clipboard, or an empty form rather than a
// result. Clicking one proves nothing about whether the tool computes, and
// "Clear" actively destroys the evidence.
//
// "Add another …" joins them for the same reason and one further one. It edits
// the form — it reveals or appends an input row — so pressing it can never make
// a tool answer, and because a row-adder sits with the rows it adds, it is
// often the *first* button in the document: `pressPrimaryAction` would stop
// there and record a working tool as NO-RESPONSE, having never pressed its
// action at all. That is `cash-runway-planner`, whose one-off payment rows have
// an "Add another row" above the Forecast button. Anchored, so a compute
// button that merely contains the word is still pressed.
const NOT_AN_ACTION = /copy|download|print|clear|export|reset|share|^add another\b/i;

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
const advertised = await page.$$eval('[data-tool]', (links) => [
  ...new Set(links.map((link) => link.dataset.tool)),
]);

if (advertised.length === 0) {
  console.error('No tools found on the hub — is the site built and served at BASE_URL?');
  process.exit(2);
}
const slugs = advertised.filter((slug) => keepSlug(slug, only));
if (only) console.log(describeFilter(only));
requireNonEmpty(slugs, only, 'tools on the hub');
console.log(`Sweeping ${slugs.length} tools at ${BASE}\n`);

// Plausible text for a field the visitor would have to fill before the tool
// will do anything. Keyed loosely off the field's own name so a date field gets
// a date and an email field something with an `@`: a tool that validates its
// input is doing its job, and feeding it "x" would fail it for being careful.
const SAMPLE_TEXT = [
  [/mail/i, 'someone@example.com'],
  [/url|link|site|repo/i, 'https://example.com/thing'],
  [/phone|tel/i, '555-0100'],
  [/date/i, '2026-01-15'],
  [/time/i, '09:00'],
];

function sampleFor(name, type) {
  if (type === 'date') return '2026-01-15';
  if (type === 'time') return '09:00';
  if (type === 'email') return 'someone@example.com';
  if (type === 'url') return 'https://example.com/thing';
  for (const [pattern, value] of SAMPLE_TEXT) if (pattern.test(name)) return value;
  return 'Example';
}

/**
 * The same selector, restricted to the venture's own markup.
 *
 * The bands this build injects carry controls of exactly the kinds these
 * selectors look for -- four number inputs in the shop-rates bar, a text box
 * and several buttons in the saved-bids panel -- and none of them are the tool.
 * Both bands open closed, so today they are merely invisible to a fill; naming
 * them keeps that a property of the sweep rather than an accident of which
 * panel happened to be shut.
 */
function ownOnly(selector) {
  return selector
    .split(', ')
    .map((part) => `${part}:not([data-pf-jobs-root] ${part})`
      + `:not([data-pf-rates-root] ${part}):not(.pf-chrome ${part})`)
    .join(', ');
}

/** Fill empty text-ish fields the primary action would otherwise refuse to run
 * without; returns how many were filled.
 *
 * Without this, a tool whose form is "name, funder, then four numbers" reads as
 * dead: `perturb` changes the numbers, the action button is pressed, the form
 * rejects it for the empty required name, and the output is identical. That is
 * exactly what `grant-reporting-tracker` did on 2026-08-27 while working
 * perfectly for a visitor who typed a name — and a sweep that cries wolf twice
 * is a sweep whose real findings get skimmed past.
 *
 * Only *empty* fields are filled. A field the page pre-filled is the author's
 * own worked example and knows better than this list does.
 */
async function fillBlanks(limit = 6) {
  let filled = 0;
  const selector = ownOnly(
    'input[type=text], input[type=date], input[type=email], input[type=url], '
    + 'input[type=tel], input[type=time], input:not([type]), textarea',
  );
  for (const el of (await page.$$(selector)).slice(0, limit)) {
    try {
      if ((await el.inputValue()).trim()) continue;
      const [name, type] = await el.evaluate((node) => [
        node.name || node.id || node.placeholder || '',
        node.type || 'text',
      ]);
      await el.fill(sampleFor(name, type));
      await el.dispatchEvent('input');
      await el.dispatchEvent('change');
      filled += 1;
    } catch {
      // Hidden, readonly, or behind a disclosure. Try the next.
    }
  }
  return filled;
}

/** Change up to `limit` inputs; returns how many actually took a new value. */
async function perturb(limit = 4) {
  let touched = 0;
  for (const el of (await page.$$(ownOnly('input[type=number], select'))).slice(0, limit)) {
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

/**
 * Every button on the page except the ones this build injected.
 *
 * The whole sweep rests on "press the tool's action and see whether the page
 * answers", and it was pressing the wrong button. `injectSavedBids` puts its
 * band immediately after the navigation, above the form — so on a tool that
 * does not recalculate live, the first `<button>` in the document is "Saved
 * bids", not "Calculate true-up". Clicking it opens the panel, `innerText`
 * changes, and the tool is recorded `ok — via "Saved bids"` with its own
 * calculator never run.
 *
 * That was nine of 163 on 2026-08-28: chargeback-evidence-packet,
 * consent-change-record, grant-deadline-tracker, cam-reconciliation-check,
 * music-lesson-break-even, saas-seat-true-up, commercial-photo-license-calculator,
 * hvac-maintenance-contract-calculator and tender-radar, each reported working
 * on the strength of a platform feature that works on all 234 pages. It is the
 * exact failure this file exists to catch — a page that renders perfectly and
 * does nothing — passing *because* of the sweep rather than in spite of it.
 *
 * Excluded by container and not by label, because the labels are no help:
 * `NOT_AN_ACTION` already skips "Copy link to this bid", but "Save this bid" is
 * an ordinary-looking verb on an ordinary-looking button and would simply
 * become the next wrong thing pressed.
 */
const OWN_BUTTONS = 'button:not([data-pf-jobs-root] button)'
  + ':not([data-pf-rates-root] button):not(.pf-chrome button)';

async function pressMatching(pattern) {
  for (const button of await page.$$(OWN_BUTTONS)) {
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
  for (const button of await page.$$(OWN_BUTTONS)) {
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

// `needs-network` joins `links-only` as reported-but-not-failed: the runner
// cannot reach the API, so the sweep has no opinion on whether the tool works.
const PASSING = new Set(['ok', 'links-only', 'needs-network']);

/**
 * Same-directory links a `links-only` page's own markup points at, one level
 * deep — `ai-engineering-academy`'s hub links `resistor-calculator/`,
 * `voltage-divider-calculator/`, and four more, each a real calculator this
 * sweep otherwise never opens: the top-level catalog carries one `data-tool`
 * entry for the whole venture (`ENTRY_OVERRIDES` in `build.mjs` points it at
 * the hub), so `slugs` above never named them and nothing before this walked
 * a link to find out what it led to.
 *
 * Scoped with `ownOnly` for the same reason as everywhere else in this file:
 * the injected top nav and footer chrome link all over the site, and a link
 * back to the site root or sideways to an unrelated tool is not a child of
 * this hub. Restricted to one path segment past the hub's own, so a link
 * that happens to reach three directories down (it does not, today, but
 * nothing stops a future page) does not get walked as if it were a sibling
 * tool.
 */
async function discoverChildTools(prefix) {
  return page.$$eval(ownOnly('a[href]'), (nodes, prefix) => {
    const out = new Set();
    for (const node of nodes) {
      let url;
      try {
        url = new URL(node.getAttribute('href') || '', location.href);
      } catch {
        continue;
      }
      if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) continue;
      const rest = url.pathname.slice(prefix.length).replace(/^\/+/, '');
      const child = rest.split('/')[0];
      if (child && child !== 'index.html') out.add(child);
    }
    return [...out];
  }, prefix);
}

/**
 * The URL path for one discovered child, with a trailing slash only where one
 * belongs.
 *
 * `discoverChildTools` reads the hub's own links and returns the first path
 * segment of each, which is two different kinds of thing: a directory
 * (`resistor-calculator`, served as `/resistor-calculator/`) and a page file
 * (`vs-omni-calculator.html`). Both are real destinations a visitor clicks to,
 * so both belong in the sweep — but only the directory takes the slash.
 *
 * This sweep appended one unconditionally until 2026-09-06, and the failure was
 * the expensive kind rather than the loud kind. `GET
 * /ai-engineering-academy/vs-omni-calculator.html/` 404s; Chromium logs that
 * navigation as a console error; `sweepOne` sees the console error and reports
 * the page as a dead product. So the one red line in a 182-tool run named a
 * page that was perfectly healthy — and a standing false positive is how a
 * sweep stops being read at all.
 *
 * The half that is worse: the page was never actually loaded, so nothing on it
 * was exercised. Had its arithmetic genuinely broken, this sweep would have
 * printed the identical message it was already printing, and the run would have
 * looked no different. A gate that reports the same thing whether or not the
 * product works is not covering that ground, which is the failure this
 * repository keeps re-learning about checks that only appear to run.
 *
 * Decided on the extension rather than on a directory listing because the sweep
 * runs against a served site and has no filesystem to consult — a segment with
 * a file extension is a file, and every other segment is a directory.
 */
function childPath(child) {
  return /\.[a-z0-9]+$/i.test(child) ? child : `${child}/`;
}

/**
 * Loads one page and decides whether it works, whether it is a landing page
 * doing its job, or whether it is dead. Pulled out of the sweep's main loop
 * so the same judgment applies to a top-level tool and to a calculator only
 * reachable through a hub's own links (see `discoverChildTools`) — a nested
 * page is not exempt from being real product just because nothing on the
 * catalog names it directly.
 */
async function sweepOne(url) {
  const errors = [];
  // A request to somewhere other than the site under test that could not be
  // made. Almost every tool here is offline by construction, but a couple call
  // a public API from the browser, and this runner reaches it through a proxy
  // whose certificate Chromium does not trust. That is a fact about the sandbox,
  // not about the product: `sponsor-ready` handled it correctly on 2026-08-27,
  // printing "Failed to fetch" where a visitor would see the answer, and the
  // sweep still called it dead. Recorded separately so the distinction survives.
  const offsite = [];
  const onPageError = (error) => errors.push(`pageerror: ${error.message}`);
  const onConsole = (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 160)}`);
  };
  const onRequestFailed = (request) => {
    const url = request.url();
    if (!url.startsWith(BASE)) offsite.push(`${new URL(url).host}: ${request.failure()?.errorText}`);
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);

  let verdict = 'ok';
  let detail = '';
  let filled = 0;

  try {
    await page.goto(url, { waitUntil: 'load' });
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
      // Then supply anything still blank, so the action below is not refused
      // for an empty required field the visitor would simply have typed.
      if (!presses.length) {
        filled = await fillBlanks();
        if (filled) await page.waitForTimeout(200);
      }
      const pressed = await pressPrimaryAction();
      if (pressed) presses.push(pressed);
      if (presses.length) {
        await page.waitForTimeout(400);
        after = await page.evaluate(() => document.body.innerText);
        detail = `via ${presses.map((p) => `"${p}"`).join(' → ')}`;
      }
    }

    // `ownOnly`, for the reason that helper exists: this number decides whether
    // a page is a landing page or a broken tool, and a control this build
    // injected is neither the tool nor the author's.
    //
    // It was the bare selector until it miscounted. `injectEmbedWidget`
    // (#2561, 2026-08-31) puts a `<textarea>` and a "Copy embed code"
    // `<button>` inside `.pf-chrome` on every entry page, so every page in the
    // catalog gained two controls it does not own. On 168 of them that changed
    // nothing -- they have controls of their own and never reach this branch.
    // On `ai-engineering-academy`, which is a hub linking to six calculators
    // and has none of its own, `interactive` went 0 to 2: the `links-only`
    // branch below stopped firing and a page doing exactly its job was
    // reported `NO-CONTROLS -- 2 control(s) on the page, none of them usable`,
    // failing the whole sweep. That branch's own comment names this page.
    //
    // Which is the failure this file warns about twice in its own words -- "a
    // sweep that cries wolf twice is a sweep whose real findings get skimmed
    // past". The count has to mean what the verdicts read it as: controls the
    // venture wrote.
    const interactive = await page.$$eval(
      ownOnly('input, select, textarea, button'),
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

    // A failed off-site request explains the console error it also produced, so
    // this is asked before `errors` — otherwise the same one fact gets reported
    // twice, once as an error and once as no response.
    if (offsite.length && !errors.some((e) => e.startsWith('pageerror:'))) {
      verdict = 'needs-network';
      detail = `calls ${offsite[0]} — unreachable from this runner, not a product fault`;
    } else if (errors.length) {
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
      const acted = touched + filled;
      verdict = acted === 0 && presses.length === 0 ? 'NO-CONTROLS' : 'NO-RESPONSE';
      detail = acted === 0 && presses.length === 0
        ? `${interactive} control(s) on the page, none of them usable`
        : `changed ${touched}, filled ${filled}, pressed ${presses.length || 'no'} button(s); output identical`;
    }
  } catch (error) {
    verdict = 'LOAD-FAILED';
    detail = error.message.slice(0, 160);
  }

  page.off('pageerror', onPageError);
  page.off('console', onConsole);
  page.off('requestfailed', onRequestFailed);

  return { verdict, detail };
}

function report(label, verdict, detail) {
  results.push({ slug: label, verdict, detail });
  const flag = PASSING.has(verdict) ? '   ' : '>> ';
  console.log(`${flag}${verdict.padEnd(12)} ${label}${detail ? `  — ${detail}` : ''}`);
}

const results = [];
for (const slug of slugs) {
  const { verdict, detail } = await sweepOne(`${BASE}/${slug}/`);
  report(slug, verdict, detail);

  // A hub that is only links is doing its job, and its job was to lead
  // somewhere — follow it, the same way a visitor's next click would, rather
  // than taking "renders" as the last word on pages this sweep never named.
  if (verdict !== 'links-only') continue;
  for (const child of await discoverChildTools(`/${slug}/`)) {
    const label = `${slug}/${child}`;
    const childResult = await sweepOne(`${BASE}/${slug}/${childPath(child)}`);
    report(label, childResult.verdict, childResult.detail);
  }
}

await browser.close();

const broken = results.filter((r) => !PASSING.has(r.verdict));
console.log(`\n${results.length - broken.length}/${results.length} tools answered with no errors`);
if (broken.length) {
  console.log('\nNeeds a look — a tool that does not respond is a dead product to whoever lands on it:');
  for (const { slug, verdict, detail } of broken) console.log(`  ${slug}: ${verdict} — ${detail}`);
}
process.exit(broken.length ? 1 : 0);
