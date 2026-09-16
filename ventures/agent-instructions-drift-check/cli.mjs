#!/usr/bin/env node
// Zero-dependency CLI: check an AI-coding-agent instruction file (AGENTS.md,
// CLAUDE.md, .cursorrules, .github/copilot-instructions.md, or similar) for
// drift against the repo it actually describes. No network call, ever --
// reads only the instructions file, an optional package.json, and the
// filesystem paths the instructions file itself names.
//
//   node cli.mjs check AGENTS.md
//   node cli.mjs check AGENTS.md --root .            # resolve refs from here (default: cwd)
//   node cli.mjs check CLAUDE.md --package package.json
//   node cli.mjs check AGENTS.md --json

import fs from "node:fs/promises";
import path from "node:path";
import { parseInstructions, diffFileRefs, diffScriptRefs, summarize } from "./engine.mjs";

function parseArgs(argv) {
  const args = { root: ".", json: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root") args.root = argv[++i];
    else if (a === "--package") args.package = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (!a.startsWith("-")) args.positional.push(a);
  }
  return args;
}

async function fileExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function renderReport({ fileDiff, scriptDiff, footguns }) {
  const { status, text } = summarize({ fileDiff, scriptDiff, footguns });
  const lines = [text];
  for (const m of fileDiff.missing) {
    const first = m.occurrences[0];
    lines.push(`  MISSING FILE    ${m.ref}  (referenced at line ${first.line}${m.occurrences.length > 1 ? ` +${m.occurrences.length - 1} more` : ""})`);
  }
  if (!scriptDiff.skipped) {
    for (const m of scriptDiff.missing) {
      const first = m.occurrences[0];
      lines.push(`  MISSING SCRIPT  npm run ${m.name}  (referenced at line ${first.line})`);
    }
  }
  for (const f of footguns) {
    lines.push(`  FOOTGUN         ${f.tool}  line ${f.line}: ${f.message}`);
    lines.push(`                  > ${f.snippet}`);
  }
  return { status, lines };
}

export async function run(
  argv,
  { readFile = (p) => fs.readFile(p, "utf8"), stat = (p) => fs.stat(p) } = {},
) {
  const args = parseArgs(argv);
  const exists = async (p) => {
    try {
      await stat(path.join(args.root, p));
      return true;
    } catch {
      return false;
    }
  };

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check <instructions-file.md> [--root <dir>] [--package <package.json>] [--json]",
        "",
        "Checks an AI-coding-agent instruction file (AGENTS.md, CLAUDE.md, and",
        "similar) for drift against the repo it describes: a markdown-link or",
        "inline-code file reference that no longer points at a real path (resolved",
        "against --root, default the current directory), an `npm run <script>`",
        "reference not defined in --package's \"scripts\" (auto-detected as",
        "<root>/package.json if present and --package is not given), and known",
        "interpreter-mismatch shell footguns (bare `pytest`/`mypy` instead of",
        "`python3 -m`) inside fenced code blocks. No network call, ever. Exits 1",
        "if anything is found.",
      ].join("\n"),
    };
  }
  if (args.sub !== "check") return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs check <instructions-file.md> [--root <dir>]" };

  const instructionsPath = args.positional[0];
  let text;
  try {
    text = await readFile(instructionsPath);
  } catch (err) {
    return { exitCode: 2, output: `Cannot read ${instructionsPath}: ${err.message}` };
  }

  let definedScripts = null;
  const packagePath = args.package ?? path.join(args.root, "package.json");
  try {
    const pkgText = await readFile(packagePath);
    const pkg = JSON.parse(pkgText);
    if (pkg && typeof pkg.scripts === "object" && pkg.scripts) definedScripts = pkg.scripts;
  } catch {
    // No package.json (or unparseable): script-reference checking is skipped,
    // not failed -- an instructions file for a non-npm repo is not an error.
  }

  const { fileRefs, scriptRefs, footguns } = parseInstructions(text);

  const missingFlags = [];
  const matched = [];
  for (const [ref, occurrences] of fileRefs) {
    if (await exists(ref)) matched.push({ ref, occurrences });
    else missingFlags.push({ ref, occurrences });
  }
  missingFlags.sort((a, b) => a.ref.localeCompare(b.ref));
  matched.sort((a, b) => a.ref.localeCompare(b.ref));
  const fileDiff = { missing: missingFlags, matched };
  const scriptDiff = diffScriptRefs(scriptRefs, definedScripts);

  const exitCode = fileDiff.missing.length > 0 || (!scriptDiff.skipped && scriptDiff.missing.length > 0) || footguns.length > 0 ? 1 : 0;

  if (args.json) {
    return {
      exitCode,
      output: JSON.stringify({ instructionsPath, root: args.root, fileDiff, scriptDiff, footguns }, null, 2),
    };
  }

  const { lines } = renderReport({ fileDiff, scriptDiff, footguns });
  lines.unshift(`${instructionsPath}: ${fileRefs.size} file ref(s), ${scriptRefs.size} script ref(s)${scriptDiff.skipped ? " (no package.json found -- script refs not checked)" : ""}`);
  return { exitCode, output: lines.join("\n") };
}

// The diffFileRefs export exists for callers (and tests) that already have a
// synchronous exists() check; the CLI itself needs the async fs form above
// because file existence is an async syscall in Node.
export { diffFileRefs };

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
