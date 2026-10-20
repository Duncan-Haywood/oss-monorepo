#!/usr/bin/env node
// node cli.mjs audit <file|url> [--json] [--min-score N]
// Fetching a URL needs Node 18+ (fetch has no CORS limit outside a browser).
import { readFile } from "node:fs/promises";
import { audit } from "./analyze.mjs";

export function render(r) {
  if (!r.ok) return r.error;
  const out = [`Score ${r.score}/100 (${r.grade})  AI-readiness ${r.aiReadiness}%  ${r.counts.critical} critical, ${r.counts.warning} warning, ${r.counts.info} info`];
  for (const x of r.findings) out.push(`\n[${x.severity.toUpperCase()}] ${x.title}\n  ${x.detail.replace(/`/g, "")}\n  Fix: ${x.fix}`);
  if (!r.findings.length) out.push("\nNothing found. This reads markup only; it is not a ranking guarantee.");
  return out.join("\n");
}

export async function main(argv, io = { log: console.log, err: console.error }) {
  const args = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--min-score");
  const min = argv.includes("--min-score") ? Number(argv[argv.indexOf("--min-score") + 1]) : null;
  if (args[0] !== "audit" || !args[1]) { io.err("usage: cli.mjs audit <file|url> [--json] [--min-score N]"); return 2; }
  let html;
  try {
    html = /^https?:\/\//i.test(args[1])
      ? await (await fetch(args[1], { headers: { "user-agent": "page-seo-audit/1.0" } })).text()
      : await readFile(args[1], "utf8");
  } catch (e) { io.err(`could not read ${args[1]}: ${e.message}`); return 2; }
  const r = audit(html, { url: args[1] });
  io.log(argv.includes("--json") ? JSON.stringify(r, null, 2) : render(r));
  if (!r.ok) return 2;
  return min != null && r.score < min ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
