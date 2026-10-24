import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addOfficialFindings, officialNote } from "./official.mjs";

const mk = () => ({ reports: [{ file: "a.xml", errors: [{ rule: "INV-001" }] }, { file: "b.json", errors: [] }] });
const inputs = [{ name: "a.xml", source: "<x/>" }, { name: "b.json", source: "{}" }];

test("merges only Schematron findings and posts XML to the API", async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push([url, init.method]);
    return { ok: true, json: async () => ({ reports: [{ schematron: "ok", errors: [{ rule: "INV-001" }, { rule: "BR-02", source: "en16931-schematron" }] }] }) };
  };
  const r = await addOfficialFindings(mk(), inputs, { profile: "peppol", fetchFn });
  assert.deepEqual(r.reports[0].errors.map((e) => e.rule), ["INV-001", "BR-02"]);
  assert.equal(r.reports[0].schematron, "ok");
  assert.equal(r.reports[1].schematron, "unavailable");
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /^v1\/validate\?.*schematron=1.*profile=peppol/);
});

test("a host without the API reports unavailable, never a pass", async () => {
  for (const fetchFn of [async () => ({ ok: false }), async () => { throw new Error("offline"); }]) {
    const r = await addOfficialFindings(mk(), inputs, { fetchFn });
    assert.equal(r.reports[0].schematron, "unavailable");
    assert.equal(r.reports[0].errors.length, 1);
    assert.match(officialNote(r.reports[0]), /not run/);
  }
});

test("the page offers the option with a privacy warning", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="official"/);
  assert.match(page, /sends the file to the server this page is served from/);
  assert.match(page, /addOfficialFindings/);
});
