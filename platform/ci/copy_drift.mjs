#!/usr/bin/env node
// Copy drift: functions vendored into many ventures whose copies no longer agree.
//
//   node platform/ci/copy_drift.mjs [--min-ventures 4] [--max-dist 12]
//        [--name REGEX] [--skip REGEX] [--limit 40] [--json] [ventures-dir]
//
// Most ventures carry their own copy of a shared helper (usage.mjs's
// counters, csvCell, escapeHtml, share.mjs's decoders). When a run fixes one
// copy, nothing tells it about the other thirty. This report groups every
// named function by name, takes the most common exact body (by token, so
// whitespace and comments do not count) as the majority, and lists the
// minority bodies that are a few tokens away from it, with the token diff.
//
// A small diff is either a fix that never spread or a bug that crept into one
// copy. Read the diff and decide which: the report cannot. Found on its first
// run (2026-11-18): usageAllowed() in 39 ventures, where 3 copies had been
// given a try/catch around getItem on 2026-11-11 and the other 36 still let a
// throwing store raise out of recordEvent(), which the pages call inside the
// try that renders the answer (docs/posts/2026-11-18-the-fix-that-reached-three-of-thirty-nine-copies.md).
//
// It is a report for a person or an agent to triage, not a CI gate: most
// differences (a renamed parameter, a different number format) are on purpose.
//
// Needs acorn and acorn-walk (MIT). They are not a repository dependency; the
// script finds them in node_modules, NODE_PATH or /opt/node-tools, else says
// how to fetch them (`npm i --no-save acorn acorn-walk` in a scratch dir and
// point NODE_PATH at it).
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

export function loadAcorn() {
  const bases = [import.meta.url, ...(process.env.NODE_PATH || "").split(":").filter(Boolean).map((p) => join(p, "x")), "/opt/node-tools/node_modules/x"];
  for (const base of bases) {
    try {
      const req = createRequire(base);
      return { acorn: req("acorn"), walk: req("acorn-walk") };
    } catch {
      /* try the next place */
    }
  }
  return null;
}

// Bounded Levenshtein distance over token arrays; returns cap + 1 when over.
export function editDistance(a, b, cap = Infinity) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < low) low = cur[j];
    }
    if (low > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Token diff, compressed to the changed tokens and `context` tokens around them:
// "[-old]" from the majority, "[+new]" from the minority copy, "…" for a gap.
export function tokenDiff(a, b, context = 4) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) ops.push([" ", a[i++], j++]);
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) ops.push(["+", b[j++]]);
    else ops.push(["-", a[i++]]);
  }
  const keep = new Set();
  ops.forEach((op, k) => {
    if (op[0] !== " ") for (let d = -context; d <= context; d++) keep.add(k + d);
  });
  const out = [];
  let last = -2;
  ops.forEach((op, k) => {
    if (!keep.has(k)) return;
    if (k !== last + 1 && out.length) out.push("…");
    out.push(op[0] === " " ? op[1] : `[${op[0]}${op[1]}]`);
    last = k;
  });
  return out.join(" ");
}

// defs: [{ name, venture, file, line, tokens: [string] }]
// Returns drift candidates, most widely copied first.
export function findDrift(defs, { minVentures = 4, maxDist = 12, minMajority = 3 } = {}) {
  const byName = new Map();
  for (const d of defs) {
    if (!byName.has(d.name)) byName.set(d.name, []);
    byName.get(d.name).push(d);
  }
  const ventureCount = (list) => new Set(list.map((d) => d.venture)).size;
  const out = [];
  for (const [name, list] of byName) {
    if (ventureCount(list) < minVentures) continue;
    const bodies = new Map();
    for (const d of list) {
      const key = d.tokens.join("\u0000");
      if (!bodies.has(key)) bodies.set(key, []);
      bodies.get(key).push(d);
    }
    const groups = [...bodies.values()].sort((x, y) => ventureCount(y) - ventureCount(x) || x[0].file.localeCompare(y[0].file));
    const major = groups[0];
    const majorCount = ventureCount(major);
    if (majorCount < minMajority) continue;
    for (const g of groups.slice(1)) {
      const count = ventureCount(g);
      if (count * 2 >= majorCount) continue; // two real variants, not drift
      const dist = editDistance(major[0].tokens, g[0].tokens, maxDist);
      if (dist < 1 || dist > maxDist) continue;
      out.push({
        name,
        majorCount,
        minorCount: count,
        dist,
        major: `${major[0].file}:${major[0].line}`,
        minor: g.map((d) => `${d.file}:${d.line}`),
        diff: tokenDiff(major[0].tokens, g[0].tokens),
      });
    }
  }
  return out.sort((x, y) => y.majorCount - x.majorCount || x.dist - y.dist || x.name.localeCompare(y.name));
}

