#!/usr/bin/env python3
"""Give every venture and research README a title a searcher would type.

A README's `# H1` is the heading GitHub shows and search engines index first.
`# shopify-customer-csv-check` names a directory; `# Shopify Customer CSV
Check — Find Import Errors Before You Import` names what the thing does. 50
READMEs carried the bare slug when this was written, although each one's page
already had a good title.

The title comes from what the project already publishes, so nothing is
invented here:

  - a venture: the `<title>` of its `index.html`;
  - a research project: its `title` in `research/_homepage/projects.json`.

Only an H1 that is exactly the slug is touched; a hand-written title is left
alone. A project with no published title is left alone too.

    python3 platform/ci/readme_titles.py          # report; exit 1 if any README has a bare-slug title
    python3 platform/ci/readme_titles.py --write  # replace those titles (idempotent)
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S | re.I)


def page_title(index_html):
    m = TITLE_RE.search(index_html)
    if not m:
        return None
    title = " ".join(html.unescape(m.group(1)).split())
    return title or None


def research_titles(root):
    f = root / "research" / "_homepage" / "projects.json"
    if not f.exists():
        return {}
    sys.path.insert(0, str(ROOT / "research" / "_homepage"))
    import registry
    data = registry.load(root / "research")
    return {p["slug"]: " ".join(html.unescape(re.sub(r"<[^>]+>", "", p["title"])).split())
            for t in data["themes"] for p in t["projects"] if p.get("title")}


def bare_slug_title(text, slug):
    """True when the README's first H1 is the slug itself."""
    for line in text.split("\n"):
        if line.startswith("# "):
            return line[2:].strip().strip("`") == slug
    return False


def retitle(text, title):
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("# "):
            lines[i] = f"# {title}"
            break
    return "\n".join(lines)


def candidates(root=ROOT):
    """Yield (readme_path, slug, published_title) for each bare-slug README."""
    for d in sorted((root / "ventures").iterdir()) if (root / "ventures").is_dir() else []:
        readme, index = d / "README.md", d / "index.html"
        if not readme.is_file():
            continue
        text = readme.read_text(encoding="utf-8")
        if bare_slug_title(text, d.name):
            title = page_title(index.read_text(encoding="utf-8")) if index.is_file() else None
            yield readme, d.name, title
    titles = research_titles(root)
    for slug in sorted(titles):
        readme = root / "research" / slug / "README.md"
        if readme.is_file() and bare_slug_title(readme.read_text(encoding="utf-8"), slug):
            yield readme, slug, titles[slug]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--root", type=Path, default=ROOT)
    args = ap.parse_args(argv)
    fixable, untitled = [], []
    for readme, slug, title in candidates(args.root):
        rel = readme.relative_to(args.root)
        if not title:
            untitled.append(rel)
            continue
        fixable.append((rel, title))
        if args.write:
            readme.write_text(retitle(readme.read_text(encoding="utf-8"), title), encoding="utf-8")
    verb = "retitled" if args.write else "have a bare-slug title"
    print(f"{len(fixable)} READMEs {verb}")
    if not args.write:
        for rel, title in fixable[:20]:
            print(f"  {rel}  ->  # {title}")
    for rel in untitled:
        print(f"  {rel}: bare-slug title and no published title to use (left alone)")
    return 1 if fixable and not args.write else 0


if __name__ == "__main__":
    sys.exit(main())
