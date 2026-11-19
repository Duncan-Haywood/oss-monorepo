#!/usr/bin/env python3
"""Fail if a browser script loads Playwright only by ESM import, with no fallback.

Playwright is not a dependency of this repository. Cloud sessions keep a global
copy on NODE_PATH (and in /opt/node-tools), and ESM `import('playwright')` or
`import ... from 'playwright'` ignores NODE_PATH, so a script that tries only
that dies with ERR_MODULE_NOT_FOUND in every cloud session, although
`require('playwright')` works there. On 2026-11-19 four scripts did:
platform/pages/sideways.mjs (doc_friction that day: a run had to symlink
node_modules/playwright to get it running), framerate.mjs, optout.mjs, and
ventures/dns-configuration-evidence/tests/journey.mjs, whose journey had never
run in a cloud session. platform/pages/load-playwright.mjs has the loader to use.

A file passes when it imports that loader, or also tries require()/createRequire
or the /opt/node-tools path; PLAYWRIGHT alone is not a fallback, since it is
unset in a cloud session.

    python3 platform/ci/check_playwright_import.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUFFIXES = (".mjs", ".js")
# A bare-specifier ESM load: `from 'playwright'`, `import('playwright')`, or
# `import(process.env.PLAYWRIGHT || 'playwright')` and the `specifier` form of it.
ESM = re.compile(r"""from\s+['"]playwright['"]|import\(\s*['"]playwright['"]\s*\)|\|\|\s*['"]playwright['"]""")
FALLBACK = re.compile(r"""load-playwright|createRequire|\brequire\s*\(|/opt/node-tools""")


def esm_only(text: str) -> bool:
    return bool(ESM.search(text)) and not FALLBACK.search(text)


def files(root: Path):
    try:
        out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"],
                             cwd=root, capture_output=True, text=True, check=True).stdout.split("\n")
        paths = [root / p for p in out if p.endswith(SUFFIXES)]
    except (OSError, subprocess.CalledProcessError):
        paths = [p for p in root.rglob("*") if p.suffix in SUFFIXES]
    return sorted(p for p in paths if "node_modules" not in p.parts and p.is_file())


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT))
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    bad, scanned = [], 0
    for p in files(root):
        try:
            text = p.read_text(encoding="utf8")
        except (OSError, UnicodeDecodeError):
            continue
        if "playwright" not in text:
            continue
        scanned += 1
        if esm_only(text):
            bad.append(p)
    for p in bad:
        print(f"{p.relative_to(root)}: loads Playwright by ESM import only, which ignores NODE_PATH; "
              "use platform/pages/load-playwright.mjs or add a require() fallback")
    print(f"{scanned} files name playwright, {len(bad)} load it by ESM import only")
    if not scanned:
        print(f"no file under {root} names playwright: wrong --root? A scan of nothing is not a pass.")
        return 2
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
