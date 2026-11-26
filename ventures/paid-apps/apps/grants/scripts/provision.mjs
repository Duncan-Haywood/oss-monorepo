#!/usr/bin/env node
// Idempotent provisioning of the Cloudflare resources `wrangler deploy` does not create for us, plus the
// per-environment deploy config. Safe to run on every deploy (CI runs it before `wrangler deploy`).
//
//   node scripts/provision.mjs                      # production resources
//   node scripts/provision.mjs --env demo           # demo deployment (suffixed names)
//   node scripts/provision.mjs --env demo --write-config dist/grant_autopilot/wrangler.demo.json
//   node scripts/provision.mjs --write-config dist/grant_autopilot/wrangler.production.json \
//     --domain grants.example.org                   # + custom domain route (workers.dev off)
//   node scripts/provision.mjs --dry-run            # print what would run, change nothing
//
// Creates (tolerating "already exists"):
//   - Vectorize index `<prefix>-chunks` (1024 dims, cosine; @cf/baai/bge-m3) with string metadata
//     indexes `documentId` and `kind`. Metadata indexes only cover vectors inserted AFTER they exist,
//     so they are created here, before the Worker can insert anything.
//   - Queues `<prefix>-jobs` and its dead-letter queue `<prefix>-jobs-dlq`.
// D1 and R2 are auto-provisioned by `wrangler deploy` (bindings carry names, no ids). This script only
// reports whether the D1 database exists yet, so CI can migrate before deploying (or after, on the
// very first deploy).
//
// --write-config <out>: derive the deploy config for --env from the Vite build output
// (dist/grant_autopilot/wrangler.json; override with --from). For demo every account-scoped name is
// suffixed (worker, D1, R2, Vectorize, queues, Workflow, rate-limit namespaces) so the demo never
// shares state with production. <out> must sit next to the build config (paths are relative to it).
// --domain <host> adds `routes: [{ pattern: host, custom_domain: true }]` (Cloudflare creates the DNS
// record + certificate; the zone must be on the account) and turns the workers.dev URL off.
//
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (see docs/DEPLOY.md). Writes `key=value` lines to
// $GITHUB_OUTPUT when set: worker_name, d1_name, d1_exists, config.
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_CONFIG = "dist/grant_autopilot/wrangler.json";
const VECTOR_DIMENSIONS = 1024;
const VECTOR_METRIC = "cosine";
const METADATA_INDEXES = [
  { propertyName: "documentId", type: "string" },
  { propertyName: "kind", type: "string" },
];
/** Demo rate-limit namespaces are offset so counters are never shared with production. */
const DEMO_RATELIMIT_OFFSET = 1000;

export const ENVIRONMENTS = ["production", "demo"];

/** Account-scoped resource names per environment (single source of truth for CI and docs). */
export function resourceNames(env) {
  const p = env === "demo" ? "grant-autopilot-demo" : "grant-autopilot";
  return {
    worker: p,
    d1: p,
    r2: `${p}-files`,
    vectorize: `${p}-chunks`,
    queue: `${p}-jobs`,
    dlq: `${p}-jobs-dlq`,
    workflow: `${p}-application-pipeline`,
  };
}

