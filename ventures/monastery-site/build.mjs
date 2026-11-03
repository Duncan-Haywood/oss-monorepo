#!/usr/bin/env node
// Build a community's website from its config file.
//
//   node build.mjs community.json --out site/      write every page
//   node build.mjs community.json --check          print the launch checklist only
//   node build.mjs community.json --zip site.zip   write the site as one archive
//   node build.mjs --demo                          rebuild the two example sites in demo/
//
// Exit code 1 when the checklist has a high finding (a page would be broken
// or misleading), so it can gate a deploy.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, checkSite } from "./site.mjs";
import { zip } from "./zip.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEMOS = { abbey: "examples/abbey.json", sisters: "examples/sisters.json" };

export function writeSite(config, outDir) {
  const { files, findings } = buildSite(config);
  mkdirSync(outDir, { recursive: true });
  for (const [name, body] of files) writeFileSync(path.join(outDir, name), body);
  return { files, findings };
}

export function formatFindings(findings) {
  if (!findings.length) return "Launch checklist: nothing missing.";
  const order = { high: 0, medium: 1, low: 2 };
  return ["Launch checklist:", ...findings.slice().sort((a, b) => order[a.level] - order[b.level])
    .map((f) => `  [${f.level}] ${f.page}: ${f.message}`)].join("\n");
}

function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes("--help") || !args.length) {
    console.log("usage: node build.mjs community.json [--out DIR] [--zip FILE] [--check] [--json]\n       node build.mjs --demo");
    return 0;
  }
  if (args.includes("--demo")) {
    for (const [name, file] of Object.entries(DEMOS)) {
      const out = path.join(here, "demo", name);
      if (existsSync(out)) rmSync(out, { recursive: true });
      const { files } = writeSite(JSON.parse(readFileSync(path.join(here, file), "utf8")), out);
      console.log(`demo/${name}: ${files.size} files`);
    }
    return 0;
  }
  const file = args.find((a) => !a.startsWith("--") && a !== flag("--out") && a !== flag("--zip"));
  const config = JSON.parse(readFileSync(file, "utf8"));
  const findings = checkSite(config);
  if (args.includes("--json")) console.log(JSON.stringify(findings, null, 2));
  else console.log(formatFindings(findings));
  if (flag("--out")) {
    const { files } = writeSite(config, flag("--out"));
    console.log(`Wrote ${files.size} files to ${flag("--out")}`);
  }
  if (flag("--zip")) {
    const { files } = buildSite(config);
    writeFileSync(flag("--zip"), zip([...files]));
    console.log(`Wrote ${flag("--zip")}`);
  }
  return findings.some((f) => f.level === "high") ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv);
