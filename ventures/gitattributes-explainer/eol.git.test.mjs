// Round trip against real git: for each attribute line and each
// core.autocrlf / core.eol setting, commit one LF and one CRLF text file,
// read the blob git stored, delete the file, check it out again and read
// what git wrote. predictRoundTrip must say the same bytes. Unix only
// (core.eol=native means LF here). Skipped when git is not installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile, resolvePath, predictRoundTrip } from "./gitattributes.mjs";

let hasGit = true;
try { execFileSync("git", ["--version"]); } catch { hasGit = false; }
const ENV = { ...process.env, GIT_ATTR_NOSYSTEM: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", HOME: tmpdir() };

const LINES = ["", "text", "-text", "text=auto", "text eol=lf", "text eol=crlf", "eol=crlf", "eol=lf", "-text eol=crlf",
  "text=auto eol=crlf", "text=auto eol=lf", "crlf", "-crlf", "crlf=input", "binary", "text=input", "eol=CRLF", "text=true", "!text"];
const CONTENT = { lf: "a\nb\n", crlf: "a\r\nb\r\n" };
const kind = (buf) => (buf.includes("\r\n") ? "crlf" : "lf");

function git(root, cfg, args) {
  const r = spawnSync("git", [...cfg.flatMap((c) => ["-c", c]), ...args], { cwd: root, env: ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

const skip = (!hasGit && "git not installed") || (process.platform === "win32" && "unix line endings assumed");

test(`stored and checked-out line endings match real git (${LINES.length} attribute lines x 9 settings x 2 contents)`, { skip }, () => {
  let n = 0;
  for (const line of LINES) {
    for (const autocrlf of ["false", "true", "input"]) {
      for (const eol of ["native", "lf", "crlf"]) {
        const cfg = [`core.autocrlf=${autocrlf}`, `core.eol=${eol}`, "core.safecrlf=false", "user.name=t", "user.email=t@example.invalid", "core.attributesFile=/dev/null"];
        const root = mkdtempSync(join(tmpdir(), "ga-eol-"));
        try {
          git(root, [], ["init", "-q"]);
          writeFileSync(join(root, ".gitattributes"), `*.t ${line}\n`);
          for (const [k, body] of Object.entries(CONTENT)) writeFileSync(join(root, `${k}.t`), body);
          git(root, cfg, ["add", "-A"]);
          git(root, cfg, ["commit", "-qm", "x"]);
          const files = compile(`*.t ${line}`);
          for (const k of Object.keys(CONTENT)) {
            const stored = kind(git(root, cfg, ["cat-file", "-p", `HEAD:${k}.t`]));
            unlinkSync(join(root, `${k}.t`));
            git(root, cfg, ["checkout", "--", `${k}.t`]);
            const written = kind(readFileSync(join(root, `${k}.t`)));
            const { attrs } = resolvePath(files, `${k}.t`);
            const want = predictRoundTrip((name) => attrs.get(name)?.value, { autocrlf, eol, platform: "unix" }, k);
            assert.deepEqual({ index: stored, worktree: written }, want, `"*.t ${line}", autocrlf=${autocrlf}, eol=${eol}, ${k} content`);
            n++;
          }
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }
    }
  }
  assert.equal(n, LINES.length * 9 * 2);
});
