#!/usr/bin/env node
// pyproject.toml metadata check, command line.
//
//   node cli.mjs [path]               check ./pyproject.toml, or the one in or at path
//   node cli.mjs . --json             the full report as JSON
//   node cli.mjs . --metadata         also print the core metadata a backend would write
//   node cli.mjs . --fail-on medium   exit 1 when a finding at or above that level exists
//                                     (default: high; --fail-on none never fails)
//   node cli.mjs . --no-files         skip the readme and license-files checks
//
// The folder's files (for readme and license-files) come from `git ls-files`
// (tracked and untracked, not ignored) when it is a git work tree, otherwise
// from a walk that skips .git, virtualenvs, node_modules, build and dist.
// No dependencies and no network.

import { readdirSync, readFileSync, statSync, lstatSync, existsSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { analyze } from "./engine.mjs";

const LEVELS = ["info", "low", "medium", "high"];
const SKIP = new Set([".git", "node_modules", ".venv", "venv", ".tox", ".nox", "build", "dist", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache"]);

export function listFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 });
    return out.split("\n").filter(Boolean);
  } catch {
    const files = [];
    const walk = (dir, rel) => {
      for (const name of readdirSync(dir)) {
        if (SKIP.has(name) || files.length > 50000) continue;
        const abs = join(dir, name);
        let st;
        try { st = lstatSync(abs); } catch { continue; }
        const path = rel ? `${rel}/${name}` : name;
        if (st.isDirectory()) walk(abs, path);
        else if (st.isFile()) files.push(path);
      }
    };
    walk(root, "");
    return files;
  }
}

export function run(argv, io = { out: (s) => process.stdout.write(s + "\n"), err: (s) => process.stderr.write(s + "\n") }) {
  const args = argv.slice();
  const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
  const opt = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  if (flag("--help") || flag("-h")) { io.out(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 16).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return 0; }
  const json = flag("--json");
  const showMeta = flag("--metadata");
  const noFiles = flag("--no-files");
  const failOn = opt("--fail-on") ?? "high";
  if (failOn !== "none" && !LEVELS.includes(failOn)) { io.err(`--fail-on takes ${LEVELS.join(", ")} or none`); return 2; }
  if (args.length > 1 || args.some((a) => a.startsWith("-"))) { io.err(`unknown arguments: ${args.join(" ")}`); return 2; }
  let target = resolve(args[0] ?? ".");
  if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "pyproject.toml");
  if (!existsSync(target)) { io.err(`no pyproject.toml at ${target}`); return 2; }
  const root = dirname(target);
  const files = noFiles || basename(target) !== "pyproject.toml" ? null : listFiles(root);
  const r = analyze(readFileSync(target, "utf8"), { files });
  if (json) io.out(JSON.stringify(r, null, 2));
  else {
    const s = r.summary;
    io.out(s ? `${s.name ?? "(no name)"} ${s.version ?? ""}${s.backend ? ` · ${s.backend}` : ""}${s.requiresPython ? ` · Python ${s.requiresPython}` : ""} · ${s.dependencies} dependencies${s.extras.length ? `, extras: ${s.extras.join(", ")}` : ""}` : basename(target));
    const t = r.totals ?? { high: r.findings.length, medium: 0, low: 0, info: 0 };
    io.out(`${t.high} high, ${t.medium} medium, ${t.low} low, ${t.info} info${files ? "" : " (file checks skipped)"}`);
    for (const f of r.findings) {
      io.out(`\n${target}${f.line ? `:${f.line}` : ""}: [${f.severity}] ${f.id}\n  ${f.message}`);
      if (f.fix) io.out(`  fix: ${f.fix}`);
    }
    if (showMeta && r.metadata) io.out(`\nCore metadata preview:\n${r.metadata.text}`);
  }
  if (failOn === "none") return 0;
  const bar = LEVELS.indexOf(failOn);
  return r.findings.some((f) => LEVELS.indexOf(f.severity) >= bar) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = run(process.argv.slice(2));
