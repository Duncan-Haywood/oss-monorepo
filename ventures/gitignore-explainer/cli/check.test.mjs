import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "./check.mjs";

const CLI = fileURLToPath(new URL("./check.mjs", import.meta.url));
let hasGit = true;
try { execFileSync("git", ["--version"], { stdio: "ignore" }); } catch { hasGit = false; }

function repo() {
  const root = mkdtempSync(join(tmpdir(), "gi-cli-"));
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, "build"));
  writeFileSync(join(root, ".gitignore"), "build/\n!build/keep.txt\n*.env\n");
  writeFileSync(join(root, "build", "keep.txt"), "");
  writeFileSync(join(root, "app.js"), "");
  writeFileSync(join(root, "prod.env"), "");
  execFileSync("git", ["add", "app.js", ".gitignore"], { cwd: root });
  execFileSync("git", ["add", "-f", "prod.env"], { cwd: root });
  return root;
}

test("collect reads ignore files, tracked and untracked paths", { skip: !hasGit && "git not installed" }, () => {
  const root = repo();
  try {
    const c = collect(root);
    assert.match(c.sources, /==> \.gitignore <==\nbuild\//);
    assert.deepEqual(c.tracked.split("\n").sort(), [".gitignore", "app.js", "prod.env"]);
    assert.ok(c.paths.split("\n").includes("build/keep.txt"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the CLI reports, explains and gates", { skip: !hasGit && "git not installed" }, () => {
  const root = repo();
  try {
    const out = execFileSync("node", [CLI], { cwd: root, encoding: "utf8" });
    assert.match(out, /\[high\] \.gitignore:2 +!build\/keep\.txt cannot re-include 1 path/);
    assert.match(out, /\[medium\] \.gitignore:3 .*prod\.env|prod\.env/);
    assert.match(out, /append to \.gitignore:\n +!\/build\/\n +\/build\/\*\n +!build\/keep\.txt/);
    const why = execFileSync("node", [CLI, "--why", "build/keep.txt"], { cwd: root, encoding: "utf8" });
    assert.match(why, /build\/: ignored by \.gitignore:1 build\//);
    const json = JSON.parse(execFileSync("node", [CLI, "--json"], { cwd: root, encoding: "utf8" }));
    assert.equal(json.totals.blockedNegations, 1);
    let code = 0;
    try { execFileSync("node", [CLI, "--strict"], { cwd: root, stdio: "ignore" }); } catch (e) { code = e.status; }
    assert.equal(code, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
