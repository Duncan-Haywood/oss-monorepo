// A class guard (red-team 2026-11-12): checkCfdi reports on any edit of one attribute of
// any CFDI fixture and never throws. The page calls it with no try/catch, so a throw shows
// the user nothing; the first run of this test found an export dated before 2024-01-18
// crashing cce20.mjs. About 10,000 documents in ~3 s.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { checkCfdi } from "./cfdi.mjs";

const dir = new URL("./fixtures/", import.meta.url);
const VALUES = ["", "-1", "abc", "1e5", " 1", "0", "00", "999999999999999999999", "0.0000001", ".5", "5.", "NaN", "&amp;", "2023-06-01T00:00:00"];

test("checkCfdi never throws on a one-attribute edit of a CFDI fixture", () => {
  const files = readdirSync(dir).filter((f) => /^cfdi-.*\.xml$/.test(f));
  assert.ok(files.length >= 9);
  const crashes = new Map();
  let n = 0;
  for (const f of files) {
    const t = readFileSync(new URL(f, dir), "utf8");
    for (const m of t.matchAll(/(\s)([A-Za-z]+)="[^"]*"/g)) {
      for (const v of [...VALUES, null]) {
        const edit = v === null ? "" : `${m[1]}${m[2]}="${v}"`;
        n++;
        try {
          checkCfdi(t.slice(0, m.index) + edit + t.slice(m.index + m[0].length));
        } catch (e) {
          const key = `${m[2]}: ${e.message}`;
          if (!crashes.has(key)) crashes.set(key, `${f}, ${m[2]}=${JSON.stringify(v)}`);
        }
      }
    }
  }
  assert.ok(n > 5000, `${n} documents`);
  assert.deepEqual([...crashes].map(([k, v]) => `${k} (${v})`), []);
});
