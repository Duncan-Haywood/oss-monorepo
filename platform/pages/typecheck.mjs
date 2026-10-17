// Type-checks the venture JavaScript files that opt in with `// @ts-check`.
//
// The rule of thumb is in PRODUCT_PLAYBOOK.md section 4: venture JS stays
// plain, build-free .mjs, and TypeScript is used only as a checker. A file
// opts in by starting with `// @ts-check`; JSDoc comments carry any types it
// needs. This script runs `tsc --noEmit` over the opted-in files of the
// ventures named on the command line (or of every venture), so a file that
// opted in keeps passing. Files without the pragma are not checked, which is
// what lets the portfolio adopt it one file at a time.
//
//   node platform/pages/typecheck.mjs [slug ...]   # exit 1 on any diagnostic
//   node platform/pages/typecheck.mjs --candidates <slug>
//       # which of the venture's files would pass if they opted in today
//
// tsc comes from $TSC, else a pinned typescript + @types/node installed once
// into a cache directory outside the repository ($TYPECHECK_TOOLS, default
// <tmpdir>/venture-typecheck-<version>). Nothing is written into the tree.
//
// Why the check is opt-in and not strict: measured over every venture on
// 2026-10-16 (portfolio/research/js-typecheck/), most of what tsc reports on
// unannotated files is missing annotations, not bugs. The pragma is the point
// where a file's author has added the few JSDoc types tsc needs, so what is
// left is worth a red build.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

export const TYPESCRIPT = "5.9.3";
export const TYPES_NODE = "22.18.0";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const GLOBALS = "platform/pages/typecheck-globals.d.ts";

// The same compiler options portfolio/research/js-typecheck/measure.mjs used.
// Without --checkJs (the default), tsc reports only on files carrying the
// pragma; `--candidates` adds it to ask what opting in would cost.
export function tscArgs(typesRoot, files, { checkJs = false } = {}) {
  return [
    "--allowJs", "--noEmit", "--pretty", "false", ...(checkJs ? ["--checkJs"] : []),
    "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext",
    "--lib", "es2023,dom,dom.iterable", "--types", "node", "--skipLibCheck",
    "--typeRoots", typesRoot,
    GLOBALS, ...files,
  ];
}

// A file opts in when `// @ts-check` (or `/* @ts-check */`) is among its
// leading comments, before any code -- where tsc itself looks for it.
export function optedIn(text) {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#!")) continue;
    if (/^(\/\/|\/\*)\s*@ts-check\b/.test(line)) return true;
    if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) continue;
    return false;
  }
  return false;
}

const DIAG = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

export function parseDiagnostics(stdout, cwd = ROOT) {
  const out = [];
  for (const line of stdout.split("\n")) {
    const m = DIAG.exec(line);
    if (m) out.push({ file: relative(cwd, resolve(cwd, m[1])), line: +m[2], col: +m[3], code: m[4], message: m[5] });
  }
  return out;
}

function walk(dir, keep, acc) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, keep, acc);
    else if (/\.m?js$/.test(name) && keep(name, readFileSync(p, "utf8"))) acc.push(relative(ROOT, p));
  }
  return acc;
}

function ventureFiles(slugs, keep) {
  const files = [];
  for (const slug of slugs) {
    const dir = join(ROOT, "ventures", slug);
    // TypeScript ventures run their own `tsc` against their tsconfig.
    if (!existsSync(dir) || existsSync(join(dir, "tsconfig.json"))) continue;
    walk(dir, keep, files);
  }
  return files.sort();
}

export const optedInFiles = (slugs) => ventureFiles(slugs, (_, text) => optedIn(text));

function tools() {
  if (process.env.TSC) {
    return { tsc: process.env.TSC, typesRoot: process.env.TYPES_ROOT ?? join(ROOT, "node_modules", "@types") };
  }
  const dir = process.env.TYPECHECK_TOOLS ?? join(tmpdir(), `venture-typecheck-${TYPESCRIPT}-${TYPES_NODE}`);
  const tsc = join(dir, "node_modules", ".bin", "tsc");
  if (!existsSync(tsc)) {
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--prefix", dir,
      `typescript@${TYPESCRIPT}`, `@types/node@${TYPES_NODE}`], { stdio: "inherit" });
  }
  return { tsc, typesRoot: join(dir, "node_modules", "@types") };
}

function candidates(slug) {
  const files = ventureFiles([slug], (name, text) => !/\.test\.m?js$/.test(name) && !optedIn(text));
  if (!files.length) {
    console.log(`typecheck: ${slug} has no file left to opt in`);
    return 0;
  }
  const { tsc, typesRoot } = tools();
  const r = spawnSync(tsc, tscArgs(typesRoot, files, { checkJs: true }), { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.error) throw r.error;
  const counts = new Map(files.map((f) => [f, 0]));
  for (const d of parseDiagnostics(r.stdout)) if (counts.has(d.file)) counts.set(d.file, counts.get(d.file) + 1);
  for (const [f, n] of counts) console.log(n ? `${String(n).padStart(4)}  ${f}` : `pass  ${f}  <- add // @ts-check`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === "--candidates") process.exit(candidates(process.argv[3]));
  const slugs = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(join(ROOT, "ventures"));
  const files = optedInFiles(slugs);
  if (!files.length) {
    console.log(`typecheck: no file opts in with // @ts-check in ${slugs.length} venture(s)`);
    process.exit(0);
  }
  const { tsc, typesRoot } = tools();
  const r = spawnSync(tsc, tscArgs(typesRoot, files), { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.error) throw r.error;
  const diags = parseDiagnostics(r.stdout);
  for (const d of diags) console.log(`${d.file}:${d.line}:${d.col} ${d.code} ${d.message}`);
  if (r.status !== 0 && !diags.length) {
    process.stdout.write(r.stdout + r.stderr);
    process.exit(1);
  }
  console.log(`typecheck: ${files.length} opted-in file(s), ${diags.length} diagnostic(s)`);
  process.exit(diags.length ? 1 : 0);
}
