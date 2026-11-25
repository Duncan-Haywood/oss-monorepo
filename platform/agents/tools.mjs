#!/usr/bin/env node
/**
 * One command-line entry point to every tool in `ventures/`, for AI agents (and
 * people) working in a clone of this repository.
 *
 *   node platform/agents/tools.mjs search roof bid          # find a tool by words
 *   node platform/agents/tools.mjs describe <slug>          # its engine: functions, parameters, defaults
 *   node platform/agents/tools.mjs call <slug> <fn> --input '{"need":20000}'
 *   node platform/agents/tools.mjs call <slug> analyze --stdin < export.csv
 *   node platform/agents/tools.mjs run <slug> -- --help     # the tool's own cli.mjs, if it has one
 *   node platform/agents/tools.mjs mcp                      # the same four verbs as a stdio MCP server
 *
 * Why this exists: every tool's arithmetic already lives in a pure ES module
 * beside its page (`calc.mjs`, `engine.mjs`, ...), but only ~170 of ~1,300
 * ship a `cli.mjs`, so an agent acting for someone could reach most of them
 * only by driving a browser. The page's `<script type="module">` names the
 * modules it computes with; this file imports those same modules and calls
 * their exported functions with JSON arguments. No per-tool code, so every new
 * tool is covered the day it lands.
 *
 * Safety: a module is importable only if everything it pulls in is a sibling
 * file or a `node:` builtin, none of it imports a network or process module,
 * and none of it calls fetch/WebSocket/eval — the same gate as the MCP bundle
 * (platform/distribution/mcp.mjs). In `mcp` mode each call runs in a child
 * process with a timeout and an output cap. Zero dependencies.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closure } from '../distribution/npm.mjs';
import { forbiddenImports } from '../distribution/mcp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');
// The page URL an agent is handed. It follows the build's own origin
// (platform/pages/build.mjs DEFAULT_BASE_URL, read like lighthouse.mjs reads it,
// since importing the 6,000-line build would run its setup). Until 2026-11-15 this
// was a literal naming the GitHub Pages address, which since 2026-10-29 serves only
// redirect stubs: an agent that fetched the URL got a stub, not the tool.
export const SITE =
  readFileSync(path.join(REPO_ROOT, 'platform', 'pages', 'build.mjs'), 'utf8').match(/export const DEFAULT_BASE_URL = '([^']+)'/)?.[1] ??
  'https://marisstella.app/';
export const SOURCE = 'https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/';
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const TIMEOUT_MS = 20_000;
export const MAX_OUTPUT = 200_000;
const RISKY_SRC = /\bfetch\s*\(|\bWebSocket\b|process\.binding|\beval\s*\(|new Function\s*\(/;
// Imported by pages but not part of what a tool computes.
const NOT_ENGINE = new Set(['usage.mjs', 'share.mjs', 'byok.mjs', 'ai.mjs']);
const FALLBACK_ENGINES = ['calc.mjs', 'engine.mjs', 'calculator.mjs', 'check.mjs', 'analyze.mjs'];

const ventureDir = (slug, root = REPO_ROOT) => path.join(root, 'ventures', slug);
const read = (file) => fs.readFile(file, 'utf8').catch(() => null);
const decodeEntities = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** `<title>` and meta description of a page, entity-decoded. */
export function pageMeta(html) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const desc = /<meta\s+name=["']description["']\s+content=(["'])([\s\S]*?)\1/i.exec(html)?.[2] ?? '';
  return { title: decodeEntities(title.replace(/\s+/g, ' ').trim()), description: decodeEntities(desc.replace(/\s+/g, ' ').trim()) };
}

