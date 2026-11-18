#!/usr/bin/env python3
"""Fail if a vendored share.mjs encoder throws on a name holding an emoji.

Several ventures carry a copy of `share.mjs` whose `encodeBid(spec, values)`
puts typed text (a row's "Other space" name) in the link with
`encodeURIComponent`, after cutting it to 80 UTF-16 code units. Red team
2026-11-16 (moving-bid-calculator, second run) found the cut could fall
between the two halves of an emoji, and `encodeURIComponent` throws
"URI malformed" on half a surrogate pair: the share link and the saved bid
both failed for the whole form, in all 7 copies at once. Pasted text holding
a stray half did the same.

This imports every `ventures/*/share.mjs` and `ventures/*/site/share.mjs`
that exports `encodeBid` and `decodeBid`, encodes a spec with a text row
field and a top-level text field under those two inputs, and fails on a
URIError (other errors are left alone: another design may reject this spec
on purpose). It also checks a name decoded from a link re-encodes cleanly.

    python3 platform/ci/check_share_text_encoding.py [--root DIR]   # exit 1 on a breach
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
const SPEC = {
  key: "text-contract",
  numbers: ["area"],
  text: ["note"],
  rows: { param: "rows", fields: [{ key: "n", kind: "number" }, { key: "name", kind: "text" }] },
};
const INPUTS = {
  "an emoji at the length cut": "a".repeat(79) + "\u{1F600} kitchen",
  "a stray high surrogate": "Hall \uD83D west",
  "a stray low surrogate": "Hall \uDE00 west",
};
const out = { checked: 0, breaches: [], unloadable: [] };
for (const file of files) {
  let mod;
  try { mod = await import(pathToFileURL(file)); }
  catch (e) { out.unloadable.push([file, String(e && e.message).slice(0, 120)]); continue; }
  const { encodeBid, decodeBid } = mod;
  if (typeof encodeBid !== "function" || typeof decodeBid !== "function" || encodeBid.length !== 2) continue;
  out.checked++;
  for (const [label, name] of Object.entries(INPUTS)) {
    try {
      const encoded = encodeBid(SPEC, { area: "1", note: name, rows: [{ n: "2", name }] });
      const back = decodeBid(SPEC, encoded);
      if (back && typeof back === "object") encodeBid(SPEC, back);
    } catch (e) {
      if (e instanceof URIError) out.breaches.push([file, `encodeBid threw URIError on ${label}`]);
    }
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
    print(f"{out['checked']} share.mjs encoder(s) checked; "
          f"{len(out['breaches'])} breach(es), {len(out['unloadable'])} unloadable.")
    return 1 if out["breaches"] or out["unloadable"] else 0


if __name__ == "__main__":
    sys.exit(main())
