// ISO 20022 CAMT files written by someone else: does each import, and does the
// opening balance plus the imported rows equal the file's closing balance?
// Read at run time from a directory you give (the ofxstatement-iso20022 project's
// tests/samples, GPL, never copied into this repo).
//
//   git clone --depth 1 https://github.com/kedder/ofxstatement-iso20022
//   node eval/camt-corpus.mjs ofxstatement-iso20022/tests/samples
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readStatement, parseCents } from "../bank.mjs";

const bal = (xml, code) => {
  const m = xml.match(new RegExp(`<Cd>${code}</Cd>[\\s\\S]*?<Amt[^>]*>([\\d.]+)</Amt>\\s*<CdtDbtInd>(CRDT|DBIT)`));
  return m ? (m[2] === "DBIT" ? -1 : 1) * parseCents(m[1]) : null;
};

export function checkFile(xml, name = "") {
  const r = readStatement(xml, name);
  const net = r.rows.reduce((a, x) => a + x.cents, 0);
  const open = bal(xml, "OPBD") ?? bal(xml, "PRCD");
  const close = bal(xml, "CLBD");
  const out = { name, rows: r.rows.length, problems: r.problems.length, net, open, close, statement: r.statement?.cents ?? null };
  out.arithmetic = open === null || close === null ? "no balances" : open + net === close ? "ties" : `off by ${open + net - close}`;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node eval/camt-corpus.mjs <directory of .xml files>"); process.exit(2); }
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".xml")).sort()) {
    const o = checkFile(readFileSync(join(dir, f), "utf8"), f);
    console.log(`${f.padEnd(18)} rows ${String(o.rows).padStart(3)}  problems ${o.problems}  statement ${o.statement}  arithmetic ${o.arithmetic}`);
  }
}
