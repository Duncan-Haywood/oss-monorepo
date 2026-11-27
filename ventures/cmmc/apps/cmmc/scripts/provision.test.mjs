// node --test scripts/provision.test.mjs (cmmc-ci runs it). Pure parts of the deploy provisioning.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ALREADY_EXISTS,
  d1IdFrom,
  deployConfigFor,
  parseArgs,
  parseJson,
  R2_NOT_ENABLED,
  RESOURCES,
} from "./provision.mjs";

// The shape the Cloudflare Vite plugin writes to dist/cmmc_workspace/wrangler.json (trimmed).
const build = {
  name: "cmmc-workspace",
  topLevelName: "cmmc-workspace",
  main: "index.js",
  assets: { directory: "../client", not_found_handling: "single-page-application" },
  d1_databases: [
    {
      binding: "DB",
      database_name: "cmmc-workspace",
      migrations_dir: "../../migrations",
      preview_database_id: "x",
    },
  ],
  r2_buckets: [{ binding: "FILES", bucket_name: "cmmc-workspace-files" }],
  vars: {
    APP_ENV: "development",
    APP_URL: "http://localhost:5173",
    LLM_MODEL: "claude-haiku-5-5",
    FAKE_EXTERNALS: "true",
    BILLING_PROVIDER: "none",
  },
};

test("deploy config: D1 id, R2 bucket, workers.dev, other bindings kept", () => {
  const cfg = deployConfigFor(build, { d1Id: "abc-123" });
  assert.equal(cfg.name, RESOURCES.worker);
  assert.deepEqual(cfg.d1_databases, [
    {
      binding: "DB",
      database_name: "cmmc-workspace",
      migrations_dir: "../../migrations",
      database_id: "abc-123",
    },
  ]);
  assert.deepEqual(cfg.r2_buckets, [{ binding: "FILES", bucket_name: "cmmc-workspace-files" }]);
  assert.equal(cfg.workers_dev, true);
  assert.equal(cfg.routes, undefined);
  assert.equal(cfg.assets.directory, "../client", "the SPA assets survive");
  assert.equal(cfg.vars.LLM_MODEL, "claude-haiku-5-5");
  assert.equal(cfg.vars.FAKE_EXTERNALS, undefined, "the offline demo flag never reaches a deploy");
  assert.equal(build.vars.FAKE_EXTERNALS, "true", "the build output is not mutated");
});

test("deploy config: custom domain turns workers.dev off; no id leaves it to wrangler", () => {
  const cfg = deployConfigFor(build, { domain: "cmmc.example.org" });
  assert.deepEqual(cfg.routes, [{ pattern: "cmmc.example.org", custom_domain: true }]);
  assert.equal(cfg.workers_dev, false);
  assert.equal(cfg.d1_databases[0].database_id, undefined);
  assert.equal(cfg.d1_databases[0].preview_database_id, undefined);
});

test("resource names match wrangler.jsonc", () => {
  const src = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(src, new RegExp(`"name": "${RESOURCES.worker}"`));
  assert.match(src, new RegExp(`"database_name": "${RESOURCES.d1}"`));
  assert.match(src, new RegExp(`"bucket_name": "${RESOURCES.r2}"`));
});

test("args: domain must be a bare hostname", () => {
  assert.equal(parseArgs(["--domain", "Cmmc.Example.org "]).domain, "cmmc.example.org");
  assert.throws(() => parseArgs(["--domain", "https://cmmc.example.org/"]), /bare hostname/);
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});

test("wrangler output parsing", () => {
  const list = parseJson(
    '▲ [WARNING] something\n[note] also a log line\n[{"uuid":"u-1","name":"cmmc-workspace"},{"uuid":"u-2","name":"other"}]',
  );
  assert.equal(d1IdFrom(list, "cmmc-workspace"), "u-1");
  assert.equal(d1IdFrom(list, "missing"), "");
  assert.ok(ALREADY_EXISTS.test("The bucket you tried to create already exists [code: 10004]"));
  assert.ok(
    R2_NOT_ENABLED.test("Please enable R2 through the Cloudflare Dashboard. [code: 10042]"),
  );
});
