#!/usr/bin/env node
// Export the remote D1 database to a timestamped .sql file, optionally gzip it into R2 under
// backups/d1/ and prune old copies (keep the newest N). Runbook: docs/RUNBOOK.md ("Backups").
//
//   node scripts/ops/d1-backup.mjs                              # $TMPDIR/grant-autopilot-backups/grant-autopilot-<ts>.sql
//   node scripts/ops/d1-backup.mjs --out-dir /secure/dir        # somewhere safer
//   node scripts/ops/d1-backup.mjs --upload --keep 30           # + R2 upload and retention prune
//   node scripts/ops/d1-backup.mjs --upload --dry-run           # print the plan; export/upload/delete nothing
//   node scripts/ops/d1-backup.mjs --env demo --upload          # the demo deployment's D1 and bucket
//
// Runs, from apps/grants (so wrangler resolves the database by name):
//   wrangler d1 export <db> --remote --output <file> --skip-confirmation
//   wrangler r2 object put <bucket>/backups/d1/<file>.sql.gz --file <file>.sql.gz --remote --content-type application/gzip
//   wrangler r2 object delete <bucket>/backups/d1/<old>.sql.gz --remote          (prune)
// Listing for the prune uses the REST API (wrangler has no object list):
//   GET /accounts/{account_id}/r2/buckets/{bucket}/objects?prefix=backups/d1/&cursor=...
//
// Auth: wrangler uses CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (or `wrangler login` locally).
// The prune needs the two env vars; without them it is skipped with a warning.
//
// Safety:
//  - A running export blocks other D1 queries ("D1 will be unavailable to serve queries"): run it
//    at low traffic. CI runs it at 09:43 UTC.
//  - The dump holds EVERY tenant's data. wrangler prints a one-hour presigned download URL for the
//    export; this script redacts URLs from wrangler output so the link never reaches CI logs.
//  - The prune only deletes keys matching <prefix><db>-<timestamp>.sql[.gz], only under backups/,
//    and never the object it just uploaded.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { resourceNames } from "../provision.mjs";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_DIR = resolve(APP_DIR, "../..");
const API = "https://api.cloudflare.com/client/v4";
const DEFAULT_PREFIX = "backups/d1/";
const DEFAULT_KEEP = 30;
/** wrangler r2 object put refuses files above 300 MiB (MAX_UPLOAD_SIZE_BYTES in wrangler 4). */
const WRANGLER_R2_MAX_BYTES = 300 * 1024 * 1024;

const USAGE = `usage: node scripts/ops/d1-backup.mjs [options]

  --env production|demo   deployment (default production): sets the database and bucket names
  --database <name>       D1 database name (default: grant-autopilot, bound as DB)
  --out-dir <dir>         where to write the export (default: $TMPDIR/grant-autopilot-backups;
                          never inside the git checkout, which does not ignore it)
  --upload                gzip the export and put it in R2 under --prefix
  --bucket <name>         R2 bucket (default: grant-autopilot-files; env BACKUP_BUCKET overrides)
  --prefix <p>            key prefix (default ${DEFAULT_PREFIX}; must start with backups/)
  --keep <n>              after an upload, keep the newest n backups of this database (default ${DEFAULT_KEEP}; 0 = no prune)
  --delete-local          delete the local .sql/.sql.gz after a successful upload
  --dry-run               print what would run; export, upload and delete nothing (the prune
                          still lists R2, read-only, when credentials are set)`;

