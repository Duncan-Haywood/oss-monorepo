#!/usr/bin/env python3
"""Fail if a tracked .json/.webmanifest file does not parse.

A file that is one JSON value per line (JSONL) under a `.json` name is accepted
when every non-empty line parses, and reported as a note. Several venture
manifests and ledgers are loaded by nothing in CI, so a stray comma would sit
there until a browser or tool trips on it.

    python3 platform/ci/check_json_valid.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def classify(text: str) -> str:
    """Return 'json', 'jsonl' or an error string starting with 'error:'."""
    try:
        json.loads(text)
        return "json"
    except ValueError as whole:
        lines = [x for x in text.splitlines() if x.strip()]
        if len(lines) > 1:
            try:
                for x in lines:
                    json.loads(x)
                return "jsonl"
            except ValueError:
                pass
        return f"error: {str(whole)[:80]}"


def tracked() -> list[str]:
    out = subprocess.check_output(
        ["git", "ls-files", "*.json", "*.webmanifest"], cwd=REPO_ROOT, text=True)
    return [x for x in out.splitlines() if x]


def main() -> int:
    bad, jsonl = [], []
    for rel in tracked():
        p = REPO_ROOT / rel
        if not p.is_file():
            continue
        try:
            r = classify(p.read_text(encoding="utf-8-sig"))
        except (OSError, UnicodeDecodeError) as e:
            r = f"error: {e}"
        if r == "jsonl":
            jsonl.append(rel)
        elif r.startswith("error"):
            bad.append((rel, r))
    for rel in jsonl:
        print(f"note: {rel} is JSON Lines under a .json name")
    for rel, r in bad:
        print(f"FAIL {rel}: {r}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