/** Sibling modules a page's inline module scripts import, minus usage/share plumbing. */
export function pageEngines(html) {
  const out = new Set();
  for (const m of html.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const s of m[1].matchAll(/\bfrom\s*["']\.\/([a-z0-9][a-z0-9._-]*\.mjs)["']/gi)) if (!NOT_ENGINE.has(s[1])) out.add(s[1]);
  }
  return [...out];
}

/** Every venture directory that has a page, as { slug, title, description }. */
export async function catalogue(root = REPO_ROOT) {
  const out = [];
  const entries = await fs.readdir(path.join(root, 'ventures'), { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory() || !SLUG_RE.test(e.name)) continue;
    const html = await read(path.join(root, 'ventures', e.name, 'index.html'));
    if (html === null) continue;
    out.push({ slug: e.name, ...pageMeta(html) });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Rank catalogue entries by how many query words they contain; every word must match. */
export function search(entries, query, limit = 20) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const t of entries) {
    const slug = t.slug.toLowerCase();
    const hay = `${slug} ${t.title} ${t.description}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    const score = words.reduce((n, w) => n + (slug.includes(w) ? 3 : 0) + (t.title.toLowerCase().includes(w) ? 2 : 0), 0);
    scored.push({ t, score });
  }
  scored.sort((a, b) => b.score - a.score || a.t.slug.localeCompare(b.t.slug));
  return { total: scored.length, tools: scored.slice(0, Math.max(1, limit)).map(({ t }) => ({ ...t, url: `${SITE}${t.slug}/` })) };
}

/** null if the module and everything it imports pass the safety gate, else the reason. */
export async function gate(dir, rel) {
  const c = await closure(dir, rel);
  if (c.skip) return c.skip;
  for (const f of c.files) {
    const src = await read(path.join(dir, f));
    const bad = forbiddenImports(src);
    if (bad.length) return `${f} imports ${bad.join(', ')}`;
    if (RISKY_SRC.test(src)) return `${f} uses fetch/WebSocket/eval`;
  }
  return null;
}

/** Engine modules of a tool: [{ module, skip? }], page-imported first, then the conventional names. */
export async function engines(slug, root = REPO_ROOT) {
  const dir = ventureDir(slug, root);
  const html = (await read(path.join(dir, 'index.html'))) ?? '';
  let mods = pageEngines(html);
  if (!mods.length) {
    for (const f of FALLBACK_ENGINES) if ((await read(path.join(dir, f))) !== null) mods.push(f);
  }
  const out = [];
  for (const m of mods) out.push({ module: m, ...(await gate(dir, m).then((skip) => (skip ? { skip } : {}))) });
  return out;
}

/** Text between the first `(` and its matching `)`, i.e. a function's parameter list. */
export function paramsOf(fn) {
  const src = Function.prototype.toString.call(fn);
  const arrow = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(src);
  if (arrow) return arrow[1];
  const start = src.indexOf('(');
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return src.slice(start + 1, i).replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

let splitCache = { src: null, lines: [] };

/** Comment block directly above `export ... name`, or the module's leading comment for name === null. */
export function commentFor(src, name) {
  // describe() asks once per export of the same module: split it once.
  if (splitCache.src !== src) splitCache = { src, lines: src.split('\n') };
  const lines = splitCache.lines;
  const take = (from, step) => {
    const out = [];
    for (let i = from; i >= 0 && i < lines.length; i += step) {
      const l = lines[i].trim();
      if (/^(\/\/|\/\*\*?|\*)/.test(l) || (out.length && l.endsWith('*/'))) out.push(l);
      else break;
    }
    if (step < 0) out.reverse();
    return out
      .map((l) => l.replace(/^\/\*\*?\s?|\*\/$|^\*\s?|^\/\/\s?/g, '').trimEnd())
      .join('\n')
      .trim();
  };
  if (name === null) return take(lines.findIndex((l) => l.trim() !== '' && !l.startsWith('#!')), 1);
  const re = new RegExp(`^\\s*export\\s+(?:async\\s+)?(?:function\\*?|const|let|class)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const at = lines.findIndex((l) => l.includes(name) && re.test(l));
  return at > 0 ? take(at - 1, -1) : '';
}

/** JSON.stringify that keeps Maps, Sets, non-finite numbers and BigInts readable and drops functions. */
export function toJson(value, space = 2) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (_k, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
      if (typeof v === 'function') return undefined;
      if (v instanceof Map) return Object.fromEntries(v);
      if (v instanceof Set) return [...v];
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
      }
      return v;
    },
    space,
  );
}

