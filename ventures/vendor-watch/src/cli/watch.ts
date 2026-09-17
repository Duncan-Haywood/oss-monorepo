// Vendor Watch, on the command line.
//
// Why this exists. The browser tool needs a server: checking an arbitrary
// vendor page from a tab is blocked by CORS, so the fetch has to happen
// somewhere the visitor is not. That made this venture the one product in the
// portfolio with no route to a user at all -- the catalogue is static hosting,
// and this is the only thing in it that is not.
//
// The CLI is that route. It runs the same `checkUrl` the API route runs, in
// the same Node, against the same SSRF refusals -- nothing here re-implements
// a rule from `../lib/check-url`, which is the mistake this repository has
// twice paid for (see CLAUDE.md, "168 became 169"). What it adds is the half a
// server cannot give a practitioner anyway: a baseline that lives on their own
// disk rather than in a shared in-memory store, and an exit code a cron job or
// a CI step can read.
//
//   npm run watch -- https://vendor.example/terms
//   npm run watch -- https://a.example/privacy https://b.example/subprocessors
//   npm run watch -- --json --store ~/.vendor-watch.json https://vendor.example/dpa
//
// Exit codes are the product here, so they are stated rather than implied:
//
//   0  every page checked was unchanged, or was seen for the first time
//   1  at least one page CHANGED -- the actionable outcome
//   2  bad usage (no URL, an unparseable one, an unreadable store)
//   3  nothing changed, but at least one check was INCONCLUSIVE
//
// 3 exists because collapsing it into 0 is the exact failure this venture was
// built to refuse. A monitor that reports "no change" when it could not reach
// the page is worse than no monitor: it converts an outage, a block, or a
// moved URL into positive evidence that nothing happened. `checkUrl` already
// refuses to overwrite a good snapshot on a failed fetch; this is the same
// refusal carried out to the shell.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkUrl, isPlausibleHttpUrl, type CheckResult } from "../lib/check-url";
import type { StoredSnapshot } from "../lib/watch-store";
import type { DiffOp } from "../lib/diff";

// Next's own type for `process.env` requires NODE_ENV, so a test passing a
// two-key object would not type-check against it. The CLI reads one variable;
// this is the shape it actually needs.
export type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_STORE_PATH = "vendor-watch-baselines.json";
const STORE_VERSION = 1;

export type BaselineFile = { version: number; baselines: Record<string, StoredSnapshot> };

export type ParsedArgs = {
  urls: string[];
  storePath: string;
  json: boolean;
  quiet: boolean;
  help: boolean;
  error?: string;
};

export const USAGE = `vendor-watch -- a timestamped, source-linked diff of a public vendor page

Usage:
  npm run watch -- <url> [<url> ...] [options]

Options:
  --store <path>   where to keep baselines (default: ${DEFAULT_STORE_PATH},
                   or $VENDOR_WATCH_STORE)
  --json           print one JSON object per check instead of prose
  --quiet          print only the outcome lines, no diff body
  -h, --help       this text

Exit codes:
  0  all unchanged or first snapshot
  1  at least one page changed
  2  bad usage
  3  nothing changed, but at least one check was inconclusive

Only monitor pages you are authorized to monitor. This is an evidence feed,
not legal, compliance, or contract-review advice.`;

export function parseArgs(argv: string[], env: Env = {}): ParsedArgs {
  const parsed: ParsedArgs = {
    urls: [],
    storePath: env.VENDOR_WATCH_STORE || DEFAULT_STORE_PATH,
    json: false,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
    } else if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--quiet") {
      parsed.quiet = true;
    } else if (arg === "--store") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        parsed.error = "--store needs a path";
        return parsed;
      }
      parsed.storePath = value;
      i += 1;
    } else if (arg.startsWith("-")) {
      parsed.error = `unknown option: ${arg}`;
      return parsed;
    } else {
      // Validated with the same predicate the web form uses, so the CLI and
      // the page refuse the same inputs -- a `file://` URL, a bare hostname,
      // a private address -- rather than each having its own idea of one.
      if (!isPlausibleHttpUrl(arg)) {
        parsed.error = `not a public http(s) URL: ${arg}`;
        return parsed;
      }
      parsed.urls.push(arg);
    }
  }

  if (!parsed.help && parsed.urls.length === 0) parsed.error = "give at least one URL to check";
  return parsed;
}

/**
 * Read the baseline file, or start an empty one.
 *
 * A missing file is the ordinary first run and is not an error. A file that
 * exists but cannot be parsed *is*: silently starting over would report every
 * watched page as a first snapshot, which is the same "an absence read as a
 * measurement" failure the inconclusive outcome exists to prevent, one layer
 * down.
 */
