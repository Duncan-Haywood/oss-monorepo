// node --test scripts/provision.test.mjs (payapps-ci runs it). Pure parts of the deploy provisioning.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALREADY_EXISTS,
  d1IdFrom,
  deployConfigFor,
  parseArgs,
  parseJson,
  R2_NOT_ENABLED,
  RESOURCES,
  r2Unavailable,
} from "./provision.mjs";

const build = {
  name: "payapps",
  main: "index.js",
  d1_databases: [
    {
      binding: "DB",
      database_name: "payapps",
      migrations_dir: "../../migrations",
      preview_database_id: "x",
    },
  ],
  r2_buckets: [{ binding: "FILES", bucket_name: "payapps-files" }],
  vars: {
    APP_ENV: "development",
    APP_URL: "http://localhost:5173",
    BILLING_PROVIDER: "none",
    FAKE_EXTERNALS: "true",
  },
};

test("deploy config: D1 id, R2 binding, workers.dev", () => {
  const cfg = deployConfigFor(build, { d1Id: "abc-123" });
  assert.equal(cfg.name, RESOURCES.worker);
  assert.deepEqual(cfg.d1_databases, [
    {
      binding: "DB",
      database_name: "payapps",
      migrations_dir: "../../migrations",
      database_id: "abc-123",
    },
  ]);
  assert.deepEqual(cfg.r2_buckets, [{ binding: "FILES", bucket_name: "payapps-files" }]);
  assert.equal(cfg.workers_dev, true);
  assert.equal(cfg.routes, undefined);
  assert.equal(cfg.vars.FAKE_EXTERNALS, undefined, "the offline demo flag never reaches a deploy");
  assert.equal(build.vars.FAKE_EXTERNALS, "true", "the build output is not mutated");
});

test("deploy config: no R2 binding when R2 is not enabled; custom domain turns workers.dev off", () => {
  const cfg = deployConfigFor(build, { r2Enabled: false, domain: "payapps.example.org" });
  assert.deepEqual(cfg.r2_buckets, []);
  assert.deepEqual(cfg.routes, [{ pattern: "payapps.example.org", custom_domain: true }]);
  assert.equal(cfg.workers_dev, false);
  assert.equal(cfg.d1_databases[0].database_id, undefined);
});

test("args: domain must be a bare hostname", () => {
  assert.equal(parseArgs(["--domain", "PayApps.Example.org "]).domain, "payapps.example.org");
  assert.throws(() => parseArgs(["--domain", "https://payapps.example.org/"]), /bare hostname/);
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});

test("args: a flag with no value is an error, not a silent default", () => {
  assert.throws(() => parseArgs(["--from"]), /--from needs a value/);
  assert.throws(() => parseArgs(["--write-config"]), /--write-config needs a value/);
  assert.throws(() => parseArgs(["--domain"]), /--domain needs a value/);
  assert.equal(parseArgs(["--from", "a.json", "--dry-run"]).from, "a.json");
});

test("wrangler output parsing", () => {
  const list = parseJson(
    '▲ [WARNING] something\n[note] also a log line\n[{"uuid":"u-1","name":"payapps"},{"uuid":"u-2","name":"other"}]',
  );
  assert.equal(d1IdFrom(list, "payapps"), "u-1");
  assert.equal(d1IdFrom(list, "missing"), "");
  assert.ok(ALREADY_EXISTS.test("The bucket you tried to create already exists [code: 10004]"));
  assert.ok(
    R2_NOT_ENABLED.test("Please enable R2 through the Cloudflare Dashboard. [code: 10042]"),
  );
});

test("R2 unavailable: not enabled or no permission goes on without attachments; others stop", () => {
  assert.match(
    r2Unavailable("Please enable R2 through the Cloudflare Dashboard. [code: 10042]"),
    /enabled/,
  );
  // Exactly what the first deploy (run 45947552522) printed for `wrangler r2 bucket create`.
  const run1 =
    "creating r2 bucket payapps-files failed:\n✘ [ERROR] A request to the Cloudflare API (/accounts/x/r2/buckets) failed.\n\n  Authentication error [code: 10000]\n";
  assert.match(r2Unavailable(run1), /no R2 permission/);
  assert.equal(r2Unavailable("fetch failed: ECONNRESET"), "");
  assert.equal(r2Unavailable(undefined), "");
});
