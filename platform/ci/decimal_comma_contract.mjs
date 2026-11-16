#!/usr/bin/env node
// Behavioural contract for every venture's detectDecimalComma(table, delim).
//
// 32 report analyzers vendor the same function: it decides whether "12,50"
// in an uploaded export means twelve and a half or one thousand two hundred
// and fifty, so a fault in it multiplies every amount a European user uploads
// by 100. On 2026-11-16 a red-team campaign found 30 of the 32 copies had no
// test that called it, and seeded faults in two copies (a quantifier widened,
// an `||` turned into `&&` in the text-cell skip) passed both suites. This file
// imports each copy and runs it against one table of cases, so a copy edited
// out of line fails CI whether or not its own venture tests it.
//
//   node platform/ci/decimal_comma_contract.mjs [ventures-dir]   exit 1 on a breach
//
// check_decimal_comma_contract.py runs it (unwired_checks.py picks that up on
// every pull request).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? join(here, "..", "..", "ventures"));

// [description, table, delim, expected]
export const CASES = [
  ["dot decimals", [["Total"], ["12.50"]], ",", false],
  ["comma decimals", [["Total"], ["12,50"]], ",", true],
  ["one dot decimal digit is a vote", [["Total"], ["12.5"]], ";", false],
  ["one comma decimal digit is a vote", [["Total"], ["12,5"]], ",", true],
  ["European grouping with decimals", [["Total"], ["1.234,56"]], ",", true],
  ["US grouping with decimals", [["Total"], ["1,234.56"]], ";", false],
  ["two thousands groups are an amount, not a date", [["Total"], ["1.234.567,89"]], ",", true],
  ["whole numbers fall back to the delimiter (semicolon)", [["Total"], ["1234"]], ";", true],
  ["whole numbers fall back to the delimiter (comma)", [["Total"], ["1234"]], ",", false],
  ["a tie falls back to the delimiter (comma)", [["12,50"], ["12.50"]], ",", false],
  ["a tie falls back to the delimiter (semicolon)", [["12,50"], ["12.50"]], ";", true],
  ["the majority wins", [["12,50"], ["3,10"], ["1.50"]], ",", true],
  ["text with digits never votes", [["Bottle 1,5 l"], ["Bottle 2,5 l"], ["10.00"]], ",", false],
  ["a currency code is not text", [["EUR 12,50"]], ",", true],
  ["a USD amount votes", [["USD 12.50"]], ";", false],
  ["dotted dates do not vote", [["01.08.2026"], ["02.08.2026"], ["12.50"]], ";", false],
  ["ISO dates do not vote", [["2026-08-01"]], ";", true],
  ["times do not vote", [["10:15,50"], ["12.50"]], ";", false],
  ["empty and missing cells", [[null, undefined, ""]], ",", false],
  ["an empty table", [], ";", true],
];

function copies(dir) {
  const out = [];
  for (const v of readdirSync(dir).sort()) {
    const vdir = join(dir, v);
    if (!statSync(vdir).isDirectory()) continue;
    for (const f of readdirSync(vdir).sort()) {
      if (!f.endsWith(".mjs") || f.includes(".test.") || f.includes(".check.")) continue;
      const path = join(vdir, f);
      if (/export function detectDecimalComma\s*\(/.test(readFileSync(path, "utf8"))) out.push(path);
    }
  }
  return out;
}

export async function check(dir = root) {
  const problems = [];
  const files = copies(dir);
  for (const path of files) {
    let fn;
    try { fn = (await import(pathToFileURL(path).href)).detectDecimalComma; }
    catch (e) { problems.push(`${path}: import failed: ${e.message}`); continue; }
    for (const [what, table, delim, want] of CASES) {
      let got;
      try { got = fn(table, delim); } catch (e) { got = `threw ${e.message}`; }
      if (got !== want) problems.push(`${path}: ${what}: detectDecimalComma(${JSON.stringify(table)}, ${JSON.stringify(delim)}) returned ${got}, expected ${want}`);
    }
  }
  return { files, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { files, problems } = await check();
  for (const p of problems.slice(0, 50)) console.log(p);
  console.log(`decimal-comma contract: ${files.length} copies, ${CASES.length} cases each, ${problems.length} breach(es)`);
  process.exit(problems.length || !files.length ? 1 : 0);
}
