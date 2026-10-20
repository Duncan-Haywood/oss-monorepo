// The Playwright driver. Playwright is not a dependency of this repository:
// it is loaded from PLAYWRIGHT (a path to its entry file or package dir) or
// resolved as `playwright`, and the GitHub Action installs it into a scratch
// directory. CHROME_PATH reuses a Chromium already on the machine.

import { collectInPage, REF_ATTR } from './observe.mjs';

export async function loadPlaywright(env = process.env) {
  let mod;
  try {
    mod = await import(env.PLAYWRIGHT || 'playwright');
  } catch (err) {
    throw new Error('Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`, ' +
      `or set PLAYWRIGHT to its entry file (${err.message.split('\n')[0]})`);
  }
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error(`PLAYWRIGHT=${env.PLAYWRIGHT} loaded, but exports no chromium`);
  return chromium;
}

const SKIP_REQUEST_NOISE = /\/favicon\.ico$/;

/**
 * Open a browser and return { newDriver(isAllowed), close() }. Each driver is
 * one isolated browser context (fresh cookies and storage) for one scenario.
 */
export async function launch({ headed = false, viewport, timeoutMs = 15000, env = process.env } = {}) {
  const chromium = await loadPlaywright(env);
  const browser = await chromium.launch({ headless: !headed, executablePath: env.CHROME_PATH || undefined });
  return {
    async newDriver({ isAllowed = () => true, maxText = 6000 } = {}) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(Math.min(timeoutMs, 10000));
      page.setDefaultNavigationTimeout(timeoutMs);
      const events = { consoleErrors: [], pageErrors: [], requestFailures: [], blocked: [], dialogs: [] };
      // Chrome also logs every failed subresource as a console error; those are
      // judged once, as request failures, under their own policy.
      page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) events.consoleErrors.push(m.text().slice(0, 500)); });
      page.on('pageerror', e => events.pageErrors.push(String(e.message || e).slice(0, 500)));
      page.on('dialog', d => { events.dialogs.push(`${d.type()}: ${d.message().slice(0, 200)}`); d.dismiss().catch(() => {}); });
      page.on('requestfailed', r => {
        if (!isAllowed(r.url()) || SKIP_REQUEST_NOISE.test(new URL(r.url()).pathname)) return;
        const why = r.failure()?.errorText || 'failed';
        if (/ERR_ABORTED/.test(why)) return; // navigations away, cancelled fetches
        events.requestFailures.push(`${r.method()} ${r.url()} ${why}`);
      });
      page.on('response', r => {
        // The page's own status is judged where it was loaded, not twice.
        if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) return;
        if (r.status() < 400 || !isAllowed(r.url()) || SKIP_REQUEST_NOISE.test(new URL(r.url()).pathname)) return;
        events.requestFailures.push(`${r.request().method()} ${r.url()} HTTP ${r.status()}`);
      });
      // Keep the agent on the site under test: top-level navigations elsewhere
      // are refused. Subresources (fonts, CDNs, analytics) still load.
      await context.route('**/*', route => {
        const req = route.request();
        if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !isAllowed(req.url())) {
          events.blocked.push(req.url());
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });

      const byRef = ref => page.locator(`[${REF_ATTR}="${ref}"]`).first();
      const settle = async (ms = 150) => {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(ms);
      };
      // A target is what a user reads; first match wins, in this order.
      const resolve = async (target, kinds) => {
        if (target.startsWith('css=')) return page.locator(target.slice(4)).first();
        const candidates = [];
        if (kinds.includes('field')) candidates.push(page.getByLabel(target, { exact: true }), page.getByLabel(target), page.getByPlaceholder(target));
        if (kinds.includes('button')) {
          for (const role of ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch']) candidates.push(page.getByRole(role, { name: target, exact: true }));
          for (const role of ['button', 'link']) candidates.push(page.getByRole(role, { name: target }));
          candidates.push(page.getByText(target, { exact: true }), page.getByText(target));
        }
        for (const c of candidates) {
          const n = await c.count();
          for (let i = 0; i < n; i++) if (await c.nth(i).isVisible()) return c.nth(i);
        }
        throw new Error(`no visible element matches "${target}"`);
      };

      return {
        events,
        drain() {
          const out = { consoleErrors: [...events.consoleErrors], pageErrors: [...events.pageErrors], requestFailures: [...events.requestFailures], blocked: [...events.blocked], dialogs: [...events.dialogs] };
          for (const k of Object.keys(events)) events[k].length = 0;
          return out;
        },
        async goto(url) {
          const res = await page.goto(url, { waitUntil: 'load' });
          await settle();
          return { status: res ? res.status() : null };
        },
        snapshot: () => page.evaluate(collectInPage, { refAttr: REF_ATTR, maxText }),
        url: async () => page.url(),
        text: () => page.evaluate(() => document.body ? document.body.innerText : ''),
        // `timeout` lets the smoke check give up on a covered or inert control
        // quickly instead of waiting out the page default.
        async click(ref, { timeout } = {}) { await byRef(ref).click({ timeout }); await settle(); },
        async fill(ref, value, { timeout } = {}) { await byRef(ref).fill(value, { timeout }); await byRef(ref).dispatchEvent('change', null, { timeout: 1000 }).catch(() => {}); await settle(50); },
        async select(ref, value, { timeout } = {}) { await byRef(ref).selectOption({ label: value }, { timeout }).catch(() => byRef(ref).selectOption(value, { timeout })); await settle(50); },
        async check(ref, checked) { await byRef(ref).setChecked(checked); await settle(); },
        async press(key) { await page.keyboard.press(key); await settle(); },
        async scroll(direction) { await page.mouse.wheel(0, direction === 'up' ? -600 : 600); await page.waitForTimeout(200); },
        async back() { await page.goBack({ waitUntil: 'load' }).catch(() => {}); await settle(); },
        async wait(ms) { await page.waitForTimeout(ms); },
        async fillTarget(target, value) { const l = await resolve(target, ['field']); await l.fill(value); await l.dispatchEvent('change').catch(() => {}); await settle(); },
        async selectTarget(target, value) { const l = await resolve(target, ['field']); await l.selectOption({ label: value }).catch(() => l.selectOption(value)); await settle(); },
        async checkTarget(target, checked) { const l = await resolve(target, ['field', 'button']); await l.setChecked(checked); await settle(); },
        async clickTarget(target) { const l = await resolve(target, ['button']); await l.click(); await settle(); },
        async screenshot(path) { await page.screenshot({ path, fullPage: true }); return path; },
        close: () => context.close(),
      };
    },
    close: () => browser.close(),
  };
}
