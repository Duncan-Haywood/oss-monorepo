import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_STORE_PATH,
  exitCodeFor,
  loadStore,
  parseArgs,
  renderDiff,
  renderResult,
  runWatch,
  saveStore,
  type BaselineFile,
} from "../src/cli/watch";
import { configureCheckUrlForTests } from "../src/lib/check-url";
import type { CheckResult } from "../src/lib/check-url";

// The CLI reaches the public internet through checkUrl, which resolves DNS
// before it fetches. Every test here supplies both, so nothing in this file
// makes a real request or a real lookup.
function fakeFetch(pages: Record<string, string | number>): typeof fetch {
  return (async (input: string) => {
    const body = pages[String(input)];
    if (typeof body === "number") return new Response("", { status: body });
    if (body === undefined) throw new Error("connection refused");
    return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
}

function publicDns() {
  configureCheckUrlForTests({
    lookup: (async () => [{ address: "93.184.216.34", family: 4 }]) as never,
  });
}

/** An in-memory stand-in for the baseline file, so no test touches the disk. */
function memoryStore(initial?: string) {
  const state: { data: string | undefined } = { data: initial };
  return {
    state,
    read: async () => {
      if (state.data === undefined) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return state.data;
    },
    write: async (_p: string, data: string) => {
      state.data = data;
    },
  };
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
}

// --- argument parsing -------------------------------------------------------

test("parseArgs collects URLs, flags, and a store path", () => {
  const parsed = parseArgs(
    ["https://a.example/terms", "--json", "--store", "/tmp/s.json", "https://b.example/privacy"],
    {},
  );
  assert.deepEqual(parsed.urls, ["https://a.example/terms", "https://b.example/privacy"]);
  assert.equal(parsed.json, true);
  assert.equal(parsed.storePath, "/tmp/s.json");
  assert.equal(parsed.error, undefined);
});

test("parseArgs defaults the store path, and $VENDOR_WATCH_STORE overrides it", () => {
  assert.equal(parseArgs(["https://a.example/"], {}).storePath, DEFAULT_STORE_PATH);
  assert.equal(
    parseArgs(["https://a.example/"], { VENDOR_WATCH_STORE: "/etc/watch.json" }).storePath,
    "/etc/watch.json",
  );
});

// The CLI and the web form must refuse the same inputs. If this ever diverges
// the tool acquires two different ideas of what a monitorable page is, and the
// stricter one stops being the guarantee the README makes.
test("parseArgs refuses anything the web form would refuse", () => {
  for (const bad of ["file:///etc/passwd", "vendor.example", "ftp://a.example/x", "http://localhost/x"]) {
    const parsed = parseArgs([bad], {});
    assert.ok(parsed.error, `expected ${bad} to be refused`);
    assert.match(parsed.error, /not a public http\(s\) URL/);
  }
});

test("parseArgs reports usage errors rather than guessing", () => {
  assert.match(parseArgs([], {}).error ?? "", /at least one URL/);
  assert.match(parseArgs(["--store"], {}).error ?? "", /--store needs a path/);
  assert.match(parseArgs(["--nope", "https://a.example/"], {}).error ?? "", /unknown option/);
  assert.equal(parseArgs(["--help"], {}).help, true);
});

// --- the store --------------------------------------------------------------

test("a missing store is an empty first run, not an error", async () => {
  const store = memoryStore();
  const loaded = await loadStore("anywhere.json", store.read);
  assert.deepEqual(loaded.baselines, {});
});

// Silently starting over would report every watched page as a first snapshot
// -- an absence reading as a measurement, which is the failure the whole
// inconclusive outcome exists to refuse. It has to be loud.
test("an unreadable store is an error, never a silent fresh start", async () => {
  await assert.rejects(() => loadStore("s.json", async () => "{not json"), /not valid JSON/);
  await assert.rejects(() => loadStore("s.json", async () => '{"hello":1}'), /not a vendor-watch store/);
});

test("the store round-trips", async () => {
  const store = memoryStore();
  const file: BaselineFile = {
    version: 1,
    baselines: {
      "https://a.example/terms": {
        url: "https://a.example/terms",
        normalizedText: "old text",
        hash: "abc",
        fetchedAt: "2026-09-16T00:00:00.000Z",
        httpStatus: 200,
      },
    },
  };
  await saveStore("s.json", file, store.write);
  assert.deepEqual(await loadStore("s.json", store.read), file);
});

// --- rendering --------------------------------------------------------------

test("renderDiff shows only what moved", () => {
  const rendered = renderDiff([
    { type: "same", value: "we" },
    { type: "removed", value: "may" },
    { type: "added", value: "will" },
    { type: "same", value: "share" },
  ]);
  assert.equal(rendered, "- may\n+ will");
});

test("an inconclusive result never renders as no change", () => {
  const result: CheckResult = {
    outcome: "inconclusive",
    url: "https://a.example/terms",
    fetchedAt: "2026-09-16T00:00:00.000Z",
    httpStatus: 503,
    errorMessage: "Fetch returned HTTP 503",
  };
  const rendered = renderResult(result, false);
  assert.match(rendered, /INCONCLUSIVE/);
  assert.match(rendered, /could not tell/);
  assert.match(rendered, /kept, not overwritten/);
  assert.doesNotMatch(rendered, /no change/);
});

// --- exit codes -------------------------------------------------------------

test("exit codes separate changed, inconclusive, and nothing-to-report", () => {
  const at = { fetchedAt: "t", httpStatus: 200 } as const;
  const changed = { outcome: "changed", url: "u", ...at } as CheckResult;
  const unchanged = { outcome: "unchanged", url: "u", ...at } as CheckResult;
  const first = { outcome: "first_snapshot", url: "u", ...at } as CheckResult;
  const inconclusive = { outcome: "inconclusive", url: "u", fetchedAt: "t", httpStatus: null } as CheckResult;

  assert.equal(exitCodeFor([unchanged, first]), 0);
  assert.equal(exitCodeFor([unchanged, inconclusive]), 3);
  assert.equal(exitCodeFor([changed, inconclusive]), 1, "a real change outranks a failed fetch");
  assert.equal(exitCodeFor([]), 0);
});

// --- the whole loop ---------------------------------------------------------

test("first run records a baseline and exits 0; the same text next run is unchanged", async () => {
  publicDns();
  const store = memoryStore();
  const url = "https://vendor.example/terms";
  const io = { argv: [url], out: () => {}, err: () => {}, ...store };

  assert.equal(await runWatch({ ...io, fetchImpl: fakeFetch({ [url]: "<p>we will share data</p>" }) }), 0);
  assert.ok(store.state.data?.includes(url), "the baseline must be persisted");

  assert.equal(await runWatch({ ...io, fetchImpl: fakeFetch({ [url]: "<p>we will share data</p>" }) }), 0);
});

test("edited text exits 1 and prints the words that moved", async () => {
  publicDns();
  const store = memoryStore();
  const url = "https://vendor.example/terms";
  const first = capture();
  await runWatch({
    argv: [url],
    ...first.io,
    ...store,
    fetchImpl: fakeFetch({ [url]: "<p>we may share data</p>" }),
  });

  const second = capture();
  const code = await runWatch({
    argv: [url],
    ...second.io,
    ...store,
    fetchImpl: fakeFetch({ [url]: "<p>we will share data</p>" }),
  });

  assert.equal(code, 1);
  const printed = second.out.join("\n");
  assert.match(printed, /CHANGED/);
  assert.match(printed, /- may/);
  assert.match(printed, /\+ will/);
});

// The guarantee the product is built on, carried to the shell: a failed fetch
// must not replace the last page text actually seen, and a later successful
// fetch of that same text must read "unchanged" rather than "changed".
test("a failed fetch exits 3 and does not overwrite the good baseline", async () => {
  publicDns();
  const store = memoryStore();
  const url = "https://vendor.example/terms";
  const io = { argv: [url], out: () => {}, err: () => {}, ...store };

  await runWatch({ ...io, fetchImpl: fakeFetch({ [url]: "<p>original</p>" }) });
  const afterGoodRun = store.state.data;

  assert.equal(await runWatch({ ...io, fetchImpl: fakeFetch({ [url]: 503 }) }), 3);
  assert.equal(
    JSON.parse(store.state.data!).baselines[url].normalizedText,
    JSON.parse(afterGoodRun!).baselines[url].normalizedText,
    "a 503 must leave the stored snapshot exactly as it was",
  );

  assert.equal(
    await runWatch({ ...io, fetchImpl: fakeFetch({ [url]: "<p>original</p>" }) }),
    0,
    "unchanged text after a failed check must read unchanged, not changed",
  );
});

// Two URLs in one run must not answer each other's check. checkUrl falls back
// to a shared in-process store when no baseline is passed, so this asserts the
// CLI passes one explicitly -- including the explicit null on a first run.
test("two URLs with identical text keep separate baselines", async () => {
  publicDns();
  const store = memoryStore();
  const a = "https://a.example/terms";
  const b = "https://b.example/terms";
  const io = { argv: [a, b], out: () => {}, err: () => {}, ...store };

  const code = await runWatch({ ...io, fetchImpl: fakeFetch({ [a]: "<p>same</p>", [b]: "<p>same</p>" }) });

  assert.equal(code, 0);
  const saved = JSON.parse(store.state.data!).baselines;
  assert.ok(saved[a] && saved[b], "both URLs must be tracked");
  assert.equal(saved[a].url, a);
  assert.equal(saved[b].url, b);
});

test("--json prints one parseable object per check", async () => {
  publicDns();
  const store = memoryStore();
  const url = "https://vendor.example/terms";
  const printed = capture();

  await runWatch({
    argv: [url, "--json"],
    ...printed.io,
    ...store,
    fetchImpl: fakeFetch({ [url]: "<p>hello</p>" }),
  });

  assert.equal(printed.out.length, 1);
  const parsed = JSON.parse(printed.out[0]);
  assert.equal(parsed.outcome, "first_snapshot");
  assert.equal(parsed.url, url);
});

test("bad usage exits 2 and prints the usage text without fetching anything", async () => {
  const store = memoryStore();
  const printed = capture();
  const code = await runWatch({
    argv: ["http://127.0.0.1/secrets"],
    ...printed.io,
    ...store,
    fetchImpl: (() => {
      throw new Error("the CLI must not fetch when the URL was refused");
    }) as unknown as typeof fetch,
  });

  assert.equal(code, 2);
  assert.match(printed.err.join("\n"), /not a public http\(s\) URL/);
  assert.equal(store.state.data, undefined, "a refused run must not write a store");
});

test("--help exits 0 and says what the exit codes mean", async () => {
  const printed = capture();
  const code = await runWatch({ argv: ["--help"], ...printed.io, ...memoryStore() });
  assert.equal(code, 0);
  assert.match(printed.out.join("\n"), /Exit codes/);
  assert.match(printed.out.join("\n"), /not legal, compliance, or contract-review advice/);
});
