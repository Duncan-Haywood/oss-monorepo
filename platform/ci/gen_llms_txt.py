#!/usr/bin/env python3
"""Write a starter `llms.txt` for every venture that has none.

`goals.md` ("LLM docs and a marketing page") asks each product for an
`llms.txt`; `missing_llms_txt.py` found 1,305 of 1,327 without one. Writing
them by hand does not scale, so this builds a plain one from what the page
already says about itself: the `<title>`, the meta description and the
`<h1>`, with links to the live page and the source. Nothing is invented, and
a venture that already has an `llms.txt` is never touched, so a hand-written
file always wins.

    python3 platform/ci/gen_llms_txt.py              # write the missing files
    python3 platform/ci/gen_llms_txt.py --dry-run    # list what would be written
    python3 platform/ci/gen_llms_txt.py --limit 50   # a bounded batch
"""
import argparse
import html
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SITE = "https://duncan-haywood.github.io/oss-monorepo"
SRC = "https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures"


def meta(text: str, pattern: str) -> str:
    m = re.search(pattern, text, re.I | re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", m.group(1)))).strip() if m else ""


def build(d: Path) -> str | None:
    # platform/pages/build.mjs (ENTRY_CANDIDATES) serves site/index.html too
    pages = d if (d / "index.html").exists() else d / "site"
    page = pages / "index.html"
    if not page.exists():
        return None
    t = page.read_text(errors="replace")
    title = meta(t, r"<h1[^>]*>(.*?)</h1>") or meta(t, r"<title>(.*?)</title>")
    desc = meta(t, r'<meta\s+name="description"\s+content="([^"]*)"')
    if not title or not desc:
        return None
    slug = d.name
    out = [
        f"# {title}",
        "",
        f"> {desc}",
        "",
        "Free and open source (MIT). Results are estimates from the numbers typed in, "
        "not legal, tax, financial or professional advice.",
        "",
        "## Pages",
        "",
        f"- [The tool]({SITE}/{slug}/)",
    ]
    for p in sorted(pages.glob("*.html")):
        if p.name == "index.html":
            continue
        pt = meta(p.read_text(errors="replace"), r"<h1[^>]*>(.*?)</h1>")
        if pt:
            out.append(f"- [{pt}]({SITE}/{slug}/{p.name})")
    out += ["", "## Source", "", f"- [Source code and README]({SRC}/{slug}): MIT licensed.", ""]
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    n = skipped = 0
    for d in sorted(p for p in (REPO / "ventures").iterdir() if p.is_dir()):
        if (d / "llms.txt").exists():
            continue
        body = build(d)
        if body is None:
            skipped += 1
            continue
        if a.limit and n >= a.limit:
            break
        n += 1
        if not a.dry_run:
            (d / "llms.txt").write_text(body)
    print(f"{'would write' if a.dry_run else 'wrote'} {n}; skipped {skipped} with no page or description")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
