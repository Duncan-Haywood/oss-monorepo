import test from "node:test";
import assert from "node:assert/strict";
import { main } from "./cli.mjs";
import { sampleFile, sampleBrokenFile, validate } from "./calc.mjs";

const enc = (s) => new TextEncoder().encode(s);
function harness(files) {
  const out = [], err = [], written = {};
  return {
    out, err, written,
    deps: {
      readFile: async (p) => { if (!(p in files)) throw new Error("ENOENT"); return enc(files[p]); },
      writeFile: async (p, t) => { written[p] = t; },
      stat: async (p) => { if (p === "dir") return { isDirectory: () => true }; if (p in files) return { isDirectory: () => false }; throw new Error("ENOENT"); },
      readdir: async () => [{ name: "a.gpx", isDirectory: () => false, isFile: () => true }, { name: "n.txt", isDirectory: () => false, isFile: () => true }],
      out: (s) => out.push(s), err: (s) => err.push(s),
    },
  };
}

test("clean file exits 0", async () => {
  const h = harness({ "ok.gpx": sampleFile() });
  assert.equal(await main(["check", "ok.gpx"], h.deps), 0);
});

test("broken file exits 1 and lists findings with line numbers", async () => {
  const h = harness({ "bad.gpx": sampleBrokenFile() });
  assert.equal(await main(["check", "bad.gpx"], h.deps), 1);
  assert.match(h.out.join("\n"), /line \d+/);
});

test("directory walk only picks .gpx files", async () => {
  const h = harness({ "dir/a.gpx": sampleFile() });
  h.deps.readFile = async () => enc(sampleFile());
  assert.equal(await main(["check", "dir", "--json"], h.deps), 0);
  assert.equal(JSON.parse(h.out[0]).length, 1);
});

test("missing file and usage errors exit 2", async () => {
  const h = harness({});
  assert.equal(await main(["check", "nope.gpx"], h.deps), 2);
  assert.equal(await main([], h.deps), 2);
  assert.equal(await main(["check"], h.deps), 2);
  assert.equal(await main(["check", "x", "--bogus"], h.deps), 2);
});

test("fix writes a repaired copy with fewer errors; --in-place overwrites", async () => {
  const h = harness({ "bad.gpx": sampleBrokenFile() });
  const before = validate(sampleBrokenFile()).summary.errors;
  await main(["fix", "bad.gpx"], h.deps);
  assert.ok(validate(h.written["bad.fixed.gpx"]).summary.errors < before);
  await main(["fix", "bad.gpx", "--in-place"], h.deps);
  assert.ok(h.written["bad.gpx"]);
});

test("thin writes a .thin.gpx with fewer points", async () => {
  const pts = Array.from({ length: 60 }, (_, i) => `<trkpt lat="${48 + i * 0.0001}" lon="${2 + Math.sin(i / 5) * 0.001}"><time>2026-05-01T08:00:${String(i).padStart(2, "0")}Z</time></trkpt>`).join("\n");
  const h = harness({ "r.gpx": `<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>\n${pts}\n</trkseg></trk></gpx>` });
  assert.equal(await main(["thin", "r.gpx", "--max-points=10"], h.deps), 0);
  assert.ok("r.thin.gpx" in h.written);
  assert.ok(validate(h.written["r.thin.gpx"]).stats.points <= 10);
  assert.match(h.out.join("\n"), /points kept/);
});
