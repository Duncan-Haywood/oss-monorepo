/**
 * MCP-server bundle: packages every eligible zero-dependency venture CLI behind
 * one stdio MCP server (platform/distribution/mcp-server.mjs) so an AI assistant
 * (Claude Desktop, Cursor, VS Code, ...) can search and run them. Off by
 * default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/mcp.mjs                       # dry run: counts, skips, manifest
 *   node platform/distribution/mcp.mjs --pack <outDir>       # write the npm package to disk
 *   DISTRIBUTE_MCP=true NODE_AUTH_TOKEN=... node platform/distribution/mcp.mjs   # npm publish
 *
 * Eligibility is stricter than the npx channel (npm.mjs): besides the closure
 * check (node: builtins and sibling files only), a CLI whose closure imports a
 * network or process module (http, https, net, tls, dgram, dns, child_process,
 * worker_threads, cluster, vm) is skipped, so the server never hands an
 * assistant a tool that can phone home or spawn programs. A guard on
 * `fetch(` / `WebSocket` / `process.binding` in the source skips the rest.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { importsOf, closure, descriptionOf, discover } from './npm.mjs';
import { toolUrl } from './bluesky.mjs';
import { tagUrl } from './attribution.mjs';

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const REPO_URL = 'https://github.com/duncan-haywood/oss-monorepo';
export const VERSION = '0.1.0';
export const DEFAULT_NAME = 'monorepo-projects-mcp';
const FORBIDDEN = new Set(['http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns', 'child_process', 'worker_threads', 'cluster', 'vm', 'inspector']);
const RISKY_SRC = /\bfetch\s*\(|\bWebSocket\b|process\.binding|\beval\s*\(|new Function\s*\(/;

/** Names of forbidden node: modules imported by `src`. */
export function forbiddenImports(src) {
  return importsOf(src).map((s) => s.replace(/^node:/, '').split('/')[0]).filter((m) => FORBIDDEN.has(m));
}

/** { slug, description, files } for an eligible venture, or { slug, skip }. */
export async function inspect(slug, root = REPO_ROOT) {
  const dir = path.join(root, 'ventures', slug);
  const read = (rel) => fs.readFile(path.join(dir, rel), 'utf8').catch(() => null);
  const cli = await read('cli.mjs');
  if (cli === null) return { slug, skip: 'no cli.mjs' };
  const license = await read('LICENSE');
  if (license === null || !/MIT License/i.test(license)) return { slug, skip: 'no MIT LICENSE' };
  const description = descriptionOf((await read('VENTURE.yaml')) ?? '');
  if (!description) return { slug, skip: 'no description in VENTURE.yaml' };
  const c = await closure(dir);
  if (c.skip) return { slug, skip: c.skip };
  const files = {};
  for (const rel of c.files) {
    const src = await read(rel);
    const bad = forbiddenImports(src);
    if (bad.length) return { slug, skip: `${rel} imports ${bad.join(', ')}` };
    if (RISKY_SRC.test(src)) return { slug, skip: `${rel} uses fetch/WebSocket/eval` };
    files[rel] = src;
  }
  return { slug, description, files };
}

export async function collect(root = REPO_ROOT, slugs = null) {
  const eligible = []; const skipped = [];
  for (const slug of slugs ?? await discover(root)) {
    const r = await inspect(slug, root);
    (r.skip ? skipped : eligible).push(r);
  }
  return { eligible, skipped };
}

export function manifest({ name = DEFAULT_NAME, version = VERSION, count }) {
  return {
    name,
    version,
    description: `MCP server exposing ${count} free, open-source (MIT) calculators and checkers to AI assistants. Local, no network, no account. Not professional advice.`,
    type: 'module',
    bin: { [name]: 'server.mjs' },
    main: 'server.mjs',
    files: ['server.mjs', 'tools.json', 'tools', 'LICENSE', 'README.md', 'server.json'],
    engines: { node: '>=18' },
    license: 'MIT',
    homepage: 'https://duncan-haywood.github.io/oss-monorepo/',
    repository: { type: 'git', url: `git+${REPO_URL}.git`, directory: 'platform/distribution' },
    bugs: { url: `${REPO_URL}/issues` },
    keywords: ['mcp', 'model-context-protocol', 'mcp-server', 'calculator', 'free', 'open-source'],
    publishConfig: { access: 'public' },
  };
}

