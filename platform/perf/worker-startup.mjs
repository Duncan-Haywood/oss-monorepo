// Worker cold-start bench: `wrangler check startup` on one or more built Workers, interleaved,
// next to a do-nothing Worker with the same compatibility date and flags (the floor).
//
// Usage: node platform/perf/worker-startup.mjs [--runs 9] [--wrangler <bin>] <wrangler.json|dir> ...
//   e.g. node platform/perf/worker-startup.mjs --wrangler ventures/cmmc/node_modules/.bin/wrangler \
//          /tmp/before/wrangler.json ventures/cmmc/apps/cmmc/dist/cmmc_workspace
//
// Prints, per Worker, the median "Active" startup CPU, its spread, and the median minus the floor
// (the part the Worker's own code costs). Why the floor: on 2026-11-28 a one-line nodejs_compat
// Worker read 35-44 ms in this container, the same as cmmc's whole 2.9 MB Worker (~40 ms), so a
// before/after pair that does not subtract it can read noise as a speed-up, or a real change as
// none (docs/history/cmmc-worker-cold-start-perf-2026-11-28.md). Copy the "before" dist/ aside
// before rebuilding: the bench takes paths, not git revisions. The Cloudflare Vite plugin's
// wrangler.json points `assets.directory` at `../client`, so copy `dist/client/` next to the
// copy as well (`cp -r dist/client <copy>/../client`), or wrangler stops with "does not exist".
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The "Active: 41.2 ms" figure from `wrangler check startup` output, or null. */
export const parseActive = (out) => {
  const m = /Active:\s*([0-9.]+)\s*ms/.exec(out);
  return m ? Number(m[1]) : null;
};

/** A wrangler.json for a Worker that does nothing, with the same runtime settings as `cfg`. */
export const floorConfig = (cfg) => ({
  name: 'startup-floor',
  main: 'index.js',
  ...(cfg.compatibility_date ? { compatibility_date: cfg.compatibility_date } : {}),
  ...(cfg.compatibility_flags ? { compatibility_flags: cfg.compatibility_flags } : {}),
  no_bundle: true,
});

export const resolveConfig = (p) => {
  const abs = path.resolve(p);
  return fs.statSync(abs).isDirectory() ? path.join(abs, 'wrangler.json') : abs;
};

function parseArgs(argv) {
  const o = { runs: 9, wrangler: 'npx', configs: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs') o.runs = Number(argv[++i]);
    // Resolved now, since each run's cwd is its config's directory.
    else if (argv[i] === '--wrangler') o.wrangler = argv[++i].includes('/') ? path.resolve(argv[i]) : argv[i];
    else if (argv[i] === '-h' || argv[i] === '--help') o.help = true;
    else o.configs.push(argv[i]);
  }
  return o;
}

function checkStartup(wrangler, config) {
  const args = ['check', 'startup', '-c', config, '--outfile', path.join(os.tmpdir(), 'worker-startup-bench.cpuprofile')];
  const [cmd, full] = wrangler === 'npx' ? ['npx', ['wrangler', ...args]] : [wrangler, args];
  // Run in the config's own directory: from elsewhere, wrangler 4.165 tries to detect a project
  // there and stops with "Could not detect a directory containing static files".
  const r = spawnSync(cmd, full, { encoding: 'utf8', timeout: 180_000, cwd: path.dirname(config) });
  return parseActive(`${r.stdout}${r.stderr}`);
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.configs.length || !(o.runs > 0)) {
    console.error('usage: node platform/perf/worker-startup.mjs [--runs 9] [--wrangler <bin>] <wrangler.json|dist dir> ...');
    process.exit(2);
  }
  const configs = o.configs.map(resolveConfig);
  for (const c of configs) if (!fs.existsSync(c)) { console.error(`worker-startup: no ${c} (run the app's vite build first)`); process.exit(2); }
  const floorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-floor-'));
  fs.writeFileSync(path.join(floorDir, 'index.js'), 'export default { fetch() { return new Response("ok"); } };\n');
  fs.writeFileSync(path.join(floorDir, 'wrangler.json'), JSON.stringify(floorConfig(JSON.parse(fs.readFileSync(configs[0], 'utf8')))));
  const rows = [['floor', path.join(floorDir, 'wrangler.json')], ...configs.map((c) => [c, c])];
  const got = new Map(rows.map(([label]) => [label, []]));
  for (let i = 0; i < o.runs; i++) {
    // Rotate the order each round so no Worker always runs first (or right after the floor).
    for (let j = 0; j < rows.length; j++) {
      const [label, cfg] = rows[(i + j) % rows.length];
      const v = checkStartup(o.wrangler, cfg);
      if (v == null) { console.error(`worker-startup: no "Active" figure from wrangler for ${cfg}; run \`wrangler check startup -c ${cfg}\` to see why`); process.exit(1); }
      got.get(label).push(v);
    }
  }
  const floor = median(got.get('floor'));
  console.log(`runs: ${o.runs} each, interleaved; "Active" startup CPU from wrangler check startup (ms)`);
  for (const [label] of rows) {
    const v = got.get(label);
    const m = median(v);
    const above = label === 'floor' ? '' : `  above floor ${(m - floor).toFixed(1)}`;
    console.log(`${m.toFixed(1).padStart(7)}  [${Math.min(...v).toFixed(1)}-${Math.max(...v).toFixed(1)}]${above}  ${label}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
