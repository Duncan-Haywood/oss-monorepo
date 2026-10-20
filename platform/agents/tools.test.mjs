import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import {
  buildArgs,
  call,
  catalogue,
  commentFor,
  describe,
  engines,
  handle,
  main,
  pageEngines,
  pageMeta,
  paramsOf,
  parseArgv,
  search,
  serve,
  toJson,
} from './tools.mjs';

const REAL = '401k-loan-vs-withdrawal-calculator';

async function fixtureRoot(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-tools-'));
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  }
  return root;
}

const page = (title, desc, script) =>
  `<!doctype html><html><head><title>${title}</title><meta name="description" content="${desc}"></head><body><script type="module">${script}</script></body></html>`;

test('pageMeta reads and decodes the title and description', () => {
  assert.deepEqual(pageMeta(page('A &amp; B', 'Price &quot;it&quot;', '')), { title: 'A & B', description: 'Price "it"' });
});

test('pageEngines names the modules a page computes with, not its plumbing', () => {
  const html = page('t', 'd', `import { a } from "./calc.mjs";\nimport { record } from './usage.mjs';\nimport { s } from "./share.mjs";\nimport { b } from './proposal.mjs';`);
  assert.deepEqual(pageEngines(html), ['calc.mjs', 'proposal.mjs']);
});

test('paramsOf handles declarations, arrows and default values with brackets', () => {
  function f(a, { b = [1, 2] } = {}, c = (1)) {
    return [a, b, c];
  }
  const g = (x) => x;
  const h = x => x;
  assert.equal(paramsOf(f), 'a, { b = [1, 2] } = {}, c = (1)');
  assert.equal(paramsOf(g), 'x');
  assert.equal(paramsOf(h), 'x');
});

test('commentFor returns the comment above an export and the module header', () => {
  const src = '#!/usr/bin/env node\n// Header one.\n// Header two.\n\nconst x = 1;\n// Adds.\n// Really.\nexport function add(a, b) {}\n/** Doc block. */\nexport const k = 2;\nexport function bare() {}\n';
  assert.equal(commentFor(src, null), 'Header one.\nHeader two.');
  assert.equal(commentFor(src, 'add'), 'Adds.\nReally.');
  assert.equal(commentFor(src, 'k'), 'Doc block.');
  assert.equal(commentFor(src, 'bare'), '');
});

test('toJson keeps Maps, Sets, Infinity and BigInt readable', () => {
  assert.equal(toJson({ m: new Map([['a', 1]]), s: new Set([2]), i: Infinity, b: 3n, f: () => 1 }, 0), '{"m":{"a":1},"s":[2],"i":"Infinity","b":"3"}');
});

test('buildArgs lays --input over DEFAULTS, then appends --args, with stdin first', () => {
  const mod = { DEFAULTS: { a: 1, b: 2 } };
  assert.deepEqual(buildArgs(mod, { input: '{"b":5}' }), [{ a: 1, b: 5 }]);
  assert.deepEqual(buildArgs({}, { input: { b: 5 } }), [{ b: 5 }]);
  assert.deepEqual(buildArgs(mod, { stdin: 'csv', args: '[3]' }), ['csv', 3]);
  assert.throws(() => buildArgs(mod, { args: '{"x":1}' }), /JSON array/);
});

test('parseArgv separates the tool CLI arguments after --', () => {
  const o = parseArgv(['run', 'x', '--', '--json', 'a']);
  assert.deepEqual(o._, ['run', 'x']);
  assert.deepEqual(o.rest, ['--json', 'a']);
  assert.throws(() => parseArgv(['call', '--input']), /needs a value/);
  assert.throws(() => parseArgv(['--nope']), /unknown option/);
});

test('search needs every word and ranks slug and title hits first', () => {
  const entries = [
    { slug: 'roof-bid', title: 'Roof bid', description: 'roofing' },
    { slug: 'gutter', title: 'Gutter', description: 'a roof gutter bid tool' },
    { slug: 'fence', title: 'Fence', description: 'fence bid' },
  ];
  const r = search(entries, 'roof bid');
  assert.equal(r.total, 2);
  assert.deepEqual(r.tools.map((t) => t.slug), ['roof-bid', 'gutter']);
  assert.match(r.tools[0].url, /\/roof-bid\/$/);
});

test('the safety gate refuses an engine that fetches or imports the network', async () => {
  const root = await fixtureRoot({
    'ventures/net-tool/index.html': page('Net', 'd', 'import { go } from "./calc.mjs";'),
    'ventures/net-tool/calc.mjs': "import { helper } from './lib.mjs';\nexport const go = () => helper();\n",
    'ventures/net-tool/lib.mjs': "export const helper = () => fetch('https://example.com');\n",
    'ventures/sock-tool/index.html': page('Sock', 'd', 'import { go } from "./calc.mjs";'),
    'ventures/sock-tool/calc.mjs': "import net from 'node:net';\nexport const go = () => net;\n",
  });
  assert.match((await engines('net-tool', root))[0].skip, /lib\.mjs uses fetch/);
  assert.match((await engines('sock-tool', root))[0].skip, /imports net/);
  await assert.rejects(call('net-tool', 'go', {}, root), /not loaded: calc\.mjs/);
});

