#!/usr/bin/env node
// What would `tsc --checkJs` find in the ventures' plain JavaScript?
//
// Runs the TypeScript compiler as a checker only (--noEmit) over each
// venture's own .mjs/.js files, one venture per process, and saves every
// diagnostic. Nothing is written into the tree and no file is changed.
//
//   node measure.mjs --tsc <path/to/tsc> --types-root <dir containing @types> --out results.json
//   node measure.mjs --recompute-from results.json        # summary only, no tsc needed
//
// Needs typescript and @types/node installed somewhere outside the repo
// (e.g. `npm i typescript@5.9.3 @types/node@22.18.0` in a scratch dir).
// Ventures that already carry a tsconfig.json are TypeScript projects with
// their own check and are skipped. Test files are left out: the question is
// what reaches users.

import { execFileSync, execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = resolve(new URL("../../..", import.meta.url).pathname);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1];
}

// The flags a venture would put in a shared jsconfig: no strictness, so a
// finding is a contradiction tsc can prove, not a missing annotation.
const FLAGS = [
  "--allowJs", "--checkJs", "--noEmit", "--pretty", "false",
  "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext",
  "--lib", "es2023,dom,dom.iterable", "--types", "node", "--skipLibCheck",
];

const LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

function ventureFiles() {
  const out = execFileSync("git", ["ls-files", "ventures/*.mjs", "ventures/*.js"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
  const bySlug = new Map();
  for (const f of out.split("\n").filter(Boolean)) {
    if (/\.test\.m?js$|(^|\/)(node_modules|dist|vendor)\//.test(f)) continue;
    const slug = f.split("/")[1];
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(f);
  }
  for (const slug of [...bySlug.keys()]) {
    if (existsSync(join(ROOT, "ventures", slug, "tsconfig.json"))) bySlug.delete(slug);
  }
  return bySlug;
}

async function check(tsc, typesRoot, slug, files) {
  const args = [...FLAGS, "--typeRoots", typesRoot, ...files];
  let stdout = "";
  try {
    ({ stdout } = await run(tsc, args, { cwd: ROOT, maxBuffer: 1 << 26 }));
  } catch (e) {
    stdout = e.stdout ?? "";
  }
  const diags = [];
  for (const l of stdout.split("\n")) {
    const m = LINE.exec(l);
    if (!m) continue;
    const file = relative(ROOT, resolve(ROOT, m[1]));
    // Imports pull in shared platform/ code; count only the venture's own files.
    if (!file.startsWith(`ventures/${slug}/`)) continue;
    diags.push({ file, line: +m[2], code: m[4], message: m[5] });
  }
  return { slug, files: files.length, diagnostics: diags };
}

// Buckets for the README's table. Assigned by code and message; the hand
// review of every bucket's members is in the README, not here.
export function category(d) {
  if (/globalPrivacyControl|doNotTrack/.test(d.message)) return "privacy-signal globals missing from lib.dom";
  if (d.code === "TS1117") return "duplicate object key";
  if (["TS2345", "TS2339"].includes(d.code) && /'(Element|EventTarget|HTMLElement|ParentNode)'/.test(d.message)) return "DOM element type not narrowed";
  if (d.code === "TS2339" && /on type '[^']*\|/.test(d.message)) return "union not narrowed before property access";
  if (d.code === "TS2339") return "property added after the object literal";
  if (["TS2367", "TS2551", "TS2353", "TS2741", "TS2739", "TS1131", "TS8032", "TS2322", "TS2561", "TS2559"].includes(d.code)) return "JSDoc or inferred shape disagrees with the code";
  if (["TS2362", "TS2363", "TS2365", "TS2356", "TS2349", "TS2554", "TS2538", "TS2769", "TS2345"].includes(d.code)) return "inference limit (tuples, default params, Date maths)";
  if (["TS2304", "TS2552", "TS2307", "TS17004"].includes(d.code)) return "classic-script globals, JSX, unresolved imports";
  if (["TS18047", "TS18048", "TS2532", "TS2531"].includes(d.code)) return "possibly null or undefined";
  return "other";
}

function summarise(results) {
  const ventures = results.ventures;
  const all = ventures.flatMap((v) => v.diagnostics);
  const byCode = {};
  for (const d of all) byCode[d.code] = (byCode[d.code] ?? 0) + 1;
  const files = ventures.reduce((n, v) => n + v.files, 0);
  const withAny = ventures.filter((v) => v.diagnostics.length).length;
  const filesWithAny = new Set(all.map((d) => d.file)).size;
  console.log(`tsc ${results.tsc_version}, ${results.date}`);
  console.log(`ventures checked: ${ventures.length} (${files} product files)`);
  console.log(`ventures with >=1 diagnostic: ${withAny}`);
  console.log(`files with >=1 diagnostic: ${filesWithAny}`);
  console.log(`diagnostics: ${all.length}`);
  for (const [c, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    const sample = all.find((d) => d.code === c).message.slice(0, 90);
    console.log(`  ${c.padEnd(7)} ${String(n).padStart(6)}  ${sample}`);
  }
  const byCat = {};
  for (const d of all) byCat[category(d)] = (byCat[category(d)] ?? 0) + 1;
  console.log("by category:");
  for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${c}`);
  const typeDirty = new Set(all.filter((d) => !/globalPrivacyControl|doNotTrack/.test(d.message)).map((d) => d.file));
  const cleanVentures = ventures.filter((v) => v.diagnostics.every((d) => /globalPrivacyControl|doNotTrack/.test(d.message))).length;
  console.log(`files clean as they stand: ${files - filesWithAny} of ${files}`);
  console.log(`files clean once the privacy globals are declared: ${files - typeDirty.size} of ${files}`);
  console.log(`ventures clean once the privacy globals are declared: ${cleanVentures} of ${ventures.length}`);
}

const recompute = arg("--recompute-from");
if (recompute) {
  summarise(JSON.parse(readFileSync(recompute, "utf8")));
} else {
  const tsc = arg("--tsc"), typesRoot = arg("--types-root"), out = arg("--out");
  if (!tsc || !typesRoot || !out) {
    console.error("usage: measure.mjs --tsc <tsc> --types-root <dir> --out <file> | --recompute-from <file>");
    process.exit(2);
  }
  const version = execFileSync(tsc, ["--version"], { encoding: "utf8" }).trim();
  const jobs = [...ventureFiles()];
  const ventures = [];
  const width = Number(arg("--jobs") ?? 4);
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < jobs.length) {
      const [slug, files] = jobs[next++];
      ventures.push(await check(tsc, resolve(typesRoot), slug, files));
      if (ventures.length % 100 === 0) console.error(`${ventures.length}/${jobs.length}`);
    }
  }));
  ventures.sort((a, b) => a.slug.localeCompare(b.slug));
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const results = { date: new Date().toISOString().slice(0, 10), commit, tsc_version: version, flags: FLAGS, ventures };
  writeFileSync(out, JSON.stringify(results, null, 1) + "\n");
  summarise(results);
}