/** Manifest for the official MCP registry (server.json). `namespace` e.g. io.github.duncan-haywood. */
export function registryManifest({ name = DEFAULT_NAME, version = VERSION, count, namespace = 'io.github.duncan-haywood' }) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json',
    name: `${namespace}/${name}`,
    description: `Search and run ${count} free open-source calculators and checkers. Local, offline, no account.`.slice(0, 100),
    version,
    repository: { url: REPO_URL, source: 'github' },
    packages: [{ registry_type: 'npm', identifier: name, version, transport: { type: 'stdio' } }],
  };
}

const readmeText = (name, count) => `# ${name}

An [MCP](https://modelcontextprotocol.io) server that lets an AI assistant search and run **${count} free, open-source command-line tools** (calculators, estimators and checkers) from [Maris Stella Labs](https://marisstella.app/).

Everything runs locally on your machine. The bundled tools import no network or process modules, the server sends nothing anywhere, and there is no account or API key.

## Use it

Claude Desktop, Cursor, VS Code and other MCP clients take a block like:

\`\`\`json
{ "mcpServers": { "monorepo-projects": { "command": "npx", "args": ["-y", "${name}"] } } }
\`\`\`

Tools it adds: \`list_tools\` (search by words), \`tool_help\` (a tool's options), \`run_tool\` (arguments as an array, optional stdin; output capped, 20 s timeout).

Note \`run_tool\` can read any file the tool is pointed at with a path argument, as you could yourself. Your client asks before each call; keep that on.

Free and open source (MIT). Results are estimates, not legal, tax or professional advice.
Source: ${REPO_URL}/tree/main/ventures
`;

/** The full package as { relPath: text }. */
export function buildBundle({ eligible, serverSource, license, name = DEFAULT_NAME, version = VERSION }) {
  const files = {};
  for (const e of eligible) for (const [rel, text] of Object.entries(e.files)) files[`tools/${e.slug}/${rel}`] = text;
  files['tools.json'] = `${JSON.stringify(eligible.map((e) => ({ slug: e.slug, description: e.description, url: tagUrl(toolUrl(e.slug), 'mcp') })), null, 2)}\n`;
  files['server.mjs'] = serverSource.startsWith('#!') ? serverSource : `#!/usr/bin/env node\n${serverSource}`;
  files.LICENSE = license;
  files['README.md'] = readmeText(name, eligible.length);
  files['package.json'] = `${JSON.stringify(manifest({ name, version, count: eligible.length }), null, 2)}\n`;
  files['server.json'] = `${JSON.stringify(registryManifest({ name, version, count: eligible.length }), null, 2)}\n`;
  return files;
}

export async function writeBundle(files, outDir) {
  for (const [rel, text] of Object.entries(files)) {
    const target = path.join(outDir, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text, rel === 'server.mjs' ? { mode: 0o755 } : undefined);
  }
}

export async function load(root = REPO_ROOT) {
  const serverSource = await fs.readFile(path.join(HERE, 'mcp-server.mjs'), 'utf8');
  const license = await fs.readFile(path.join(root, 'LICENSE'), 'utf8').catch(() => 'MIT License\n');
  return { serverSource, license };
}

export async function run({ env = process.env, log = console.log, execImpl = exec, root = REPO_ROOT, argv = process.argv.slice(2) } = {}) {
  const { eligible, skipped } = await collect(root);
  const name = env.MCP_PACKAGE_NAME || DEFAULT_NAME;
  const { serverSource, license } = await load(root);
  const files = buildBundle({ eligible, serverSource, license, name });
  log(`mcp bundle: ${eligible.length} tools, ${skipped.length} skipped`);
  const i = argv.indexOf('--pack');
  if (i >= 0) {
    await writeBundle(files, argv[i + 1]);
    log(`wrote ${Object.keys(files).length} files to ${argv[i + 1]}`);
    return { wrote: true };
  }
  if (argv.includes('--skipped')) for (const s of skipped) log(`  skip ${s.slug}: ${s.skip}`);
  if (env.DISTRIBUTE_MCP !== 'true') {
    log('dry run (DISTRIBUTE_MCP is not "true"); registry manifest:');
    log(files['server.json']);
    return { published: false };
  }
  const view = await execImpl('npm', ['view', name, 'version']).then((r) => r.stdout.trim(), () => '');
  if (view === VERSION) { log(`${name}@${VERSION} is already on npm; nothing to do`); return { published: false }; }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-'));
  await writeBundle(files, dir);
  await execImpl('npm', ['publish', '--access', 'public'], { cwd: dir });
  log(`published ${name}@${VERSION}`);
  return { published: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
