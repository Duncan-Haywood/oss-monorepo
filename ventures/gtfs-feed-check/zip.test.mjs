import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { readZip, listEntries, writeStoredZip, feedTextsFromZip, isZip } from "./zip.mjs";
import { checkFeed, sampleFeed } from "./calc.mjs";

test("stored zip round-trips", async () => {
  const z = writeStoredZip({ "a.txt": "hello", "b/c.txt": "world" });
  assert.ok(isZip(z));
  const files = await readZip(z);
  assert.deepEqual(Object.keys(files).sort(), ["a.txt", "b/c.txt"]);
  assert.equal(new TextDecoder().decode(files["a.txt"]), "hello");
});

test("deflated entries inflate with the platform's DecompressionStream", async () => {
  const body = "trip_id,stop_sequence\n" + "T1,1\n".repeat(5000);
  const z = writeStoredZip({ "stop_times.txt": body }, (b) => new Uint8Array(deflateRawSync(b)));
  const [e] = listEntries(z);
  assert.equal(e.method, 8);
  assert.ok(e.compressedSize < e.size / 10);
  const texts = await feedTextsFromZip(z);
  assert.equal(texts["stop_times.txt"], body);
});

test("a whole feed checks the same zipped as unzipped", async () => {
  const z = writeStoredZip(sampleFeed(), (b) => new Uint8Array(deflateRawSync(b)));
  const r = checkFeed(await feedTextsFromZip(z), { today: "20261119" });
  assert.equal(r.summary.errors, 0);
  assert.deepEqual(r.stats, checkFeed(sampleFeed(), { today: "20261119" }).stats);
});

test("a truncated or non-zip file is refused with a reason", () => {
  const z = writeStoredZip({ "a.txt": "hello" });
  assert.throws(() => listEntries(z.subarray(0, z.length - 30)), /truncated|damaged/);
  assert.ok(!isZip(new TextEncoder().encode("agency_id,agency_name")));
});