function summariseValue(v) {
  const s = toJson(v, 0) ?? String(v);
  if (s.length <= 1500) return JSON.parse(s);
  if (Array.isArray(v)) return `[array of ${v.length}]`;
  if (v && typeof v === 'object') return `{object with keys: ${Object.keys(v).slice(0, 40).join(', ')}}`;
  return `${s.slice(0, 200)}…`;
}

/** What an agent needs to call a tool: page facts, each engine's functions and constants, its CLI if any, and the papers it implements. */
export async function describe(slug, root = REPO_ROOT, { example = false, timeoutMs = 8000 } = {}) {
  if (!SLUG_RE.test(slug)) throw new Error(`bad slug "${slug}"`);
  const dir = ventureDir(slug, root);
  const html = await read(path.join(dir, 'index.html'));
  if (html === null) throw new Error(`no tool "${slug}"; try: search <words>`);
  const out = { slug, ...pageMeta(html), url: `${SITE}${slug}/`, source: `${SOURCE}${slug}`, cli: null, engines: [] };
  if ((await read(path.join(dir, 'cli.mjs'))) !== null) out.cli = `node platform/agents/tools.mjs run ${slug} -- --help`;
  for (const e of await engines(slug, root)) {
    if (e.skip) {
      out.engines.push(e);
      continue;
    }
    const src = await read(path.join(dir, e.module));
    const mod = await import(pathToFileURL(path.join(dir, e.module)).href);
    const functions = [];
    const constants = {};
    for (const [name, v] of Object.entries(mod)) {
      if (typeof v === 'function') {
        const doc = commentFor(src, name);
        functions.push({ name: `${name}(${paramsOf(v)})`, ...(doc ? { doc } : {}) });
      } else if (name === 'PAPERS' && Array.isArray(v)) {
        // Research-algorithm tools cite their papers here (portfolio/research-tools/):
        // printed in full, never summarised, so an agent can credit the method.
        out.papers = [...(out.papers ?? []), ...JSON.parse(toJson(v, 0))];
      } else constants[name] = summariseValue(v);
    }
    out.engines.push({ module: e.module, about: commentFor(src, null), functions, constants });
  }
  if (example && out.engines.some((e) => !e.skip && e.functions.length)) {
    // In a child with a timeout: an engine that loops on its own sample must not hang the server.
    const r = await spawnNode([SELF, 'example', slug, '--root', root, '--compact'], { timeoutMs });
    let ex = null;
    try {
      ex = r.code === 0 ? JSON.parse(r.stdout) : null;
    } catch {}
    if (ex) {
      const note = ex.steps
        ? 'Two call_tool calls that ran on the sample the tool ships: the first parses the text, its result is the second call\'s first argument. Replace the text with yours.'
        : 'A call_tool call that ran on the inputs the tool ships; pass these fields and change what differs.';
      out.example = { note, ...ex };
    }
  }
  return out;
}

/**
 * Arguments for a call. `--args` is a JSON array of positional arguments;
 * `--input` is one JSON object, laid over the module's exported DEFAULTS when
 * it has them (which is what the page does with its form). `stdin`, when
 * given, goes first.
 */
export function buildArgs(mod, { args, input, stdin } = {}) {
  const out = [];
  if (stdin !== undefined) out.push(stdin);
  if (input !== undefined) {
    const obj = typeof input === 'string' ? JSON.parse(input) : input;
    const d = mod.DEFAULTS;
    out.push(d && typeof d === 'object' && !Array.isArray(d) && obj && typeof obj === 'object' && !Array.isArray(obj) ? { ...d, ...obj } : obj);
  }
  if (args !== undefined) {
    const arr = typeof args === 'string' ? JSON.parse(args) : args;
    if (!Array.isArray(arr)) throw new Error('--args must be a JSON array');
    out.push(...arr);
  }
  return out;
}

