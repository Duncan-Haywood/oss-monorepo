#!/usr/bin/env python3
"""Fail if a Dockerfile line joiner in ventures/ ignores `# escape=`.

Several ventures read Dockerfiles with a small line-by-line scanner that
joins a line ending in a backslash onto the next one. A Windows Dockerfile
starts with the parser directive `# escape=`` so that a path like
`WORKDIR C:\\app\\` can end a line; under that directive the backslash is
not a continuation. Red team 2026-11-22 found four scanners ignored the
directive, so the instruction after such a path was glued onto it and never
read: a mutable `FROM ...:latest` (docker-base-image-pin-check), an
`ARG GITHUB_TOKEN` (docker-build-secrets-check) and the `RUN npm install`
the cache-order check exists to see (docker-cache-order-check) all went
unreported, with the tool saying everything was fine.

This flags any non-test source file under ventures/ that mentions a
Dockerfile and tests for a trailing-backslash continuation, but never
mentions the `escape` directive. It is a text heuristic: a file that
handles the directive some other way can name it in a comment.

    python3 platform/ci/check_dockerfile_escape.py [--root DIR]   # exit 1 on a hit
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# A trailing-backslash continuation test as these scanners write it:
# endswith("\\") / endsWith('\\') in Python or JS, or a /\\\s*$/ regex.
CONTINUATION = re.compile(
    r"""ends[wW]ith\(\s*(["'])\\\\\1\s*\)"""
    r"""|/\\\\\\s\*\$/"""
)
MENTIONS_DOCKERFILE = re.compile(r"dockerfile", re.I)
HANDLES_ESCAPE = re.compile(r"""escape\s*=|["']escape["']""", re.I)
SUFFIXES = {".py", ".mjs", ".js", ".cjs", ".ts"}
SKIP_PARTS = {"node_modules", ".git", "dist", "build", "vendor"}


def is_test(path):
    name = path.name
    return name.startswith("test_") or ".test." in name or name.endswith("_test.py")


def offenders(root):
    hits = []
    base = Path(root) / "ventures"
    for path in sorted(base.rglob("*")):
        if path.suffix not in SUFFIXES or not path.is_file() or is_test(path):
            continue
        if SKIP_PARTS.intersection(path.relative_to(base).parts):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if not MENTIONS_DOCKERFILE.search(text) or not CONTINUATION.search(text):
            continue
        if HANDLES_ESCAPE.search(text):
            continue
        hits.append(path.relative_to(root).as_posix())
    return hits


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(ROOT))
    args = ap.parse_args(argv)
    hits = offenders(Path(args.root))
    for hit in hits:
        print(f"{hit}: joins backslash-continued Dockerfile lines but never reads "
              "the `# escape=` directive (a Windows `C:\\app\\` line hides the next "
              "instruction); see platform/ci/check_dockerfile_escape.py")
    if hits:
        return 1
    print("ok: every Dockerfile line joiner under ventures/ reads the # escape= directive")
    return 0


if __name__ == "__main__":
    sys.exit(main())