const SKIP_FILE = /\.test\.|\/tests?\/|vendor|\.min\.|node_modules/;

export function collectDefs(root, { acorn, walk }, { minTokens = 25 } = {}) {
  const listing = execFileSync("git", ["-C", root, "ls-files", "--", "*.js", "*.mjs"], { maxBuffer: 1 << 28 }).toString().trim().split("\n");
  const defs = [];
  let unparsed = 0;
  for (const rel of listing) {
    if (!rel || SKIP_FILE.test(rel)) continue;
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, "utf8");
    if (src.length > 400_000) continue;
    let ast = null;
    for (const sourceType of ["module", "script"]) {
      try {
        ast = acorn.parse(src, { ecmaVersion: "latest", sourceType, allowHashBang: true, allowReturnOutsideFunction: true, locations: true });
        break;
      } catch {
        /* next */
      }
    }
    if (!ast) {
      unparsed++;
      continue;
    }
    const venture = rel.split("/")[0];
    const add = (name, node) => {
      const tokens = [];
      try {
        for (const t of acorn.tokenizer(src.slice(node.start, node.end), { ecmaVersion: "latest" })) tokens.push(t.type.label === "string" ? JSON.stringify(t.value) : src.slice(node.start + t.start, node.start + t.end)); // quote style is not drift
      } catch {
        return;
      }
      if (tokens.length >= minTokens) defs.push({ name, venture, file: relative(ROOT, file), line: node.loc.start.line, tokens });
    };
    walk.full(ast, (n) => {
      if (n.type === "FunctionDeclaration" && n.id) add(n.id.name, n);
      else if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init && /Function/.test(n.init.type)) add(n.id.name, n.init);
    });
  }
  return { defs, unparsed };
}

function parseArgs(argv) {
  const opts = { minVentures: 4, maxDist: 12, limit: 40, json: false, name: null, skip: null, root: join(ROOT, "ventures") };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === "--json") opts.json = true;
    else if (a === "--min-ventures") opts.minVentures = Number(argv[++k]);
    else if (a === "--max-dist") opts.maxDist = Number(argv[++k]);
    else if (a === "--limit") opts.limit = Number(argv[++k]);
    else if (a === "--name") opts.name = new RegExp(argv[++k]);
    else if (a === "--skip") opts.skip = new RegExp(argv[++k]);
    else if (a === "-h" || a === "--help") opts.help = true;
    else opts.root = resolve(a);
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 6).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    process.exit(0);
  }
  const libs = loadAcorn();
  if (!libs) {
    console.error("copy_drift: acorn and acorn-walk not found. In a scratch dir: npm i --no-save acorn acorn-walk, then NODE_PATH=<dir>/node_modules node platform/ci/copy_drift.mjs");
    process.exit(2);
  }
  const { defs, unparsed } = collectDefs(opts.root, libs);
  let found = findDrift(defs, opts);
  if (opts.name) found = found.filter((f) => opts.name.test(f.name));
  if (opts.skip) found = found.filter((f) => !opts.skip.test(f.name));
  const total = found.length;
  found = found.slice(0, opts.limit);
  if (opts.json) {
    console.log(JSON.stringify({ functions: defs.length, unparsed, total, candidates: found }, null, 1));
  } else {
    for (const f of found) {
      console.log(`## ${f.name}: ${f.majorCount} ventures share one body; ${f.minorCount} differ by ${f.dist} token(s)`);
      console.log(`   majority  ${f.major}`);
      console.log(`   minority  ${f.minor.slice(0, 6).join(" ")}${f.minor.length > 6 ? ` (+${f.minor.length - 6} more)` : ""}`);
      console.log(`   ${f.diff}\n`);
    }
    console.log(`${defs.length} functions read (${unparsed} files unparsed); ${total} drift candidate(s), ${found.length} shown. [-x] is the majority's token, [+x] the minority's.`);
  }
}
