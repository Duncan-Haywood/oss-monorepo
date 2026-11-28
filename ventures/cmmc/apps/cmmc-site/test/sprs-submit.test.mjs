// The "how to submit your SPRS score" page: every quotation is word for word in DoD's SPRS guides
// (fixtures/sprs/, hashes pinned so a silent edit fails) or DFARS 252.204-7019 (fixtures/dfars/), every
// quotation is on the page, the guides are all cited, and the calculator and clauses pages link to it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPages } from "../src/pages.mjs";
import { source } from "../src/site.mjs";
import { GUIDE_SOURCES, QUOTES, RECORDS, SPRS_SUBMIT_PATH } from "../src/sprs-submit.mjs";

const fixture = (f) => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8");
const flat = (s) => s.replace(/\s+/g, " ");

// sha256 of each saved text (SPRS guides downloaded 28 Nov 2026; fixtures/sprs/README.md).
const HASHES = {
  "sprs/sprs-access-new-piee.txt":
    "2b8d8f0d1861837e4edd0e57b2070cf198071de984601ab74613a757ceb0167c",
  "sprs/sprs-access-with-piee.txt":
    "0455f56cb5da0a81c2e8e490059e0c490557246b33c8f43ff795fc7188ad0dc6",
  "sprs/sprs-affirming-official-tutorial.txt":
    "cc3b9af7504647f8d3d6ab59400c267c3c7eeea36f430de88253284e6017786c",
  "sprs/sprs-cmmc-level-1-quick-entry.txt":
    "4c87f87743d5b848b2d04a43d889850b17687ac201472b299be6c1ebe2ea3125",
  "sprs/sprs-cmmc-level-2-quick-entry.txt":
    "2c5a614960acd4b03d1d833aa4356b87f93a330e66d59ceeccdaaa2543002419",
  "sprs/sprs-nist-800-171-quick-entry.txt":
    "a78639dcf921a527fd9ed80f8fc6492d212a16536a518da14407053e88f3acaa",
};

test("the saved SPRS guide texts are the ones downloaded", () => {
  for (const [f, h] of Object.entries(HASHES))
    assert.equal(createHash("sha256").update(fixture(f)).digest("hex"), h, f);
});

test("every quotation is word for word in its source", () => {
  for (const [id, { file, text }] of Object.entries(QUOTES))
    assert.ok(flat(fixture(file)).includes(flat(text)), `${id} not found in ${file}`);
});

test("the page shows every quotation, cites every guide and states the periods", () => {
  const pages = buildPages();
  const page = pages.find((p) => p.path === SPRS_SUBMIT_PATH);
  assert.ok(page);
  assert.ok(page.description.length <= 160, `description ${page.description.length}`);
  for (const id of Object.keys(QUOTES))
    assert.ok(page.body.includes(`data-quote="${id}"`), `${id} unused on the page`);
  for (const id of GUIDE_SOURCES) {
    assert.ok(source(id).url.startsWith("https://www.sprs.csd.disa.mil/pdf/"), id);
    assert.ok(page.body.includes(source(id).url), `${id} not cited`);
  }
  for (const [, , qid] of RECORDS) assert.ok(QUOTES[qid], qid);
  // Numbers the steps rest on, so a reworded step cannot drop them.
  for (const s of [
    "88 to 109",
    "180 days",
    "after 1 year",
    "three years",
    "48 hours",
    "webptsmh@navy.mil",
  ])
    assert.ok(page.body.includes(s), s);
  // It never claims to submit for the shop.
  assert.ok(page.body.includes("never logs in to PIEE or submits to SPRS for you"));
});

test("the calculator and the DFARS clauses page link to it", () => {
  const pages = buildPages();
  for (const from of ["/sprs-score-calculator", "/dfars-cybersecurity-clauses"]) {
    const p = pages.find((x) => x.path === from);
    const text = p.body + JSON.stringify(p.faq ?? []);
    assert.ok(text.includes(SPRS_SUBMIT_PATH), from);
  }
});
