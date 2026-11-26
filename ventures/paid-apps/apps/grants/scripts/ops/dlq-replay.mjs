#!/usr/bin/env node
// Inspect and replay the dead-letter queue of the jobs queue, over the Cloudflare REST API.
// Runbook: apps/grants/docs/RUNBOOK.md ("Queue backlog / DLQ growth"). Usage: scripts/ops/README.md.
//
//   node scripts/ops/dlq-replay.mjs                              # summary by job type (no change)
//   node scripts/ops/dlq-replay.mjs --list                       # + one line per message (ids only)
//   node scripts/ops/dlq-replay.mjs --replay --dry-run           # what --replay would send
//   node scripts/ops/dlq-replay.mjs --replay --type document.process --limit 20
//   node scripts/ops/dlq-replay.mjs --env demo                   # the demo deployment's queues
//
// Needs CLOUDFLARE_API_TOKEN (Account > Queues > Edit) and CLOUDFLARE_ACCOUNT_ID.
//
// The DLQ must have an HTTP pull consumer. Wrangler config cannot declare one (wrangler 4 rejects
// `type: "http_pull"`), so it is enabled once per queue:
//   pnpm exec wrangler queues consumer http add grant-autopilot-jobs-dlq --message-retries 100
//
// How it works:
//   1. Pull up to --limit messages from the DLQ (leased for --visibility-timeout-secs).
//   2. Decode each body (JSON; base64 for content types json/bytes) and summarize by job `type`.
//   3. --replay: push the selected bodies to the main queue (content_type json), then ack exactly
//      those leases in the DLQ. Push happens first, so a failure leaves a duplicate, never a loss.
//   4. Every other leased message is released with a 0 s retry, so it is visible again at once.
// Each pull counts as a delivery attempt on the DLQ. With the consumer's --message-retries at 100 a
// message survives ~100 inspections; past the limit the DLQ (which has no DLQ of its own) drops it.
//
// Output never contains message bodies: only the job type, the queue message id, attempts, age and
// body fields whose name ends in "Id" (orgId, documentId, ...). URLs and other fields are not printed.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resourceNames } from "../provision.mjs";

const API = "https://api.cloudflare.com/client/v4";
const MAX_PULL_BATCH = 100; // Queues limit for one pull
const MAX_PUSH_BATCH = 100; // Queues limit for one sendBatch
const MAX_PUSH_BYTES = 200_000; // stay under the 256 KB batch limit
const ATTEMPTS_WARN = 80;

const MESSAGES_TS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/worker/queues/messages.ts",
);

/** Fallback copy of the job types in src/worker/queues/messages.ts (read at runtime when present). */
const FALLBACK_JOB_TYPES = [
  "document.process",
  "facts.extract_document",
  "facts.extract_interview",
  "website.crawl",
  "opportunity.import_url",
  "opportunity.parse_requirements",
  "discovery.run",
  "matching.score_org",
  "followups.run_due",
  "privacy.export_org",
  "privacy.delete_org",
  "privacy.retention_sweep",
  "prospecting.build",
  "digest.weekly",
  "digest.deadlines",
];

