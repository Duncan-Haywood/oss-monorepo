// Write single-edit mutants of real .pre-commit-config.yaml files.
// Usage: node differential/mutate.mjs <out-dir> <per-file> <seed> <file>...
// Each mutant inserts or replaces one line: a hook key, a repo key or a root
// key, chosen from the mistakes this tool is meant to catch and from valid
// values that look like mistakes. The mutants are inputs for
// config-diff.mjs; neither side is told what was changed.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";

const [out, perFile, seedArg, ...files] = process.argv.slice(2);
let seed = Number(seedArg);
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];

const HOOK = [
  "args: [--line-length, 100]", "args: [--fix]", "args: --fix", "args: ['--max-line-length 100']", "args: [--max-line-length=100]",
  "stages: [commit]", "stages: [push, manual]", "stages: [manual]", "stages: [precommit]", "stages: commit", "stages: [pre-commit]",
  "language: system", "language: script", "language: pythn", "language: [python]", "language: python",
  "types: [pyton]", "types: python", "types: [python]", "types_or: [python, pyi]", "exclude_types: [markdown, jupyter]",
  "files: *.py", "files: '*.py'", "files: src/*", "files: '^src/.*\\.py$'", "exclude: [docs, tests]", "files: '(?<n>a)'",
  "files: '[\\\\/]vendor'", "exclude: '(?x) ^docs/ | ^tests/'", "exclude: '\\.(?i:md)$'", "files: '\\\\q'", "files: '(?<=a+)b'", "files: 'a*+'",
  "pass_filenames: \"false\"", "pass_filenames: no", "pass_filenames: false", "always_run: 1", "verbose: yes", "require_serial: on",
  "minimum_pre_commit_version: 9.0", "minimum_pre_commit_version: '2.20.0'", "language_version: 3.11", "language_version: python3.11",
  "exclude_files: ^docs/", "file: ^src/", "additional_dependencies: [black==24.1.0, 3]", "name: 123", "entry: [ruff]", "alias: x", "log_file: 1.5",
  "id: 2024-01-01", "description: yes",
];
const REPO = ["rev: 6.0", "rev: main", "rev: stable", "rev: 2024-01-01", "rev: v1", "rev: abcdef1", "sha: v1.0.0", "hooks: []", "hooks: {}", "repo: 5", "repo: local", "repo: meta", "foo: bar"];
const ROOT = [
  "default_stages: [commit, push]", "default_stages: [pre-commit]", "default_stages: commit", "default_language_version: {python: 3.11}",
  "default_language_version: {python: python3.11}", "default_language_version: {system: x}", "default_language_version: python3",
  "fail_fast: yes", "fail_fast: 'true'", "ci: [x]", "ci: {autofix_prs: false}", "repo: x", "default_install_hook_types: [pre-commit, push]",
  "default_install_hook_types: [pre-commit, pre-push]", "minimum_pre_commit_version: '9.0.0'", "minimum_pre_commit_version: '3.0'",
  "minimum_pre_commit_version: 2.20", "minimum_pre_commit_version: 'x.1'", "exclude: '^vendor/*'", "files: '['", "exclude: |\n  (?x)\n  ^a/|\n  ^b/",
];

mkdirSync(out, { recursive: true });
let n = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  const hookLines = [], repoLines = [];
  lines.forEach((l, i) => {
    const m = /^(\s*)- (id|repo):/.exec(l);
    if (m) (m[2] === "id" ? hookLines : repoLines).push({ i, col: m[1].length + 2 });
  });
  for (let k = 0; k < Number(perFile); k++) {
    const copy = [...lines];
    const where = rand();
    let edit;
    if (where < 0.55 && hookLines.length) {
      const h = pick(hookLines); edit = pick(HOOK);
      copy.splice(h.i + 1, 0, " ".repeat(h.col) + edit);
    } else if (where < 0.8 && repoLines.length) {
      const r = pick(repoLines); edit = pick(REPO);
      const key = edit.split(":")[0];
      // replace an existing key line at that column if there is one
      let j = r.i + 1;
      for (; j < copy.length && j < r.i + 4; j++) if (copy[j].trim().startsWith(key + ":") && copy[j].search(/\S/) === r.col) break;
      if (j < copy.length && j < r.i + 4 && key !== "repo") copy[j] = " ".repeat(r.col) + edit;
      else if (key === "repo") copy[r.i] = copy[r.i].replace(/- repo:.*/, "- " + edit);
      else copy.splice(r.i + 1, 0, " ".repeat(r.col) + edit);
    } else {
      edit = pick(ROOT);
      copy.push(edit);
    }
    writeFileSync(`${out}/${basename(f, ".yaml")}--${k}.yaml`, copy.join("\n") + "\n");
    n++;
  }
}
console.log(`${n} mutants in ${out}`);
