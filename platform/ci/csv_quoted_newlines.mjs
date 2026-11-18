// Which venture CSV parsers split a quoted field that spans lines?
//
// Found by the red team on 2026-11-17: merchant-feed-check split a feed into
// lines before reading quotes, so a Shopify or Excel export whose quoted
// description held a line break became two broken items, one of them a
// phantom row of "missing required field" errors. deal-keeper and
// cost-sharing-calculator had the same shape. RFC 4180 lets a quoted field
// hold CRLF, and spreadsheet exports use it for any multi-line cell.
//
// For every exported parseCsv / parseTsv / parseDelimited (plus the named
// EXTRA functions) in ventures/*/*.mjs, this calls the function with a header
// and one record whose quoted first field spans four lines, and asks whether
// "l1", "l2" and "l3" come back together in one value. It prints a JSON list
// of the parsers that split it. test_csv_quoted_newlines.py holds the ratchet
// (a known list that may only shrink), and unwired_checks.py runs that suite
// on every pull request.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VENTURES = join(ROOT, "ventures");
const NAME = /^export\s+(?:async\s+)?function\s+(parse(?:Csv|CSV|Tsv|TSV|Delimited)\w*)\s*\(/gm;
// Parsers with another name that take CSV text as their only argument.
const EXTRA = { "merchant-feed-check/engine.mjs": ["parseFeed"] };
const FIXTURE = 'name,amount\r\n"l1\r\nl2\nl3\nl4",2\r\n';
// Parsers that drop a record missing their own required columns.
const FIXTURES = { "deal-keeper/engine.mjs": 'id,name,created\r\nd1,"l1\r\nl2\nl3\nl4",2026-01-01\r\n' };
const TOGETHER = /l1(\\r\\n|\\n| )l2(\\n| )l3/;

export async function scan() {
  const broken = [];
  let checked = 0;
  for (const v of readdirSync(VENTURES).sort()) {
    let names;
    try { names = readdirSync(join(VENTURES, v)); } catch { continue; }
    for (const n of names.sort()) {
      if (!n.endsWith(".mjs") || n.endsWith(".test.mjs")) continue;
      const rel = `${v}/${n}`;
      const src = readFileSync(join(VENTURES, v, n), "utf8");
      const fns = [...src.matchAll(NAME)].map((m) => m[1]).concat(EXTRA[rel] || []);
      if (!fns.length) continue;
      const mod = await import(pathToFileURL(join(VENTURES, v, n)));
      for (const f of fns) {
        if (typeof mod[f] !== "function") continue;
        checked += 1;
        let out;
        try { out = await mod[f](FIXTURES[rel] ?? FIXTURE); } catch { broken.push(`ventures/${rel}:${f}`); continue; }
        if (!TOGETHER.test(JSON.stringify(out) ?? "")) broken.push(`ventures/${rel}:${f}`);
      }
    }
  }
  return { checked, broken };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(await scan()));
}
