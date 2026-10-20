#!/usr/bin/env node
// Zero-dependency CLI: statically lints an AI-coding-agent permission/MCP
// config -- Claude Code's `.claude/settings.json` / `.claude/settings.local.json`
// and the `mcpServers` block shared by `.mcp.json`, `.cursor/mcp.json`, and
// `.vscode/mcp.json` -- for a blanket Bash allow-all rule, an unscoped
// destructive-command allow with no matching deny, an MCP server reached
// over plain http://, and a hardcoded-looking secret in a committed
// server's env/headers instead of an environment-variable reference. No
// network call, ever; the only filesystem access beyond reading the config
// files themselves is a best-effort `git ls-files` check used to say
// whether a flagged file is tracked by git.
//
//   node cli.mjs check                          # auto-discovers config files under .
//   node cli.mjs check --root <dir>              # auto-discovers under <dir>
//   node cli.mjs check --file <path> [--file ...] # check specific file(s) instead
//   node cli.mjs check --json

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseConfig, analyze } from "./engine.mjs";

const execFileAsync = promisify(execFile);

// The candidate paths every major AI coding agent (as of 2026) reads a
// permission or MCP-server config from, relative to a repo root. Checked
// only if present -- a repo using one convention does not need the others.
export const DEFAULT_CANDIDATES = [
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".mcp.json",
  ".cursor/mcp.json",
  ".vscode/mcp.json",
];

function parseArgs(argv) {
  const args = { root: ".", json: false, files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "--file") args.files.push(argv[++i]);
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
  }
  return args;
}

async function readIfExists(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

/** Best-effort: is `p` tracked by git? Returns true/false, or null when
 * this is not a git checkout (or git is unavailable) -- null is reported
 * as "unknown", never coerced to false, so an unrelated failure never
 * reads as "safely gitignored". */
async function gitTracked(p, cwd) {
  try {
    await execFileAsync("git", ["ls-files", "--error-unmatch", p], { cwd });
    return true;
  } catch (err) {
    // git exits 1 (and prints to stderr) when the path exists but is not
    // tracked -- that is a real, meaningful "false", not a failure to hide.
    if (err && typeof err.code === "number") return false;
    return null;
  }
}

function renderReport(fileResults) {
  const lines = [];
  let anyFindings = false;
  for (const { file, error, result, gitTrackedNote } of fileResults) {
    if (error) {
      lines.push(`${file}: could not parse -- ${error}`);
      continue;
    }
    lines.push(`${file}${gitTrackedNote}: ${result.summary}`);
    for (const f of result.findings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.kind}: ${f.message}`);
    }
    if (result.findings.some((f) => f.severity === "high" || f.severity === "medium")) anyFindings = true;
  }
  return { lines, anyFindings };
}

export async function run(argv, { cwd = process.cwd() } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check [--root <dir>] [--file <path> ...] [--json]",
        "",
        "Statically lints an AI-coding-agent permission/MCP config for a blanket",
        "Bash allow-all rule, an unscoped destructive-command allow with no",
        "matching deny rule, an MCP server reached over plain http://, and a",
        "hardcoded-looking secret in a server's env/headers. With no --file, it",
        `auto-discovers whichever of these exist under --root (default .):`,
        ...DEFAULT_CANDIDATES.map((c) => `  ${c}`),
        "",
        "No network call, ever. Exits 1 if any high/medium finding is present",
        "in any checked file (an info-only finding does not fail the run).",
      ].join("\n"),
    };
  }
  if (args.sub !== "check") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };

  const targets = (args.files.length > 0
    ? args.files
    : DEFAULT_CANDIDATES.map((c) => path.join(args.root, c))
  ).map((t) => path.resolve(cwd, t));

  const fileResults = [];
  for (const target of targets) {
    const displayName = path.relative(cwd, target) || target;
    const text = await readIfExists(target);
    if (text === null) {
      if (args.files.length > 0) fileResults.push({ file: displayName, error: "file not found" });
      continue; // an auto-discovered candidate that doesn't exist is not an error
    }
    let parsed;
    try {
      parsed = parseConfig(text);
    } catch (err) {
      fileResults.push({ file: displayName, error: `invalid JSON (${err.message})` });
      continue;
    }
    const hasServers = parsed.servers.length > 0;
    let gitTrackedFile = null;
    let gitTrackedNote = "";
    if (hasServers) {
      gitTrackedFile = await gitTracked(displayName, cwd);
      gitTrackedNote = gitTrackedFile === true ? " (tracked by git)" : gitTrackedFile === false ? " (not tracked by git)" : "";
    }
    const result = analyze(parsed, { gitTrackedFile });
    fileResults.push({ file: displayName, result, gitTrackedNote });
  }

  if (fileResults.length === 0) {
    return {
      exitCode: 0,
      output: `No config file found among: ${DEFAULT_CANDIDATES.join(", ")} (checked under ${args.root}). Nothing to check.`,
    };
  }

  const anyParseError = fileResults.some((r) => r.error);
  const { lines, anyFindings } = renderReport(fileResults);
  const exitCode = anyFindings || anyParseError ? 1 : 0;

  if (args.json) {
    return { exitCode, output: JSON.stringify(fileResults, null, 2) };
  }
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
