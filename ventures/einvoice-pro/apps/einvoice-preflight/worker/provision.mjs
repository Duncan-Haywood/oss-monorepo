#!/usr/bin/env node
// @ts-check
// Idempotent provisioning for the paid layer's Cloudflare deploy (docs/HOSTING.md, "Deploying").
// The deploy workflow (.github/workflows/einvoice-preflight-deploy.yml) runs it after
// `node worker/build.mjs` and before `wrangler deploy`. Proprietary (see ../LICENSE, part 2).
//
//   node worker/provision.mjs --write-config wrangler.deploy.json
//   node worker/provision.mjs --write-config wrangler.deploy.json --domain app.example.org
//   node worker/provision.mjs --dry-run              # print what would run, change nothing
//
// `wrangler deploy` does not create the D1 database (apps/grants learned this), so this script
// creates `einvoice-pro` with `--jurisdiction eu`, tolerating "already exists", reads its id back
// and writes a deploy config next to wrangler.jsonc with that id, plus either a custom-domain
// route or workers.dev. The EU jurisdiction is why this is not left to the dashboard: the customers
// are EU accountants, the DPA's Annex III says the database is stored in the EU, and Cloudflare
// sets a jurisdiction only when a database is created, never later
// (https://developers.cloudflare.com/d1/configuration/data-location/). No migrations: the SqlStore
// creates its tables on first use (pro/sql-store.mjs SCHEMA).
//
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID and wrangler in ./node_modules
// (`npm i --no-save --no-package-lock --prefix . slimdom@4.3.5 wrangler@4.165.0`). Writes
// d1_id and config to $GITHUB_OUTPUT when set.
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_CONFIG = "wrangler.jsonc";

/** Account-scoped names (single source of truth for the workflow and docs/HOSTING.md). */
export const RESOURCES = Object.freeze({ worker: "einvoice-pro", d1: "einvoice-pro", jurisdiction: "eu" });

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** @param {string[]} argv */
export function parseArgs(argv) {
  const args = { writeConfig: /** @type {string | null} */ (null), domain: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // A flag that takes a value, given last with none, is an error rather than an empty value.
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--write-config") args.writeConfig = value();
    else if (a === "--domain") args.domain = value().trim().toLowerCase();
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.domain && !HOSTNAME.test(args.domain)) throw new Error(`--domain must be a bare hostname (got "${args.domain}")`);
  // Paths in the config (main) are relative to it, so it must sit beside wrangler.jsonc.
  if (args.writeConfig && (basename(args.writeConfig) !== args.writeConfig || !args.writeConfig.endsWith(".json"))) {
    throw new Error(`--write-config takes a bare .json file name written beside ${BASE_CONFIG} (got "${args.writeConfig}")`);
  }
  return args;
}

/**
 * wrangler.jsonc to a value: drops // and /* *\/ comments and trailing commas outside strings.
 * @param {string} text
 */
export function parseJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * The deploy config: wrangler.jsonc with our names, the D1 id, and a custom domain or workers.dev.
 * Pure, for tests.
 * @param {Record<string, any>} base @param {{ d1Id?: string, domain?: string }} [o]
 */
export function deployConfigFor(base, { d1Id = "", domain = "" } = {}) {
  const cfg = structuredClone(base);
  cfg.name = RESOURCES.worker;
  const dbs = cfg.d1_databases ?? [];
  if (!dbs.some((/** @type {any} */ d) => d.binding === "DB")) throw new Error(`${BASE_CONFIG} has no D1 binding named DB`);
  cfg.d1_databases = dbs.map((/** @type {any} */ d) => {
    const db = { ...d, database_name: RESOURCES.d1 };
    delete db.preview_database_id;
    if (d1Id) db.database_id = d1Id;
    else delete db.database_id;
    return db;
  });
  if (domain) {
    cfg.routes = [{ pattern: domain, custom_domain: true }];
    cfg.workers_dev = false;
  } else {
    delete cfg.routes;
    cfg.workers_dev = true;
  }
  // Never let a test or demo switch reach production through the config.
  if (cfg.vars) {
    for (const k of ["FAKE_EXTERNALS", "FAKE_LLM", "FREE_API", "PRO_DATA_FILE"]) delete cfg.vars[k];
  }
  return cfg;
}

