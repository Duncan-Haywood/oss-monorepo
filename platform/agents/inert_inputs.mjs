#!/usr/bin/env node
// Which default inputs change nothing?
//
//   node platform/agents/inert_inputs.mjs                 # one line per inert key
//   node platform/agents/inert_inputs.mjs --json          # every finding as JSON
//   node platform/agents/inert_inputs.mjs --one <slug>    # one tool (what each child runs)
//
// For every tool whose verified first call is "DEFAULTS are the input"
// (`tools.mjs example` kind `input`), lay the DEFAULTS in, call the entry
// function, then change one key at a time and call it again: a finite non-zero
// number is multiplied by 2, 0.5 and 10 (and nudged by +1), zero becomes 1, 5
// and 100, a boolean is flipped. A key whose every change leaves the whole
// result identical is reported as inert.
//
// An inert key is a lead, not a verdict. It can be a real defect (the form
// sends `rate` and the engine reads `ratePct`, so the field a person types into
// is ignored), a key read only by the page and never by the engine, an option
// that matters only in a mode the defaults are not in, or a value clamped by
// another input. Each finding names the key and whether the page has a form
// control with that id or name, so a person can tell which it is quickly.
//
// A report tool, not a CI gate. The first sweep and its triage:
// docs/reports/2026-11-19-inert-inputs-sweep.md.
import { catalogue, findExample, spawnNode, engines, entryCandidates, variants, canon, REPO_ROOT } from './tools.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

const run = async (fn, input) => {
  try {
    return { ok: true, out: canon(await fn({ ...input })) };
  } catch (e) {
    return { ok: false, out: `throw:${e && e.message}` };
  }
};

/**
 * Which keys of `defaults` leave `fn`'s result unchanged under every variant,
 * both from the defaults and after any one other key has moved to its first
 * variant (so a fee that only counts once its count is above zero is not
 * reported). Null when `fn` throws on the defaults.
 */
export async function inertKeys(fn, defaults) {
  const base = await run(fn, defaults);
  if (!base.ok) return null;
  const keys = Object.keys(defaults).filter((k) => variants(defaults[k]).length);
  const movesFrom = async (from, fromOut, k) => {
    for (const x of variants(defaults[k])) if ((await run(fn, { ...from, [k]: x })).out !== fromOut) return true;
    return false;
  };
  const inert = [];
  for (const k of keys) if (!(await movesFrom(defaults, base.out, k))) inert.push(k);
  if (!inert.length) return inert;
  // Second look: does any one other key unlock it?
  const shifted = [];
  for (const j of keys) {
    const from = { ...defaults, [j]: variants(defaults[j])[0] };
    shifted.push([j, from, (await run(fn, from)).out]);
  }
  const still = [];
  for (const k of inert) {
    let moved = false;
    for (const [j, from, out] of shifted) if (j !== k && (await movesFrom(from, out, k))) {
      moved = true;
      break;
    }
    if (!moved) still.push(k);
  }
  return still;
}

/** Whether the tool's page has a form control whose id or name is `key`. */
export function pageHasControl(html, key) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<(input|select|textarea)\\b[^>]*\\b(id|name)\\s*=\\s*["']${esc}["']`, 'i').test(html);
}

/**
 * The inert keys of one tool: keys no entry function that runs on DEFAULTS
 * responds to (a page often calls two, such as calculate and
 * occupancyBreakeven, each reading half the form).
 */
export async function checkOne(slug, root = REPO_ROOT) {
  const ex = await findExample(slug, root);
  if (!ex || !ex.input) return { slug, skipped: ex ? 'not-input' : 'no-example' };
  const e = (await engines(slug, root)).find((x) => x.module === ex.module);
  const dir = path.join(root, 'ventures', slug);
  const mod = await import(pathToFileURL(path.join(dir, e.module)).href);
  const D = mod.DEFAULTS;
  if (!D || typeof D !== 'object' || Array.isArray(D)) return { slug, skipped: 'no-defaults' };
  let html = '';
  try {
    html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
  } catch {}
  // The entry-shaped exports, plus every export the page itself calls.
  const called = Object.keys(mod).filter((n) => typeof mod[n] === 'function' && new RegExp(`\\b${n}\\s*\\(`).test(html));
  const candidates = [...new Set([...entryCandidates(mod), ...called])];
  let inert = null;
  const functions = [];
  for (const n of candidates) {
    const keys = await inertKeys(mod[n], D);
    if (keys === null) continue;
    functions.push(n);
    inert = inert === null ? keys : inert.filter((k) => keys.includes(k));
  }
  if (inert === null) return { slug, skipped: 'base-threw' };
  return {
    slug,
    module: ex.module,
    function: ex.function,
    functions,
    keys: Object.keys(D).length,
    inert: inert.map((k) => ({ key: k, value: D[k], onPage: pageHasControl(html, k) })),
  };
}

export async function sweep({ concurrency = 8, timeoutMs = 60_000 } = {}) {
  const tools = await catalogue();
  const out = [];
  let next = 0;
  const worker = async () => {
    while (next < tools.length) {
      const slug = tools[next++].slug;
      const r = await spawnNode([SELF, '--one', slug], { timeoutMs });
      try {
        out.push(JSON.parse(r.stdout));
      } catch {
        out.push({ slug, skipped: r.timedOut ? 'timeout' : 'failed' });
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--one') {
    process.stdout.write(JSON.stringify(await checkOne(argv[1])));
    process.exit(0);
  }
  const rows = await sweep();
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(rows, null, 1)}\n`);
  else {
    const checked = rows.filter((r) => r.inert);
    let keys = 0;
    let n = 0;
    for (const r of checked) {
      keys += r.keys;
      for (const i of r.inert) {
        n++;
        process.stdout.write(`${r.slug}\t${r.function}\t${i.key}=${JSON.stringify(i.value)}\t${i.onPage ? 'on page' : 'not on page'}\n`);
      }
    }
    process.stdout.write(`${n} inert keys in ${checked.filter((r) => r.inert.length).length} of ${checked.length} tools checked (${keys} keys)\n`);
  }
}
