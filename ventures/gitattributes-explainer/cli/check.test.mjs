import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { collect, verify } from "./check.mjs";

const CLI = fileURLToPath(new URL("./check.mjs", import.meta.url));
let hasGit = true;
try { execFileSync("git", ["--version"], { stdio: "ignore" }); } catch { hasGit = false; }
const ENV = { ...process.env, GIT_ATTR_NOSYSTEM: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", XDG_CONFIG_HOME: join(tmpdir(), "ga-no-xdg") };

function repo() {
  const root = mkdtempSync(join(tmpdir(), "ga-cli-"));
  execFileSync("git", ["init", "-q", root], { env: ENV });
  mkdirSync(join(root, "docs"));
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, ".gitattributes"), "* text=auto\n*.png binary\ndocs/ linguist-documentation\n*.psd filter=lfs diff=lfs merge=lfs\n");
  writeFileSync(join(root, "web", ".gitattributes"), "[attr]gen linguist-generated\n*.snap gen\n");
  for (const f of ["a.png", "docs/guide.md", "art.psd", "web/x.snap", "README.md"]) writeFileSync(join(root, f), "x\n");
  return root;
}

test("collect reads attribute files, settings and paths", { skip: !hasGit && "git not installed" }, () => {
  const root = repo();
  try {
    const c = collect(root);
    assert.match(c.sources, /==> \.gitattributes <==\n\* text=auto/);
    assert.match(c.sources, /==> web\/\.gitattributes <==/);
    assert.ok(c.pathList.includes("docs/guide.md"));
    assert.equal(c.settings.autocrlf, "false");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the CLI reports, explains, verifies against git and gates", { skip: !hasGit && "git not installed" }, () => {
  const root = repo();
  try {
    const run = (...a) => spawnSync("node", [CLI, ...a], { cwd: root, encoding: "utf8", env: ENV });
    const out = run();
    assert.equal(out.status, 0);
    assert.match(out.stdout, /\[high\] \.gitattributes:3 {2}A trailing \/ makes this line apply to the folder itself/);
    assert.match(out.stdout, /\[high\] web\/\.gitattributes:1 {2}\[attr\]gen only works in the top-level/);
    assert.match(out.stdout, /\[medium\] \.gitattributes:4 {2}Git LFS line without -text/);
    const w = run("--why", "a.png");
    assert.match(w.stdout, /diff: unset {2}\(\.gitattributes:2, via binary\)/);
    assert.match(w.stdout, /text=auto: already decided by \.gitattributes:2/);
    const v = run("--verify");
    assert.match(v.stdout, /paths checked against git check-attr: 0 disagreement\(s\)/);
    assert.equal(v.status, 0);
    assert.equal(run("--strict").status, 1);
    assert.match(run("--help").stdout, /No warranty/);
    assert.ok(verify(collect(root)).checked >= 5);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
