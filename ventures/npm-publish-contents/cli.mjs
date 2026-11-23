#!/usr/bin/env node
// npm publish contents, command line. Reads a package folder, says which
// files `npm publish` would put in the tarball and which rule decides each,
// and flags secrets, missing entry points and a shadowed .gitignore.
//
//   node cli.mjs [folder]            report (default: the current folder)
//   node cli.mjs . --all             also list every left-out file and why
//   node cli.mjs . --why lib/a.js    explain one path
//   node cli.mjs . --json            the full report as JSON
//   node cli.mjs . --verify          also run `npm pack --dry-run --json` and diff
//   node cli.mjs . --fail-on high    exit 1 when a finding at or above that level exists
//
// No dependencies and no network. --verify runs your own npm, with
// --ignore-scripts so no prepack script runs.

import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { analyze } from "./packlist.mjs";

const LEVELS = ["info", "low", "medium", "high"];

export function readPackage(root) {
  const files = [];
  const contents = new Map();
  const skipped = [];
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const path = rel ? rel + "/" + name : name;
      // .git and the root node_modules are never packed; not reading them
      // keeps big repositories fast. (A nested node_modules can ship.)
      if (name === ".git" || (!rel && name === "node_modules")) continue;
      let st;
      try { st = lstatSync(abs); } catch { continue; }
      if (st.isSymbolicLink()) { skipped.push(path); continue; }
      if (st.isDirectory()) walk(abs, path);
      else if (st.isFile()) {
        files.push(path);
        if (name === ".npmignore" || name === ".gitignore" || path === "package.json") contents.set(path, readFileSync(abs, "utf8"));
      }
    }
  };
  walk(root, "");
  return { files, contents, skipped };
}

function npmPack(root) {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out)[0].files.map((f) => f.path);
}

export function run(argv, io = { out: (s) => process.stdout.write(s + "\n"), err: (s) => process.stderr.write(s + "\n") }) {
  const args = argv.slice();
  const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
  const opt = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  if (flag("--help") || flag("-h")) { io.out(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 15).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return 0; }
  const json = flag("--json");
  const all = flag("--all");
  const verify = flag("--verify");
  const why = opt("--why");
  const failOn = opt("--fail-on");
  const root = resolve(args[0] || ".");
  if (!existsSync(join(root, "package.json"))) { io.err(`No package.json in ${root}.`); return 2; }
  const { files, contents, skipped } = readPackage(root);
  let compare = null;
  if (verify) {
    try { compare = npmPack(root); } catch (e) { io.err(`npm pack --dry-run failed: ${e.message.split("\n")[0]}`); return 2; }
  }
  const report = analyze({ packageJson: contents.get("package.json"), files, ignoreFiles: contents, compare });
  if (json) { io.out(JSON.stringify({ ...report, skippedSymlinks: skipped }, null, 2)); }
  else if (why) {
    const row = report.rows.find((r) => r.path === why.replace(/^\.\//, ""));
    if (!row) { io.err(`${why} is not a file in ${root}.`); return 2; }
    io.out(`${row.path}: ${row.included ? "SHIPS" : "left out"}\n  ${row.reason}${row.secret ? `\n  looks like ${row.secret}` : ""}`);
  } else {
    const t = report.totals;
    io.out(`${report.pkg.name || "(no name)"}@${report.pkg.version || "?"}: ${t.shipped} of ${t.listed} files would be published${report.pkg.hasFiles ? " (files is set)" : ""}.`);
    for (const s of report.shadowed) io.out(`  ${s.file} is not read: ${s.by} takes its place.`);
    for (const e of report.errors) io.out(`  note: ${e}`);
    if (skipped.length) io.out(`  note: ${skipped.length} symbolic link${skipped.length === 1 ? "" : "s"} skipped (npm does not pack links): ${skipped.slice(0, 5).join(", ")}`);
    io.out("");
    for (const f of report.findings) {
      io.out(`[${f.severity}] ${f.message}`);
      for (const p of f.paths.slice(0, 25)) io.out(`    ${p}`);
      if (f.paths.length > 25) io.out(`    ... ${f.paths.length - 25} more`);
    }
    if (!report.findings.length) io.out("Nothing to flag.");
    io.out("\nWould publish:");
    for (const r of report.rows.filter((r) => r.included)) io.out(`  + ${r.path}    ${r.reason}`);
    if (all) {
      io.out("\nLeft out:");
      for (const r of report.rows.filter((r) => !r.included)) io.out(`  - ${r.path}    ${r.reason}`);
    }
    if (report.comparison) {
      const c = report.comparison;
      if (!c.onlyHere.length && !c.onlyThere.length) io.out(`\nnpm pack --dry-run agrees: the same ${t.shipped} files.`);
      else {
        io.out("\nnpm pack --dry-run DISAGREES with this tool (please report it):");
        for (const p of c.onlyHere) io.out(`  only here: ${p}`);
        for (const p of c.onlyThere) io.out(`  only npm:  ${p}`);
      }
    }
  }
  if (failOn) {
    const min = LEVELS.indexOf(failOn);
    if (min < 0) { io.err(`--fail-on takes one of ${LEVELS.join(", ")}`); return 2; }
    if (report.findings.some((f) => LEVELS.indexOf(f.severity) >= min)) return 1;
  }
  if (report.comparison && (report.comparison.onlyHere.length || report.comparison.onlyThere.length)) return 3;
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2));
}
