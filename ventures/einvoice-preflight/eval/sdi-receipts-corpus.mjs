// Runs the SdI receipt reader (sdi-receipt.mjs) over public SdI receipts and notices:
// the Agenzia delle Entrate's example messages as mirrored in link-it/govway, and the
// receipts AgID's EeISI project got back from SdI's test and production environments
// in 2019 (with three of the invoices they answer). The files are not copied here;
// each is downloaded and refused unless its SHA-256 matches eval/sdi-receipts-corpus.json.
//   node eval/sdi-receipts-corpus.mjs <cache-dir>
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { preflightDocuments } from "../report.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node eval/sdi-receipts-corpus.mjs <cache-dir>"); process.exit(2); }
mkdirSync(dir, { recursive: true });
const list = JSON.parse(readFileSync(new URL("./sdi-receipts-corpus.json", import.meta.url), "utf8"));
const inputs = [];
for (const row of list) {
  const path = join(dir, row.sha256 + ".xml");
  if (!existsSync(path)) {
    const res = await fetch(row.url);
    if (!res.ok) throw new Error(`${row.url}: HTTP ${res.status}`);
    writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
  }
  const bytes = new Uint8Array(readFileSync(path));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== row.sha256) throw new Error(`${row.name}: SHA-256 ${digest} is not the pinned ${row.sha256}`);
  inputs.push({ name: row.name, source: bytes });
}
const out = await preflightDocuments(inputs, { maxFiles: 100 });
const tally = { receipts: 0, byType: {}, codes: 0, paired: 0, reproduced: 0, notReproduced: 0 };
for (const r of out.reports) {
  if (!r.receipt) continue;
  tally.receipts++;
  tally.byType[r.receipt.type] = (tally.byType[r.receipt.type] || 0) + 1;
  tally.codes += r.receipt.codes.length;
  if (r.receipt.pairedWith) tally.paired++;
  const codes = r.errors.filter((e) => /^SDI-\d/.test(e.rule));
  for (const e of codes) { if (e.reproduced === true) tally.reproduced++; if (e.reproduced === false) tally.notReproduced++; }
  console.log([r.file, r.receipt.type, r.receipt.codes.join("+") || r.receipt.outcome || "-", r.receipt.pairedWith ? `${r.receipt.pairedWith} (${r.receipt.pairedBy})` : "",
    codes.map((e) => `${e.rule}${e.reproduced === undefined ? "" : e.reproduced ? " reproduced" : " not reproduced"}`).join(", "),
    r.errors.filter((e) => e.rule === "SDI-HASH").map((e) => `hash ${e.severity === "warning" ? "differs" : "matches"}`).join("")].join(" | "));
}
for (const e of out.readErrors) console.log("read error:", e.file, e.error);
console.log("\n" + JSON.stringify(tally));
