#!/usr/bin/env python3
"""Fail if a Node script decides "am I the entry script?" from a hand-built file:// string.

Most CLIs under `ventures/` end with a guard so that importing the module (from
a test or a page) does not run `main()`. Until 2026-11-14, 310 files wrote it as

    if (import.meta.url === `file://${process.argv[1]}`) { ... }

or with `new URL(`file://${...}`).href` / `new URL(process.argv[1], "file://")`.
`import.meta.url` is percent-encoded and on Windows starts `file:///C:/`, so
none of those strings matches it when the script lives in a folder with a
space, `#` or `%` in its name, or on any Windows path. The guard is then false
and the CLI prints nothing and exits 0: `--help` is silent and a CI gate
(`--max-churn`, a security check's exit 1) always passes. Red team 2026-11-14
reproduced it with a checker copied under "My Projects".

The robust form is

    import { pathToFileURL } from "node:url";
    if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { ... }

(in a module the browser also loads, `(await import("node:url")).pathToFileURL`
behind the `typeof process` guard).

    python3 platform/ci/check_cli_entry.py [--root DIR]   # exit 1 on any fragile guard
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN = ("ventures", "platform", "research", "portfolio", "docs")
SKIP_DIRS = {"node_modules", ".git", "dist", "_site"}

ARGV = r"(?:path\.resolve\()?process\.argv\[1\][^`)]*\)?"
FRAGILE = re.compile(
    r"import\.meta\.url\s*===?\s*(?:"
    r"`file://\$\{" + ARGV + r"\}`"                       # `file://${process.argv[1]}`
    r"|new URL\(\s*`file://\$\{" + ARGV + r"\}`\s*\)"      # new URL(`file://${...}`).href
    r"|new URL\(\s*process\.argv\[1\]\s*,\s*[\"'`]file://"  # new URL(process.argv[1], "file://")
    r")"
    r"|`file://\$\{" + ARGV + r"\}`\s*===?\s*import\.meta\.url"
)


def scripts(root):
    for top in SCAN:
        base = root / top
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.suffix in (".mjs", ".js") and p.is_file() and not SKIP_DIRS.intersection(p.parts):
                yield p


def findings(root):
    out = []
    for p in sorted(scripts(root)):
        text = p.read_text(encoding="utf-8", errors="replace")
        if "import.meta.url" not in text:
            continue
        for m in FRAGILE.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            out.append(f"{p.relative_to(root)}:{line}: entry-script guard built from a file:// string "
                       "(false from a path with a space, # or %, or on Windows: the CLI exits 0 silently); "
                       "use import.meta.url === pathToFileURL(process.argv[1]).href")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    args = ap.parse_args(argv)
    bad = findings(args.root)
    for line in bad:
        print(line)
    print(f"check_cli_entry: {len(bad)} fragile entry-script guard(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
