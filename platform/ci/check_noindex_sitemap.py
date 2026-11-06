#!/usr/bin/env python3
"""Fail if a venture's sitemap.xml lists a page whose own meta robots says noindex.

A sitemap asks crawlers to index a URL; `<meta name="robots" content="noindex">`
asks them not to. Search Console reports the pair as "Submitted URL marked
noindex". Sample packs and admin pages carry noindex on purpose, so they
belong out of the sitemap. Only sitemap entries that resolve to a local file
under the venture are checked (absolute URLs are matched by their path tail).

    python3 platform/ci/check_noindex_sitemap.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOC = re.compile(r"<loc>\s*([^<]+?)\s*</loc>", re.I)
META = re.compile(r"<meta\b[^>]*>", re.I)
ROBOTS = re.compile(r"\bname\s*=\s*[\"']?robots\b", re.I)


def is_noindex(page: Path) -> bool:
    try:
        text = page.read_text(encoding="utf8")
        return any(ROBOTS.search(m) and "noindex" in m.lower() for m in META.findall(text))
    except (OSError, UnicodeDecodeError):
        return False


def conflicts(venture: Path):
    """Yield sitemap entries of `venture` that point at a noindex page in it."""
    sm = venture / "sitemap.xml"
    if not sm.is_file():
        return
    base = venture.name
    for loc in LOC.findall(sm.read_text(encoding="utf8")):
        path = loc.split("?")[0].split("#")[0]
        if "/blob/" in path or "/tree/" in path:
            continue  # repository links, not served pages
        if f"/{base}/" in path:
            rel = path.split(f"/{base}/", 1)[1]
        elif path.startswith("./"):
            rel = path[2:]
        else:
            continue
        if not rel.endswith(".html"):
            continue
        page = venture / rel
        if page.is_file() and is_noindex(page):
            yield rel


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    bad, n = [], 0
    for v in sorted(Path(args.root).iterdir()):
        if v.is_dir() and (v / "sitemap.xml").is_file():
            n += 1
            bad += [f"{v.name}/{rel}" for rel in conflicts(v)]
    for b in bad:
        print(f"sitemap lists a noindex page: {b}")
    print(f"{len(bad)} conflict(s) across {n} sitemaps")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
