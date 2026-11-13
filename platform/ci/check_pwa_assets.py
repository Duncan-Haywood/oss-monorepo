#!/usr/bin/env python3
"""Fail if a PWA web manifest or service worker names a local file that is missing.

A manifest icon that 404s breaks "install app"; a precache entry that 404s makes
`cache.addAll()` reject, so the service worker never installs and the app is not
offline. Only real web-app manifests count (those with `icons` or `start_url`);
the media and build indexes also named manifest.json are skipped. Remote URLs and
root-absolute paths are skipped (they depend on the serving root).

    python3 platform/ci/check_pwa_assets.py [--root DIR]   # exit 1 if any found
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SW_REF = re.compile(r"""['"](\.{0,2}/?[\w\-./]+\.(?:html|js|mjs|css|json|png|svg|ico|webp|csv|woff2?))['"]""")
SKIP = re.compile(r"(https?:|//|data:|blob:)", re.I)


def _local(base: Path, ref: str):
    ref = ref.split("?")[0].split("#")[0]
    if not ref or SKIP.match(ref) or ref.startswith("/") or "${" in ref:
        return None
    return base / ref


def manifest_missing(path: Path):
    try:
        m = json.loads(path.read_text(encoding="utf8"))
    except (OSError, ValueError):
        return
    if not isinstance(m, dict) or not ("icons" in m or "start_url" in m):
        return
    items = list(m.get("icons") or []) + list(m.get("screenshots") or [])
    for it in items:
        t = _local(path.parent, it.get("src", "")) if isinstance(it, dict) else None
        if t is not None and not t.exists():
            yield it["src"]


def sw_missing(path: Path):
    try:
        text = path.read_text(encoding="utf8")
    except (OSError, UnicodeDecodeError):
        return
    for ref in sorted(set(SW_REF.findall(text))):
        t = _local(path.parent, ref)
        if t is not None and not t.exists():
            yield ref


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    bad, n = [], 0
    for p in sorted(Path(args.root).rglob("*")):
        if not {"node_modules", ".next"}.isdisjoint(p.parts) or not p.is_file():
            continue
        if p.name.startswith("manifest") and p.suffix == ".json" or p.suffix == ".webmanifest":
            n += 1
            bad += [(p, r) for r in manifest_missing(p)]
        elif p.name in ("sw.js", "service-worker.js"):
            n += 1
            bad += [(p, r) for r in sw_missing(p)]
    for p, r in bad:
        print(f"{p}: missing {r}")
    print(f"{n} manifests and service workers, {len(bad)} missing local references")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
