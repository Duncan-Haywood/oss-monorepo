import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { run } from "./cli.mjs";

const execFileAsync = promisify(execFile);

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-permission-config-check-"));
}

test("--help exits 0 and names every default candidate path", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /\.claude\/settings\.json/);
  assert.match(output, /\.mcp\.json/);
  assert.match(output, /\.cursor\/mcp\.json/);
  assert.match(output, /\.vscode\/mcp\.json/);
});

test("no subcommand exits 1", async () => {
  const { exitCode } = await run([]);
  assert.equal(exitCode, 1);
});

test("no config file found under --root exits 0 with a clear message", async () => {
  const dir = await tmpDir();
  const { exitCode, output } = await run(["check", "--root", dir]);
  assert.equal(exitCode, 0);
  assert.match(output, /No config file found/);
});

test("auto-discovers .claude/settings.json and reports a clean config as exit 0", async () => {
  const dir = await tmpDir();
  await fs.mkdir(path.join(dir, ".claude"));
  await fs.writeFile(
    path.join(dir, ".claude", "settings.json"),
    JSON.stringify({ permissions: { allow: ["Bash(npm test:*)"], deny: ["Bash(rm:*)"] } }),
  );
  const { exitCode, output } = await run(["check", "--root", dir]);
  assert.equal(exitCode, 0);
  assert.match(output, /No findings/);
});

test("flags a Bash allow-all rule and exits 1", async () => {
  const dir = await tmpDir();
  await fs.writeFile(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
  await fs.mkdir(path.join(dir, ".claude"));
  await fs.writeFile(
    path.join(dir, ".claude", "settings.json"),
    JSON.stringify({ permissions: { allow: ["Bash"], deny: [] } }),
  );
  const { exitCode, output } = await run(["check", "--root", dir]);
  assert.equal(exitCode, 1);
  assert.match(output, /bash-allow-all/);
});

test("--file checks an explicit path and reports a missing one as an error, still exiting 1", async () => {
  const dir = await tmpDir();
  const good = path.join(dir, "mcp.json");
  await fs.writeFile(good, JSON.stringify({ mcpServers: { s: { command: "node" } } }));
  const { exitCode, output } = await run(["check", "--file", good, "--file", path.join(dir, "missing.json")]);
  assert.equal(exitCode, 1);
  assert.match(output, /file not found/);
});

test("invalid JSON in an explicit --file is reported, not thrown", async () => {
  const dir = await tmpDir();
  const bad = path.join(dir, "settings.json");
  await fs.writeFile(bad, "{not valid json");
  const { exitCode, output } = await run(["check", "--file", bad]);
  assert.equal(exitCode, 1);
  assert.match(output, /invalid JSON/);
});

test("--json emits machine-readable output with a findings array", async () => {
  const dir = await tmpDir();
  const file = path.join(dir, "mcp.json");
  await fs.writeFile(file, JSON.stringify({ mcpServers: { s: { url: "http://example.com/mcp" } } }));
  const { exitCode, output } = await run(["check", "--file", file, "--json"]);
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed[0].result.findings.some((f) => f.kind === "insecure-mcp-url"), true);
});

test("notes when a flagged file is tracked by git", async () => {
  const dir = await tmpDir();
  await execFileAsync("git", ["init", "-q"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: dir });
  const file = path.join(dir, "mcp.json");
  await fs.writeFile(file, JSON.stringify({ mcpServers: { s: { env: { KEY: "sk-ant-api03-" + "x".repeat(40) } } } }));
  await execFileAsync("git", ["add", "mcp.json"], { cwd: dir });
  const { output } = await run(["check", "--file", "mcp.json"], { cwd: dir });
  assert.match(output, /tracked by git\)/);
  assert.match(output, /treat the value as already leaked/);
});
