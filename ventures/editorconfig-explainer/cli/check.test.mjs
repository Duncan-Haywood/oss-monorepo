import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "./check.mjs";

const CLI = fileURLToPath(new URL("./check.mjs", import.meta.url));
let hasGit = true;
try { execFileSync("git", ["--version"], { stdio: "ignore" }); } catch { hasGit = false; }

function repo() {
  const root = mkdtempSync(join(tmpdir(), "ec-cli-"));
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, "pkg"));
  writeFileSync(join(root, ".editorconfig"), "root = true\n[*]\nindent_size = 2\n[*.py]\nindent_size = 4 # pep 8\n");
  writeFileSync(join(root, "pkg", ".editorconfig"), "[*.js]\nroot = true\n");
  writeFileSync(join(root, "app.py"), "");
  writeFileSync(join(root, "pkg", "a.js"), "");
  execFileSync("git", ["add", "."], { cwd: root });
  return root;
}

test("collect reads every .editorconfig and the file list", { skip: !hasGit && "git not installed" }, () => {
  const root = repo();
  try {
    const c = collect(root);
    assert.deepEqual(c.configs, [".editorconfig", "pkg/.editorconfig"]);
    assert.deepEqual(c.paths.sort(), ["app.py", "pkg/a.js"]);
    assert.match(c.sources, /==> pkg\/\.editorconfig <==/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the report names the inline comment and the root in a section; --strict exits 1", { skip: !hasGit && "git not installed" }, () => {
  const root = repo();
  try {
    const out = execFileSync("node", [CLI], { cwd: root, encoding: "utf8" });
    assert.match(out, /\[high\] \.editorconfig:5 +indent_size = 4 # pep 8: editors disagree/);
    assert.match(out, /\[high\] pkg\/\.editorconfig:2 +root = true inside \[\*\.js\]/);
    const strict = spawnSync("node", [CLI, "--strict"], { cwd: root, encoding: "utf8" });
    assert.equal(strict.status, 1);
    const w = execFileSync("node", [CLI, "--why", "app.py"], { cwd: root, encoding: "utf8" });
    assert.match(w, /matches +\[\*\.py\] line 4: indent_size = 4 # pep 8/);
    assert.match(w, /indent_size=4 # pep 8/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
