#!/usr/bin/env node
// tsconfig TypeScript 7 readiness check, command line.
//   node cli.mjs [tsconfig.json ...] [--json] [--strict] [--suggest]
// Follows relative and node_modules `extends`. Exit 0 no errors, 1 an error
// (or a warning with --strict), 2 bad arguments or an unreadable file.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { parseJsonc, lineCol, checkConfig, extendsList, suggestOptions } from './tsconfig7.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const known = new Set(['--json', '--strict', '--suggest', '--help']);
for (const f of flags) if (!known.has(f)) { console.error(`Unknown flag ${f}`); process.exit(2); }
if (flags.has('--help')) {
  console.log('Usage: node cli.mjs [tsconfig.json ...] [--json] [--strict] [--suggest]\nChecks each tsconfig for options TypeScript 7 removed and defaults TypeScript 6/7 changed.');
  process.exit(0);
}
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) files.push('tsconfig.json');

function readConfig(path) {
  const text = readFileSync(path, 'utf8');
  const r = parseJsonc(text);
  if (r.error) { const { line, col } = lineCol(text, r.offset); throw new Error(`${path}:${line}:${col}: ${r.error}`); }
  return r.value;
}

// tsc's extends lookup: a path (relative or absolute) with or without .json,
// or a package specifier resolved through node_modules (package.json "tsconfig"
// field, then tsconfig.json, then the subpath with .json added).
export function resolveExtends(spec, fromDir) {
  const tries = [];
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const p = resolve(fromDir, spec);
    tries.push(p, `${p}.json`);
  } else {
    for (let d = fromDir; ; d = dirname(d)) {
      const base = join(d, 'node_modules', spec);
      tries.push(`${base}.json`, join(base, 'tsconfig.json'), base);
      try {
        const pkg = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
        if (typeof pkg.tsconfig === 'string') tries.unshift(join(base, pkg.tsconfig));
      } catch { /* not a package root */ }
      if (dirname(d) === d) break;
    }
  }
  return tries.find((t) => existsSync(t) && !t.endsWith('/') && !isDir(t)) || null;
}
function isDir(p) { try { readdirSync(p); return true; } catch { return false; } }

function loadChain(path) {
  const unresolved = []; const seen = new Set([resolve(path)]);
  // Nearest first. tsc applies an extends list in order with later entries
  // winning, and each base carries its own bases underneath it, so for
  // "extends": [a, b] the order is b, b's bases, a, a's bases.
  const walk = (cfg, dir) => {
    const out = [];
    for (const spec of extendsList(cfg).reverse()) {
      const p = resolveExtends(spec, dir);
      if (!p) { unresolved.push(spec); continue; }
      if (seen.has(p)) continue;
      seen.add(p);
      const c = readConfig(p);
      out.push({ name: spec, config: c }, ...walk(c, dirname(p)));
    }
    return out;
  };
  const config = readConfig(path);
  const bases = walk(config, dirname(resolve(path)));
  return { config, bases, unresolved };
}

// The @types packages tsc 5.9 would have loaded: node_modules/@types in the
// config's folder and every folder above it.
function typesPackages(dir) {
  const found = new Set();
  for (let d = resolve(dir); ; d = dirname(d)) {
    try { for (const n of readdirSync(join(d, 'node_modules', '@types'))) if (!n.startsWith('.')) found.add(n); } catch { /* none here */ }
    if (dirname(d) === d) return [...found].sort();
  }
}

function hasLibReplacementPackages(dir) {
  for (let d = resolve(dir); ; d = dirname(d)) {
    try { if (readdirSync(join(d, 'node_modules', '@typescript')).some((n) => n.startsWith('lib-'))) return true; } catch { /* none here */ }
    if (dirname(d) === d) return false;
  }
}

let worst = 0; const out = [];
for (const f of files) {
  let chain;
  try { chain = loadChain(f); } catch (e) { console.error(e.message); process.exit(2); }
  const r = checkConfig(chain.config, { bases: chain.bases, unresolvedExtends: chain.unresolved, hasLibReplacementPackages: hasLibReplacementPackages(dirname(f)), typesPackages: typesPackages(dirname(f)) });
  const s = r.summary;
  if (s.errors || (flags.has('--strict') && s.warnings)) worst = 1;
  const entry = { file: f, ...s, findings: r.findings };
  if (flags.has('--suggest')) entry.suggested = suggestOptions(chain.config, r.effective);
  out.push(entry);
}

if (flags.has('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  for (const e of out) {
    console.log(`${e.file}: ${e.errors} error(s), ${e.warnings} warning(s), ${e.infos} note(s)`);
    for (const d of e.findings) {
      console.log(`  ${d.severity.toUpperCase().padEnd(7)} ${d.message}`);
      if (d.fix) console.log(`          fix: ${d.fix}`);
    }
    if (e.suggested) {
      console.log('\n  Suggested compilerOptions:');
      console.log(JSON.stringify(e.suggested.compilerOptions, null, 2).replace(/^/gm, '  '));
      for (const n of e.suggested.notes) console.log(`  - ${n}`);
    }
    console.log('');
  }
}
process.exit(worst);
