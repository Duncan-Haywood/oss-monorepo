#!/usr/bin/env node
// Idempotent provisioning for a CMMC Workspace deploy (docs/DEPLOY.md). Safe to run on every deploy; the
// deploy workflow (.github/workflows/priv-cmmc-deploy.yml) runs it after `pnpm build` and before
// `wrangler deploy`. Ported from apps/jobshop-quote/scripts/provision.mjs (2026-11-25).
//
//   node scripts/provision.mjs --write-config dist/cmmc_workspace/wrangler.deploy.json
//   node scripts/provision.mjs --write-config dist/cmmc_workspace/wrangler.deploy.json --domain cmmc.example.org
//   node scripts/provision.mjs --dry-run            # print what would run, change nothing
//
// `wrangler deploy` does not create the D1 database or the R2 bucket on the account (apps/grants learned
// this the hard way), so this script creates them, tolerating "already exists":
//   - D1 `cmmc-workspace`, whose id goes into the deploy config so migrations run before the new code is live;
//   - R2 `cmmc-workspace-files` (private; no public URL). Unlike payapps, R2 is required: the evidence
//     files behind every requirement live there, so without R2 the script fails and nothing is deployed.
//
// --write-config <out> derives the deploy config from the Vite build output
// (dist/cmmc_workspace/wrangler.json, the Cloudflare Vite plugin's name for the worker; override with --from). <out> must sit next to it, since paths in it are relative. --domain <host> adds a
// custom-domain route and turns workers.dev off. Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.
// Writes worker, d1_exists and config to $GITHUB_OUTPUT when set.
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_CONFIG = "dist/cmmc_workspace/wrangler.json";

/** Account-scoped names (single source of truth for the workflow and docs/DEPLOY.md). */
export const RESOURCES = Object.freeze({
  worker: "cmmc-workspace",
  d1: "cmmc-workspace",
  r2: "cmmc-workspace-files",
});

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function parseArgs(argv) {
  const args = { writeConfig: null, from: BUILD_CONFIG, domain: "", dryRun: false };
  const value = (flag, v) => {
    if (v === undefined) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write-config") args.writeConfig = value(a, argv[++i]);
    else if (a === "--from") args.from = value(a, argv[++i]);
    else if (a === "--domain") args.domain = value(a, argv[++i]).trim().toLowerCase();
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.domain && !HOSTNAME.test(args.domain)) {
    throw new Error(`--domain must be a bare hostname (got "${args.domain}")`);
  }
  return args;
}

/**
 * The deploy config, derived from the build output: our resource names, the D1 id when known, the R2
 * bucket, and either a custom domain or workers.dev. Pure, for tests.
 */
export function deployConfigFor(base, { d1Id = "", domain = "" } = {}) {
  const cfg = structuredClone(base);
  cfg.name = RESOURCES.worker;
  cfg.topLevelName = RESOURCES.worker;
  cfg.d1_databases = (cfg.d1_databases ?? []).map((d) => {
    const db = { ...d, database_name: RESOURCES.d1 };
    delete db.preview_database_id;
    if (d1Id) db.database_id = d1Id;
    else delete db.database_id;
    return db;
  });
  cfg.r2_buckets = (cfg.r2_buckets ?? []).map((b) => ({ ...b, bucket_name: RESOURCES.r2 }));
  if (domain) {
    cfg.routes = [{ pattern: domain, custom_domain: true }];
    cfg.workers_dev = false;
  } else {
    delete cfg.routes;
    cfg.workers_dev = true;
  }
  // Never let a dev-time value reach production through the build output.
  if (cfg.vars) {
    delete cfg.vars.FAKE_EXTERNALS;
    delete cfg.vars.TEST_SCHEMA_SQL;
  }
  return cfg;
}

/**
 * Parse the JSON document in wrangler's stdout. Warnings may precede it, and they start with
 * "▲ [WARNING]", so the document is the first line-initial `[` or `{` from which the rest parses.
 */
export function parseJson(stdout) {
  for (const m of stdout.matchAll(/^[ \t]*[[{]/gm)) {
    try {
      return JSON.parse(stdout.slice(m.index));
    } catch {
      // a bracket that opens a log line, not the document: try the next line
    }
  }
  throw new Error(`expected JSON from wrangler, got: ${stdout.slice(0, 300)}`);
}

/** The id of D1 database `name` in `wrangler d1 list --json` output, or "". */
export function d1IdFrom(list, name) {
  const db = Array.isArray(list) ? list.find((d) => d.name === name) : undefined;
  return db?.uuid ?? db?.id ?? db?.database_id ?? "";
}

export const ALREADY_EXISTS =
  /already exists|already taken|already in use|duplicate|\[code: (10004|11009)\]/i;
export const R2_NOT_ENABLED = /enable R2|10042/i;

function wrangler(args, { allowFailure = false } = {}) {
  const res = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: APP_DIR,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", FORCE_COLOR: "0" },
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = { ok: res.status === 0, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  if (!out.ok && !allowFailure) {
    throw new Error(`wrangler ${args.join(" ")} failed:\n${out.stderr || out.stdout}`);
  }
  return out;
}

/** Run a create command; "already exists" counts as success. */
function createTolerant(label, args, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would run: wrangler ${args.join(" ")}`);
    return;
  }
  const res = wrangler(args, { allowFailure: true });
  if (res.ok) return console.log(`created ${label}`);
  if (ALREADY_EXISTS.test(`${res.stdout}\n${res.stderr}`)) return console.log(`exists  ${label}`);
  throw new Error(`creating ${label} failed:\n${res.stderr || res.stdout}`);
}

function githubOutput(values) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  appendFileSync(file, `${lines.join("\n")}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`provisioning cmmc-workspace${args.dryRun ? " (dry run)" : ""}`);

  try {
    createTolerant(
      `r2 bucket ${RESOURCES.r2}`,
      ["r2", "bucket", "create", RESOURCES.r2],
      args.dryRun,
    );
  } catch (e) {
    if (!R2_NOT_ENABLED.test(String(e?.message ?? e))) throw e;
    throw new Error(
      "::error title=R2 not enabled::CMMC Workspace stores evidence files in R2. Enable R2 (Cloudflare dashboard -> R2 Object Storage) and re-run. Nothing was deployed.",
    );
  }

  const list = () => (args.dryRun ? [] : parseJson(wrangler(["d1", "list", "--json"]).stdout));
  let d1Id = d1IdFrom(list(), RESOURCES.d1);
  if (d1Id) console.log(`exists  d1 ${RESOURCES.d1}`);
  else {
    createTolerant(`d1 ${RESOURCES.d1}`, ["d1", "create", RESOURCES.d1], args.dryRun);
    d1Id = d1IdFrom(list(), RESOURCES.d1);
  }

  let config = "";
  if (args.writeConfig) {
    const src = resolve(APP_DIR, args.from);
    const dst = resolve(APP_DIR, args.writeConfig);
    if (dirname(src) !== dirname(dst)) {
      throw new Error(`--write-config must sit next to ${args.from} (its paths are relative)`);
    }
    const base = JSON.parse(readFileSync(src, "utf8"));
    const cfg = deployConfigFor(base, { d1Id, domain: args.domain });
    writeFileSync(dst, `${JSON.stringify(cfg, null, 2)}\n`);
    config = relative(APP_DIR, dst);
    console.log(
      `wrote   ${config}${args.domain ? ` (custom domain ${args.domain})` : " (workers.dev)"}`,
    );
  }
  githubOutput({
    worker: RESOURCES.worker,
    d1_exists: String(Boolean(d1Id) || args.dryRun),
    config,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exit(1);
  }
}