/** Job types the consumer handles, parsed from the `JobMessage` union in messages.ts. */
export function loadJobTypes(file = MESSAGES_TS) {
  try {
    const src = readFileSync(file, "utf8");
    const types = [...src.matchAll(/\{\s*type:\s*"([a-z0-9_.]+)"/g)].map((m) => m[1]);
    if (types.length > 0) return new Set(types);
  } catch {
    // not in a checkout: use the fallback list
  }
  return new Set(FALLBACK_JOB_TYPES);
}

export const KNOWN_JOB_TYPES = loadJobTypes();

const USAGE = `usage: node scripts/ops/dlq-replay.mjs [options]

  --replay                     re-send selected messages to the main queue and ack them in the DLQ
  --dry-run                    with --replay: show what would be re-sent; send and ack nothing
  --type <jobType>             only select messages of this job type (e.g. document.process)
  --limit <n>                  pull at most n messages (default 100, max 5000)
  --list                       print one line per message (message id, type, attempts, age, *Id fields)
  --env production|demo        which deployment's queues (default production)
  --dlq <name> / --queue <name>  override the queue names
  --delay-seconds <n>          deliver replayed messages after n seconds (spreads load; default 0)
  --visibility-timeout-secs <n>  lease length while the script runs (default 600, max 43200)

env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID`;

export function parseArgs(argv) {
  const args = {
    replay: false,
    dryRun: false,
    type: null,
    limit: 100,
    list: false,
    env: "production",
    dlq: null,
    queue: null,
    delaySeconds: 0,
    visibilityTimeoutSecs: 600,
  };
  const intArg = (name, v, min, max) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max} (got "${v}")`);
    }
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--replay") args.replay = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--list") args.list = true;
    else if (a === "--type") args.type = next();
    else if (a === "--limit") args.limit = intArg(a, next(), 1, 5000);
    else if (a === "--env") args.env = next();
    else if (a === "--dlq") args.dlq = next();
    else if (a === "--queue") args.queue = next();
    else if (a === "--delay-seconds") args.delaySeconds = intArg(a, next(), 0, 43_200);
    else if (a === "--visibility-timeout-secs")
      args.visibilityTimeoutSecs = intArg(a, next(), 30, 43_200);
    else if (a === "-h" || a === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}\n\n${USAGE}`);
  }
  if (!["production", "demo"].includes(args.env))
    throw new Error("--env must be production or demo");
  if (args.dryRun && !args.replay) {
    console.log(
      "note: --dry-run without --replay is the default summary mode (nothing is changed)",
    );
  }
  const names = resourceNames(args.env);
  args.dlq ??= names.dlq;
  args.queue ??= names.queue;
  if (args.dlq === args.queue) throw new Error("--dlq and --queue must differ");
  return args;
}

// ------------------------------------------------------------------------------- Cloudflare API

function credentials() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !accountId) {
    throw new Error(
      "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (see scripts/ops/README.md).",
    );
  }
  if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID looks malformed");
  return { token, accountId };
}

