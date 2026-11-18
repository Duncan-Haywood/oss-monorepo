"""List a set of raw.pixls.us sample raws (CC0) from its directory pages, for ``tools/pixls_fetch.py``.

Reads ``https://raw.pixls.us/data/<maker>/<body>/`` for each ``--maker``, keeps bodies with at least
``--min-files`` raw files of at most ``--max-mb`` MB, takes up to ``--per-body`` of them (by name), skips any body
already in ``--exclude`` (a files JSON such as ``eval/noise-card-floor-files-2026-11-18.json``: every set in it),
and prints ``{set: [{"body", "url", "name"}, ...]}`` with names as ``pixls_fetch.py`` expects (body, ``__``, file).

Usage (from ``ventures/photo-editing``)::

    python tools/pixls_list.py --set fourth --maker Pentax --maker Samsung \\
        --exclude eval/noise-card-floor-files-2026-11-18.json > files.json
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from urllib.parse import quote, unquote

BASE = "https://raw.pixls.us/data/"
ROW = re.compile(r'<a href="([^"?/][^"]*)">[^<]*</a></td><td[^>]*>[^<]*</td><td[^>]*>\s*([0-9.]+[KMG]?)\s*</td>')
DIR = re.compile(r'<a href="([^"?/][^"]*/)">')
SKIP = (".jpg", ".jpeg", ".txt", ".md", ".xmp", ".pp3", ".json", ".html", ".png", ".tif", ".tiff")


def finite_pos(text: str) -> float:
    value = float(text)
    if not math.isfinite(value) or value <= 0:
        raise argparse.ArgumentTypeError(f"must be a finite number > 0, got {text!r}")
    return value


def get(url: str) -> str:
    r = subprocess.run(["curl", "-sS", "-L", "--fail", url], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def mb(size: str) -> float:
    unit = {"K": 1 / 1024, "M": 1.0, "G": 1024.0}.get(size[-1], 1 / 2**20)
    return float(size.rstrip("KMG")) * unit


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--set", required=True)
    ap.add_argument("--maker", action="append", required=True, help="a folder under /data/, as the site spells it")
    ap.add_argument("--exclude", action="append", default=[])
    ap.add_argument("--min-files", type=int, default=3)
    ap.add_argument("--per-body", type=int, default=5)
    ap.add_argument("--max-mb", type=finite_pos, default=40.0)
    args = ap.parse_args(argv)
    seen = {m["body"] for path in args.exclude for s in json.load(open(path)).values() for m in s}
    out = []
    for maker in args.maker:
        for body in DIR.findall(get(BASE + quote(maker) + "/")):
            name = f"{maker}/{unquote(body).rstrip('/')}"
            if name in seen:
                continue
            page = get(BASE + quote(maker) + "/" + body)
            files = sorted(unquote(f).removeprefix("./") for f, size in ROW.findall(page)
                           if not f.lower().endswith(SKIP) and mb(size) <= args.max_mb)
            if len(files) < args.min_files:
                continue
            for f in files[: args.per_body]:
                out.append({"body": name, "url": BASE + quote(f"{maker}/{unquote(body)}{f}"),
                            "name": re.sub(r"[^A-Za-z0-9._\[\]-]", "_", name) + "__" + f})
            print(f"{name}: {len(files)} files", file=sys.stderr)
    print(json.dumps({args.set: out}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