/** Import a tool's engine and call one exported function. Resolves { module, function, args, result }. */
export async function call(slug, fnName, opts = {}, root = REPO_ROOT) {
  if (!SLUG_RE.test(slug)) throw new Error(`bad slug "${slug}"`);
  const list = await engines(slug, root);
  if (!list.length) throw new Error(`"${slug}" has no engine module; try: describe ${slug}`);
  const wanted = opts.module ? list.filter((e) => e.module === opts.module) : list;
  if (!wanted.length) throw new Error(`"${slug}" has no engine ${opts.module}; it has ${list.map((e) => e.module).join(', ')}`);
  for (const e of wanted) {
    if (e.skip) continue;
    const mod = await import(pathToFileURL(path.join(ventureDir(slug, root), e.module)).href);
    if (typeof mod[fnName] !== 'function') continue;
    const args = buildArgs(mod, opts);
    const result = await mod[fnName](...args);
    return { module: e.module, function: fnName, args: opts.stdin !== undefined ? ['<stdin>', ...args.slice(1)] : args, result };
  }
  const skipped = wanted.filter((e) => e.skip).map((e) => `${e.module} (${e.skip})`);
  // Name what is there: an agent's first guess is usually `compute`, and
  // "try: describe" alone costs it another round trip to learn the real name.
  const names = [];
  for (const e of wanted) {
    if (e.skip) continue;
    const mod = await import(pathToFileURL(path.join(ventureDir(slug, root), e.module)).href);
    for (const [n, v] of Object.entries(mod)) if (typeof v === 'function') names.push(n);
  }
  const has = names.length ? `; it exports ${names.slice(0, 30).join(', ')}${names.length > 30 ? ', …' : ''}` : '';
  throw new Error(`no exported function "${fnName}" in ${slug}${has}${skipped.length ? `; not loaded: ${skipped.join(', ')}` : ''}; try: describe ${slug}`);
}

// ---- A verified first call ---------------------------------------------------
//
// describe lists every export, but the list does not say which one is the
// tool, nor whether DEFAULTS are that function's input or only its options
// (dog-grooming-profit-calculator's DEFAULTS are the options of
// analyze(services, opts); its services come from sampleServices()). So
// `example` tries the likely entry points on what the module itself ships
// (its DEFAULTS, a zero-argument sample*/example*/demo* function, a SAMPLE*
// string) and returns the first call that ran: no throw, a result, no NaN, no
// `ok: false`. It is a call that worked, run here, never a guess.

const ENTRY_FIRST = ['compute', 'calculate', 'calc', 'analyze', 'analyse', 'estimate', 'evaluate', 'run', 'simulate', 'plan', 'quote', 'price', 'check', 'audit', 'score', 'summarize', 'summarise'];
const ENTRY_RE = /^(compute|calculate|calc|analy[sz]e|estimate|evaluate|run|simulate|plan|quote|price|check|audit|lint|scan|score|summari[sz]e|report|assess|compare|rank|optimi[sz]e|solve|project|forecast|model|grade|review|validate|classify|detect|inspect|diagnose|reconcile|match|find|build|size|cost)/i;
// The tax and finance tools name their entry for what it returns: contributionLimitOutcome, ...
const ENTRY_SUFFIX_RE = /[a-z](Outcome|Result|Report|Summary|Quote|Bid|Estimate|Plan|Analysis)$/;
const PARSE_RE = /^(parse|read|load|normali[sz]e)/i;
const SAMPLE_FN_RE = /^(sample|example|demo)/i;
const SAMPLE_CONST_RE = /^(SAMPLE|EXAMPLE|DEMO)/;
export const EXAMPLE_MAX_CHARS = 4000;

