// node --test scripts/provision.test.mjs (seller-books-ci runs it). Pure parts of the deploy provisioning.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALREADY_EXISTS,
  d1IdFrom,
  deployConfigFor,
  parseArgs,
  parseJson,
  RESOURCES,
} from "./provision.mjs";

const build = {
  name: "seller-books",
  main: "index.js",
  d1_databases: [
    {
      binding: "DB",
      database_name: "seller-books",
      migrations_dir: "../../migrations",
      preview_database_id: "x",
    },
  ],
  send_email: [{ name: "EMAIL" }],
  vars: {
    APP_ENV: "development",
    APP_URL: "http://localhost:5173",
    FAKE_EXTERNALS: "true",
  },
};

test("deploy config: D1 id, workers.dev, no dev-only vars", () => {
  const cfg = deployConfigFor(build, { d1Id: "abc-123" });
  assert.equal(cfg.name, RESOURCES.worker);
  assert.equal(cfg.topLevelName, RESOURCES.worker);
  assert.deepEqual(cfg.d1_databases, [
    {
      binding: "DB",
      database_name: "seller-books",
      migrations_dir: "../../migrations",
      database_id: "abc-123",
    },
  ]);
  assert.deepEqual(cfg.send_email, [{ name: "EMAIL" }], "the mail binding is kept");
  assert.equal(cfg.workers_dev, true);
  assert.equal(cfg.routes, undefined);
  assert.equal(cfg.vars.FAKE_EXTERNALS, undefined, "the fake checkout flag never reaches a deploy");
  assert.equal(build.vars.FAKE_EXTERNALS, "true", "the build output is not mutated");
  assert.equal(cfg.r2_buckets, undefined, "Seller Books stores no files, so no R2");
});

test("deploy config: custom domain turns workers.dev off; no id leaves database_id out", () => {
  const cfg = deployConfigFor(build, { domain: "books.example.org" });
  assert.deepEqual(cfg.routes, [{ pattern: "books.example.org", custom_domain: true }]);
  assert.equal(cfg.workers_dev, false);
  assert.equal(cfg.d1_databases[0].database_id, undefined);
  assert.equal(cfg.d1_databases[0].preview_database_id, undefined);
});

test("args: domain must be a bare hostname", () => {
  assert.equal(parseArgs(["--domain", "Books.Example.org "]).domain, "books.example.org");
  assert.equal(parseArgs([]).from, "dist/seller_books/wrangler.json");
  assert.throws(() => parseArgs(["--domain", "https://books.example.org/"]), /bare hostname/);
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});

test("wrangler output parsing", () => {
  const list = parseJson(
    '▲ [WARNING] something\n[note] also a log line\n[{"uuid":"u-1","name":"seller-books"},{"uuid":"u-2","name":"other"}]',
  );
  assert.equal(d1IdFrom(list, "seller-books"), "u-1");
  assert.equal(d1IdFrom(list, "missing"), "");
  assert.equal(d1IdFrom({ not: "a list" }, "seller-books"), "");
  assert.ok(ALREADY_EXISTS.test("A database with that name already exists [code: 7502]"));
  assert.throws(() => parseJson("no json here"), /expected JSON/);
});