/** Calls the v4 API and returns `result`. Error text carries only API codes/messages. */
async function cf(creds, method, path, body) {
  const res = await fetch(`${API}/accounts/${creds.accountId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`${method} ${path}: HTTP ${res.status} (non-JSON response)`);
  }
  if (!res.ok || json.success === false) {
    const errs = (json.errors ?? []).map((e) => `[${e.code}] ${e.message}`).join("; ");
    throw new Error(`${method} ${path}: HTTP ${res.status} ${errs}`.trim());
  }
  return json.result;
}

async function getQueue(creds, name) {
  const params = new URLSearchParams({ name });
  const list = await cf(creds, "GET", `/queues?${params}`);
  const queue = (Array.isArray(list) ? list : []).find((q) => q.queue_name === name);
  if (!queue) throw new Error(`queue ${name} not found in this account`);
  return queue;
}

// ------------------------------------------------------------------------------- decoding

/** Returns the parsed job object, or null when the body cannot be decoded. Never throws. */
export function decodeBody(msg) {
  const contentType = String(msg.metadata?.["CF-Content-Type"] ?? "").toLowerCase();
  const raw = typeof msg.body === "string" ? msg.body : "";
  const tryJson = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const fromBase64 = (s) => {
    try {
      return Buffer.from(s, "base64").toString("utf8");
    } catch {
      return "";
    }
  };
  if (contentType === "v8") return null; // structured clone: not decodable outside workerd
  let value;
  if (contentType === "json" || contentType === "bytes") value = tryJson(fromBase64(raw));
  else if (contentType === "text") value = tryJson(raw);
  else value = tryJson(raw) ?? tryJson(fromBase64(raw)); // unknown/missing content type
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export const jobTypeOf = (job) =>
  job && typeof job.type === "string" && job.type.length <= 100 ? job.type : "(undecodable)";

/** The id fields of a job, for display: `*Id` strings and the length of `*Ids` arrays. */
export function idFields(job) {
  if (!job) return "";
  const parts = [];
  for (const [k, v] of Object.entries(job)) {
    if (/Id$/.test(k) && typeof v === "string") parts.push(`${k}=${v.slice(0, 64)}`);
    else if (/Ids$/.test(k) && Array.isArray(v)) parts.push(`${k}=[${v.length}]`);
  }
  return parts.join(" ");
}

const age = (tsMs) => {
  if (!tsMs) return "?";
  const mins = Math.max(0, Math.round((Date.now() - tsMs) / 60_000));
  return mins < 120
    ? `${mins}m`
    : mins < 2880
      ? `${Math.round(mins / 60)}h`
      : `${Math.round(mins / 1440)}d`;
};

// ------------------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const creds = credentials();
  const mode = args.replay ? (args.dryRun ? "replay (dry run)" : "REPLAY") : "summary";
  console.log(`dlq-replay: ${mode} | ${args.dlq} -> ${args.queue} | limit ${args.limit}`);

  const dlq = await getQueue(creds, args.dlq);
  const pullConsumer = (dlq.consumers ?? []).find((c) => c.type === "http_pull");
  if (!pullConsumer) {
    console.error(
      `\n${args.dlq} has no HTTP pull consumer. Enable it once (see RUNBOOK.md):\n` +
        `  pnpm exec wrangler queues consumer http add ${args.dlq} --message-retries 100\n`,
    );
    process.exit(2);
  }
  const mainQueue = args.replay ? await getQueue(creds, args.queue) : null;

  // 1. Pull (leases held until released or acked below).
  const leased = new Map(); // message id -> { msg, job }
  const releaseAll = async (exceptLeases = new Set()) => {
    const leases = [...leased.values()]
      .map((m) => m.msg.lease_id)
      .filter((l) => l && !exceptLeases.has(l));
    for (let i = 0; i < leases.length; i += MAX_PULL_BATCH) {
      const retries = leases.slice(i, i + MAX_PULL_BATCH).map((lease_id) => ({
        lease_id,
        delay_seconds: 0,
      }));
      await cf(creds, "POST", `/queues/${dlq.queue_id}/messages/ack`, { acks: [], retries });
    }
    return leases.length;
  };
  let interrupted = false;
  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.error(
      "\ninterrupted: releasing leases (Ctrl-C again to quit; leases then expire on their own)",
    );
  });

  // Steps 1-3 run inside try; step 4 (release every lease not acked) runs in finally, also after an
  // error, so nothing waits for its visibility timeout.
  const acked = new Set();
  try {
    let backlog = null;
    while (leased.size < args.limit && !interrupted) {
      const result = await cf(creds, "POST", `/queues/${dlq.queue_id}/messages/pull`, {
        batch_size: Math.min(MAX_PULL_BATCH, args.limit - leased.size),
        visibility_timeout_ms: args.visibilityTimeoutSecs * 1000,
      });
      backlog = result?.message_backlog_count ?? backlog;
      const msgs = result?.messages ?? [];
      if (msgs.length === 0) break;
      let fresh = 0;
      for (const msg of msgs) {
        if (!leased.has(msg.id)) fresh++;
        leased.set(msg.id, { msg, job: decodeBody(msg) }); // a re-delivery replaces the old lease
      }
      if (fresh === 0) break; // only re-deliveries: the visible backlog is exhausted
    }

    // 2. Summary by type.
    const byType = new Map();
    for (const { msg, job } of leased.values()) {
      const t = jobTypeOf(job);
      const s = byType.get(t) ?? { count: 0, maxAttempts: 0, oldest: Number.POSITIVE_INFINITY };
      s.count++;
      s.maxAttempts = Math.max(s.maxAttempts, msg.attempts ?? 0);
      if (msg.timestamp_ms) s.oldest = Math.min(s.oldest, msg.timestamp_ms);
      byType.set(t, s);
    }
    const isSelected = (job) => {
      const t = jobTypeOf(job);
      if (args.type) return t === args.type;
      return KNOWN_JOB_TYPES.has(t);
    };
    const selected = [...leased.values()].filter(({ job }) => job && isSelected(job));

    console.log(
      `\npulled ${leased.size} message(s)${backlog === null ? "" : `; DLQ backlog reported: ${backlog}`}`,
    );
    if (leased.size === 0) return;
    console.log(`\n${"type".padEnd(34)}${"count".padStart(7)}${"max att.".padStart(10)}  oldest`);
    for (const [t, s] of [...byType.entries()].sort((a, b) => b[1].count - a[1].count)) {
      const unknown = t !== "(undecodable)" && !KNOWN_JOB_TYPES.has(t) ? " (unknown type)" : "";
      const oldest = Number.isFinite(s.oldest) ? age(s.oldest) : "?";
      console.log(
        `${(t + unknown).padEnd(34)}${String(s.count).padStart(7)}${String(s.maxAttempts).padStart(10)}  ${oldest}`,
      );
    }
    const worn = [...leased.values()].filter(
      ({ msg }) => (msg.attempts ?? 0) >= ATTEMPTS_WARN,
    ).length;
    if (worn) {
      console.warn(
        `\nwarning: ${worn} message(s) have >= ${ATTEMPTS_WARN} attempts on the DLQ; they are dropped once they pass the pull consumer's --message-retries.`,
      );
    }
    if (args.list) {
      console.log("\nmessages (id, type, attempts, age, ids):");
      for (const { msg, job } of leased.values()) {
        const mark = args.replay && job && isSelected(job) ? "*" : " ";
        console.log(
          `${mark} ${msg.id}  ${jobTypeOf(job)}  att=${msg.attempts ?? "?"}  age=${age(msg.timestamp_ms)}  ${idFields(job)}`,
        );
      }
    }

    // 3. Replay.
    if (args.replay && !interrupted) {
      const skipped = leased.size - selected.length;
      console.log(
        `\nselected for replay: ${selected.length}${args.type ? ` (type ${args.type})` : " (known job types)"}; left in DLQ: ${skipped}`,
      );
      if (args.dryRun) {
        console.log("dry run: nothing sent or acked.");
      } else {
        let sent = 0;
        let batch = [];
        let bytes = 0;
        const flush = async () => {
          if (batch.length === 0) return;
          await cf(creds, "POST", `/queues/${mainQueue.queue_id}/messages/batch`, {
            messages: batch.map(({ job }) => ({ body: job, content_type: "json" })),
            ...(args.delaySeconds ? { delay_seconds: args.delaySeconds } : {}),
          });
          // Ack only after the push succeeded: at-least-once, never lost.
          const acks = batch.map(({ msg }) => ({ lease_id: msg.lease_id }));
          await cf(creds, "POST", `/queues/${dlq.queue_id}/messages/ack`, { acks, retries: [] });
          for (const { msg } of batch) acked.add(msg.lease_id);
          sent += batch.length;
          batch = [];
          bytes = 0;
        };
        try {
          for (const item of selected) {
            if (interrupted) break;
            const size = Buffer.byteLength(JSON.stringify(item.job));
            if (batch.length >= MAX_PUSH_BATCH || bytes + size > MAX_PUSH_BYTES) await flush();
            batch.push(item);
            bytes += size;
          }
          if (!interrupted) await flush();
        } finally {
          console.log(`replayed ${sent} message(s) to ${args.queue} and acked them in ${args.dlq}`);
        }
      }
    }
  } finally {
    // 4. Release the rest.
    try {
      const released = await releaseAll(acked);
      console.log(`released ${released} message(s) back to ${args.dlq}`);
    } catch (e) {
      console.error(
        `could not release leases (${e?.message ?? e}); they return after the visibility timeout`,
      );
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`dlq-replay failed: ${e?.message ?? e}`);
    process.exit(1);
  });
}