function hasNaN(v, seen = new Set()) {
  if (typeof v === 'number') return Number.isNaN(v);
  if (v && typeof v === 'object') {
    if (seen.has(v)) return false;
    seen.add(v);
    return Object.values(v).some((x) => hasNaN(x, seen));
  }
  return false;
}

function hasNonZero(v, seen = new Set()) {
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  if (v && typeof v === 'object') {
    if (seen.has(v)) return false;
    seen.add(v);
    return Object.values(v).some((x) => hasNonZero(x, seen));
  }
  return false;
}

/** Whether a call's result looks like an answer rather than a mismatch or a refusal. */
export function usableResult(r) {
  if (r === undefined || r === null || hasNaN(r)) return false;
  if (r && typeof r === 'object' && !Array.isArray(r) && (r.ok === false || (r.error && typeof r.error !== 'number'))) return false;
  return true;
}

/** Ordered entry-point candidates among a module's exports. */
export function entryCandidates(mod) {
  const fns = Object.entries(mod).filter(([n, v]) => typeof v === 'function' && n !== 'default');
  const first = ENTRY_FIRST.filter((n) => typeof mod[n] === 'function');
  const rest = fns.map(([n]) => n).filter((n) => !first.includes(n) && (ENTRY_RE.test(n) || ENTRY_SUFFIX_RE.test(n)));
  return [...first, ...rest];
}

const fits = (v) => (toJson(v, 0) ?? '').length <= EXAMPLE_MAX_CHARS;
const roundTrip = (v) => JSON.parse(toJson(v, 0));

/** Resolves { module, function, input?, args?, text? } for the first call that ran, or null. */
export async function findExample(slug, root = REPO_ROOT) {
  if (!SLUG_RE.test(slug)) throw new Error(`bad slug "${slug}"`);
  const tryCall = async (fn, args) => {
    try {
      return usableResult(await fn(...args));
    } catch {
      return false;
    }
  };
  for (const e of await engines(slug, root)) {
    if (e.skip) continue;
    const mod = await import(pathToFileURL(path.join(ventureDir(slug, root), e.module)).href);
    const names = entryCandidates(mod);
    const D = mod.DEFAULTS && typeof mod.DEFAULTS === 'object' && !Array.isArray(mod.DEFAULTS) ? mod.DEFAULTS : null;
    // 1. DEFAULTS are the input: `call_tool {function, input: {}}` lays them in.
    if (D) for (const n of names) if (await tryCall(mod[n], [{ ...D }])) return { module: e.module, function: n, input: {} };
    // 2. A sample the module ships, passed as the first argument (DEFAULTS after it as options).
    const samples = [];
    for (const [n, v] of Object.entries(mod)) {
      if (typeof v === 'function' && SAMPLE_FN_RE.test(n) && v.length === 0) {
        try {
          const s = await v();
          if (s !== undefined && s !== null && fits(s)) samples.push(typeof s === 'string' ? s : roundTrip(s));
        } catch {}
      } else if (SAMPLE_CONST_RE.test(n) && v !== null && typeof v !== 'function' && fits(v) && (typeof v !== 'string' || v.trim())) samples.push(typeof v === 'string' ? v : roundTrip(v));
    }
    const parsers = Object.keys(mod).filter((n) => typeof mod[n] === 'function' && PARSE_RE.test(n));
    for (const s of samples) {
      const text = typeof s === 'string';
      for (const n of names) {
        if (await tryCall(mod[n], [s])) return { module: e.module, function: n, ...(text ? { text: s } : { args: [s] }) };
        if (D && !text && (await tryCall(mod[n], [s, { ...D }]))) return { module: e.module, function: n, args: [s, roundTrip(D)] };
      }
      // 3. The page's own pipeline: pasted text through a parse step, then the entry function.
      if (!text) continue;
      for (const p of parsers) {
        let parsed;
        try {
          parsed = await mod[p](s);
        } catch {
          continue;
        }
        if (!usableResult(parsed)) continue;
        parsed = roundTrip(parsed);
        // A parser often wraps its rows ({ rows, warnings }): try the whole result, then each array in it.
        const feeds = [['<result of step 1>', parsed]];
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) if (Array.isArray(v) && v.length) feeds.push([`<result of step 1>.${k}`, v]);
        }
        for (const [label, feed] of feeds) {
          for (const n of names) {
            if (n === p) continue;
            const tail = (await tryCall(mod[n], [feed])) ? [] : D && (await tryCall(mod[n], [feed, { ...D }])) ? [roundTrip(D)] : null;
            if (tail) return { module: e.module, steps: [{ function: p, text: s }, { function: n, args: [label, ...tail] }] };
          }
        }
      }
    }
    // 4. No DEFAULTS and no sample: an entry function whose own defaults give a non-zero answer
    // on an empty input object (all zeros would show the shape but teach nothing).
    if (!D) {
      for (const n of names) {
        let r;
        try {
          r = await mod[n]({});
        } catch {
          continue;
        }
        if (usableResult(r) && hasNonZero(r)) return { module: e.module, function: n, input: {} };
      }
    }
  }
  return null;
}

