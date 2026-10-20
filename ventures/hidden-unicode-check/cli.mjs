#!/usr/bin/env node
// Zero-dependency CLI over calc.mjs: scan the text files under a directory for
// invisible and bidirectional-control Unicode characters (Trojan Source,
// Unicode Tag "ASCII smuggling"). No network call, ever -- this reads files
// already on disk and classifies codepoints. A finding is a structural
// observation, never a verdict, and a clean run is not a safety guarantee.
//
//   node cli.mjs                    # scan every text file under .
//   node cli.mjs /path/to/repo
//   node cli.mjs --format json
//   node cli.mjs --fail-on-risk     # exit 2 if any finding exists

import { readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { scanText, visualize } from "./calc.mjs";

const SKIP_DIRS = new Set([".git", "node_modules"]);
const MAX_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  ".md", ".mdc", ".markdown", ".txt", ".rst", ".json", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".env",
  ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs",
  ".c", ".h", ".cc", ".cpp", ".hpp", ".swift", ".sh", ".bash", ".zsh", ".ps1", ".sql", ".html", ".css", ".tf",
]);
const TEXT_NAMES = new Set(["Dockerfile", "Makefile", ".cursorrules", ".windsurfrules", ".clinerules", ".gitattributes"]);

function isTextFile(name) {
  return TEXT_NAMES.has(name) || name.startsWith("Dockerfile.") || TEXT_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** Text files under `root` (skipping `.git` and `node_modules`), sorted. */
async function discoverFiles(root) {
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && isTextFile(entry.name)) results.push(full);
    }
  }
  try {
    if (!statSync(root).isDirectory()) return [];
  } catch {
    return [];
  }
  await walk(root);
  return results.sort();
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const EMOJI_GLUE = new Set([0x200d, 0xfe0f, 0xfe0e]);

/** Emoji sequences legitimately contain zero-width joiners and variation
 * selectors (family, flags-with-skin-tone, text-vs-emoji presentation). A
 * glue character touching a pictographic is not reported, so READMEs full of
 * emoji do not drown the real findings. */
function isEmojiGlue(text, finding) {
  if (!EMOJI_GLUE.has(finding.codePoint)) return false;
  const before = [...text.slice(Math.max(0, finding.index - 2), finding.index)].pop() || "";
  const after = String.fromCodePoint(text.codePointAt(finding.index + finding.char.length) || 0x20);
  const prevIsGlueOrPic = PICTOGRAPHIC.test(before) || /[‍️\u{1f3fb}-\u{1f3ff}]/u.test(before);
  return PICTOGRAPHIC.test(after) || prevIsGlueOrPic;
}

/** Findings for one file's text, as plain objects (no raw hidden characters).
 * A run of adjacent characters of one category (a Tag-character message is
 * dozens) is reported once, with `count` characters. */
export function scanFile(text, file) {
  const result = scanText(text);
  const findings = [];
  let prev = null;
  let prevEnd = -1;
  for (const f of result.findings) {
    if (isEmojiGlue(text, f)) continue;
    if (prev && prev.category === f.category && prevEnd === f.index) {
      prev.count += 1;
      if (f.severity === "high") prev.severity = "high";
    } else {
      prev = {
        file, line: f.line, column: f.column, codePoint: f.hex, name: f.name, category: f.category, kind: f.kind,
        severity: f.severity, count: 1, context: `${visualize(f.before)}${visualize(f.char)}${visualize(f.after)}`,
      };
      findings.push(prev);
    }
    prevEnd = f.index + f.char.length;
  }
  const decoded = result.decodedTagMessages.map((m) => ({ file, line: m.line, column: m.column, text: m.text }));
  return { findings, decoded };
}

function parseArgs(argv) {
  const args = { format: "text", failOnRisk: false, path: "." };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--format") args.format = argv[++i];
    else if (a === "--json") args.format = "json";
    else if (a === "--fail-on-risk") args.failOnRisk = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!a.startsWith("-")) args.path = a;
  }
  return args;
}

const HELP = [
  "Usage: node cli.mjs [path] [--format text|json] [--fail-on-risk]",
  "",
  "Scans text files (docs, config, source, AI-agent instruction files such as",
  "CLAUDE.md, AGENTS.md and .cursorrules) under [path] (default: current",
  "directory) for characters a reviewer cannot see:",
  "",
  "  invisible   zero-width characters, Unicode Tag characters (decoded back",
  "              to the ASCII they spell), variation selectors, fillers",
  "  bidi        bidirectional overrides, embeddings and isolates (Trojan",
  "              Source, CVE-2021-42574) and the weaker direction marks",
  "",
  "Zero-width joiners and variation selectors inside emoji are not reported.",
  "A finding is worth a look, not a verdict; a clean run is not a guarantee.",
  "",
  "Exit status: 0 normally (even with findings, unless --fail-on-risk),",
  "2 if --fail-on-risk was given and at least one finding exists.",
].join("\n");

export async function run(argv, { readFile = (p) => readFileSync(p, "utf8"), discover = discoverFiles } = {}) {
  const args = parseArgs(argv);
  if (args.help) return { exitCode: 0, output: HELP };

  const files = await discover(args.path);
  const findings = [];
  const decoded = [];
  let scanned = 0;
  for (const file of files) {
    let text;
    try {
      if (statSync(file).size > MAX_BYTES) continue;
      text = readFile(file);
    } catch (err) {
      return { exitCode: 2, output: `Error reading ${file}: ${err.message}` };
    }
    scanned += 1;
    const rel = path.relative(args.path, file) || file;
    const one = scanFile(text, rel);
    findings.push(...one.findings);
    decoded.push(...one.decoded);
  }

  const exitCode = args.failOnRisk && findings.length > 0 ? 2 : 0;
  if (args.format === "json") {
    return { exitCode, output: JSON.stringify({ scanned, findings, decoded }, null, 2) };
  }

  const lines = findings.map(
    (f) => `!! [${f.severity.toUpperCase()}] ${f.file}:${f.line}:${f.column} ${f.codePoint} ${f.name}${f.count > 1 ? ` (+${f.count - 1} adjacent)` : ""}: ...${f.context}...`,
  );
  for (const m of decoded) lines.push(`   hidden Tag-character text at ${m.file}:${m.line}:${m.column} decodes to: "${m.text}"`);
  if (scanned === 0) lines.push(`No text files found under ${args.path}`);
  else {
    if (lines.length) lines.push("");
    lines.push(
      `Scanned ${scanned} file(s): ${findings.length} finding(s). A mechanical codepoint match, not a security audit; ` +
        "a clean run does not mean the files are safe.",
    );
  }
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