export async function loadStore(
  path: string,
  read: (p: string) => Promise<string> = (p) => readFile(p, "utf8"),
): Promise<BaselineFile> {
  let raw: string;
  try {
    raw = await read(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { version: STORE_VERSION, baselines: {} };
    }
    throw new Error(`cannot read baseline store ${path}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`baseline store ${path} is not valid JSON -- move it aside to start over`);
  }
  const file = parsed as Partial<BaselineFile>;
  if (!file || typeof file !== "object" || typeof file.baselines !== "object" || file.baselines === null) {
    throw new Error(`baseline store ${path} is not a vendor-watch store`);
  }
  return { version: file.version ?? STORE_VERSION, baselines: file.baselines as Record<string, StoredSnapshot> };
}

export async function saveStore(
  path: string,
  file: BaselineFile,
  write: (p: string, data: string) => Promise<void> = (p, data) => writeFile(p, data, "utf8"),
): Promise<void> {
  await write(path, `${JSON.stringify(file, null, 2)}\n`);
}

/**
 * The diff, as a shell reads one. `-` is text the vendor removed and `+` text
 * they added; unchanged runs are dropped rather than printed, because a terms
 * page is thousands of words and the three that moved are the evidence.
 */
export function renderDiff(diff: DiffOp[]): string {
  return diff
    .filter((op) => op.type !== "same")
    .map((op) => `${op.type === "added" ? "+" : "-"} ${op.value}`)
    .join("\n");
}

export function renderResult(result: CheckResult, quiet: boolean): string {
  const at = result.fetchedAt;
  const status = result.httpStatus === null ? "no response" : `HTTP ${result.httpStatus}`;
  const head = `${result.outcome.toUpperCase().padEnd(15)} ${result.url}  (${at}, ${status})`;

  if (result.outcome === "inconclusive") {
    // Named explicitly on its own line: the whole point of this outcome is
    // that it is not "unchanged", and a reader skimming a cron mail should
    // not have to infer that from the absence of a diff.
    return `${head}\n  could not tell: ${result.errorMessage ?? "unknown error"}\n  the previous snapshot was kept, not overwritten`;
  }
  if (result.outcome === "first_snapshot") {
    return `${head}\n  baseline recorded -- re-run later to see what moved`;
  }
  if (result.outcome === "unchanged") {
    const since = result.previous ? ` since ${result.previous.fetchedAt}` : "";
    return `${head}\n  no change${since}`;
  }
  const since = result.previous ? ` since ${result.previous.fetchedAt}` : "";
  const body = quiet || !result.diff ? "" : `\n${renderDiff(result.diff)}`;
  return `${head}\n  CHANGED${since}${body}`;
}

/**
 * 1 beats 3 beats 0. A run that found a real change reports that even if
 * another URL in the same run could not be reached, because the change is the
 * thing the operator has to act on; the inconclusive line is still printed.
 */
export function exitCodeFor(results: CheckResult[]): 0 | 1 | 3 {
  if (results.some((r) => r.outcome === "changed")) return 1;
  if (results.some((r) => r.outcome === "inconclusive")) return 3;
  return 0;
}

export type RunIO = {
  argv: string[];
  env?: Env;
  out: (line: string) => void;
  err: (line: string) => void;
  fetchImpl?: typeof fetch;
  read?: (p: string) => Promise<string>;
  write?: (p: string, data: string) => Promise<void>;
};

export async function runWatch(io: RunIO): Promise<number> {
  const args = parseArgs(io.argv, io.env ?? {});
  if (args.help) {
    io.out(USAGE);
    return 0;
  }
  if (args.error) {
    io.err(`vendor-watch: ${args.error}`);
    io.err(USAGE);
    return 2;
  }

  let store: BaselineFile;
  try {
    store = await loadStore(args.storePath, io.read);
  } catch (error) {
    io.err(`vendor-watch: ${(error as Error).message}`);
    return 2;
  }

  const results: CheckResult[] = [];
  for (const url of args.urls) {
    // `?? null` rather than `undefined`: passing the baseline explicitly --
    // including "I track this myself and have nothing yet" -- is what tells
    // checkUrl to bypass its shared in-process store in both directions. An
    // undefined here would silently fall back to that store, and two URLs in
    // one run could then answer each other's check.
    const result = await checkUrl(url, io.fetchImpl ?? fetch, store.baselines[url] ?? null);
    results.push(result);
    // Only a successful fetch yields a snapshot, so this cannot overwrite a
    // good baseline with a failure -- the guarantee is checkUrl's, and this
    // line is careful not to take it back.
    if (result.snapshot) store.baselines[url] = result.snapshot;
    io.out(args.json ? JSON.stringify(result) : renderResult(result, args.quiet));
  }

  try {
    await saveStore(args.storePath, store, io.write);
  } catch (error) {
    io.err(`vendor-watch: could not write ${args.storePath}: ${(error as Error).message}`);
    io.err("the checks above are still accurate; the next run will start from the last saved baselines");
  }

  return exitCodeFor(results);
}

// `tsx src/cli/watch.ts` runs this file directly; the tests import it instead,
// which is why every side effect above is injected rather than reached for.
// Compared as resolved paths rather than by filename: a suffix match would
// also fire when some other `watch.ts` is the entry point, and a CLI that
// runs itself during someone else's test run is a hard bug to find.
const entryPoint = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPoint !== undefined && entryPoint === fileURLToPath(import.meta.url)) {
  runWatch({
    argv: process.argv.slice(2),
    env: process.env,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  }).then((code) => {
    process.exitCode = code;
  });
}
