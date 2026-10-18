import test from "node:test";
import assert from "node:assert/strict";
import { main } from "./cli.mjs";

const io = (files) => { const out = [], err = []; return { out, err, log: (x) => out.push(x), err_: err, error: null, read: async (f) => { if (!(f in files)) throw new Error("ENOENT"); return files[f]; }, errFn: (x) => err.push(x) }; };
const mk = (files) => { const o = io(files); return { o, deps: { log: o.log, err: o.errFn, read: o.read } }; };

test("exit 0 when every action has an owner, 1 when one does not, 2 on bad input", async () => {
  let m = mk({ "a.txt": "Ben: I'll fix the toggle by Friday." });
  assert.equal(await main(["a.txt", "--date", "2026-10-19", "--format", "csv"], m.deps), 0);
  assert.match(m.o.out[0], /Fix the toggle,Ben,2026-10-23,high/);
  m = mk({ "b.txt": "We need to update the checklist." });
  assert.equal(await main(["b.txt"], m.deps), 1);
  m = mk({});
  assert.equal(await main(["missing.txt"], m.deps), 2);
  assert.equal(await main([], m.deps), 2);
  m = mk({ "a.txt": "x" });
  assert.equal(await main(["a.txt", "--format", "pdf"], m.deps), 2);
});
