import test from "node:test";
import assert from "node:assert/strict";
import { main } from "./cli.mjs";
import { sampleFile, sampleBrokenFile, validate } from "./calc.mjs";

const enc = (s) => new TextEncoder().encode(s);
function harness(files, extra = {}) {
  const out = [], err = [], written = {};
  return {
    out, err, written,
    deps: {
      readFile: async (p) => { if (!(p in files)) throw new Error("ENOENT"); return enc(files[p]); },
      writeFile: async (p, t) => { written[p] = t; },
      stat: async (p) => { if (p === "dir") return { isDirectory: () => true }; if (p in files) return { isDirectory: () => false }; throw new Error("ENOENT"); },
      readdir: async () => [{ name: "a.ics", isDirectory: () => false, isFile: () => true }, { name: "n.txt", isDirectory: () => false, isFile: () => true }],
      out: (s) => out.push(s), err: (s) => err.push(s), ...extra,
    },
  };
}

test("clean file exits 0", async () => {
  const h = harness({ "ok.ics": sampleFile() });
  assert.equal(await main(["check", "ok.ics"], h.deps), 0);
});

test("broken file exits 1 and lists findings", async () => {
  const h = harness({ "bad.ics": sampleBrokenFile() });
  assert.equal(await main(["check", "bad.ics"], h.deps), 1);
  assert.match(h.out.join("\n"), /line/);
});

test("directory walk only picks .ics files", async () => {
  const h = harness({ "dir/a.ics": sampleFile() });
  h.deps.readFile = async () => enc(sampleFile());
  assert.equal(await main(["check", "dir", "--json"], h.deps), 0);
  assert.equal(JSON.parse(h.out[0]).length, 1);
});

test("URL is fetched with one GET and webcal is mapped to https", async () => {
  const urls = [];
  const h = harness({}, { fetch: async (u) => { urls.push(u); return { ok: true, arrayBuffer: async () => enc(sampleFile()).buffer }; } });
  assert.equal(await main(["check", "https://x.test/e.ics"], h.deps), 0);
  assert.deepEqual(urls, ["https://x.test/e.ics"]);
});

test("HTTP error and missing file exit 2", async () => {
  const h = harness({}, { fetch: async () => ({ ok: false, status: 404 }) });
  assert.equal(await main(["check", "https://x.test/e.ics"], h.deps), 2);
  assert.equal(await main(["check", "nope.ics"], h.deps), 2);
});

test("--strict fails on warnings only", async () => {
  const lf = sampleFile().replace(/\r\n/g, "\n");
  const h = harness({ "lf.ics": lf });
  assert.equal(await main(["check", "lf.ics"], h.deps), 0);
  assert.equal(await main(["check", "lf.ics", "--strict"], h.deps), 1);
});

test("fix writes a repaired copy that validates clean", async () => {
  const lf = sampleFile().replace(/\r\n/g, "\n");
  const h = harness({ "lf.ics": lf });
  assert.equal(await main(["fix", "lf.ics", "--strict"], h.deps), 0);
  assert.equal(validate(h.written["lf.fixed.ics"]).summary.warnings, 0);
  await main(["fix", "lf.ics", "--in-place"], h.deps);
  assert.ok(h.written["lf.ics"]);
});

test("usage errors exit 2", async () => {
  const h = harness({});
  assert.equal(await main([], h.deps), 2);
  assert.equal(await main(["check"], h.deps), 2);
  assert.equal(await main(["check", "x", "--bogus"], h.deps), 2);
});
