#!/usr/bin/env node
// Zero-dependency CLI: audit a domain's (or a local file's) robots.txt and
// llms.txt against the same known-AI-bot list the browser page uses. Node's
// built-in fetch has no CORS restriction, so this is the surface that can
// actually reach an arbitrary domain -- the browser page can only analyse
// text you paste into it.
//
//   node cli.mjs example.com
//   node cli.mjs example.com --json
//   node cli.mjs --robots-file ./robots.txt --llms-file ./llms.txt
//   node cli.mjs example.com --fail-if-blocked GPTBot,ClaudeBot
//   node cli.mjs example.com --fail-if-allowed Bytespider

import fs from "node:fs/promises";
import { auditRobots, validateLlmsTxt, KNOWN_BOTS } from "./audit.mjs";

function parseArgs(argv) {
  const args = { paths: ["/"], json: false, failIfBlocked: [], failIfAllowed: [] };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--robots-file") args.robotsFile = argv[++i];
    else if (a === "--llms-file") args.llmsFile = argv[++i];
    else if (a === "--path") args.paths.push(argv[++i]);
    else if (a === "--fail-if-blocked") args.failIfBlocked = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--fail-if-allowed") args.failIfAllowed = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--help" || a === "-h") args.help = true;
    else rest.push(a);
  }
  if (rest.length) args.domain = rest[0];
  return args;
}

function normalizeDomain(input) {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return new URL(withScheme).origin;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return { text: "", status: res.status, found: false };
  return { text: await res.text(), status: res.status, found: true };
}

function findBot(token) {
  const lower = token.toLowerCase();
  return KNOWN_BOTS.find((b) => b.token.toLowerCase() === lower);
}

export async function run(argv, { fetchTextImpl = fetchText, readFile = (p) => fs.readFile(p, "utf8") } = {}) {
  const args = parseArgs(argv);

  if (args.help || (!args.domain && !args.robotsFile)) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage: node cli.mjs <domain> [--json] [--path /some/path] [--fail-if-blocked Bot1,Bot2] [--fail-if-allowed Bot3]",
        "       node cli.mjs --robots-file ./robots.txt [--llms-file ./llms.txt] [--json]",
      ].join("\n"),
    };
  }

  let robotsText = "";
  let robotsFound = true;
  let llmsText = null;
  let llmsFound = false;
  let origin = null;

  if (args.robotsFile) {
    robotsText = await readFile(args.robotsFile);
    if (args.llmsFile) {
      llmsText = await readFile(args.llmsFile);
      llmsFound = true;
    }
  } else {
    origin = normalizeDomain(args.domain);
    const robots = await fetchTextImpl(`${origin}/robots.txt`);
    robotsText = robots.text;
    robotsFound = robots.found;
    const llms = await fetchTextImpl(`${origin}/llms.txt`);
    if (llms.found) {
      llmsText = llms.text;
      llmsFound = true;
    }
  }

  const { rows, sitemaps } = auditRobots(robotsText, args.paths);
  const llmsResult = llmsText !== null ? validateLlmsTxt(llmsText) : null;

  const blockedTokensLower = new Set(
    rows.filter((r) => r.status !== "allowed").map((r) => r.token.toLowerCase())
  );
  let exitCode = 0;
  const gateFailures = [];
  for (const token of args.failIfBlocked) {
    const bot = findBot(token);
    if (!bot) {
      gateFailures.push(`--fail-if-blocked: unknown bot token "${token}"`);
      exitCode = 2;
      continue;
    }
    if (blockedTokensLower.has(bot.token.toLowerCase())) {
      gateFailures.push(`${bot.token} is blocked or partially blocked, and --fail-if-blocked named it.`);
      exitCode = exitCode || 1;
    }
  }
  for (const token of args.failIfAllowed) {
    const bot = findBot(token);
    if (!bot) {
      gateFailures.push(`--fail-if-allowed: unknown bot token "${token}"`);
      exitCode = 2;
      continue;
    }
    if (!blockedTokensLower.has(bot.token.toLowerCase())) {
      gateFailures.push(`${bot.token} is allowed, and --fail-if-allowed named it.`);
      exitCode = exitCode || 1;
    }
  }

  if (args.json) {
    return {
      exitCode,
      output: JSON.stringify(
        {
          origin,
          robotsFound,
          sitemaps,
          paths: args.paths,
          bots: rows.map(({ token, operator, purpose, status, results }) => ({ token, operator, purpose, status, results })),
          llmsTxt: llmsFound ? llmsResult : null,
          gateFailures,
        },
        null,
        2
      ),
    };
  }

  const lines = [];
  lines.push(origin ? `Auditing ${origin}` : "Auditing local files");
  if (!robotsFound) lines.push("No robots.txt found (treated as allow-everything).");
  lines.push("");
  const w1 = Math.max("AI crawler".length, ...rows.map((r) => r.token.length)) + 2;
  const w2 = Math.max("operator".length, ...rows.map((r) => r.operator.length)) + 2;
  const w3 = Math.max("purpose".length, ...rows.map((r) => r.purpose.length)) + 2;
  lines.push("AI crawler".padEnd(w1) + "operator".padEnd(w2) + "purpose".padEnd(w3) + "status");
  lines.push("-".repeat(w1 + w2 + w3 + 7));
  for (const row of rows) {
    lines.push(`${row.token.padEnd(w1)}${row.operator.padEnd(w2)}${row.purpose.padEnd(w3)}${row.status}`);
  }
  if (llmsFound) {
    lines.push("");
    lines.push(`llms.txt: ${llmsResult.valid ? "structurally valid" : "has errors"}`);
    for (const e of llmsResult.errors) lines.push(`  error: ${e}`);
    for (const w of llmsResult.warnings) lines.push(`  warning: ${w}`);
  } else if (args.domain) {
    lines.push("");
    lines.push("llms.txt: not found (this is common; it's an emerging, optional convention).");
  }
  if (gateFailures.length) {
    lines.push("");
    for (const f of gateFailures) lines.push(`GATE: ${f}`);
  }
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
