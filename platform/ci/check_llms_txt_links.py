#!/usr/bin/env python3
"""Check that every link in a venture's `llms.txt` points at something that exists.

`goals.md` ("LLM docs and a marketing page") asks for a current `llms.txt`. A
stale link there is read by crawlers and agents, so it is worth a check. Two
kinds of link are resolved against the tree:

  - `github.com/<owner>/oss-monorepo/(tree|blob)/main/<path>`: the path exists;
  - the Pages site (`.../oss-monorepo/`, the retired `.../monorepo-projects/`
    path, or the `example.invalid` placeholder the build rewrites):
    `<slug>/[page]` maps to `ventures/<slug>/[page|page.html|page/index.html]`.

    python3 platform/ci/check_llms_txt_links.py     # exit 1 on any dead link
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LINK = re.compile(r"\]\((https?://[^)\s]+)\)")
GH = re.compile(r"https://github\.com/[^/]+/(?:oss-monorepo|monorepo-projects)/(?:tree|blob)/main/(.*)", re.I)
SITE = re.compile(r"https://(?:[\w-]+\.github\.io/(?:oss-monorepo|monorepo-projects)|example\.invalid)/(.*)", re.I)


def dead_links(root: Path) -> list[tuple[Path, str, str]]:
    bad = []
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
            elif rest and not any(c.exists() for c in (base / rest, base / (rest + ".html"), base / rest / "index.html")):
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
