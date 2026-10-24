import test from "node:test";
import assert from "node:assert/strict";
import { main, parseArgs } from "./cli.mjs";
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
      readdir: async () => [
        { name: "a.csv", isDirectory: () => false, isFile: () => true },
        { name: "a.fixed.csv", isDirectory: () => false, isFile: () => true },
        { name: "n.png", isDirectory: () => false, isFile: () => true },
      ],
      out: (s) => out.push(s), err: (s) => err.push(s),
    },
  };
}

test("clean file exits 0", async () => {
  const h = harness({ "ok.csv": sampleFile() });
  assert.equal(await main(["check", "ok.csv"], h.deps), 0);
  assert.match(h.out[0], /ok\.csv: 4 IBANs/);
});

test("broken file exits 1 and lists findings with line numbers", async () => {
  const h = harness({ "bad.csv": sampleBrokenFile() });
  assert.equal(await main(["check", "bad.csv"], h.deps), 1);
  assert.match(h.out.join("\n"), /error\s+line \d+/);
});

test("directory walk picks csv files and skips .fixed copies", async () => {
  const h = harness({ "dir/a.csv": sampleFile() });
  h.deps.readFile = async () => enc(sampleFile());
  assert.equal(await main(["check", "dir", "--json"], h.deps), 0);
  assert.equal(JSON.parse(h.out[0]).length, 1);
});

test("--strict fails on warnings only; --sepa-only warns outside SEPA", async () => {
  const dup = "iban\nDE89370400440532013000\nDE89370400440532013000\n";
  const h = harness({ "d.csv": dup, "us.csv": "iban\nAE070331234567890123456\n" });
  assert.equal(await main(["check", "d.csv"], h.deps), 0);
  assert.equal(await main(["check", "d.csv", "--strict"], h.deps), 1);
  assert.equal(await main(["check", "us.csv"], h.deps), 0);
  assert.equal(await main(["check", "us.csv", "--sepa-only", "--strict"], h.deps), 1);
});

test("fix writes a normalised copy; --in-place overwrites; --groups prints in fours", async () => {
  const h = harness({ "s.csv": "name,iban\nA,de89 3704 0044 0532 0130 00\n" });
  assert.equal(await main(["fix", "s.csv"], h.deps), 0);
  assert.match(h.written["s.fixed.csv"], /DE89370400440532013000/);
  assert.equal(validate(h.written["s.fixed.csv"]).summary.errors, 0);
  await main(["fix", "s.csv", "--in-place", "--groups"], h.deps);
  assert.match(h.written["s.csv"], /DE89 3704 0044 0532 0130 00/);
});

test("fix leaves unfixable rows alone and still exits 1", async () => {
  const h = harness({ "b.csv": sampleBrokenFile() });
  assert.equal(await main(["fix", "b.csv"], h.deps), 1);
  assert.match(h.written["b.fixed.csv"], /DE89 3704 0044 0532 0031 00|DE89370400440532003100/);
});

test("missing file and no arguments exit 2", async () => {
  const h = harness({});
  assert.equal(await main(["check", "nope.csv"], h.deps), 2);
  assert.equal(await main([], h.deps), 2);
  assert.equal(await main(["check"], h.deps), 2);
  assert.equal(await main(["check", "x", "--bogus"], h.deps), 2);
  assert.equal(await main(["check", "x", "--column"], h.deps), 2);
});

test("parseArgs reads --column", () => {
  assert.equal(parseArgs(["check", "f.csv", "--column", "iban"]).column, "iban");
});