/** Spawn `node <args>` with optional stdin, a timeout and an output cap. */
export function spawnNode(args, { stdin = '', timeoutMs = TIMEOUT_MS, maxOutput = MAX_OUTPUT, cwd = process.cwd() } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } });
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    const add = (cur, chunk) => {
      const next = cur + chunk;
      if (next.length > maxOutput) {
        truncated = true;
        return next.slice(0, maxOutput);
      }
      return next;
    };
    child.stdout.on('data', (c) => (stdout = add(stdout, c)));
    child.stderr.on('data', (c) => (stderr = add(stderr, c)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: e.message, truncated, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, truncated, timedOut });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(String(stdin));
  });
}

// ---- MCP (stdio, newline-delimited JSON-RPC) --------------------------------

export const PROTOCOL_VERSION = '2025-06-18';
const SELF = fileURLToPath(import.meta.url);
const DISCLAIMER = 'Results are estimates from typed assumptions, not legal, tax, financial or professional advice.';

export const MCP_TOOLS = [
  {
    name: 'search_tools',
    description: 'Search ~1,300 free, open-source calculators, estimators and checkers (small business, trades, tax, e-commerce, DevOps, security). Every query word must match the slug, title or description. Returns slug, title, description and page URL.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['query'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'describe_tool',
    description: "Show how to call one tool: its engine modules' exported functions with parameter lists and doc comments, exported constants such as DEFAULTS (the page's default inputs) and sample inputs, whether it has its own CLI, and `example`: a call_tool call that was run on the tool's own sample inputs and worked, when one exists.",
    inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'call_tool',
    description: `Call one exported function of a tool's engine and return its result as JSON. Pass \`input\` (one object, merged over the module's DEFAULTS when it has them) and/or \`args\` (positional arguments), and \`text\` for functions that take pasted text or CSV as their first argument. Runs locally with a timeout. ${DISCLAIMER}`,
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        function: { type: 'string' },
        input: { type: 'object' },
        args: { type: 'array' },
        text: { type: 'string', description: 'Passed as the first argument (CSV, a pasted report, a config file).' },
        module: { type: 'string', description: 'Engine file, when a tool has more than one and names collide.' },
      },
      required: ['slug', 'function'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'run_cli',
    description: `Run a tool's own command-line interface (only tools whose describe_tool shows a cli) with an array of arguments, no shell, and optional stdin. ${DISCLAIMER}`,
    inputSchema: { type: 'object', properties: { slug: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, stdin: { type: 'string' } }, required: ['slug'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];

const mcpText = (s, isError = false) => ({ content: [{ type: 'text', text: s }], ...(isError ? { isError: true } : {}) });

function formatRun(r, timeoutMs = TIMEOUT_MS) {
  const parts = [];
  if (r.stdout) parts.push(r.stdout.trimEnd());
  if (r.stderr) parts.push(`[stderr]\n${r.stderr.trimEnd()}`);
  if (r.timedOut) parts.push(`[timed out after ${timeoutMs / 1000}s]`);
  if (r.truncated) parts.push('[output truncated]');
  if (r.code !== 0) parts.push(`[exit ${r.code}]`);
  return parts.join('\n');
}

export async function mcpCall(name, a = {}, ctx = {}) {
  const root = ctx.root ?? REPO_ROOT;
  a = a ?? {};
  try {
    if (name === 'search_tools') {
      ctx.cat ??= await catalogue(root);
      return mcpText(toJson(search(ctx.cat, a.query, Math.min(Number(a.limit) || 20, 100))));
    }
    const slug = String(a.slug ?? '');
    if (!SLUG_RE.test(slug) || (await read(path.join(ventureDir(slug, root), 'index.html'))) === null) return mcpText(`unknown tool "${slug}"; use search_tools`, true);
    if (name === 'describe_tool') return mcpText(toJson(await describe(slug, root, { example: true })));
    if (name === 'call_tool') {
      const argv = [SELF, 'call', slug, String(a.function ?? ''), '--root', root];
      if (a.input !== undefined) argv.push('--input', JSON.stringify(a.input));
      if (a.args !== undefined) argv.push('--args', JSON.stringify(a.args));
      if (a.module !== undefined) argv.push('--module', String(a.module));
      if (a.text !== undefined) argv.push('--stdin');
      const r = await spawnNode(argv, { stdin: a.text ?? '', timeoutMs: ctx.timeoutMs });
      return mcpText(formatRun(r, ctx.timeoutMs), r.code !== 0);
    }
    if (name === 'run_cli') {
      if (a.args !== undefined && (!Array.isArray(a.args) || a.args.some((x) => typeof x !== 'string'))) return mcpText('args must be an array of strings', true);
      const cli = path.join(ventureDir(slug, root), 'cli.mjs');
      if ((await read(cli)) === null) return mcpText(`"${slug}" has no cli.mjs; use call_tool`, true);
      const r = await spawnNode([cli, ...(a.args ?? [])], { stdin: a.stdin ?? '', timeoutMs: ctx.timeoutMs });
      return mcpText(formatRun(r, ctx.timeoutMs), r.code !== 0);
    }
    return mcpText(`unknown tool ${name}`, true);
  } catch (e) {
    return mcpText(String(e?.message ?? e), true);
  }
}

/** One JSON-RPC message in, a response (or null for a notification) out. */
export async function handle(msg, ctx = {}) {
  const { id, method, params } = msg ?? {};
  if (id === undefined) return null;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'monorepo-projects-tools', version: '0.1.0' },
        instructions: `Free, open-source (MIT) calculators and checkers. search_tools, then describe_tool, then call_tool. ${DISCLAIMER} Each result's page URL is where a person can check the same numbers.`,
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: MCP_TOOLS });
    case 'tools/call':
      if (!params || typeof params.name !== 'string') return { jsonrpc: '2.0', id, error: { code: -32602, message: 'missing tool name' } };
      return ok(await mcpCall(params.name, params.arguments, ctx));
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
  }
}

