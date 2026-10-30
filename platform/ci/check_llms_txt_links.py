#!/usr/bin/env python3
"""Check that every link in a venture's `llms.txt` points at something that exists.

`goals.md` ("LLM docs and a marketing page") asks for a current `llms.txt`. A
stale link there is read by crawlers and agents, so it is worth a check. Two
kinds of link are resolved against the tree:

  - `github.com/<owner>/oss-monorepo/(tree|blob)/main/<path>`: the path exists;
  - the Pages site (`.../oss-monorepo/`, the retired `.../monorepo-projects/`
    path, or the `example.invalid` placeholder the build rewrites):
    `<slug>/[page]` maps to `ventures/<slug>/[page|page.html|page/index.html]`,
    or names a page that the venture's build-time generator (`GENERATED_PAGES`) writes.

    python3 platform/ci/check_llms_txt_links.py     # exit 1 on any dead link
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LINK = re.compile(r"\]\((https?://[^)\s]+)\)")
GH = re.compile(r"https://github\.com/[^/]+/(?:oss-monorepo|monorepo-projects)/(?:tree|blob)/main/(.*)", re.I)
GENERATED = re.compile(r"^\s*'([\w-]+)':\s*(\[[^\]]*\]|'[\w.-]+')", re.M)
SCRIPT = re.compile(r"'([\w.-]+)'")
SITE = re.compile(r"https://(?:[\w-]+\.github\.io/(?:oss-monorepo|monorepo-projects)|example\.invalid)/(.*)", re.I)


def generated_pages(root: Path) -> dict[str, str]:
    """Venture slug -> source of the script that writes pages at build time
    (`platform/pages/generated-pages.mjs`, `GENERATED_PAGES`); those pages are not committed."""
    reg = root / "platform" / "pages" / "generated-pages.mjs"
    if not reg.exists():
        return {}
    out = {}
    for slug, scripts in GENERATED.findall(reg.read_text()):
        srcs = [root / "ventures" / slug / name for name in SCRIPT.findall(scripts)]
        text = "\n".join(src.read_text() for src in srcs if src.exists())
        if text:
            out[slug] = text
    return out


def dead_links(root: Path) -> list[tuple[Path, str, str]]:
    bad = []
    generated = generated_pages(root)
    for f in sorted((root / "ventures").glob("*/llms.txt")):
        for url in sorted(set(LINK.findall(f.read_text()))):
            m = GH.match(url)
            if m:
                if not (root / m.group(1).split("#")[0].split("?")[0]).exists():
                    bad.append((f, url, "repo path missing"))
                continue
            m = SITE.match(url)
            if not m:
                continue
            slug, _, rest = m.group(1).split("#")[0].split("?")[0].partition("/")
            base = root / "ventures" / slug
            if not base.is_dir():
                bad.append((f, url, "no such venture"))
            elif rest and rest in generated.get(slug, ""):
                continue
            elif rest and not any(c.exists() for b in (base, base / "site") for c in (b / rest, b / (rest + ".html"), b / rest / "index.html")):
                bad.append((f, url, "page missing"))
    return bad


def main() -> int:
    bad = dead_links(REPO)
    for f, url, why in bad:
        print(f"{f.relative_to(REPO)}: {why}: {url}")
    n = len(list((REPO / "ventures").glob("*/llms.txt")))
    print(f"{len(bad)} dead link(s) across {n} llms.txt files")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
