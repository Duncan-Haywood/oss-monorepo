// One run: bring the app up, run each scenario in a fresh browser context
// (smoke check, then scripted steps, then the agent's goal), judge, report.

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { scenarioUrl, allowedOrigins } from './spec.mjs';
import { explorePage } from './explore.mjs';
import { runSteps } from './steps.mjs';
import { runAgent } from './agent.mjs';
import { judge, summarise, exitCode, toJUnit, toMarkdown } from './report.mjs';
import { serveStatic, startCommand, waitForUrl } from './server.mjs';
import { firstLine } from './actions.mjs';

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'scenario';

/**
 * @param {object} spec      resolved spec (spec.mjs)
 * @param {object} deps
 * @param {Function} deps.launch     browser.mjs launch, or a fake
 * @param {Function|null} deps.ask   (system, prompt) => {text, usage}; null when no model key
 * @param {{provider:string, model:string}|null} deps.model
 */
export async function run(spec, { launch, ask = null, model = null, out = null, log = console.error, headed = false, env = process.env, cwd = process.cwd() } = {}) {
  const started = Date.now();
  const cleanup = [];
  const result = { name: spec.name || 'uitest', startedAt: new Date(started).toISOString(), baseUrl: spec.baseUrl || null, model, scenarios: [] };
  try {
    if (spec.serve) {
      const srv = await serveStatic(resolve(cwd, spec.serve));
      cleanup.push(srv.close);
      spec = { ...spec, baseUrl: spec.baseUrl || srv.url };
      // A served directory has one origin, whatever baseUrl's host says.
      if (!spec.baseUrl.startsWith(srv.url)) spec.baseUrl = new URL(new URL(spec.baseUrl).pathname, srv.url).href;
      log(`serving ${spec.serve} at ${spec.baseUrl}`);
    }
    if (spec.start) {
      const app = startCommand(spec.start, { cwd, env });
      cleanup.push(app.close);
      const target = spec.waitFor || spec.baseUrl;
      log(`started: ${spec.start}; waiting for ${target}`);
      try {
        await waitForUrl(target, { timeoutMs: Math.max(spec.timeoutMs, 60000), isAlive: app.isAlive });
      } catch (err) {
        throw new Error(`${err.message}\n--- app output ---\n${app.output()}`);
      }
      spec = { ...spec, baseUrl: spec.baseUrl || new URL('/', target).href };
    }
    result.baseUrl = spec.baseUrl;
    const origins = allowedOrigins(spec);
    const isAllowed = url => { try { return origins.has(new URL(url).origin); } catch { return false; } };
    const resolveUrl = path => scenarioUrl(spec.baseUrl, path);

    if (out) await mkdir(join(out, 'screenshots'), { recursive: true });
    const browser = await launch({ headed, viewport: spec.viewport, timeoutMs: spec.timeoutMs, env });
    cleanup.unshift(browser.close);

    // Crawl adds one smoke-only scenario per discovered same-site page.
    const queue = spec.scenarios.map(s => ({ ...s }));
    const seen = new Set(queue.map(s => resolveUrl(s.path || '/')));
    let crawlBudget = spec.crawl || 0;
    const workers = Math.max(1, Math.min(spec.workers || 1, 16));

    const runOne = async (sc, i) => {
      // With several workers, a scenario's lines print together when it ends.
      const lines = [];
      const say = workers > 1 ? line => lines.push(line) : log;
      const url = resolveUrl(sc.path || '/');
      const t0 = Date.now();
      say(`\n▶ ${sc.name}  ${url}`);
      const driver = await browser.newDriver({ isAllowed });
      const record = { name: sc.name, url, goal: sc.goal || null, expect: sc.expect || null, screenshots: [] };
      const events = { consoleErrors: [], pageErrors: [], requestFailures: [], blocked: [], dialogs: [] };
      const collect = () => { const e = driver.drain(); for (const k of Object.keys(events)) events[k].push(...(e[k] || [])); };
      try {
        if (spec.explore !== false && sc.explore !== false) {
          record.explore = await explorePage(driver, url, { isAllowed });
          collect();
          for (const link of record.explore.links) {
            if (crawlBudget <= 0 || seen.has(link)) continue;
            seen.add(link);
            crawlBudget -= 1;
            queue.push({ name: `crawl: ${new URL(link).pathname}`, path: link, crawled: true });
          }
        }
        const hardSmoke = record.explore?.issues.some(x => x.level === 'fail');
        if (!hardSmoke && (sc.steps?.length || sc.goal)) await driver.goto(url);
        if (!hardSmoke && sc.steps?.length) {
          record.steps = await runSteps(driver, sc.steps, {
            resolveUrl, timeoutMs: Math.min(spec.timeoutMs, 10000),
            screenshotPath: out ? name => join(out, 'screenshots', `${slug(sc.name)}-${slug(name)}.png`) : null,
          });
          record.screenshots.push(...record.steps.screenshots);
          for (const st of record.steps.steps) say(`  ${st.ok ? '✓' : '✗'} ${st.desc}${st.error ? ` — ${st.error}` : ''}`);
          collect();
        }
        if (!hardSmoke && sc.goal && ask && record.steps?.ok !== false) {
          record.agent = await runAgent({
            driver, ask, goal: sc.goal, expect: sc.expect, maxSteps: sc.maxSteps || spec.maxSteps, resolveUrl, isAllowed, log: say,
            issues: () => { collect(); return [...events.pageErrors.map(e => `uncaught error: ${e}`), ...events.consoleErrors.map(e => `console.error: ${e}`), ...events.requestFailures.map(e => `request failed: ${e}`)]; },
          });
          collect();
        }
      } catch (err) {
        record.crash = firstLine(err.message);
      }
      collect();
      const verdict = record.crash
        ? { verdict: 'error', reason: `run crashed: ${record.crash}`, issues: [] }
        : judge({ steps: record.steps, explore: record.explore, agent: record.agent, browserEvents: events, hadGoal: Boolean(sc.goal), policy: spec });
      Object.assign(record, verdict, { durationMs: Date.now() - t0 });
      if (out && record.verdict !== 'pass' && record.verdict !== 'skipped') {
        const path = join(out, 'screenshots', `${slug(sc.name)}-final.png`);
        try { record.screenshots.push(await driver.screenshot(path)); } catch { /* page gone */ }
      }
      await driver.close().catch(() => {});
      for (const issue of record.issues) say(`  ${issue.level}: ${issue.message}`);
      say(`  → ${record.verdict}: ${record.reason}`);
      if (lines.length) log(lines.join('\n'));
      records[i] = record;
    };

    // A small pool: crawling can grow the queue while workers are busy, so an
    // idle worker waits until every scenario has finished, not just started.
    const records = [];
    let next = 0, active = 0;
    const worker = async () => {
      for (;;) {
        if (next < queue.length) {
          const i = next++;
          active += 1;
          try { await runOne(queue[i], i); } finally { active -= 1; }
        } else if (active === 0) return;
        else await new Promise(r => setTimeout(r, 25));
      }
    };
    await Promise.all(Array.from({ length: workers }, worker));
    result.scenarios.push(...records.filter(Boolean));
  } catch (err) {
    result.fatal = err.message;
  } finally {
    for (const fn of cleanup) await Promise.resolve().then(fn).catch(() => {});
  }
  result.durationMs = Date.now() - started;
  if (result.fatal) result.scenarios.push({ name: 'setup', url: result.baseUrl || '', verdict: 'error', reason: firstLine(result.fatal), issues: [{ level: 'fail', message: result.fatal }], durationMs: 0 });
  result.summary = summarise(result);
  result.exitCode = exitCode(result);

  const markdown = toMarkdown(result);
  if (out) {
    await writeFile(join(out, 'report.json'), JSON.stringify(result, null, 2));
    await writeFile(join(out, 'junit.xml'), toJUnit(result));
    await writeFile(join(out, 'summary.md'), markdown);
  }
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, markdown + '\n').catch(() => {});
  return { result, markdown };
}
