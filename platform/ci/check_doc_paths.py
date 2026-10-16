#!/usr/bin/env python3
"""Report backticked repo paths in the steering docs that point at nothing.

`check_md_links.py` covers `[text](path)` links. The steering documents
(CLAUDE.md, AGENTS.md, prompt.md, prompts/, .github/prompts/) mostly name
files in backticks instead, and a moved or deleted file leaves a pointer that
costs the next run a failed read. This lists the ones that no longer resolve.

Skipped: placeholders (`<slug>`, `*`, `YYYY`), bare numbers, fenced code, and
dated logs that describe the past (prompts/runs, prompts/process/reports,
prompts/drift, prompts/derived, prompts/experiments.md, docs/history).

Usage:
    python3 platform/ci/check_doc_paths.py [--root DIR] [PATH ...]

Exit 0: every named path exists. Exit 1: stale paths printed as file:line: path.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOTS = ("platform", "portfolio", "prompts", "research", "gitops", "infra",
         "ventures", "docs", ".github", "bootstrap")
SPAN_RE = re.compile(r"`([^`\n]+)`")
PATH_RE = re.compile(r"^(?:%s)/[A-Za-z0-9_.@/-]+$" % "|".join(re.escape(r) for r in ROOTS))
FENCE_RE = re.compile(r"^\s*(```|~~~)")
PLACEHOLDER_RE = re.compile(r"YYYY|MM-DD|<|>|\*|\{|\.\.\.")
LOG_PREFIXES = ("prompts/runs/", "prompts/process/reports/", "prompts/drift/",
                "prompts/derived/", "docs/history/")
LOG_FILES = ("prompts/experiments.md",)
DEFAULT_DOCS = ("CLAUDE.md", "AGENTS.md", "prompt.md", "PRODUCT_PLAYBOOK.md", "README.md")


def is_log(rel: str) -> bool:
    return rel in LOG_FILES or rel.startswith(LOG_PREFIXES)


def paths_in(text: str):
    """Yield (line_number, path) for each checkable backticked repo path."""
    fenced = False
    for n, line in enumerate(text.splitlines(), 1):
        if FENCE_RE.match(line):
            fenced = not fenced
            continue
        if fenced:
            continue
        for span in SPAN_RE.findall(line):
            span = span.strip().rstrip(".,;:")
            if PLACEHOLDER_RE.search(span) or not PATH_RE.match(span):
                continue
            if span.rstrip("/").rsplit("/", 1)[-1].isdigit():
                continue
            yield n, span


def stale(root: Path, rel: str) -> list[tuple[int, str]]:
    text = (root / rel).read_text(encoding="utf-8", errors="replace")
    return [(n, p) for n, p in paths_in(text) if not (root / p).exists()]


def default_files(root: Path) -> list[str]:
    out = subprocess.run(["git", "ls-files", "prompts/*.md", "prompts/**/*.md",
                          ".github/prompts/*.md"], cwd=root, capture_output=True,
                         text=True, check=True).stdout.split()
    return [f for f in list(DEFAULT_DOCS) + out if (root / f).is_file()]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=Path(__file__).resolve().parents[2], type=Path)
    ap.add_argument("paths", nargs="*")
    a = ap.parse_args(argv)
    files = a.paths or default_files(a.root)
    bad = 0
    for rel in sorted(set(files)):
        if is_log(rel):
            continue
        for n, p in stale(a.root, rel):
            print(f"{rel}:{n}: {p}")
            bad += 1
    if bad:
        print(f"check_doc_paths: {bad} stale path(s)", file=sys.stderr)
        return 1
    print("check_doc_paths: every backticked repo path in the steering docs exists.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
