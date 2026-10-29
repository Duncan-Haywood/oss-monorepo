#!/usr/bin/env python3
"""PreToolUse hook: before `git push`, check front matter of posts this branch adds or edits.

A post missing `description`/`tags`, or with a description over 160 characters,
merged and turned main red three times (2026-10-26 to 2026-10-28), because the
only check ran in CI after the PR was open. This runs the same `problems()` on
just the posts this branch changed since it forked from origin/main (three-dot diff, so a post main has since fixed is not re-flagged), so another run's bad post never
blocks you. Silent when origin/main is not fetched or nothing applies.
"""
import json, re, subprocess, sys
from pathlib import Path

try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)
if not re.search(r"(?:^|[;&|(\n]|\b(?:then|do|else)\b)\s*git\s+push\b", cmd):
    sys.exit(0)

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "platform" / "ci"))
try:
    from check_post_frontmatter import problems
    out = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=AM", "origin/main...HEAD", "--", "docs/posts/*.md"],
        cwd=root, capture_output=True, text=True, timeout=20).stdout.split()
except Exception:
    sys.exit(0)

bad = []
for rel in out:
    f = root / rel
    if f.is_file():
        bad += [f"{f.name}: {p}" for p in problems(f.name, f.read_text(encoding="utf-8"))]
if bad:
    print("Blocked: this push carries a post the front-matter check rejects "
          "(it would turn main red):\n  " + "\n  ".join(bad) +
          "\nFix it and commit, then push again (platform/ci/check_post_frontmatter.py).", file=sys.stderr)
    sys.exit(2)