export function parseArgs(argv, env = process.env) {
  const args = {
    env: "production",
    database: null,
    outDir: join(tmpdir(), "grant-autopilot-backups"),
    upload: false,
    bucket: env.BACKUP_BUCKET?.trim() || null,
    prefix: DEFAULT_PREFIX,
    keep: DEFAULT_KEEP,
    deleteLocal: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--env") args.env = next();
    else if (a === "--database") args.database = next();
    else if (a === "--out-dir") args.outDir = next();
    else if (a === "--upload") args.upload = true;
    else if (a === "--bucket") args.bucket = next();
    else if (a === "--prefix") args.prefix = next();
    else if (a === "--keep") {
      const v = next();
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 1000)
        throw new Error(`--keep must be 0..1000 (got "${v}")`);
      args.keep = n;
    } else if (a === "--delete-local") args.deleteLocal = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "-h" || a === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}\n\n${USAGE}`);
  }
  if (!["production", "demo"].includes(args.env))
    throw new Error("--env must be production or demo");
  const names = resourceNames(args.env);
  args.database ??= names.d1;
  args.bucket ??= names.r2;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(args.database)) throw new Error("--database: invalid name");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(args.bucket)) throw new Error("--bucket: invalid name");
  if (!args.prefix.endsWith("/")) args.prefix += "/";
  if (!/^backups\/[a-z0-9/_-]*$/.test(args.prefix) || args.prefix.includes("//")) {
    throw new Error("--prefix must start with backups/ and use [a-z0-9/_-] (never orgs/...)");
  }
  if (args.deleteLocal && !args.upload) throw new Error("--delete-local needs --upload");
  args.outDir = resolve(process.cwd(), args.outDir);
  if (args.outDir === REPO_DIR || args.outDir.startsWith(REPO_DIR + sep)) {
    throw new Error("--out-dir must be outside the git checkout: a dump holds every tenant's data");
  }
  return args;
}

/** 2026-11-19T09:43:07.123Z -> 2026-11-19T09-43-07Z (sortable, safe in keys and file names). */
export const timestampSlug = (d) =>
  d
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");

/** Keys this script created for `database` under `prefix`, e.g. backups/d1/grant-autopilot-<ts>.sql.gz */
export function backupKeyPattern(prefix, database) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(
    `^${esc(prefix)}${esc(database)}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z\\.sql(\\.gz)?$`,
  );
}

/** Keys to delete so that the newest `keep` remain (names sort by timestamp). */
export function keysToPrune(keys, { prefix, database, keep, protect }) {
  if (keep < 1) return [];
  const pattern = backupKeyPattern(prefix, database);
  const ours = [...new Set(keys)]
    .filter((k) => pattern.test(k))
    .sort()
    .reverse();
  return ours.slice(keep).filter((k) => k !== protect);
}

// ------------------------------------------------------------------------------- helpers

const redact = (s) => s.replace(/https?:\/\/\S+/g, "[url redacted]");

/** Runs `pnpm exec wrangler ...` in apps/grants; streams output with URLs redacted. */
function wrangler(args) {
  console.log(`$ wrangler ${args.join(" ")}`);
  return new Promise((resolvePromise, reject) => {
    const child = spawn("pnpm", ["exec", "wrangler", ...args], {
      cwd: APP_DIR,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: "false",
        FORCE_COLOR: "0",
        CI: process.env.CI ?? "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const relay = (stream, out) => {
      let buf = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        buf += chunk;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";
        for (const line of lines) out.write(`  ${redact(line)}\n`);
      });
      stream.on("end", () => {
        if (buf) out.write(`  ${redact(buf)}\n`);
      });
    };
    relay(child.stdout, process.stdout);
    relay(child.stderr, process.stderr);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`wrangler ${args[0]} ${args[1]} exited with ${code}`)),
    );
  });
}

async function sha256(file) {
  const h = createHash("sha256");
  await pipeline(createReadStream(file), h);
  return h.digest("hex");
}

function head(file, bytes = 65_536) {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

const mib = (n) => `${(n / 1024 / 1024).toFixed(1)} MiB`;

async function listKeys(prefix, bucket) {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !accountId) return null;
  const keys = [];
  let cursor = "";
  for (let page = 0; page < 1000; page++) {
    const params = new URLSearchParams({ prefix });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(
      `${API}/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}/objects?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      const errs = (json.errors ?? []).map((e) => `[${e.code}] ${e.message}`).join("; ");
      throw new Error(`listing r2://${bucket}/${prefix} failed: HTTP ${res.status} ${errs}`.trim());
    }
    const items = Array.isArray(json.result) ? json.result : [];
    for (const o of items) if (typeof o?.key === "string") keys.push(o.key);
    cursor = json.result_info?.cursor ?? "";
    if (!cursor || items.length === 0) break;
  }
  return keys;
}

