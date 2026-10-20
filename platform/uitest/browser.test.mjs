// End to end in a real browser: the CLI against fixtures/app, with a local
// stand-in for an OpenAI-compatible model server so the agent path runs
// through byok.mjs and HTTP exactly as it would with a real key.
//
// Skips when Playwright cannot be loaded (set PLAYWRIGHT to its entry file).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/browser.mjs';
import { scriptedModel } from './fixtures/fake-driver.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'uitest.mjs');
const app = join(here, 'fixtures', 'app');

let skip = false;
try { await loadPlaywright(); } catch (err) { skip = `Playwright unavailable: ${err.message.slice(0, 80)}`; }

function uitest(args, env = {}) {
  return new Promise(resolve => {
    execFile(process.execPath, [cli, ...args], { env: { PATH: process.env.PATH, PLAYWRIGHT: process.env.PLAYWRIGHT || '', CHROME_PATH: process.env.CHROME_PATH || '', PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '', ...env }, timeout: 120000 },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

/** A /chat/completions server whose "model" is the scripted fixture policy. */
async function fakeModelServer() {
  const policy = scriptedModel();
  const requests = [];
  const srv = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const { messages } = JSON.parse(body);
    requests.push({ auth: req.headers.authorization, messages });
    const reply = await policy(messages[0].content, messages.at(-1).content);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      choices: [{ message: { content: reply.text } }], usage: { prompt_tokens: 100, completion_tokens: 20 },
    }));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}/v1`, requests, close: () => new Promise(r => srv.close(r)) };
}

test('no key: smoke + crawl find the broken page; exit 1 with JUnit and a screenshot', { skip }, async () => {
  const out = await mkdtemp(join(tmpdir(), 'uitest-e2e-'));
  const r = await uitest(['--serve', app, '--crawl', '5', '--out', out]);
  assert.equal(r.code, 1, r.stderr);
  const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8'));
  assert.deepEqual(report.scenarios.map(s => [s.name, s.verdict]), [['smoke', 'pass'], ['crawl: /broken.html', 'fail']]);
  assert.match(report.scenarios[1].reason, /undefinedFunction is not defined/);
  assert.equal(report.scenarios[0].explore.filled, 3);
  assert.match(await readFile(join(out, 'junit.xml'), 'utf8'), /failures="1"/);
  assert.deepEqual(await readdir(join(out, 'screenshots')), ['crawl-broken-html-final.png']);
});

test('scripted steps in a real browser: labels, selects, regex expectations', { skip }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'uitest-spec-'));
  const spec = join(dir, 'uitest.json');
  await writeFile(spec, JSON.stringify({ explore: false, timeoutMs: 3000, scenarios: [
    { name: 'estimate', steps: [{ fill: 'Wall width (ft)', value: '35' }, { fill: 'Wall height (ft)', value: '10' }, { select: 'Coats', value: '2' }, { click: 'Calculate' }, { expectText: 'You need 2 gallons of paint.' }] },
    { name: 'validation', steps: [{ click: 'Calculate' }, { expectText: 'Enter a width and a height.' }, { expectNoText: 'gallons' }] },
    { name: 'regression', steps: [{ click: 'css=button[type=submit]' }, { expectText: '/\\d gallons/' }] },
  ] }));
  const r = await uitest([spec, '--serve', app, '--json']);
  assert.equal(r.code, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.deepEqual(report.scenarios.map(s => s.verdict), ['pass', 'pass', 'fail']);
  assert.match(report.scenarios[2].reason, /never showed \/\\d gallons\//);
});

test('agent goal through an OpenAI-compatible endpoint: pass on the app, fail on the broken page', { skip }, async () => {
  const model = await fakeModelServer();
  try {
    const env = { LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: model.url, LLM_MODEL: 'scripted', LLM_API_KEY: 'test-key' };
    let r = await uitest(['--serve', app, '--no-explore', '--goal', 'Estimate paint for one wall', '--json'], env);
    assert.equal(r.code, 0, r.stderr);
    let s = JSON.parse(r.stdout).scenarios[0];
    assert.equal(s.verdict, 'pass');
    assert.match(s.reason, /You need [\d.]+ gallons/);
    assert.deepEqual(s.agent.steps.map(x => x.desc.replace(/\[\d+\] /, '').split(' =')[0]), ['fill "Wall width (ft)"', 'fill "Wall height (ft)"', 'click "Calculate"', s.agent.steps[3].desc]);
    assert.equal(model.requests[0].auth, 'Bearer test-key');
    assert.match(model.requests[0].messages.at(-1).content, /\[\d+\] input\[number\] "Wall width \(ft\)" value=""/);

    // The broken page: whatever the model says, an uncaught error fails it.
    const spec = join(await mkdtemp(join(tmpdir(), 'uitest-spec-')), 'u.json');
    await writeFile(spec, JSON.stringify({ explore: false, scenarios: [{ name: 'broken', path: '/broken.html', goal: 'Estimate paint', maxSteps: 6 }] }));
    r = await uitest([spec, '--serve', app, '--json'], env);
    assert.equal(r.code, 1, r.stderr);
    s = JSON.parse(r.stdout).scenarios[0];
    assert.equal(s.verdict, 'fail');
    assert.ok(s.issues.some(i => /undefinedFunction/.test(i.message)), JSON.stringify(s.issues));
    // The key never reaches the report.
    assert.doesNotMatch(r.stdout + r.stderr, /test-key/);
  } finally { await model.close(); }
});

test('a goal with no key is skipped, and all-skipped exits 2 (nothing verified)', { skip }, async () => {
  const r = await uitest(['--serve', app, '--no-explore', '--goal', 'Estimate paint']);
  assert.equal(r.code, 2, r.stderr);
  assert.match(r.stderr, /no model key configured/);
  assert.match(r.stderr, /nothing was verified/);
});

test('--start runs a full-stack app and waits for it; a dead command fails fast', { skip }, async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const file = join(await mkdtemp(join(tmpdir(), 'uitest-app-')), 'server.mjs');
  await writeFile(file, `import { createServer } from 'node:http';
createServer((q, s) => {
  s.writeHead(q.url === '/api' ? 500 : 200, { 'content-type': 'text/html' });
  s.end("<title>t</title><h1>Hi</h1><script>fetch('/api')</script>");
}).listen(${port});`);
  const server = `node ${JSON.stringify(file)}`;
  let r = await uitest(['--start', server, '--wait-for', `http://127.0.0.1:${port}/`, '--request-failures', 'fail', '--json']);
  assert.equal(r.code, 1, r.stderr);
  const s = JSON.parse(r.stdout).scenarios[0];
  assert.equal(s.verdict, 'fail', s.reason);
  assert.match(s.reason, /request failed: GET http:\/\/127\.0\.0\.1:\d+\/api HTTP 500/);
  r = await uitest(['--start', 'exit 3', '--wait-for', 'http://127.0.0.1:9/', '--json']);
  assert.equal(r.code, 1);
  assert.match(JSON.parse(r.stdout).scenarios[0].reason, /exited before/);
});
