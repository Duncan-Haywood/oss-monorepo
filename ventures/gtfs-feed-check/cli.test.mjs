import { test } from "node:test";
import assert from "node:assert/strict";
import { main, parseArgs } from "./cli.mjs";
import { writeStoredZip } from "./zip.mjs";
import { sampleFeed, sampleBrokenFeed } from "./calc.mjs";

function fakeFs(files) {
  return {
    readFile: async (p) => { if (!(p in files)) throw new Error("ENOENT"); return files[p]; },
    stat: async (p) => {
      if (p in files) return { isDirectory: () => false };
      if (Object.keys(files).some((k) => k.startsWith(p + "/"))) return { isDirectory: () => true };
      throw new Error("ENOENT");
    },
    readdir: async (p) => Object.keys(files).filter((k) => k.startsWith(p + "/")).map((k) => k.slice(p.length + 1)),
  };
}
function run(argv, files) {
  const out = [], err = [];
  return main(argv, { ...fakeFs(files), out: (s) => out.push(s), err: (s) => err.push(s) }).then((code) => ({ code, out: out.join("\n"), err: err.join("\n") }));
}

test("a clean zip exits 0, a broken one exits 1", async () => {
  const ok = await run(["good.zip", "--today=2026-11-19"], { "good.zip": writeStoredZip(sampleFeed()) });
  assert.equal(ok.code, 0, ok.out + ok.err);
  assert.match(ok.out, /0 errors/);
  const bad = await run(["bad.zip", "--today=2026-11-19"], { "bad.zip": writeStoredZip(sampleBrokenFeed()) });
  assert.equal(bad.code, 1);
  assert.match(bad.out, /time_goes_backwards/);
});

test("a folder of .txt files is read like a zip", async () => {
  const files = Object.fromEntries(Object.entries(sampleFeed()).map(([k, v]) => [`gtfs/${k}`, new TextEncoder().encode(v)]));
  const r = await run(["gtfs", "--json", "--today=2026-11-19"], files);
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(r.out).stats.trips, 2);
});

test("--strict fails on warnings; --csv prints findings", async () => {
  const feed = { ...sampleFeed(), "routes.txt": "route_id,agency_id,route_short_name,route_long_name,route_type\n1,RVT,Depot - Valley Mall,Depot - Valley Mall,3\n" };
  const loose = await run(["w.zip", "--today=2026-11-19"], { "w.zip": writeStoredZip(feed) });
  assert.equal(loose.code, 0);
  const strict = await run(["w.zip", "--strict", "--today=2026-11-19"], { "w.zip": writeStoredZip(feed) });
  assert.equal(strict.code, 1);
  const csv = await run(["w.zip", "--csv", "--today=2026-11-19"], { "w.zip": writeStoredZip(feed) });
  assert.match(csv.out, /^severity,code,file/);
});

test("usage errors exit 2", async () => {
  assert.equal((await run([], {})).code, 2);
  assert.equal((await run(["x.zip", "--bogus"], {})).code, 2);
  assert.equal((await run(["missing.zip"], {})).code, 2);
  assert.equal((await run(["plain.zip"], { "plain.zip": new TextEncoder().encode("not a zip") })).code, 2);
  assert.ok(parseArgs(["--today=2026-13"]).unknown);
});
