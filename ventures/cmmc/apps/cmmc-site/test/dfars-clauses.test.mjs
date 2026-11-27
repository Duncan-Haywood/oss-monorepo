// The DFARS cybersecurity clauses page: every quotation is word for word in the clause text saved from
// the eCFR (fixtures/dfars/, hashes pinned so a silent edit fails), every clause has its block, and the
// explainer links to the page.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CLAUSES, CLOCKS, DFARS_PATH, dfarsCounts, QUOTES } from "../src/dfars-clauses.mjs";
import { buildPages } from "../src/pages.mjs";
import { source } from "../src/site.mjs";

const fixture = (f) => readFileSync(new URL(`../fixtures/dfars/${f}`, import.meta.url), "utf8");
const flat = (s) => s.replace(/\s+/g, " ");

// sha256 of each saved text (eCFR versioner API, 2026-11-01 point in time, read 27 Nov 2026).
const HASHES = {
  "far-52.204-21.txt": "7ed1db04ee3de02840a96ad05a789530cfe8db005e3d4e6812b81f9d2b08d919",
  "dfars-252.204-7008.txt": "472734aae0b9050c578847f6d9737ff3eb0f526a4bb5d8abf0dccd645528abd1",
  "dfars-252.204-7012.txt": "653f6fecc845366d0526698dae48ca6ee75e2546da5d278bf5e0f510c536bd8c",
  "dfars-252.204-7019.txt": "e41e5e94f35445fff0e677426ef82c4dffc47886b68e27840b25006d5c759f81",
  "dfars-252.204-7020.txt": "88ced89a4f68b6f6f8c0e0f091d1f1ace7eba94cd8d3d98677aa5833fb1f5565",
  "dfars-252.204-7021.txt": "7c80a3426dc97e2336c72bb19c5b3a89b5173b605526f983da43089837812531",
  "dfars-252.204-7024.txt": "0100fb992b239f95aff05e78dd86e382e8ebbd9b5dc9118dba629dacc42e0846",
  "dfars-252.204-7025.txt": "c75c22de3ac1f20f63d8e99f1de0fe67cd2cbe007993f4f76e730875cb52b0d0",
  "dfars-204.7304.txt": "7f313266a2cb3f5deeae8f633ab4eaf1ea36a99fcbeb562e3f94aef35ec408c2",
  "dfars-204.7504.txt": "741e84bc20b7911497916099721fb2c17845b95c8b01affa8d7d62af5651a364",
};

test("the saved clause texts are the ones read from the eCFR", () => {
  for (const [f, h] of Object.entries(HASHES))
    assert.equal(createHash("sha256").update(fixture(f)).digest("hex"), h, f);
});

test("every quotation is word for word in its clause", () => {
  for (const [id, { file, text }] of Object.entries(QUOTES))
    assert.ok(flat(fixture(file)).includes(flat(text)), `${id} not found in ${file}`);
});

test("each clause's version and title match its saved text", () => {
  const files = {
    "52.204-21": "far-52.204-21.txt",
  };
  for (const c of CLAUSES) {
    const text = fixture(files[c.id] ?? `dfars-252.204-${c.id.slice(-4)}.txt`);
    assert.ok(text.includes(`(${c.version})`), `${c.id} version ${c.version}`);
    assert.ok(text.toLowerCase().includes(c.title.toLowerCase()), `${c.id} title`);
    assert.ok(source(c.source).url.includes(c.id) || c.id === "52.204-21", `${c.id} source url`);
  }
});

test("the page shows every clause, every quotation it uses, and the clocks", () => {
  const pages = buildPages();
  const page = pages.find((p) => p.path === DFARS_PATH);
  assert.ok(page);
  assert.ok(page.description.length <= 160, `description ${page.description.length}`);
  assert.deepEqual(dfarsCounts(), { clauses: 8, provisions: 4, flowDown: 4, quotes: 26 });
  assert.equal((page.body.match(/<section class="requirement"/g) ?? []).length, 8);
  for (const [id] of Object.entries(QUOTES))
    assert.ok(page.body.includes(`data-quote="${id}"`), `${id} unused on the page`);
  for (const [, , qid] of CLOCKS) assert.ok(QUOTES[qid], qid);
  // Text the readings lean on, so a reworded reading cannot drop the number it rests on.
  for (const s of ["72 hours", "90 days", "3 years", "14 business days", "180 days", "10 Nov 2028"])
    assert.ok(page.body.includes(s), s);
  assert.ok(
    pages.find((p) => p.path === "/cmmc-level-1-vs-level-2").body.includes(`href="${DFARS_PATH}"`),
  );
});