function parseArgs(argv) {
  const args = {
    env: "production",
    writeConfig: null,
    from: BUILD_CONFIG,
    domain: "",
    dryRun: false,
    fast: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--env") args.env = argv[++i];
    else if (a.startsWith("--env=")) args.env = a.slice(6);
    else if (a === "--write-config") args.writeConfig = argv[++i];
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--domain") args.domain = (argv[++i] ?? "").trim().toLowerCase();
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--fast") args.fast = true;
    else if (a === "-h" || a === "--help") {
      console.log(
        "usage: node scripts/provision.mjs [--env production|demo] [--write-config <out> [--from <build wrangler.json>] [--domain <host>]] [--fast] [--dry-run]",
      );
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (!ENVIRONMENTS.includes(args.env)) throw new Error(`--env must be one of ${ENVIRONMENTS}`);
  if (
    args.domain &&
    !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(args.domain)
  ) {
    throw new Error(`--domain must be a bare hostname (got "${args.domain}")`);
  }
  return args;
}

// ------------------------------------------------------------------------------- wrangler

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

/** Parse the JSON document in wrangler's stdout (warnings may precede it). */
function parseJson(stdout) {
  const start = stdout.search(/[[{]/);
  if (start < 0) throw new Error(`expected JSON from wrangler, got: ${stdout.slice(0, 300)}`);
  return JSON.parse(stdout.slice(start));
}

const ALREADY_EXISTS =
  /already exists|already taken|already in use|already has a consumer|duplicate|\[code: (3002|10004|11004|11009)\]/i;

/** Run a create command; "already exists" counts as success. */
function createTolerant(label, args, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would run: wrangler ${args.join(" ")}`);
    return "dry-run";
  }
  const res = wrangler(args, { allowFailure: true });
  if (res.ok) {
    console.log(`created ${label}`);
    return "created";
  }
  if (ALREADY_EXISTS.test(`${res.stdout}\n${res.stderr}`)) {
    console.log(`exists  ${label}`);
    return "exists";
  }
  throw new Error(`creating ${label} failed:\n${res.stderr || res.stdout}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------- resources

async function ensureVectorize(name, dryRun) {
  const indexes = dryRun ? [] : parseJson(wrangler(["vectorize", "list", "--json"]).stdout);
  const existing = Array.isArray(indexes) ? indexes.find((i) => i.name === name) : undefined;
  if (existing) {
    const dims = existing.config?.dimensions;
    const metric = existing.config?.metric;
    if ((dims && dims !== VECTOR_DIMENSIONS) || (metric && metric !== VECTOR_METRIC)) {
      throw new Error(
        `Vectorize index ${name} exists with ${dims} dims / ${metric}; expected ${VECTOR_DIMENSIONS} / ${VECTOR_METRIC}. Indexes cannot be changed in place: delete it (or rename) and re-run.`,
      );
    }
    console.log(`exists  vectorize ${name}`);
  } else {
    createTolerant(
      `vectorize ${name}`,
      [
        "vectorize",
        "create",
        name,
        `--dimensions=${VECTOR_DIMENSIONS}`,
        `--metric=${VECTOR_METRIC}`,
        "--description=Grant Autopilot document chunks (namespace = orgId)",
      ],
      dryRun,
    );
  }

  for (const mi of METADATA_INDEXES) {
    const label = `vectorize ${name} metadata index ${mi.propertyName} (${mi.type})`;
    if (dryRun) {
      createTolerant(label, metadataIndexArgs(name, mi), true);
      continue;
    }
    // A freshly created index can take a few seconds before it accepts metadata indexes.
    for (let attempt = 1; ; attempt++) {
      const list = wrangler(["vectorize", "list-metadata-index", name, "--json"], {
        allowFailure: true,
      });
      const present =
        list.ok &&
        (parseJson(list.stdout) ?? []).some(
          (x) => x.propertyName === mi.propertyName && (x.indexType ?? mi.type) === mi.type,
        );
      if (present) {
        console.log(`exists  ${label}`);
        break;
      }
      try {
        createTolerant(label, metadataIndexArgs(name, mi), false);
        break;
      } catch (e) {
        if (attempt >= 5) throw e;
        console.log(`retrying ${label} (attempt ${attempt} failed)`);
        await sleep(3000 * attempt);
      }
    }
  }
}

const metadataIndexArgs = (name, mi) => [
  "vectorize",
  "create-metadata-index",
  name,
  `--propertyName=${mi.propertyName}`,
  `--type=${mi.type}`,
];

function d1Exists(name, dryRun) {
  if (dryRun) return false;
  const list = parseJson(wrangler(["d1", "list", "--json"]).stdout);
  return Array.isArray(list) && list.some((db) => db.name === name);
}

/** The D1 database id for `name` (empty when missing or in a dry run). */
function d1IdFor(name, dryRun) {
  if (dryRun) return "";
  const list = parseJson(wrangler(["d1", "list", "--json"]).stdout);
  const db = Array.isArray(list) ? list.find((d) => d.name === name) : undefined;
  return db?.uuid ?? db?.id ?? db?.database_id ?? "";
}

// ------------------------------------------------------------------------------- deploy config

/** Deploy config for `env`, derived from the Vite plugin's build output. */
export function deployConfigFor(env, base, domain = "", d1Id = "", r2Enabled = true) {
  const n = resourceNames(env);
  const cfg = structuredClone(base);
  cfg.name = n.worker;
  cfg.topLevelName = n.worker;
  cfg.d1_databases = (cfg.d1_databases ?? []).map((d) => {
    if (d.database_name === n.d1) return d;
    // A different database: drop any id so wrangler resolves (or auto-provisions) it by name.
    const renamed = { ...d, database_name: n.d1 };
    delete renamed.database_id;
    delete renamed.preview_database_id;
    return renamed;
  });
  if (d1Id) {
    cfg.d1_databases = cfg.d1_databases.map((d) =>
      d.database_name === n.d1 ? { ...d, database_id: d1Id } : d,
    );
  }
  cfg.r2_buckets = r2Enabled
    ? (cfg.r2_buckets ?? []).map((b) => ({ ...b, bucket_name: n.r2 }))
    : [];
  cfg.vectorize = (cfg.vectorize ?? []).map((v) => ({ ...v, index_name: n.vectorize }));
  if (cfg.queues) {
    cfg.queues.producers = (cfg.queues.producers ?? []).map((q) => ({ ...q, queue: n.queue }));
    cfg.queues.consumers = (cfg.queues.consumers ?? []).map((q) => ({
      ...q,
      queue: n.queue,
      dead_letter_queue: n.dlq,
    }));
  }
  cfg.workflows = (cfg.workflows ?? []).map((w) => ({ ...w, name: n.workflow }));
  if (env === "demo") {
    cfg.ratelimits = (cfg.ratelimits ?? []).map((r) => ({
      ...r,
      namespace_id: String(Number(r.namespace_id) + DEMO_RATELIMIT_OFFSET),
    }));
    // The demo runs on fakes: no daily discovery / follow-up crons. Only the hourly cleanup of
    // expired one-click demo sessions (DEMO_CLEANUP_CRON in src/worker/scheduled.ts).
    cfg.triggers = { ...(cfg.triggers ?? {}), crons: ["41 * * * *"] };
  }
  if (domain) {
    cfg.routes = [{ pattern: domain, custom_domain: true }];
    cfg.workers_dev = false;
  } else {
    delete cfg.routes;
    cfg.workers_dev = true;
  }
  return cfg;
}

function writeDeployConfig(env, from, out, domain, d1Id = "", r2Enabled = true) {
  const src = resolve(APP_DIR, from);
  const dst = resolve(APP_DIR, out);
  if (dirname(src) !== dirname(dst)) {
    throw new Error(`--write-config must be next to ${from} (relative paths in it must resolve)`);
  }
  const base = JSON.parse(readFileSync(src, "utf8"));
  writeFileSync(
    dst,
    `${JSON.stringify(deployConfigFor(env, base, domain, d1Id, r2Enabled), null, 2)}\n`,
  );
  console.log(
    `wrote   ${relative(APP_DIR, dst)} (${env}${domain ? `, custom domain ${domain}` : ""})`,
  );
  return relative(APP_DIR, dst);
}

// ------------------------------------------------------------------------------- main

function githubOutput(values) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  appendFileSync(
    file,
    `${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")}\n`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const n = resourceNames(args.env);
  console.log(`provisioning ${args.env}${args.dryRun ? " (dry run)" : ""}`);

  let r2Enabled = true;
  // --fast (hotfix lane): resources already exist; only resolve the D1 id and write the config.
  if (!args.fast) {
    await ensureVectorize(n.vectorize, args.dryRun);
    createTolerant(`queue ${n.queue}`, ["queues", "create", n.queue], args.dryRun);
    createTolerant(`queue ${n.dlq}`, ["queues", "create", n.dlq], args.dryRun);
    // The DLQ is read by scripts/ops/dlq-replay.mjs via the HTTP pull API (config-based pull is unsupported).
    createTolerant(
      `dlq pull consumer ${n.dlq}`,
      ["queues", "consumer", "http", "add", n.dlq, "--message-retries", "100"],
      args.dryRun,
    );

    // wrangler deploy does not create R2 buckets or D1 databases on this account: create them here.
    try {
      createTolerant(`r2 bucket ${n.r2}`, ["r2", "bucket", "create", n.r2], args.dryRun);
    } catch (e) {
      // R2 must be enabled once in the dashboard. Deploy without file storage instead of not at all.
      if (!/enable R2|10042/i.test(String(e?.message ?? e))) throw e;
      r2Enabled = false;
      console.log(
        "::warning title=R2 not enabled::File uploads are off until R2 is enabled (Cloudflare dashboard -> R2 Object Storage -> Enable). Re-run the deploy afterwards.",
      );
    }
  }
  if (!d1Exists(n.d1, args.dryRun)) {
    createTolerant(`d1 ${n.d1}`, ["d1", "create", n.d1], args.dryRun);
  } else {
    console.log(`exists  d1 ${n.d1}`);
  }
  const d1Id = d1IdFor(n.d1, args.dryRun);
  const exists = Boolean(d1Id) || args.dryRun;

  const config = args.writeConfig
    ? writeDeployConfig(args.env, args.from, args.writeConfig, args.domain, d1Id, r2Enabled)
    : "";
  githubOutput({ worker_name: n.worker, d1_name: n.d1, d1_exists: String(exists), config });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(String(e?.message ?? e));
    process.exit(1);
  });
}
