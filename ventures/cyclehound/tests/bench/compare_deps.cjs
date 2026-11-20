// Compare `cyclehound --deps --depcheck` with depcheck on the same packages.
//
//   node compare_deps.cjs <depcheck install dir> <cyclehound binary> <root> [--out file.json]
//
// <depcheck install dir> holds node_modules/depcheck (npm i depcheck@1.4.7).
// depcheck runs once per package.json cyclehound finds under <root>, in a
// child process with NODE_PATH removed: depcheck resolves installed
// packages through it, so a machine's global tools would change its answer.
// With --safe-specials depcheck runs only its `bin` and `react17` specials,
// the two that read nothing but JSON: the others require() the project's
// webpack, jest, babel, eslint and other config files, which runs their
// code (use it on code you did not write).
// Prints each package where the two disagree and the totals; exits 1 on
// any disagreement.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [dcDir, bin, root] = process.argv.slice(2);
const outAt = process.argv.indexOf('--out');
const safe = process.argv.includes('--safe-specials');
if (!dcDir || !bin || !root) {
  console.error('usage: node compare_deps.cjs <depcheck dir> <cyclehound> <root> [--out f.json]');
  process.exit(2);
}
const absRoot = path.resolve(root);

const t0 = process.hrtime.bigint();
const ch = spawnSync(bin, ['--deps', '--depcheck', '--json', '--warn', absRoot], {
  encoding: 'utf8', maxBuffer: 1 << 30,
});
const chSecs = Number(process.hrtime.bigint() - t0) / 1e9;
if (ch.status !== 0) { console.error(ch.stderr); process.exit(2); }
const ours = JSON.parse(ch.stdout);

// One child runs depcheck over every package, so its time is depcheck's.
const runner = `
const depcheck = require(${JSON.stringify(path.resolve(dcDir, 'node_modules/depcheck'))});
const dirs = JSON.parse(process.argv[1]);
const opts = process.argv[2] === 'safe'
  ? { specials: [depcheck.special.bin, depcheck.special.react17] } : {};
(async () => {
  const out = {};
  const t0 = process.hrtime.bigint();
  for (const d of dirs) {
    try {
      const r = await depcheck(d, opts);
      out[d] = { dependencies: r.dependencies, devDependencies: r.devDependencies,
                 missing: Object.keys(r.missing), invalidFiles: Object.keys(r.invalidFiles) };
    } catch (e) { out[d] = { error: String(e) }; }
  }
  out.__secs = Number(process.hrtime.bigint() - t0) / 1e9;
  out.__rssMB = process.memoryUsage().rss / 1e6;
  process.stdout.write(JSON.stringify(out));
})();`;
const dirs = ours.map((p) => path.dirname(path.resolve(absRoot, p.package)));
const env = { ...process.env };
delete env.NODE_PATH;
const dc = spawnSync(process.execPath, ['-e', runner, JSON.stringify(dirs), safe ? 'safe' : 'all'], {
  encoding: 'utf8', maxBuffer: 1 << 30, env,
});
if (dc.status !== 0) { console.error(dc.stderr); process.exit(2); }
const theirs = JSON.parse(dc.stdout);

const sort = (v) => [...v].sort();
const diff = (a, b) => a.filter((x) => !b.includes(x));
let agree = 0, differ = 0, findings = 0, invalid = 0, parseExplained = 0;
const rows = [];
for (const p of ours) {
  const d = path.dirname(path.resolve(absRoot, p.package));
  const t = theirs[d];
  const rel = path.relative(absRoot, d) || '.';
  if (!t || t.error) { console.log(`${rel}: depcheck failed: ${t && t.error}`); differ++; continue; }
  invalid += t.invalidFiles.length;
  const row = { package: rel, depcheckInvalidFiles: t.invalidFiles.map((f) => path.relative(d, f)) };
  let same = true;
  for (const [k, mine] of [['dependencies', p.dependencies], ['devDependencies', p.devDependencies], ['missing', Object.keys(p.missing)]]) {
    const a = sort(mine), b = sort(t[k]);
    findings += b.length;
    const onlyOurs = diff(a, b), onlyTheirs = diff(b, a);
    row[k] = { both: a.filter((x) => b.includes(x)), onlyCyclehound: onlyOurs, onlyDepcheck: onlyTheirs };
    // A use cyclehound sees only in files depcheck could not parse
    // explains "unused" (depcheck) or "missing" (cyclehound) on its own.
    const bad = new Set(t.invalidFiles.map((f) => path.relative(absRoot, f)));
    const seenOnlyInBad = (n) => (p.using[n] || []).length > 0
      && p.using[n].every((u) => bad.has(u.replace(/:\d+$/, '')));
    const explained = (k === 'missing' ? onlyOurs : onlyTheirs).filter(seenOnlyInBad);
    const rest = [onlyOurs, onlyTheirs].map((v) => v.filter((x) => !explained.includes(x)));
    row[k].explainedByParseFailure = explained;
    parseExplained += explained.length;
    if (rest[0].length || rest[1].length) {
      same = false;
      console.log(`${rel} ${k}: only cyclehound [${rest[0].join(', ')}], only depcheck [${rest[1].join(', ')}]`);
    }
  }
  if (same) agree++; else differ++;
  rows.push(row);
}
console.log(`${ours.length} packages: ${agree} agree, ${differ} differ; depcheck findings ${findings}; depcheck could not parse ${invalid} files, which alone explain ${parseExplained} differences`);
console.log(`time: cyclehound ${chSecs.toFixed(2)} s, depcheck ${theirs.__secs.toFixed(2)} s (${theirs.__rssMB.toFixed(0)} MB rss)`);
if (outAt > 0) fs.writeFileSync(process.argv[outAt + 1], JSON.stringify({ parseExplained, chSecs, dcSecs: theirs.__secs, dcRssMB: theirs.__rssMB, rows }, null, 1));
process.exit(differ ? 1 : 0);
