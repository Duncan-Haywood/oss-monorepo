#!/usr/bin/env node
// How many catalogue tools hand an agent a first call that works?
//
//   node platform/agents/example_coverage.mjs            # counts by kind
//   node platform/agents/example_coverage.mjs --list null # the slugs of one kind
//   node platform/agents/example_coverage.mjs --json      # every slug and its kind
//
// Runs `tools.mjs example <slug>` for every tool, eight at a time, each in its
// own child with a 10 s timeout, and sorts the answers into kinds:
//   input   DEFAULTS are the input: call_tool {function, input: {}} runs
//   args    a sample the module ships, as positional arguments
//   text    a SAMPLE string the module ships, as `text`
//   steps   a parse step then the entry function (see findExample in tools.mjs)
//   form    the values and "e.g." placeholders the tool's page form shows
//   null    nothing the module ships ran through an entry function
//   failed  the child threw or timed out
// A report tool, not a CI gate: "null" is not a defect in a tool, only a place
// where an agent has to read the doc comments to build its first call.
import { catalogue, spawnNode } from './tools.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tools.mjs');

export function kindOf(code, stdout) {
  if (code !== 0) return 'failed';
  let ex;
  try {
    ex = JSON.parse(stdout);
  } catch {
    return 'failed';
  }
  if (ex === null) return 'null';
  if (ex.steps) return 'steps';
  if (ex.from === 'page form') return 'form';
  if (ex.input) return 'input';
  if (ex.text !== undefined) return 'text';
  if (ex.args) return 'args';
  return 'failed';
}

export async function coverage({ concurrency = 8, timeoutMs = 10_000 } = {}) {
  const tools = await catalogue();
  const out = new Array(tools.length);
  let next = 0;
  const worker = async () => {
    while (next < tools.length) {
      const i = next++;
      const r = await spawnNode([SELF_TOOLS, 'example', tools[i].slug, '--compact'], { timeoutMs });
      out[i] = { slug: tools[i].slug, kind: kindOf(r.timedOut ? 1 : r.code, r.stdout) };
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const rows = await coverage();
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(rows, null, 1)}\n`);
  else if (argv.includes('--list')) {
    const k = argv[argv.indexOf('--list') + 1];
    for (const r of rows) if (r.kind === k) process.stdout.write(`${r.slug}\n`);
  } else {
    const counts = {};
    for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    const ok = rows.length - (counts.null ?? 0) - (counts.failed ?? 0);
    process.stdout.write(`${ok} of ${rows.length} tools have a verified example call (${((100 * ok) / rows.length).toFixed(1)}%)\n`);
    for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) process.stdout.write(`  ${k.padEnd(7)} ${n}\n`);
  }
}
