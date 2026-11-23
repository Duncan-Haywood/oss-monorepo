// Compares the engine with a recorded run of real PostgreSQL 16
// (run-pg.mjs). Exit 0 when every row and every connection agrees.
//
//   node parity/compare.mjs [parity/pg-16.json]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readHba, viewRow, matchConnection, pastedResolver } from "../scan.mjs";
import { ROLES } from "./gen.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function resolverFor(data, files) {
  return pastedResolver(Object.entries(files).map(([name, text]) => ({ name: `${data}/${name}`, text })));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function compare(recorded) {
  const data = recorded.data;
  const diffs = [];
  let rows = 0, conns = 0;
  for (const c of recorded.parse) {
    const res = readHba({ resolver: resolverFor(data, c.files), main: `${data}/pg_hba.conf` });
    const mine = res.rows.map((r) => ({ row: viewRow(r), regex: r.regex }));
    if (mine.length !== c.rows.length) { diffs.push({ kind: "parse", seed: c.seed, why: `row count ${mine.length} vs ${c.rows.length}`, mine: mine.map((m) => m.row), pg: c.rows }); continue; }
    c.rows.forEach((pg, i) => {
      rows++;
      const { row, regex } = mine[i];
      // PostgreSQL's regex engine words its errors its own way: for a regex
      // the engine cannot compile, agreeing that the line fails is enough.
      if (regex && pg.error && pg.error.startsWith("invalid regular expression")) { if (row.line_number !== pg.line_number) diffs.push({ kind: "parse", seed: c.seed, mine: row, pg }); return; }
      if (!same(row, pg)) diffs.push({ kind: "parse", seed: c.seed, mine: row, pg });
    });
  }
  for (const c of recorded.match) {
    const res = readHba({ resolver: resolverFor(data, c.files), main: `${data}/pg_hba.conf` });
    if (!res.loads) { diffs.push({ kind: "match", seed: c.seed, why: "engine says the file does not load" }); continue; }
    for (const r of c.results) {
      conns++;
      const m = matchConnection(res.rules, r.conn, ROLES);
      let got;
      if (m.unknown.length) got = { outcome: "unknown" };
      else if (!m.rule) got = { outcome: "none" };
      else if (m.rule.method === "reject") got = { outcome: "reject" };
      else got = { outcome: "auth", method: m.rule.method, file: m.rule.file, line: m.rule.line };
      const want = r.outcome === "auth" ? { outcome: "auth", method: r.method, file: r.file, line: r.line } : { outcome: r.outcome };
      if (!same(got, want)) diffs.push({ kind: "match", seed: c.seed, conn: r.conn, mine: got, pg: want });
    }
  }
  return { rows, conns, diffs };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const file = process.argv[2] || path.join(here, "pg-16.json");
  const rec = JSON.parse(readFileSync(file, "utf8"));
  const { rows, conns, diffs } = compare(rec);
  console.log(`${rec.server}\n${rec.parse.length} parse cases, ${rows} view rows; ${rec.match.length} match cases, ${conns} connections; ${diffs.length} differences`);
  for (const d of diffs.slice(0, 15)) console.log(JSON.stringify(d));
  process.exitCode = diffs.length ? 1 : 0;
}
