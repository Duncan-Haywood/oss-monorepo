#!/usr/bin/env python3
"""Fail if a shared-link decoder crashes on a link whose JSON is not an object.

Most ventures put a calculation in the URL (`share.mjs`, `decode*` and
`parse*` exports) and read it back when a stranger opens the link. A link is
untrusted input: hand-edited, truncated by a chat app, or written on purpose.
`JSON.parse` accepts `null`, `7`, `"x"` and `[]` without complaint, so a
decoder that then reads `d.field` throws a TypeError and the page shows
nothing at all instead of "this link is damaged". Red team 2026-11-14 found
one (quick-pick-survey's result codes: a payload of JSON `null` threw inside
the Combine handler, so the whole team box did nothing).

This imports every `ventures/*/share.mjs` and `ventures/*/site/share.mjs`,
calls each `decode*` / `parse*` export with those payloads in the encodings
the ventures use (percent-encoded JSON, base64url, base64, with and without a
`#` or `#s=` prefix) and fails on a TypeError, RangeError or ReferenceError:
a crash, not a decision. A decoder may still return null or throw its own
Error with a message ("Invalid shared calculation link"); its page catches it.

It also covers share links that live outside a `share.mjs`: any other
`ventures/*/*.mjs` (tests aside) exporting an `encodeX` and a `decodeX` with
the same suffix, such as youth-lineup-rotator's `encodeSetup`/`decodeSetup`
in `calc.mjs`. Red team 2026-11-20: 110 such modules, 161 decoders, none
checked before. Only their `decode*` exports are fed, since a `parse*` there
is usually a text parser that takes more than one argument, not a link reader.

    python3 platform/ci/check_share_decoders.py [--root DIR]   # exit 1 on a crash
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

NODE = r"""
import { pathToFileURL } from "node:url";
const files = JSON.parse(process.argv[1]);  // [path, name pattern]
const payloads = ["null", "[]", "7", '"x"', "true", "[null]", '{"a":null}'];
const b64url = (s) => Buffer.from(s).toString("base64url");
const inputs = [];
for (const p of payloads)
  for (const enc of [encodeURIComponent(p), b64url(p), btoa(p)])
    for (const pre of ["", "#", "#s=", "#d=", "?s="]) inputs.push(pre + enc);
const CRASH = new Set(["TypeError", "RangeError", "ReferenceError"]);
const out = { decoders: 0, crashes: [], unloadable: [] };
for (const [file, pattern] of files) {
  const wanted = new RegExp(pattern, "i");
  let mod;
  try { mod = await import(pathToFileURL(file)); }
  catch (e) { out.unloadable.push([file, String(e && e.message).slice(0, 120)]); continue; }
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn !== "function" || !wanted.test(name)) continue;
    out.decoders++;
    for (const x of inputs) {
      try {
        const r = fn(x);
        if (r && typeof r.then === "function") r.catch(() => {});
      } catch (e) {
        if (e && CRASH.has(e.name)) { out.crashes.push([file, name, x, `${e.name}: ${e.message}`.slice(0, 160)]); break; }
      }
    }
  }
}
console.log(JSON.stringify(out));
"""


def share_modules(root):
    return sorted([*root.glob("ventures/*/share.mjs"), *root.glob("ventures/*/site/share.mjs")])


ENCODER = re.compile(r"export\s+(?:async\s+)?function\s+encode(\w*)\s*\(")
DECODER = re.compile(r"export\s+(?:async\s+)?function\s+decode(\w*)\s*\(")


def paired_modules(root):
    """Other venture modules exporting an encodeX/decodeX pair: share links too."""
    out = []
    for p in sorted(root.glob("ventures/*/*.mjs")):
        if p.name == "share.mjs" or ".test." in p.name or p.name.startswith("test"):
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        if set(DECODER.findall(text)) & set(ENCODER.findall(text)):
            out.append(p)
    return out


def run(root, timeout=300):
    files = [[str(p), "^(decode|parse)"] for p in share_modules(root)]
    files += [[str(p), "^decode"] for p in paired_modules(root)]
    proc = subprocess.run(["node", "--input-type=module", "-e", NODE, json.dumps(files)],
                          cwd=root, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(f"node exited {proc.returncode}: {proc.stderr[-2000:]}")
    return len(files), json.loads(proc.stdout.strip().splitlines()[-1])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    args = ap.parse_args(argv)
    root = args.root.resolve()
    n, out = run(root)
    for file, name, x, err in out["crashes"]:
        print(f"{Path(file).relative_to(root)}: {name}({x!r}) threw {err} "
              "(return null or throw your own Error so the page can say the link is damaged)")
    for file, err in out["unloadable"]:
        print(f"{Path(file).relative_to(root)}: could not be imported in node: {err}")
    print(f"{n} share-link module(s), {out['decoders']} decoder(s) fed non-object JSON; "
          f"{len(out['crashes'])} crashed, {len(out['unloadable'])} unloadable.")
    return 1 if out["crashes"] or out["unloadable"] else 0


if __name__ == "__main__":
    sys.exit(main())