// ------------------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.outDir;
  const name = `${args.database}-${timestampSlug(new Date())}.sql`;
  const sqlFile = join(outDir, name);
  const gzFile = `${sqlFile}.gz`;
  const key = `${args.prefix}${name}.gz`;
  console.log(
    `d1-backup: ${args.database} -> ${sqlFile}${args.upload ? ` -> r2://${args.bucket}/${key} (keep ${args.keep || "all"})` : ""}${args.dryRun ? " [dry run]" : ""}`,
  );

  const exportArgs = [
    "d1",
    "export",
    args.database,
    "--remote",
    "--output",
    sqlFile,
    "--skip-confirmation",
  ];
  const putArgs = [
    "r2",
    "object",
    "put",
    `${args.bucket}/${key}`,
    "--file",
    gzFile,
    "--remote",
    "--content-type",
    "application/gzip",
  ];

  if (args.dryRun) {
    console.log(`[dry-run] would run: wrangler ${exportArgs.join(" ")}`);
    if (args.upload) {
      console.log(`[dry-run] would gzip to ${gzFile}`);
      console.log(`[dry-run] would run: wrangler ${putArgs.join(" ")}`);
    }
  } else {
    mkdirSync(outDir, { recursive: true, mode: 0o700 });
    await wrangler(exportArgs);
    chmodSync(sqlFile, 0o600);
    const size = statSync(sqlFile).size;
    const start = head(sqlFile);
    if (size === 0 || !/CREATE TABLE|INSERT INTO|PRAGMA/i.test(start)) {
      throw new Error(`export ${sqlFile} looks empty or is not SQL (${size} bytes)`);
    }
    console.log(`exported ${mib(size)}  sha256 ${await sha256(sqlFile)}  ${basename(sqlFile)}`);

    if (args.upload) {
      await pipeline(
        createReadStream(sqlFile),
        createGzip({ level: 9 }),
        createWriteStream(gzFile, { mode: 0o600 }),
      );
      const gzSize = statSync(gzFile).size;
      console.log(`gzipped ${mib(gzSize)}  sha256 ${await sha256(gzFile)}  ${basename(gzFile)}`);
      if (gzSize > WRANGLER_R2_MAX_BYTES) {
        throw new Error(
          `${basename(gzFile)} is ${mib(gzSize)}; wrangler r2 object put accepts at most 300 MiB. Upload it with an S3 client (multipart) instead, see RUNBOOK.md.`,
        );
      }
      await wrangler(putArgs);
      console.log(`uploaded r2://${args.bucket}/${key}`);
      if (args.deleteLocal) {
        unlinkSync(sqlFile);
        unlinkSync(gzFile);
        console.log("deleted the local copies");
      }
    }
  }

  if (!args.upload || args.keep === 0) return;
  const keys = await listKeys(args.prefix, args.bucket);
  if (keys === null) {
    console.warn(
      "prune skipped: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to list R2 objects",
    );
    return;
  }
  // In a dry run the new object does not exist yet: it would take one of the `keep` slots.
  const planned = args.dryRun ? [...keys, key] : keys;
  const doomed = keysToPrune(planned, {
    prefix: args.prefix,
    database: args.database,
    keep: args.keep,
    protect: key,
  });
  const ours = planned.filter((k) => backupKeyPattern(args.prefix, args.database).test(k)).length;
  console.log(
    `retention: ${ours} backup(s) of ${args.database} under ${args.prefix}; keeping ${args.keep}, pruning ${doomed.length}`,
  );
  for (const k of doomed) {
    const delArgs = ["r2", "object", "delete", `${args.bucket}/${k}`, "--remote"];
    if (args.dryRun) console.log(`[dry-run] would run: wrangler ${delArgs.join(" ")}`);
    else await wrangler(delArgs);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`d1-backup failed: ${redact(String(e?.message ?? e))}`);
    process.exit(1);
  });
}