export function serve({ input = process.stdin, output = process.stdout, ctx = {} } = {}) {
  const rl = createInterface({ input });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })}\n`);
      return;
    }
    handle(msg, ctx).then((res) => res && output.write(`${JSON.stringify(res)}\n`));
  });
}

// ---- command line -----------------------------------------------------------

export const USAGE = `Search, inspect and call the ~1,300 free tools in ventures/ from a terminal or an agent.

Usage:
  node platform/agents/tools.mjs search <words...> [--limit N]
  node platform/agents/tools.mjs describe <slug>
  node platform/agents/tools.mjs example <slug>
  node platform/agents/tools.mjs call <slug> <function> [--input JSON] [--args JSON] [--stdin] [--module FILE]
  node platform/agents/tools.mjs run <slug> [-- <the tool's own CLI arguments>]
  node platform/agents/tools.mjs mcp

  search    every word must match; prints JSON { total, tools: [{ slug, title, description, url }] }
  describe  prints JSON: each engine module's functions (with parameters and doc comments),
            constants such as DEFAULTS, the tool's own CLI if it has one, and a verified example call
  example   prints the first call that ran on the tool's own DEFAULTS or samples, or null
  call      prints the function's result as JSON
              --input   one object; merged over the module's DEFAULTS when it exports them
              --args    a JSON array of positional arguments (after --input, if both)
              --stdin   read text (CSV, a pasted report) and pass it as the first argument
  run       runs ventures/<slug>/cli.mjs with your arguments and stdin
  mcp       stdio MCP server with search_tools, describe_tool, call_tool, run_cli

Example:
  node platform/agents/tools.mjs search 401k loan
  node platform/agents/tools.mjs call 401k-loan-vs-withdrawal-calculator analyze --input '{"need":20000}'

${DISCLAIMER}
`;

export function parseArgv(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      o.rest = argv.slice(i + 1);
      break;
    }
    if (a === '--stdin' || a === '--compact') o[a.slice(2)] = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (['--input', '--args', '--module', '--limit', '--root'].includes(a)) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o._.push(a);
  }
  return o;
}

async function readStdin(stream = process.stdin) {
  let s = '';
  for await (const c of stream) s += c;
  return s;
}

export async function main(argv = process.argv.slice(2), { out = (s) => process.stdout.write(s), stdin = readStdin } = {}) {
  let o;
  try {
    o = parseArgv(argv);
  } catch (e) {
    out(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  const [cmd, ...pos] = o._;
  const root = o.root ? path.resolve(o.root) : REPO_ROOT;
  const space = o.compact ? 0 : 2;
  if (o.help || !cmd) {
    out(USAGE);
    return o.help ? 0 : 2;
  }
  try {
    if (cmd === 'search') out(`${toJson(search(await catalogue(root), pos.join(' '), Number(o.limit) || 20), space)}\n`);
    else if (cmd === 'describe') {
      if (pos.length !== 1) throw new Error('describe takes one slug');
      out(`${toJson(await describe(pos[0], root, { example: true }), space)}\n`);
    } else if (cmd === 'example') {
      if (pos.length !== 1) throw new Error('example takes one slug');
      // An engine that logs while it runs must not corrupt the one JSON line describe parses.
      const quiet = ['log', 'info', 'warn', 'debug'].map((k) => [k, console[k]]);
      for (const [k] of quiet) console[k] = () => {};
      let ex;
      try {
        ex = await findExample(pos[0], root);
      } finally {
        for (const [k, f] of quiet) console[k] = f;
      }
      out(`${toJson(ex, space)}\n`);
    } else if (cmd === 'call') {
      if (pos.length !== 2) throw new Error('call takes <slug> <function>');
      const r = await call(pos[0], pos[1], { input: o.input, args: o.args, module: o.module, stdin: o.stdin ? await stdin() : undefined }, root);
      out(`${toJson(r, space)}\n`);
    } else if (cmd === 'run') {
      if (pos.length !== 1 || !SLUG_RE.test(pos[0])) throw new Error('run takes one slug, then -- and its arguments');
      const cli = path.join(ventureDir(pos[0], root), 'cli.mjs');
      if ((await read(cli)) === null) throw new Error(`"${pos[0]}" has no cli.mjs; use: call ${pos[0]} <function>`);
      const child = spawn(process.execPath, [cli, ...(o.rest ?? [])], { stdio: 'inherit' });
      return await new Promise((res) => child.on('close', (c) => res(c ?? 1)));
    } else if (cmd === 'mcp') {
      serve({ ctx: { root } });
      return null;
    } else throw new Error(`unknown command "${cmd}"`);
    return 0;
  } catch (e) {
    process.stderr.write(`${e?.message ?? e}\n`);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(SELF)) {
  const code = await main();
  if (code !== null) process.exitCode = code;
}
