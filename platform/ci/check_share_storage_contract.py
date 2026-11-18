#!/usr/bin/env python3
"""Run every vendored share.mjs saveBid/loadBid/clearBid against a fake localStorage.

47 ventures carry a copy of the same `share.mjs` that puts a bid in the
visitor's own browser storage: `saveBid(storage, spec, values)`,
`loadBid(storage, spec)` and `clearBid(storage, spec)`. Each copy's own suite
tests what that venture's page uses, and none tested the edges: a red-team
campaign on 2026-11-16 (moving-bid-calculator) seeded `!storage || !spec?.key`
-> `&&` in saveBid and `return true` -> `return false` in clearBid, and both
went green. The first writes a bid under the key "undefined" when a spec has
no key, so two calculators on one origin overwrite each other; the second
tells the page a clear failed when it worked. A copy fixed in one venture
stays broken in the other 46, so this checks every copy at once.

The contract, for each copy whose saveBid takes three parameters and
clearBid two (three ventures use a key-less `saveBid(storage, values)`
design and are left out):
  - saveBid writes under spec.key, returns true, and loadBid reads it back;
  - saveBid with no storage, or a spec without a key, returns false and
    writes nothing;
  - clearBid removes the key and returns true; with no storage or no key it
    returns false;
  - storage that throws (site data blocked) makes saveBid and clearBid return
    false and loadBid return {}, never throw;
  - loadBid ignores a blob from another version or one that is not JSON.

    python3 platform/ci/check_share_storage_contract.py [--root DIR]   # exit 1 on a breach
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

NODE = r"""
import { pathToFileURL } from "node:url";
const files = JSON.parse(process.argv[1]);
function fakeStorage({ throws = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => { if (throws) throw new Error("blocked"); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (throws) throw new Error("blocked"); map.set(k, String(v)); },
    removeItem: (k) => { if (throws) throw new Error("blocked"); map.delete(k); },
  };
}
const SPEC = { key: "contract-bid", numbers: ["area"] };
const out = { checked: 0, skipped: 0, breaches: [], unloadable: [] };
for (const file of files) {
  let mod;
  try { mod = await import(pathToFileURL(file)); }
  catch (e) { out.unloadable.push([file, String(e && e.message).slice(0, 120)]); continue; }
  const { saveBid, loadBid, clearBid } = mod;
  if (typeof saveBid !== "function" || typeof loadBid !== "function" || typeof clearBid !== "function") continue;
  if (saveBid.length !== 3 || clearBid.length !== 2) { out.skipped++; continue; }
  out.checked++;
  const fail = (what) => out.breaches.push([file, what]);
  const expect = (cond, what) => { if (!cond) fail(what); };
  try {
    let s = fakeStorage();
    expect(saveBid(s, SPEC, { area: "48" }) === true, "saveBid did not return true on a working store");
    expect(s.map.has(SPEC.key), "saveBid did not write under spec.key");
    expect(loadBid(s, SPEC).area === "48", "loadBid did not read back what saveBid wrote");
    expect(clearBid(s, SPEC) === true, "clearBid did not return true on a working store");
    expect(!s.map.has(SPEC.key), "clearBid did not remove the saved bid");
    expect(JSON.stringify(loadBid(s, SPEC)) === "{}", "loadBid after clearBid is not {}");

    s = fakeStorage();
    expect(saveBid(s, { numbers: ["area"] }, { area: "48" }) === false, "saveBid with a key-less spec did not return false");
    expect(s.map.size === 0, "saveBid with a key-less spec wrote to storage (under the key \"undefined\")");
    expect(saveBid(null, SPEC, { area: "48" }) === false, "saveBid with no storage did not return false");
    expect(clearBid(s, { numbers: ["area"] }) === false, "clearBid with a key-less spec did not return false");
    expect(clearBid(null, SPEC) === false, "clearBid with no storage did not return false");
    expect(JSON.stringify(loadBid(null, SPEC)) === "{}", "loadBid with no storage is not {}");

    const blocked = fakeStorage({ throws: true });
    expect(saveBid(blocked, SPEC, { area: "48" }) === false, "saveBid on blocked storage did not return false");
    expect(clearBid(blocked, SPEC) === false, "clearBid on blocked storage did not return false");
    expect(JSON.stringify(loadBid(blocked, SPEC)) === "{}", "loadBid on blocked storage is not {}");

    s = fakeStorage();
    s.map.set(SPEC.key, "{not json");
    expect(JSON.stringify(loadBid(s, SPEC)) === "{}", "loadBid on unparseable storage is not {}");
    s.map.set(SPEC.key, JSON.stringify({ v: -1, values: { area: "48" } }));
    expect(JSON.stringify(loadBid(s, SPEC)) === "{}", "loadBid accepted a blob from another version");
  } catch (e) {
    fail(`threw ${e && e.name}: ${String(e && e.message).slice(0, 120)}`);
  }
}
console.log(JSON.stringify(out));
"""


def share_modules(root):
    return sorted([*root.glob("ventures/*/share.mjs"), *root.glob("ventures/*/site/share.mjs")])


def run(root, timeout=120):
    files = [str(p) for p in share_modules(root)]
    proc = subprocess.run(["node", "--input-type=module", "-e", NODE, json.dumps(files)],
                          cwd=root, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"node exited {proc.returncode}: {proc.stderr[-2000:]}")
    return json.loads(proc.stdout.strip().splitlines()[-1])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    args = ap.parse_args(argv)
    root = args.root.resolve()
    out = run(root)
    for file, what in out["breaches"]:
        print(f"{Path(file).relative_to(root)}: {what}")
    for file, err in out["unloadable"]:
        print(f"{Path(file).relative_to(root)}: could not be imported in node: {err}")
    print(f"{out['checked']} share.mjs storage helper(s) checked ({out['skipped']} of another design skipped); "
          f"{len(out['breaches'])} breach(es), {len(out['unloadable'])} unloadable.")
    return 1 if out["breaches"] or out["unloadable"] else 0


if __name__ == "__main__":
    sys.exit(main())
