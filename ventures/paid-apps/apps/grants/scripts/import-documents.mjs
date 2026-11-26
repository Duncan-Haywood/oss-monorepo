#!/usr/bin/env node
// Bulk-load an organization's documents into Grant Autopilot (POST /api/orgs/:orgId/documents).
// Node 22+, no dependencies. Run from apps/grants. See docs/onboarding/IMPORTING_DOCUMENTS.md.
//
//   node scripts/import-documents.mjs --dir ../swif-docs --make-manifest [--manifest ../swif-manifest.csv]
//   node scripts/import-documents.mjs --dir ../swif-docs [--manifest ../swif-manifest.csv] --dry-run
//   node scripts/import-documents.mjs --base https://grants.example --email you@x.org --org org_123 \
//     --dir ../swif-docs [--manifest ../swif-manifest.csv] [--concurrency 2]
//
// The password is read from the terminal without echo (or the first line of piped stdin); it is
// never accepted as a flag. The report (import-report.json) holds paths, sizes, hashes and results,
// never file contents.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ALLOWED_EXTENSIONS,
  apiErrorText,
  confirm,
  containsSsnPattern,
  createApiClient,
  extensionOf,
  formatBytes,
  formatTable,
  isIgnoredName,
  MAX_UPLOAD_BYTES,
  manifestTemplateRows,
  markLocalDuplicates,
  mimeForFile,
  parseManifest,
  planImport,
  promptPassword,
  TEXT_SCAN_EXTENSIONS,
  toCsv,
  uploadFields,
} from "./lib/import-helpers.mjs";

const USAGE = `Usage:
  node scripts/import-documents.mjs --dir <folder> --make-manifest [--manifest manifest.csv] [--force]
  node scripts/import-documents.mjs --dir <folder> [--manifest manifest.csv] --dry-run
  node scripts/import-documents.mjs --base https://grants.example --email <you> --org <orgId> \\
      --dir <folder> [--manifest manifest.csv] [--concurrency 2] [--yes] [--no-wait]

Options:
  --dir <folder>        Folder to import (walked recursively; hidden files and symlinks are skipped)
  --manifest <csv>      Per-file overrides: ${"path,kind,title,pastOutcome,pastFunder,pastAmountUSD,pastYear,notes"}
  --make-manifest       Write a manifest template for --dir (to --manifest, default ./manifest.csv) and exit
  --dry-run             Show what would be uploaded; no network, no password
  --base <url>          App origin, e.g. https://grants.example (https required except localhost)
  --email <email>       Account to sign in as (must be editor or above in the org)
  --org <orgId>         Target organization id
  --concurrency <n>     Parallel uploads, 1-4 (default 2)
  --report <file>       Report path (default ./import-report.json)
  --poll-timeout <sec>  How long to wait for processing (default 900)
  --no-wait             Upload only; don't wait for processing
  --yes                 Skip the confirmation prompt (required when the password is piped)
  --force               Overwrite an existing manifest with --make-manifest

The password is prompted for without echo. It is never accepted as a flag.`;

const POLL_INTERVAL_MS = 5000;
const ROLE_RANK = { viewer: 0, reviewer: 1, editor: 2, admin: 3, owner: 4 };

const log = (...a) => console.error(...a);
const fail = (msg) => {
  log(`error: ${msg}`);
  process.exit(1);
};

