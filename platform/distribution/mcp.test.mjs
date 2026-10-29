import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DEFAULT_NAME, forbiddenImports, inspect, collect, buildBundle, writeBundle, manifest, registryManifest, run, load } from './mcp.mjs';
import { handle, listTools, callTool, serve, TOOLS } from './mcp-server.mjs';

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcptest-'));
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  }
  return root;
}
const MIT = 'MIT License\n\nCopyright (c) x';
const venture = (n, cli = 'console.log("hi", process.argv.slice(2).join(","));') => ({
  [`ventures/${n}/cli.mjs`]: `#!/usr/bin/env node\n${cli}\n`,
  [`ventures/${n}/LICENSE`]: MIT,
  [`ventures/${n}/VENTURE.yaml`]: `name: ${n}\ndescription: Does ${n}. More.\n`,
});

test('forbiddenImports flags network and process modules, with or without node:', () => {
  assert.deepEqual(forbiddenImports('import a from "node:https";\nimport b from "child_process";\nimport c from "node:fs/promises";'), ['https', 'child_process']);
});

test('inspect skips network, process, fetch and eval; accepts a plain CLI', async () => {
  const root = await fixture({
    ...venture('ok'),
    ...venture('net', 'import h from "node:https"; h;'),
    ...venture('fetchy', 'await fetch("https://x");'),
    ...venture('nolic'), [`ventures/nolic/LICENSE`]: 'proprietary',
  });
  assert.equal((await inspect('ok', root)).description, 'Does ok.');
  assert.match((await inspect('net', root)).skip, /imports https/);
  assert.match((await inspect('fetchy', root)).skip, /fetch/);
  assert.match((await inspect('nolic', root)).skip, /MIT/);
  const { eligible, skipped } = await collect(root);
  assert.deepEqual(eligible.map((e) => e.slug), ['ok']);
  assert.equal(skipped.length, 3);
});

test('the real tree yields a bundle whose server answers over stdio', async () => {
  const { eligible } = await collect();
  assert.ok(eligible.length > 100, `only ${eligible.length} eligible`);
  const { serverSource, license } = await load();
  const files = buildBundle({ eligible, serverSource, license });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpbundle-'));
  await writeBundle(files, dir);
  const pkg = JSON.parse(files['package.json']);
  assert.equal(pkg.bin['monorepo-projects-mcp'], 'server.mjs');
  assert.ok(files['server.mjs'].startsWith('#!/usr/bin/env node\n'));
  const reg = JSON.parse(files['server.json']);
  assert.ok(reg.description.length <= 100);
  assert.equal(reg.packages[0].identifier, pkg.name);
  const catalogue = JSON.parse(files['tools.json']);
  const slug = catalogue[0].slug;
  const help = await callTool('tool_help', { slug }, { catalogue, dir });
  assert.ok(help.content[0].text.length > 20);
  assert.match(help.content[0].text, /\[exit 0\]/);
});

test('protocol: initialize, tools/list, notifications ignored, bad method, bad slug, bad args', async () => {
  const ctx = { catalogue: [{ slug: 'a-b', description: 'Alpha beta', url: 'u' }], dir: '/nonexistent' };
  assert.equal((await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, ctx)).result.capabilities.tools !== undefined, true);
  assert.equal((await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx)).result.tools.length, TOOLS.length);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx), null);
  assert.equal((await handle({ jsonrpc: '2.0', id: 3, method: 'nope' }, ctx)).error.code, -32601);
  const bad = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'run_tool', arguments: { slug: '../etc' } } }, ctx);
  assert.equal(bad.result.isError, true);
  const bad2 = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'run_tool', arguments: { slug: 'a-b', args: [1] } } }, ctx);
  assert.match(bad2.result.content[0].text, /array of strings/);
});

test('listTools matches all words, caps the limit', () => {
  const cat = Array.from({ length: 40 }, (_, i) => ({ slug: `t${i}`, description: i % 2 ? 'odd thing' : 'even thing' }));
  assert.equal(listTools(cat, { query: 'odd thing' }).total, 20);
  assert.equal(listTools(cat, { limit: 5 }).tools.length, 5);
});

test('run_tool passes args as an array (no shell) and stdin through, reports exit codes', async () => {
  const dir = await fixture({
    'tools/echo/cli.mjs': 'import fs from "node:fs"; console.log(JSON.stringify(process.argv.slice(2)), fs.readFileSync(0, "utf8")); if (process.argv.includes("--fail")) process.exit(3);',
  });
  const catalogue = [{ slug: 'echo', description: 'e' }];
  const ok = await callTool('run_tool', { slug: 'echo', args: ['a b', '$(id)', ';ls'], stdin: 'in' }, { catalogue, dir });
  assert.match(ok.content[0].text, /\["a b","\$\(id\)",";ls"\] in/);
  assert.equal(ok.isError, undefined);
  const fail = await callTool('run_tool', { slug: 'echo', args: ['--fail'] }, { catalogue, dir });
  assert.equal(fail.isError, true);
  assert.match(fail.content[0].text, /\[exit 3\]/);
});