test('describe and call work on a fixture with DEFAULTS', async () => {
  const root = await fixtureRoot({
    'ventures/sum-tool/index.html': page('Sum', 'Adds two numbers.', 'import { DEFAULTS, total } from "./calc.mjs";'),
    'ventures/sum-tool/calc.mjs': '// Adds things.\nexport const DEFAULTS = { a: 1, b: 2 };\n// a plus b.\nexport function total(o) { return o.a + o.b; }\nexport async function lines(text) { return text.split("\\n").length; }\n',
  });
  const d = await describe('sum-tool', root);
  assert.equal(d.title, 'Sum');
  assert.equal(d.cli, null);
  assert.equal(d.engines[0].about, 'Adds things.');
  assert.deepEqual(d.engines[0].functions[0], { name: 'lines(text)' });
  assert.deepEqual(d.engines[0].functions[1], { name: 'total(o)', doc: 'a plus b.' });
  assert.deepEqual(d.engines[0].constants, { DEFAULTS: { a: 1, b: 2 } });
  assert.equal((await call('sum-tool', 'total', { input: { b: 40 } }, root)).result, 41);
  const r = await call('sum-tool', 'lines', { stdin: 'x\ny\nz' }, root);
  assert.equal(r.result, 3);
  assert.deepEqual(r.args, ['<stdin>']);
  await assert.rejects(call('sum-tool', 'nope', {}, root), /no exported function "nope"/);
  await assert.rejects(describe('../etc', root), /bad slug/);
  assert.deepEqual((await catalogue(root)).map((t) => t.slug), ['sum-tool']);
});

test('describe prints a tool\'s PAPERS in full as papers, not as a summarised constant', async () => {
  const long = 'x'.repeat(2000);
  const root = await fixtureRoot({
    'ventures/paper-tool/index.html': page('Paper', 'd', 'import { analyze } from "./engine.mjs";'),
    'ventures/paper-tool/engine.mjs': `export const PAPERS = [{ title: 'A Method', year: 2001, url: 'https://doi.org/10.1/x', bibtex: '${long}' }];\nexport const analyze = () => 1;\n`,
  });
  const d = await describe('paper-tool', root);
  assert.equal(d.papers.length, 1);
  assert.equal(d.papers[0].title, 'A Method');
  assert.equal(d.papers[0].bibtex.length, 2000);
  assert.deepEqual(d.engines[0].constants, {});
});

test('call runs a real catalogue tool', async () => {
  const r = await call(REAL, 'payment', { args: [20000, 8.5, 5] });
  assert.equal(r.module, 'calc.mjs');
  assert.ok(Math.abs(r.result - 410.33) < 0.01);
  const a = await call(REAL, 'analyze', { input: { need: 20000 } });
  assert.equal(a.args[0].need, 20000);
  assert.equal(a.args[0].balance, 80000, 'unspecified inputs come from DEFAULTS');
});

test('main prints JSON for search and exits 2 on bad usage', async () => {
  let printed = '';
  assert.equal(await main(['search', '401k', 'loan', '--compact'], { out: (s) => (printed += s) }), 0);
  assert.ok(JSON.parse(printed).tools.some((t) => t.slug === REAL));
  assert.equal(await main([], { out: () => {} }), 2);
  assert.equal(await main(['--bogus'], { out: () => {} }), 2);
});

test('MCP: initialize, tools/list and a call_tool round trip in a child process', async () => {
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.result.serverInfo.name, 'monorepo-projects-tools');
  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), ['search_tools', 'describe_tool', 'call_tool', 'run_cli']);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await handle({ jsonrpc: '2.0', id: 3, method: 'nope' })).error.code, -32601);

  const c = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'call_tool', arguments: { slug: REAL, function: 'payment', args: [20000, 8.5, 5] } } });
  assert.equal(c.result.isError, undefined);
  assert.ok(Math.abs(JSON.parse(c.result.content[0].text).result - 410.33) < 0.01);

  const bad = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'describe_tool', arguments: { slug: '../../etc' } } });
  assert.equal(bad.result.isError, true);
  const noCli = await handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'run_cli', arguments: { slug: REAL } } });
  assert.match(noCli.result.content[0].text, /has no cli\.mjs/);
});

test('MCP: serve answers newline-delimited JSON-RPC and reports parse errors', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let buf = '';
  output.on('data', (c) => (buf += c));
  serve({ input, output });
  input.write('not json\n');
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' })}\n`);
  for (let i = 0; i < 50 && buf.split('\n').filter(Boolean).length < 2; i++) await new Promise((r) => setTimeout(r, 10));
  const msgs = buf.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(msgs[0].error.code, -32700);
  assert.deepEqual(msgs[1], { jsonrpc: '2.0', id: 9, result: {} });
  input.end();
});

// The guard that keeps this useful: every tool that ships an engine module has
// to import cleanly outside a browser, so an agent can call it. A module that
// touches `document` or `window` at import time fails here, with its name.
test('every catalogue tool with an engine module is describable without a browser', async () => {
  const entries = await catalogue();
  assert.ok(entries.length > 1000, `catalogue has ${entries.length} tools`);
  const failures = [];
  let callable = 0;
  for (const t of entries) {
    try {
      const d = await describe(t.slug);
      if (d.engines.some((e) => !e.skip && e.functions.length)) callable++;
    } catch (e) {
      failures.push(`${t.slug}: ${String(e?.message ?? e).split('\n')[0]}`);
    }
  }
  assert.deepEqual(failures, []);
  assert.ok(callable / entries.length > 0.95, `only ${callable} of ${entries.length} tools are callable`);
});
