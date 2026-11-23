import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, collect } from "./check.mjs";

const CLI = fileURLToPath(new URL("./check.mjs", import.meta.url));
let hasGit = true;
try { execFileSync("git", ["--version"]); } catch { hasGit = false; }

test("parseArgs", () => {
  assert.deepEqual(parseArgs(["--key", "user.email", "--json"]).key, "user.email");
  assert.throws(() => parseArgs(["--nope"]));
});

test("the CLI follows includes on disk and agrees with git", { skip: !hasGit && "git not installed" }, () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gccli-")));
  try {
    const home = join(root, "h");
    const env = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: "1" };
    for (const k of Object.keys(env)) if (/^(GIT_CONFIG_(PARAMETERS|COUNT|KEY|VALUE|GLOBAL)|XDG_CONFIG_HOME)/.test(k)) delete env[k];
    mkdirSync(join(home, "work/api"), { recursive: true });
    execFileSync("git", ["init", "-q", "-b", "main", join(home, "work/api")], { env });
    writeFileSync(join(home, ".gitconfig"), "[includeIf \"gitdir:~/work/\"]\n\tpath = .gc-work\n[user]\n\temail = me@home\n");
    writeFileSync(join(home, ".gc-work"), "[user]\n\temail = me@work\n[include]\n\tpath = deeper\n");
    writeFileSync(join(home, "deeper"), "[core]\n\teditor = vi\n");
    const { result } = collect({ repo: join(home, "work/api"), env });
    assert.equal(result.effective["user.email"].value, "me@home");
    assert.equal(result.effective["core.editor"].value, "vi");
    assert.ok(result.findings.some((f) => f.kind === "include-overridden"));
    const res = spawnSync(process.execPath, [CLI, "--verify", "--key", "user.email", "--strict"], { cwd: join(home, "work/api"), env, encoding: "utf8" });
    assert.equal(res.status, 1, res.stderr);
    assert.match(res.stdout, /--verify: matches git/);
    assert.match(res.stdout, /-> me@home/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
