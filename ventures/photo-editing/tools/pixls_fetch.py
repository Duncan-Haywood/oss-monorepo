"""Fetch a listed set of raw.pixls.us sample raws (CC0) and write the manifest ``tools/card_scenes.py`` reads.

``eval/noise-card-floor-files-2026-11-18.json`` lists, per set, each file's body, URL and the local name the
sweeps used (body, then ``__``, then the file name), so rows match by name. Files already present are kept.

Usage (from ``ventures/photo-editing``)::

    python tools/pixls_fetch.py eval/noise-card-floor-files-2026-11-18.json --set first --out /tmp/raws > manifest.json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files")
    ap.add_argument("--set", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    out = []
    for m in json.load(open(args.files))[args.set]:
        local = os.path.join(os.path.abspath(args.out), m["name"])
        if not os.path.exists(local):
            tmp = local + ".part"
            if subprocess.run(["curl", "-sS", "-L", "--fail", "-o", tmp, m["url"]]).returncode:
                print(f"failed: {m['url']}", file=sys.stderr)
                continue
            os.replace(tmp, local)
        out.append({"body": m["body"], "file": local})
    print(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
