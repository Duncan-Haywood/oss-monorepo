#!/usr/bin/env python3
"""Go-live switch for the dark paid paths: one command instead of six hand edits.

    python3 portfolio/monetization/golive.py                 # status of every checkout.mjs
    python3 portfolio/monetization/golive.py set URL         # one link for every dark path
    python3 portfolio/monetization/golive.py set slug=URL ...  # a link per venture
    python3 portfolio/monetization/golive.py unset [slug ...] # back to dark

Every venture with a `checkout.mjs` exports CHECKOUT_URL (empty = no Buy button)
and VALIDATE_URL. This only edits that one constant, and only accepts an
https:// link with no spaces or quotes. It never touches a secret: both values
are public. The owner creates the hosted checkout product; this applies it.
After `set`, run each venture's tests and move its stage in models.yaml to
test-paid only once a test-mode purchase has actually run.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
LINE = re.compile(r'^(export const CHECKOUT_URL = )"([^"\n]*)"(;.*)$', re.M)
VALIDATE = re.compile(r'^export const VALIDATE_URL = "([^"\n]*)"', re.M)
SAFE = re.compile(r'^https://[^\s"\'\\<>]+$')


def files(repo: Path = REPO) -> dict[str, Path]:
    return {p.parent.name: p for p in sorted((repo / "ventures").glob("*/checkout.mjs"))
            if LINE.search(p.read_text(encoding="utf-8"))}


def status(repo: Path = REPO) -> list[tuple[str, str, str]]:
    rows = []
    for slug, p in files(repo).items():
        text = p.read_text(encoding="utf-8")
        url = LINE.search(text).group(2)
        v = VALIDATE.search(text)
        rows.append((slug, url, v.group(1) if v else ""))
    return rows


def apply(slug: str, url: str, repo: Path = REPO) -> None:
    fs = files(repo)
    if slug not in fs:
        raise ValueError(f"{slug}: no ventures/{slug}/checkout.mjs with a CHECKOUT_URL")
    if url and not SAFE.match(url):
        raise ValueError(f"{slug}: link must be https:// with no spaces, quotes or <>")
    p = fs[slug]
    p.write_text(LINE.sub(lambda m: f'{m.group(1)}"{url}"{m.group(3)}',
                          p.read_text(encoding="utf-8"), count=1), encoding="utf-8")


def main(argv: list[str], repo: Path = REPO) -> int:
    cmd = argv[0] if argv else "status"
    if cmd == "status":
        rows = status(repo)
        for slug, url, v in rows:
            print(f"{slug:28} {'LIVE ' + url if url else 'dark'}")
        n = sum(1 for _, u, _ in rows if u)
        print(f"\n{n} of {len(rows)} paid paths have a checkout link set.")
        if len({v for _, _, v in rows}) > 1:
            print("warning: VALIDATE_URL differs between ventures")
        return 0
    if cmd == "set" and len(argv) > 1:
        pairs = []
        for a in argv[1:]:
            if "=" in a and not a.startswith("https://"):
                s, u = a.split("=", 1)
                pairs.append((s, u))
            else:
                pairs += [(s, a) for s in files(repo)]
        try:
            for s, u in pairs:
                if not u:
                    raise ValueError(f"{s}: empty link; use `unset`")
                apply(s, u, repo)
        except ValueError as e:
            print(f"refused: {e}", file=sys.stderr)
            return 2
        return main(["status"], repo)
    if cmd == "unset":
        for s in argv[1:] or files(repo):
            apply(s, "", repo)
        return main(["status"], repo)
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
