#!/usr/bin/env node
/**
 * Zero-dependency MCP server (stdio, newline-delimited JSON-RPC) that lets an
 * AI assistant use the portfolio's free command-line tools. It is copied into
 * the npm bundle that platform/distribution/mcp.mjs builds, next to a
 * `tools.json` catalogue and one `tools/<slug>/` directory per CLI.
 *
 * Three tools: list_tools (search the catalogue), tool_help (a CLI's --help),
 * run_tool (run one CLI with an argument array and optional stdin). Arguments
 * are passed to `node` as an array, never through a shell. Output is capped
 * and every run has a timeout. Nothing is sent anywhere by this server; the
 * bundled CLIs are checked at build time to import no network or process
 * modules.
 */
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROTOCOL_VERSION = '2025-06-18';
export const MAX_OUTPUT = 200_000;
export const TIMEOUT_MS = 20_000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function loadCatalogue(file = path.join(HERE, 'tools.json')) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export const TOOLS = [
  {
    name: 'list_tools',
    description: 'Search the catalogue of free, open-source command-line tools (calculators, checkers, estimators). Returns slug, one-line description and page URL. Leave query empty to list all.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to match against slug and description' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'tool_help',
    description: 'Show the usage text (--help) of one catalogue tool: its options and what the numbers mean.',
    inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'run_tool',
    description: 'Run one catalogue tool with command-line arguments (an array of strings, no shell) and optional stdin text. Output is capped and the run times out. Results are estimates, not legal, tax or professional advice.',
    inputSchema: { type: 'object', properties: { slug: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, stdin: { type: 'string' } }, required: ['slug'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];

const text = (s, isError = false) => ({ content: [{ type: 'text', text: s }], ...(isError ? { isError: true } : {}) });

export function listTools(catalogue, { query = '', limit = 25 } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const hits = catalogue.filter((t) => words.every((w) => `${t.slug} ${t.description}`.toLowerCase().includes(w)));
  const n = Math.min(Math.max(Number(limit) || 25, 1), 100);
  return { total: hits.length, tools: hits.slice(0, n) };
}

/** Run a bundled CLI. Resolves { code, stdout, stderr, truncated, timedOut }. */
export function runCli(dir, slug, args = [], stdin = '', { timeoutMs = TIMEOUT_MS, maxOutput = MAX_OUTPUT } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(dir, 'tools', slug, 'cli.mjs'), ...args], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } });
    let stdout = ''; let stderr = ''; let truncated = false; let timedOut = false;
    const add = (cur, chunk) => { const next = cur + chunk; if (next.length > maxOutput) { truncated = true; return next.slice(0, maxOutput); } return next; };
    child.stdout.on('data', (c) => { stdout = add(stdout, c); });
    child.stderr.on('data', (c) => { stderr = add(stderr, c); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(e.message), truncated, timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, truncated, timedOut }); });
    child.stdin.on('error', () => {});
    child.stdin.end(String(stdin));
  });
}

function formatRun(r) {
  const parts = [];
  if (r.stdout) parts.push(r.stdout.trimEnd());
  if (r.stderr) parts.push(`[stderr]\n${r.stderr.trimEnd()}`);
  if (r.timedOut) parts.push(`[timed out after ${TIMEOUT_MS / 1000}s]`);
  if (r.truncated) parts.push('[output truncated]');
  parts.push(`[exit ${r.code}]`);
  return parts.join('\n');
}

export async function callTool(name, args, { catalogue, dir = HERE }) {
  args = args ?? {};
  if (name === 'list_tools') return text(JSON.stringify(listTools(catalogue, args), null, 2));
  if (name !== 'tool_help' && name !== 'run_tool') return text(`unknown tool ${name}`, true);
  const slug = String(args.slug ?? '');
  if (!SLUG_RE.test(slug) || !catalogue.some((t) => t.slug === slug)) return text(`unknown slug "${slug}"; use list_tools to search`, true);
  if (name === 'tool_help') {
    const r = await runCli(dir, slug, ['--help']);
    return text(formatRun(r), false);
  }
  if (args.args !== undefined && (!Array.isArray(args.args) || args.args.some((a) => typeof a !== 'string'))) return text('args must be an array of strings', true);
  const r = await runCli(dir, slug, args.args ?? [], args.stdin ?? '');
  return text(formatRun(r), r.code !== 0);
}

/** One JSON-RPC message in, a response object (or null for notifications) out. */
export async function handle(msg, ctx) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (id === undefined) return null; // notification (initialized, cancelled, ...)
  switch (method) {
    case 'initialize':
      return ok({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'monorepo-projects-mcp', version: ctx.version ?? '0.1.0' }, instructions: 'Free, open-source (MIT) calculators and checkers. Start with list_tools. Outputs are estimates, not professional advice.' });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call':
      if (!params || typeof params.name !== 'string') return err(-32602, 'missing tool name');
      return ok(await callTool(params.name, params.arguments, ctx));
    default: return err(-32601, `method not found: ${method}`);
  }
}

export function serve({ input = process.stdin, output = process.stdout, ctx = { catalogue: loadCatalogue() } } = {}) {
  const rl = createInterface({ input });
  const pending = new Set();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })}\n`); return; }
    const p = handle(msg, ctx).then((res) => { if (res) output.write(`${JSON.stringify(res)}\n`); }).finally(() => pending.delete(p));
    pending.add(p);
  });
  rl.on('close', () => Promise.all(pending).then(() => {}));
}

// npm links bin files as symlinks, so compare real paths.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) serve();