function parseCli(argv) {
  if (argv.some((a) => /^--?(p|pw|pass|password)(=|$)/i.test(a))) {
    fail(
      "the password is never accepted as a flag; you will be prompted for it (or pipe it on stdin)",
    );
  }
  try {
    return parseArgs({
      args: argv,
      options: {
        base: { type: "string" },
        email: { type: "string" },
        org: { type: "string" },
        dir: { type: "string" },
        manifest: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        "make-manifest": { type: "boolean", default: false },
        concurrency: { type: "string", default: "2" },
        report: { type: "string", default: "import-report.json" },
        "poll-timeout": { type: "string", default: "900" },
        "no-wait": { type: "boolean", default: false },
        yes: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (e) {
    log(USAGE);
    fail(e.message);
  }
}

/** Walk the folder: regular files only, no symlinks, no hidden/system files, no outputs of this tool. */
async function walk(root, excludeAbs) {
  const files = [];
  const skipped = [];
  let ignored = 0;
  async function visit(abs, rel) {
    const entries = await readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      const relPath = (rel ? `${rel}/${e.name}` : e.name).normalize("NFC");
      const absPath = path.join(abs, e.name);
      if (isIgnoredName(e.name)) {
        ignored++;
        continue;
      }
      if (e.isSymbolicLink()) skipped.push({ path: relPath, reason: "symlink (not followed)" });
      else if (e.isDirectory()) await visit(absPath, relPath);
      else if (e.isFile()) {
        if (excludeAbs.has(path.resolve(absPath))) continue;
        const st = await stat(absPath);
        files.push({ path: relPath, abs: absPath, size: st.size });
      } else skipped.push({ path: relPath, reason: "not a regular file" });
    }
  }
  await visit(root, "");
  return { files, skipped, ignored };
}

/** Plain-text formats can be screened for SSN-shaped numbers; PDFs/Office files cannot. */
async function screenTextFiles(files) {
  for (const f of files) {
    if (!TEXT_SCAN_EXTENSIONS.includes(extensionOf(f.path)) || f.size > MAX_UPLOAD_BYTES) continue;
    f.ssnHit = containsSsnPattern(await readFile(f.abs, "latin1"));
  }
}

function findGitRoot(dir) {
  let d = path.resolve(dir);
  for (;;) {
    if (existsSync(path.join(d, ".git"))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const noteFor = (it) =>
  it.reason ?? it.message ?? (it.warnings?.length ? it.warnings.join("; ") : "");

function printPlan(items) {
  const rows = items.map((it) => ({
    path: it.path,
    kind: it.kind,
    outcome: it.pastOutcome ?? "",
    src: it.kindSource,
    size: formatBytes(it.sizeBytes),
    action: it.action,
    note: noteFor(it),
  }));
  console.log(
    formatTable(rows, [
      { key: "path", label: "PATH", max: 60 },
      { key: "kind", label: "KIND" },
      { key: "outcome", label: "OUTCOME" },
      { key: "src", label: "FROM" },
      { key: "size", label: "SIZE" },
      { key: "action", label: "ACTION" },
      { key: "note", label: "NOTE", max: 90 },
    ]),
  );
}

function countBy(items, key) {
  const out = {};
  for (const it of items) out[it[key]] = (out[it[key]] ?? 0) + 1;
  return out;
}

/** { upload: 3, invalid: 1 } -> "3 upload, 1 invalid" */
const summarize = (counts) =>
  Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");

async function writeReport(file, report) {
  // Paths and funder names can be confidential under the NDA: owner-only permissions.
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  log(`Report written to ${path.resolve(file)} (no file contents; keep it with the NDA materials)`);
}

function reportItem(it) {
  const keep = [
    "path",
    "sizeBytes",
    "sha256",
    "kind",
    "kindSource",
    "pastOutcome",
    "pastFunder",
    "pastAmountCents",
    "pastYear",
    "title",
    "action",
    "result",
    "httpStatus",
    "errorCode",
    "message",
    "reason",
    "documentId",
    "status",
    "processingError",
    "chunkCount",
    "factCount",
    "warnings",
  ];
  const out = {};
  for (const k of keep)
    if (it[k] !== undefined && !(Array.isArray(it[k]) && it[k].length === 0)) out[k] = it[k];
  if (it.notes) out.hasNotes = true; // the notes text itself stays out of the report
  return out;
}

async function runPool(items, concurrency, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const it = items[next++];
      await fn(it);
    }
  });
  await Promise.all(workers);
}

async function uploadOne(client, orgId, dir, it, state) {
  if (state.abort) {
    it.result = "not_attempted";
    it.message = state.abort;
    return;
  }
  const bytes = await readFile(path.join(dir, it.path));
  it.sha256 = sha256(bytes);
  const filename = path.basename(it.path);
  const fields = uploadFields(it);
  const r = await client.request("POST", `/api/orgs/${encodeURIComponent(orgId)}/documents`, {
    body: () => {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append(
        "file",
        new Blob([bytes], { type: mimeForFile(filename) ?? "application/octet-stream" }),
        filename,
      );
      return form;
    },
  });
  it.httpStatus = r.status;
  const code = r.data?.error?.code;
  if (r.status === 201) {
    it.result = "uploaded";
    it.documentId = r.data?.id;
    it.status = r.data?.status;
  } else if (r.status === 409 && code === "duplicate_document") {
    it.result = "skipped";
    it.documentId = r.data?.error?.details?.documentId;
    it.message = "duplicate: already in the org";
  } else {
    it.result = "error";
    it.errorCode = code ?? `http_${r.status}`;
    it.message =
      r.status === 413
        ? `too large for the server (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)`
        : r.status === 415
          ? `unsupported type (allowed: ${ALLOWED_EXTENSIONS.join(", ")})`
          : r.status === 429
            ? "still rate limited after retries; re-run later (already-uploaded files are skipped)"
            : apiErrorText(r);
    // Session, permission or org problems affect every remaining file: stop instead of hammering.
    if ([401, 403, 404].includes(r.status))
      state.abort = `stopped after HTTP ${r.status} on ${it.path}: ${apiErrorText(r)}`;
  }
  log(`  ${it.result.padEnd(8)} ${it.path}${it.message ? `  (${it.message})` : ""}`);
}

const TERMINAL = new Set(["ready", "failed"]);

async function pollUntilProcessed(client, orgId, items, timeoutSec) {
  const tracked = items.filter((it) => it.documentId);
  if (tracked.length === 0) return;
  const deadline = Date.now() + timeoutSec * 1000;
  const base = `/api/orgs/${encodeURIComponent(orgId)}/documents`;
  const apply = (it, d) => {
    it.status = d.status;
    it.chunkCount = d.chunkCount;
    it.factCount = d.factCount;
    if (d.error) it.processingError = String(d.error).slice(0, 300);
  };
  log(`Waiting for processing of ${tracked.length} document(s)...`);
  for (;;) {
    const pending = tracked.filter((it) => !TERMINAL.has(it.status));
    if (pending.length === 0) break;
    if (Date.now() > deadline) {
      log(`Timed out with ${pending.length} still processing; check the Documents page later.`);
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    // The list endpoint carries status/counts without chunk text (the detail endpoint includes it).
    const r = await client.request("GET", base);
    if (!r.ok) {
      log(`  poll failed: ${apiErrorText(r)}`);
      continue;
    }
    const byId = new Map((r.data?.items ?? []).map((d) => [d.id, d]));
    for (const it of pending) {
      const d = byId.get(it.documentId);
      if (d) apply(it, d);
      else {
        const one = await client.request("GET", `${base}/${encodeURIComponent(it.documentId)}`);
        if (one.ok && one.data) apply(it, one.data);
      }
    }
    const c = countBy(tracked, "status");
    log(`  ${summarize(c)}`);
  }
}

function printSummary(items) {
  const rows = items.map((it) => ({
    path: it.path,
    kind: it.kind,
    result: it.result ?? it.action,
    status: it.status ?? "",
    facts: it.factCount ?? "",
    note: it.processingError ?? it.message ?? it.reason ?? "",
  }));
  console.log(
    formatTable(rows, [
      { key: "path", label: "PATH", max: 60 },
      { key: "kind", label: "KIND" },
      { key: "result", label: "RESULT" },
      { key: "status", label: "STATUS" },
      { key: "facts", label: "FACTS" },
      { key: "note", label: "NOTE", max: 90 },
    ]),
  );
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }
  if (!opts.dir) fail("--dir is required");
  const dir = path.resolve(opts.dir);
  if (!existsSync(dir)) fail(`--dir ${dir} does not exist`);

  const gitRoot = findGitRoot(dir);
  if (gitRoot) {
    log(`WARNING: ${dir} is inside the git checkout ${gitRoot}.`);
    log("         NDA documents must never be committed. Move the folder outside the repository.");
  }

  const manifestPath = opts.manifest ? path.resolve(opts.manifest) : null;
  const reportPath = path.resolve(opts.report);
  const exclude = new Set([reportPath, manifestPath ?? path.resolve("manifest.csv")]);
  const { files, skipped, ignored } = await walk(dir, exclude);
  await screenTextFiles(files);
  if (files.length === 0) fail(`no files found in ${dir}`);

  // --make-manifest: write the template and stop.
  if (opts["make-manifest"]) {
    const out = manifestPath ?? path.resolve("manifest.csv");
    if (existsSync(out) && !opts.force) fail(`${out} exists; pass --force to overwrite`);
    await writeFile(out, toCsv(manifestTemplateRows(files)), { mode: 0o600 });
    log(`Wrote a manifest template for ${files.length} file(s) to ${out}`);
    log(
      'Fill in title/pastOutcome/pastFunder/pastAmountUSD/pastYear; rows marked "skip" will not be uploaded.',
    );
    return;
  }

  let manifest = null;
  if (manifestPath) {
    if (!existsSync(manifestPath)) fail(`--manifest ${manifestPath} does not exist`);
    const parsed = parseManifest(await readFile(manifestPath, "utf8"));
    for (const wmsg of parsed.warnings) log(`manifest warning: ${wmsg}`);
    if (parsed.errors.length) {
      for (const e of parsed.errors) log(`manifest error: ${e}`);
      fail("fix the manifest and re-run");
    }
    manifest = parsed.entries;
  }
  const plan = planImport(files, manifest);
  if (plan.errors.length) {
    for (const e of plan.errors) log(`manifest error: ${e}`);
    fail("fix the manifest (paths are relative to --dir) and re-run");
  }
  const items = plan.items;
  for (const s of skipped)
    items.push({
      path: s.path,
      sizeBytes: 0,
      kind: "",
      kindSource: "",
      action: "excluded",
      reason: s.reason,
    });

  // Identical files would be rejected as duplicates by the server: upload only the best-classified copy.
  for (const it of items)
    if (it.action === "upload") it.sha256 = sha256(await readFile(path.join(dir, it.path)));
  markLocalDuplicates(items);
  const toUpload = items.filter((it) => it.action === "upload");

  printPlan(items);
  const counts = countBy(items, "action");
  log(
    `\n${items.length} file(s): ${summarize(counts)}${ignored ? ` (${ignored} hidden/system file(s) ignored)` : ""}`,
  );
  if (items.some((it) => it.action === "blocked")) {
    log(
      "Blocked files look like they may hold personal data. Check them by hand; see IMPORTING_DOCUMENTS.md.",
    );
  }

  if (opts["dry-run"]) {
    await writeReport(opts.report, {
      generatedAt: new Date().toISOString(),
      dryRun: true,
      dir,
      manifest: manifestPath,
      totals: counts,
      items: items.map(reportItem),
    });
    log("Dry run: nothing was uploaded.");
    return;
  }

  // ---- Real run ----
  for (const k of ["base", "email", "org"])
    if (!opts[k]) fail(`--${k} is required (or use --dry-run)`);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(opts.org)) fail("--org does not look like an organization id");
  const concurrency = Number(opts.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
    fail("--concurrency must be 1-4");
  const pollTimeout = Number(opts["poll-timeout"]);
  if (!Number.isFinite(pollTimeout) || pollTimeout < 0)
    fail("--poll-timeout must be a number of seconds");
  if (toUpload.length === 0) fail("nothing to upload");

  const client = createApiClient({
    base: opts.base,
    onRetry: ({ status, ms }) =>
      log(
        `  ${status === 429 ? "rate limited" : `HTTP ${status}`}; retrying in ${Math.ceil(ms / 1000)}s`,
      ),
  });
  const password = await promptPassword(`Password for ${opts.email}: `);
  if (!password) fail("no password entered");
  const state = { abort: null };
  let exitCode = 0;
  try {
    await client.signIn(opts.email, password);
    const me = await client.request("GET", "/api/me");
    if (!me.ok) throw new Error(`GET /api/me failed: ${apiErrorText(me)}`);
    const membership = me.data.memberships?.find((m) => m.orgId === opts.org);
    if (!membership) throw new Error(`${opts.email} is not a member of ${opts.org}`);
    if ((ROLE_RANK[membership.role] ?? -1) < ROLE_RANK.editor) {
      throw new Error(
        `${opts.email} is ${membership.role} in ${membership.orgName}; uploading needs editor or above`,
      );
    }
    log(
      `\nTarget: ${membership.orgName} (${opts.org}) at ${client.origin}, signed in as ${opts.email} (${membership.role})`,
    );
    log(
      `About to upload ${toUpload.length} file(s) with consent=true (you confirm the org may share them and agrees to processing).`,
    );
    if (!opts.yes && !(await confirm("Proceed?")))
      throw new Error("cancelled (pass --yes to skip this prompt)");

    await runPool(toUpload, concurrency, (it) => uploadOne(client, opts.org, dir, it, state));
    if (!opts["no-wait"]) await pollUntilProcessed(client, opts.org, toUpload, pollTimeout);

    console.log("");
    printSummary(items);
    const results = countBy(
      items.map((it) => ({ r: it.result ?? it.action })),
      "r",
    );
    const failed = toUpload.filter((it) => it.status === "failed").length;
    log(`\n${summarize(results)}${failed ? `; ${failed} failed processing` : ""}`);
    if (state.abort) log(`Stopped early: ${state.abort}`);
    log(`Next: review the proposed facts at ${client.origin}/orgs/${opts.org}/knowledge/facts`);
    await writeReport(opts.report, {
      generatedAt: new Date().toISOString(),
      dryRun: false,
      base: client.origin,
      orgId: opts.org,
      orgName: membership.orgName,
      signedInAs: opts.email,
      dir,
      manifest: manifestPath,
      totals: { ...results, processingFailed: failed },
      items: items.map(reportItem),
    });
    if (results.error || results.not_attempted || failed) exitCode = 1;
  } finally {
    await client.signOut();
  }
  process.exitCode = exitCode;
}

main().catch((e) => fail(e.message));
