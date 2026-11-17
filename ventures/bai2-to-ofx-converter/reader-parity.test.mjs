// The reader half of calc.mjs is a copy of ../bai2-statement-reader/calc.mjs, whose suite tests it in depth
// (88 continuations, one-line files, trailer repair). This suite tested only the converters, so a fault in the
// copied reader escaped it (red team 2026-11-17: a one-line file's 03 records, an 88 continuation, and the
// rebuilt trailers of a wrapped file each changed with no test failing here). Rather than duplicate those tests,
// hold the copy to the tested original: every reader export must give the same answer on the same inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mine from "./calc.mjs";
import * as reader from "../bai2-statement-reader/calc.mjs";

const lines = (t) => t.split("\n").filter(Boolean);
const join = (ls) => ls.join("\n") + "\n";

function wrapped() {
  const ls = lines(reader.sampleFile());
  const i = ls.findIndex((l) => l.startsWith("16,175,"));
  ls[i] = "16,175,420000,,DEP48211,CHK DEPOSIT 4 ITEMS,MOBILE DEP";
  ls.splice(i + 1, 0, "88,OSIT NORTH BRANCH/");
  return join(ls);
}

const CORPUS = {
  sample: () => reader.sampleFile(),
  broken: () => reader.sampleBrokenFile(),
  "one line": () => lines(reader.sampleFile()).join(""),
  "one line, broken": () => lines(reader.sampleBrokenFile()).join(" "),
  "88 continuation": wrapped,
  "88 continuation, CRLF": () => wrapped().replace(/\n/g, "\r\n"),
  "wrapped 03 record": () => reader.sampleFile().replace(/^(03,[^\n]*?,)(\d{3},[^\n]*)$/m, "$1\n88,$2"),
  "no slashes": () => reader.sampleFile().replace(/\/$/gm, ""),
  "missing 49": () => join(lines(reader.sampleFile()).filter((l, i, a) => !(l.startsWith("49,") && i === a.findIndex((x) => x.startsWith("49,"))))),
  "detail-only totals": () => reader.repair(reader.sampleBrokenFile()).text,
  "starts wrong": () => "16,175,1/\n" + reader.sampleFile(),
  empty: () => "",
  garbage: () => "hello, world\n01\n99,x/",
};

// accountList in the converter also carries each account's txns (the converters need them); nothing else differs.
const strip = (r) => ({ ...r, summary: { ...r.summary, accountList: r.summary.accountList.map(({ txns, ...a }) => a) } });

for (const [name, make] of Object.entries(CORPUS)) {
  test(`reader copy matches bai2-statement-reader: ${name}`, () => {
    const text = make();
    assert.deepEqual(mine.splitRecords(text), reader.splitRecords(text));
    assert.deepEqual(strip(mine.validate(text)), strip(reader.validate(text)));
    assert.deepEqual(mine.repair(text), reader.repair(text));
    const v = reader.validate(text);
    assert.equal(mine.maskedFindingsCsv(v), reader.maskedFindingsCsv(v));
    assert.equal(mine.transactionsCsv(v), reader.transactionsCsv(v));
  });
}

test("the corpus reaches the paths the converter's own tests miss", () => {
  // A wrapped record goes through the joined-trailer rebuild, and a one-line file is cut into its records.
  assert.match(reader.repair(wrapped()).changes[0] || "", /88/);
  assert.equal(reader.splitRecords(CORPUS["one line"]()).lines.length, lines(reader.sampleFile()).length);
  assert.ok(reader.validate(wrapped()).summary.transactionList.some((t) => /MOBILE DEP,OSIT/.test(t.text)));
});

test("type helpers and the sample builders match", () => {
  for (let c = 0; c < 1000; c += 7) { assert.equal(mine.typeKind(c), reader.typeKind(c)); assert.equal(mine.typeName(c), reader.typeName(c)); }
  assert.equal(mine.sampleFile(), reader.sampleFile());
  assert.equal(mine.sampleBrokenFile(), reader.sampleBrokenFile());
});
