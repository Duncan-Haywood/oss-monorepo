// @ts-check
// worker/provision.mjs: the deploy config and wrangler-output parsing (no Cloudflare calls).
// Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ALREADY_EXISTS, RESOURCES, d1IdFrom, deployConfigFor, jurisdictionOf, parseArgs, parseJson, parseJsonc } from "./provision.mjs";

const BASE = parseJsonc(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

test("parses the committed wrangler.jsonc, comments and the escaped define included", () => {
  assert.equal(BASE.name, "einvoice-pro");
  assert.equal(BASE.main, "worker/index.mjs");
  assert.equal(BASE.define["import.meta.url"], '"file:///bundle/apps/einvoice-preflight/worker/index.mjs"');
  assert.deepEqual(BASE.d1_databases, [{ binding: "DB", database_name: "einvoice-pro" }]);
  assert.equal(BASE.limits.cpu_ms, 60000);
});

test("parseJsonc keeps // and /* inside strings, drops trailing commas", () => {
  assert.deepEqual(parseJsonc('{ "a": "http://x/*y*/", // c\n /* d */ "b": [1, 2,], }'), { a: "http://x/*y*/", b: [1, 2] });
  assert.deepEqual(parseJsonc('{ "q": "say \\"hi\\" // not a comment" }'), { q: 'say "hi" // not a comment' });
});

test("deploy config: the D1 id, workers.dev by default, the base left untouched", () => {
  const cfg = deployConfigFor(BASE, { d1Id: "1234-abcd" });
  assert.deepEqual(cfg.d1_databases, [{ binding: "DB", database_name: RESOURCES.d1, database_id: "1234-abcd" }]);
  assert.equal(cfg.workers_dev, true);
  assert.equal(cfg.routes, undefined);
  assert.equal(cfg.main, BASE.main);
  assert.deepEqual(cfg.limits, BASE.limits);
  assert.deepEqual(cfg.compatibility_flags, ["nodejs_compat"]);
  assert.equal(BASE.d1_databases[0].database_id, undefined, "the base config is not mutated");
});

test("deploy config: a custom domain turns workers.dev off", () => {
  const cfg = deployConfigFor(BASE, { d1Id: "x", domain: "app.example.org" });
  assert.deepEqual(cfg.routes, [{ pattern: "app.example.org", custom_domain: true }]);
  assert.equal(cfg.workers_dev, false);
});

test("deploy config: demo and test switches never reach production", () => {
  const cfg = deployConfigFor({ ...BASE, vars: { FAKE_EXTERNALS: "true", FAKE_LLM: "1", FREE_API: "on", PRO_DATA_FILE: "/x", KEEP: "1" } }, { d1Id: "x" });
  assert.deepEqual(cfg.vars, { KEEP: "1" });
});

test("deploy config: refuses a config without the DB binding; drops a stale id and preview id", () => {
  assert.throws(() => deployConfigFor({ ...BASE, d1_databases: [] }), /no D1 binding named DB/);
  const cfg = deployConfigFor({ ...BASE, d1_databases: [{ binding: "DB", database_name: "old", database_id: "stale", preview_database_id: "p" }] });
  assert.deepEqual(cfg.d1_databases, [{ binding: "DB", database_name: RESOURCES.d1 }]);
});

test("args: a bare .json name beside wrangler.jsonc, a bare hostname", () => {
  assert.deepEqual(parseArgs(["--write-config", "wrangler.deploy.json", "--domain", " App.Example.org "]), {
    writeConfig: "wrangler.deploy.json",
    domain: "app.example.org",
    dryRun: false,
  });
  assert.throws(() => parseArgs(["--write-config", "../x.json"]), /bare \.json file name/);
  assert.throws(() => parseArgs(["--write-config", "dist/x.json"]), /bare \.json file name/);
  assert.throws(() => parseArgs(["--write-config", "x.jsonc"]), /bare \.json file name/);
  assert.throws(() => parseArgs(["--domain", "https://x.org/"]), /bare hostname/);
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});

test("wrangler output: JSON after warnings, the id by name, existing-database errors", () => {
  const out = '▲ [WARNING] Proxy environment variables detected.\n[\n  { "uuid": "u-1", "name": "other" },\n  { "uuid": "u-2", "name": "einvoice-pro", "jurisdiction": "eu" }\n]\n';
  const list = parseJson(out);
  assert.equal(d1IdFrom(list, "einvoice-pro"), "u-2");
  assert.equal(d1IdFrom(list, "missing"), "");
  assert.equal(d1IdFrom(null, "einvoice-pro"), "");
  assert.throws(() => parseJson("no json here"), /expected JSON/);
  assert.ok(ALREADY_EXISTS.test("A database with that name already exists [code: 7502]"));
  assert.ok(!ALREADY_EXISTS.test("Authentication error [code: 10000]"));
});

test("jurisdiction: eu, other, or unknown when the listing does not say", () => {
  assert.equal(jurisdictionOf([{ name: "einvoice-pro", jurisdiction: "EU" }], "einvoice-pro"), "eu");
  assert.equal(jurisdictionOf([{ name: "einvoice-pro", jurisdiction: "us" }], "einvoice-pro"), "other");
  assert.equal(jurisdictionOf([{ name: "einvoice-pro" }], "einvoice-pro"), "unknown");
  assert.equal(jurisdictionOf([], "einvoice-pro"), "unknown");
});

test("parseArgs refuses a value flag given last with no value", () => {
  assert.throws(() => parseArgs(["--domain"]), /--domain needs a value/);
  assert.throws(() => parseArgs(["--write-config"]), /--write-config needs a value/);
  assert.equal(parseArgs(["--domain", "Example.COM"]).domain, "example.com");
});