test('serve speaks newline-delimited JSON-RPC and survives a malformed line', async () => {
  const input = new PassThrough(); const output = new PassThrough();
  serve({ input, output, ctx: { catalogue: [] } });
  input.write('not json\n{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
  input.end();
  let got = '';
  output.on('data', (c) => { got += c; });
  await new Promise((r) => setTimeout(r, 100));
  const lines = got.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].error.code, -32700);
  assert.deepEqual(lines[1].result, {});
});

test('run: dry run by default, publishes once when enabled, skips an already-published version', async () => {
  const root = await fixture({ ...venture('ok'), LICENSE: MIT });
  const logs = []; const calls = [];
  const log = (s) => logs.push(s);
  const r1 = await run({ env: {}, log, root, argv: [], execImpl: async (...a) => { calls.push(a); return { stdout: '' }; } });
  assert.equal(r1.published, false); assert.equal(calls.length, 0);
  const r2 = await run({ env: { DISTRIBUTE_MCP: 'true' }, log, root, argv: [], execImpl: async (cmd, args) => { calls.push(args[0]); return { stdout: '' }; } });
  assert.equal(r2.published, true); assert.deepEqual(calls, ['view', 'publish']);
  const r3 = await run({ env: { DISTRIBUTE_MCP: 'true' }, log, root, argv: [], execImpl: async () => ({ stdout: '0.1.0\n' }) });
  assert.equal(r3.published, false);
});

test('manifests carry the free/no-advice framing and agree on name and version', () => {
  const m = manifest({ count: 3 }); const r = registryManifest({ count: 3 });
  assert.match(m.description, /Not professional advice/);
  assert.equal(r.packages[0].version, m.version);
  assert.equal(r.name, 'io.github.duncan-haywood/monorepo-projects-mcp');
});

test('run --pack writes the bundle to the named directory and does not publish', async () => {
  const root = await fixture({ ...venture('ok'), LICENSE: MIT });
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpout-'));
  const calls = []; const logs = [];
  const r = await run({ env: { DISTRIBUTE_MCP: 'true' }, log: (s) => logs.push(s), root, argv: ['--pack', out], execImpl: async (...a) => { calls.push(a); return { stdout: '' }; } });
  assert.deepEqual(r, { wrote: true });
  assert.equal(calls.length, 0);
  assert.ok((await fs.stat(path.join(out, 'server.json'))).isFile());
  assert.ok((await fs.stat(path.join(out, 'tools/ok/cli.mjs'))).isFile());
  assert.ok(logs.some((l) => l.includes(`to ${out}`)));
});

test('registry description is capped at 100 characters', () => {
  assert.ok(registryManifest({ count: 3 }).description.length <= 100);
  assert.equal(registryManifest({ count: '9'.repeat(40) }).description.length, 100);
});

test('run --pack marks server.mjs executable and leaves other files plain', async () => {
  const root = await fixture({ ...venture('ok'), LICENSE: MIT });
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpmode-'));
  await run({ env: {}, log() {}, root, argv: ['--pack', out] });
  assert.equal((await fs.stat(path.join(out, 'server.mjs'))).mode & 0o111, 0o111);
  assert.equal((await fs.stat(path.join(out, 'package.json'))).mode & 0o111, 0);
});

test('run: MCP_PACKAGE_NAME overrides the package name, otherwise the default is used', async () => {
  const root = await fixture({ ...venture('ok'), LICENSE: MIT });
  for (const [env, want] of [[{ MCP_PACKAGE_NAME: 'custom-mcp' }, 'custom-mcp'], [{}, DEFAULT_NAME]]) {
    const out = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpname-'));
    await run({ env, log() {}, root, argv: ['--pack', out] });
    assert.equal(JSON.parse(await fs.readFile(path.join(out, 'package.json'), 'utf8')).name, want);
  }
});

test('running mcp.mjs directly performs the dry run; importing it does not', async () => {
  const file = fileURLToPath(new URL('./mcp.mjs', import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, [file], { env: { PATH: process.env.PATH } });
  assert.match(stdout, /^mcp bundle: \d+ tools/);
  assert.match(stdout, /dry run/);
});
