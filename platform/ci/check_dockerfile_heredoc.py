#!/usr/bin/env python3
"""Fail if a Dockerfile line scanner in ventures/ never says how it reads heredocs.

BuildKit's Dockerfile syntax (1.4+, the default frontend) lets RUN, COPY and
ADD take a heredoc:

    RUN <<EOF
    npm ci
    EOF

The lines up to the terminator are the heredoc's body: a RUN's script, or a
COPY's file content. They are not instructions. Red team 2026-11-22 (second
run) found two line-by-line scanners that read them as instructions:
docker-base-image-pin-check reported the `FROM alpine:latest` of a nested
Dockerfile written by `COPY <<EOF /srv/Dockerfile` as a mutable base image of
the outer file, and docker-cache-order-check read `COPY . .` then a
`RUN <<EOF` running `npm ci` as a RUN of "<<EOF" with no install, so the file
passed clean while the same install on one line was flagged.

This flags any non-test source file under ventures/ that mentions a
Dockerfile and joins trailing-backslash continuations (the same test
check_dockerfile_escape.py uses to spot a line scanner) but never mentions
heredocs. It is a text heuristic: a scanner that reads heredoc bodies as
lines on purpose says why in a comment containing the word "heredoc".

    python3 platform/ci/check_dockerfile_heredoc.py [--root DIR]   # exit 1 on a hit, 2 if no files
"""
import argparse
import re
import sys
from pathlib import Path

from check_dockerfile_escape import CONTINUATION, MENTIONS_DOCKERFILE, SKIP_PARTS, SUFFIXES, is_test

ROOT = Path(__file__).resolve().parents[2]

HANDLES_HEREDOC = re.compile(r"heredoc", re.I)


def offenders(root, stats=None):
    """Repo-relative paths of line scanners that never mention heredocs. When
    `stats` is a dict, its "scanned" count is the number of source files read."""
    hits = []
    scanned = 0
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
        scanned += 1
        if not MENTIONS_DOCKERFILE.search(text) or not CONTINUATION.search(text):
            continue
        if HANDLES_HEREDOC.search(text):
            continue
        hits.append(path.relative_to(root).as_posix())
    if stats is not None:
        stats["scanned"] = scanned
    return hits


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(ROOT))
    args = ap.parse_args(argv)
    stats = {}
    hits = offenders(Path(args.root), stats)
    if not stats["scanned"]:
        print(f"no source files under {args.root}/ventures: wrong --root? A scan of nothing is not a pass.")
        return 2
    for hit in hits:
        print(f"{hit}: scans Dockerfile lines but never says how it reads a "
              "`RUN <<EOF` heredoc body (its lines are not instructions); "
              "see platform/ci/check_dockerfile_heredoc.py")
    if hits:
        return 1
    print("ok: every Dockerfile line scanner under ventures/ says how it reads heredocs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
