import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGpx } from "./src/gpx.mjs";
import { detectTrips } from "./src/tripdetect.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "replay-gpx.mjs");
const pt = (lat, lon, t, extra = "") => `<trkpt lat="${lat}" lon="${lon}"><ele>10</ele><time>${new Date(t).toISOString()}</time>${extra}</trkpt>`;
const T0 = Date.UTC(2026, 6, 14, 12, 0, 0);
// 3 miles due north at ~13 m/s, then 10 parked minutes.
function track() {
  const pts = [];
  for (let i = 0; i <= 60; i++) pts.push(pt(40 + (i * 3) / 60 / 69.09, -75, T0 + i * 5000, "<extensions><speed>13</speed></extensions>"));
  for (let i = 1; i <= 10; i++) pts.push(pt(40 + 3 / 69.09, -75, T0 + 300000 + i * 60000, "<speed>0</speed>"));
  return `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${pts.join("")}</trkseg></trk></gpx>`;
}

test("parseGpx reads points, speed and hdop; skips untimed and invalid points", () => {
  const xml = `<gpx><trk><trkseg>
    ${pt(1, 2, T0, "<speed>3.5</speed><hdop>2</hdop>")}
    <trkpt lat="1" lon="2"><ele>1</ele></trkpt>
    <trkpt lat="95" lon="2"><time>2026-07-14T12:00:00Z</time></trkpt>
    <trkpt lat="x" lon="2"><time>2026-07-14T12:00:00Z</time></trkpt>
    ${pt(1.1, 2, T0 - 1000)}
  </trkseg></trk></gpx>`;
  const f = parseGpx(xml);
  assert.equal(f.length, 2);
  assert.ok(f[0].t < f[1].t, "sorted by time");
  assert.deepEqual(f[1], { lat: 1, lon: 2, t: T0, speed: 3.5, accuracy: 10 });
  assert.equal(f[0].speed, null);
});

test("a parsed GPX drive is detected as one ~3 mile trip", () => {
  const trips = detectTrips(parseGpx(track()));
  assert.equal(trips.length, 1);
  assert.ok(Math.abs(trips[0].miles - 3) < 0.3, String(trips[0].miles));
});

test("replay-gpx CLI prints the trip and rejects unknown options", () => {
  const dir = mkdtempSync(join(tmpdir(), "gpx-"));
  const f = join(dir, "d.gpx");
  writeFileSync(f, track());
  const out = execFileSync("node", [CLI, f], { encoding: "utf8" });
  assert.match(out, /1 drive\(s\)/);
  assert.match(out, /total 3\.\d+ mi/);
  const strict = execFileSync("node", [CLI, f, "--minMiles=5"], { encoding: "utf8" });
  assert.match(strict, /0 drive\(s\)/);
  assert.throws(() => execFileSync("node", [CLI, f, "--bogus=1"], { stdio: "pipe" }));
});