/**
 * The JSON document in wrangler's stdout. Warnings may precede it ("▲ [WARNING] ..."), so the
 * document is the first line-initial `[` or `{` from which the rest parses.
 * @param {string} stdout
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

/** The id of D1 database `name` in `wrangler d1 list --json` output, or "". @param {unknown} list @param {string} name */
export function d1IdFrom(list, name) {
  const db = Array.isArray(list) ? list.find((d) => d?.name === name) : undefined;
  return db?.uuid ?? db?.id ?? db?.database_id ?? "";
}

/**
 * Whether a database's listed entry is known to sit in the EU jurisdiction: "eu", "other" (fail:
 * the legal pages would be wrong) or "unknown" (the listing names no jurisdiction; a database this
 * run created is EU by construction). @param {unknown} list @param {string} name
 */
export function jurisdictionOf(list, name) {
  const db = Array.isArray(list) ? list.find((d) => d?.name === name) : undefined;
  const j = db?.jurisdiction;
  if (typeof j !== "string" || !j) return "unknown";
  return j.toLowerCase() === RESOURCES.jurisdiction ? "eu" : "other";
}

export const ALREADY_EXISTS = /already exists|already taken|already in use|duplicate|\[code: (10004|11009|7502)\]/i;

/** @param {string[]} args @param {{ allowFailure?: boolean }} [o] */
function wrangler(args, { allowFailure = false } = {}) {
  const res = spawnSync(resolve(APP_DIR, "node_modules/.bin/wrangler"), args, {
    cwd: APP_DIR,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", FORCE_COLOR: "0" },
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = { ok: res.status === 0, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  if (!out.ok && !allowFailure) throw new Error(`wrangler ${args.join(" ")} failed:\n${out.stderr || out.stdout || res.error}`);
  return out;
}

/** @param {Record<string, string>} values */
function setOutputs(values) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  appendFileSync(file, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(""));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const create = ["d1", "create", RESOURCES.d1, `--jurisdiction=${RESOURCES.jurisdiction}`];
  if (args.dryRun) {
    console.log(`would run: wrangler ${create.join(" ")} (an existing database is kept as it is)`);
    console.log("would run: wrangler d1 list --json, then write the deploy config with its id");
    return;
  }
  const made = wrangler(create, { allowFailure: true });
  if (made.ok) console.log(`created D1 ${RESOURCES.d1} (jurisdiction ${RESOURCES.jurisdiction})`);
  else if (ALREADY_EXISTS.test(made.stderr + made.stdout)) console.log(`D1 ${RESOURCES.d1} already exists: kept`);
  else throw new Error(`wrangler ${create.join(" ")} failed:\n${made.stderr || made.stdout}`);

  const list = parseJson(wrangler(["d1", "list", "--json"]).stdout);
  const d1Id = d1IdFrom(list, RESOURCES.d1);
  if (!d1Id) throw new Error(`D1 ${RESOURCES.d1} is not in \`wrangler d1 list\` after creating it`);
  console.log(`D1 ${RESOURCES.d1}: ${d1Id}`);
  const where = jurisdictionOf(list, RESOURCES.d1);
  if (where === "other") {
    throw new Error(`D1 ${RESOURCES.d1} exists outside the EU jurisdiction, which the DPA's Annex III promises and cannot be changed after creation: export it, delete it and re-run (docs/HOSTING.md, "Deploying")`);
  }
  if (where === "unknown" && !made.ok) {
    console.log(`::warning title=D1 jurisdiction not confirmed::${RESOURCES.d1} already existed and the listing names no jurisdiction. Check it says "eu" in the Cloudflare dashboard (D1 -> ${RESOURCES.d1} -> Settings); the DPA's Annex III promises EU storage.`);
  }

  if (args.writeConfig) {
    const base = parseJsonc(readFileSync(resolve(APP_DIR, BASE_CONFIG), "utf8"));
    const cfg = deployConfigFor(base, { d1Id, domain: args.domain });
    writeFileSync(resolve(APP_DIR, args.writeConfig), `${JSON.stringify(cfg, null, 2)}\n`);
    console.log(`wrote ${args.writeConfig} (${args.domain ? `custom domain ${args.domain}` : "workers.dev"})`);
    setOutputs({ d1_id: d1Id, config: args.writeConfig });
  } else setOutputs({ d1_id: d1Id });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(`provision: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
