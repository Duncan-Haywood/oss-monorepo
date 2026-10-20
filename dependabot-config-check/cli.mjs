#!/usr/bin/env node
// Zero-dependency CLI for check.mjs. Reads .github/dependabot.yml, walks the
// checkout for manifests, prints findings. No network calls, nothing written.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { analyze, generateConfig, summary, hasRisk } from "./check.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--config");
const root = positional[0] || ".";

if (flag("--help")) {
  console.log("usage: dependabot-config-check [repo] [--config path] [--format json] [--fail-on-risk] [--generate]");
  process.exit(0);
}

function walk(dir, out, depth = 0) {
  if (depth > 10 || out.length > 50000) return;
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out, depth + 1); else out.push(relative(root, p).split("\\").join("/"));
  }
}

const files = []; walk(root, files);

if (flag("--generate")) {
  const y = generateConfig(files);
  if (!y) { console.error("No supported manifests found."); process.exit(1); }
  process.stdout.write(y); process.exit(0);
}

const cfgPath = opt("--config") || [".github/dependabot.yml", ".github/dependabot.yaml"].map((p) => join(root, p)).find(existsSync);
if (!cfgPath || !existsSync(cfgPath)) {
  const y = generateConfig(files);
  console.error("No .github/dependabot.yml found: Dependabot version updates are off for this repository.");
  if (y) console.error("Run with --generate for a starter config.");
  process.exit(flag("--fail-on-risk") ? 2 : 1);
}

const result = analyze(readFileSync(cfgPath, "utf8"), files);
if (opt("--format") === "json") console.log(JSON.stringify({ config: cfgPath, ...result, parseError: undefined, entries: undefined }, null, 2));
else {
  for (const f of result.findings) console.log(`${cfgPath}:${f.line}  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}\n    ${f.message}${f.fix ? "\n    fix: " + f.fix.replace(/\n/g, "\n    ") : ""}`);
  console.log(summary(result));
}
process.exit(flag("--fail-on-risk") && hasRisk(result) ? 2 : 0);
