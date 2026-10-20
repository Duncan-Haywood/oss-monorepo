import { test } from "node:test";
import assert from "node:assert/strict";
import { tokens, similar } from "./similar.mjs";

const docs = [
  { id: "csv", text: "Export reports to CSV" },
  { id: "dark", text: "Dark mode for the dashboard" },
  { id: "sso", text: "SAML single sign-on for teams" },
  { id: "api", text: "Public REST API with API keys" },
];

test("tokens drop stop words, stem plurals and add bigrams", () => {
  const t = tokens("Please add exports of reports");
  assert.ok(t.includes("export") && t.includes("report") && t.includes("export_report"));
  assert.ok(!t.includes("please") && !t.includes("add"));
});

test("a reworded request finds its duplicate first", () => {
  assert.equal(similar("CSV export of reports", docs)[0].id, "csv");
  assert.equal(similar("night dark mode please", docs)[0].id, "dark");
  assert.equal(similar("single sign on SAML", docs)[0].id, "sso");
});

test("unrelated text matches nothing and empty input is safe", () => {
  assert.deepEqual(similar("gluten free pizza", docs), []);
  assert.deepEqual(similar("", docs), []);
  assert.deepEqual(similar("anything", []), []);
});

test("scores are 0..1, sorted, and limited", () => {
  const r = similar("api keys rest", [...docs, { id: "api2", text: "REST API" }], { min: 0.05, limit: 2 });
  assert.equal(r.length, 2);
  assert.ok(r[0].score >= r[1].score && r[0].score <= 1 && r[1].score > 0);
});
