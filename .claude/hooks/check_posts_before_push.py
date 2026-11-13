#!/usr/bin/env python3
"""PreToolUse hook: before `git push`, check front matter of posts this branch adds or edits.

A post missing `description`/`tags`, or with a description over 160 characters,
merged and turned main red three times (2026-10-26 to 2026-10-28), because the
only check ran in CI after the PR was open. This runs the same `problems()` on
just the posts this branch changed since it forked from origin/main (three-dot diff, so a post main has since fixed is not re-flagged), so another run's bad post never
blocks you. Silent when origin/main is not fetched or nothing applies.
"""
import json, os, re, subprocess, sys
from pathlib import Path

try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)
m = re.search(r"(?:^|[;&|(\n]|\b(?:then|do|else)\b)\s*git\s+push\b", cmd)
if not m:
    sys.exit(0)
# This hook sees the tree before the whole command runs. A command that edits
# or swaps files ahead of the push (sed -i, checkout, merge...) would be judged
# on the old tree, so it is let through; CI still checks the post.
before = cmd[:m.start()]
if re.search(r"\bgit\s+(?:merge|checkout|switch|restore|rebase|pull|stash|reset|cherry-pick)\b|\bsed\s+-i|\bperl\s+-[a-z]*i", before):
    sys.exit(0)
# `git add && git commit && git push` in one call used to skip the check too,
# and it is the usual way to push: 10 posts reached main broken 2026-11-10 to
# 11-13, turning the site build red until another run fixed them
# (`check_post_frontmatter.py --landed-since 2026-11-10`). The files on disk are
# what that chain commits, so judge them: the working tree against the fork
# point, plus untracked posts.
chained = bool(re.search(r"\bgit\s+(?:add|commit)\b", before))

root = Path(__file__).resolve().parents[2]
repo = Path(os.environ.get("POSTS_HOOK_REPO") or root)  # tests point this at a scratch repository
sys.path.insert(0, str(root / "platform" / "ci"))
try:
    from check_post_frontmatter import problems
    git = lambda *a: subprocess.run(["git", *a], cwd=repo, capture_output=True, text=True, timeout=20).stdout.split()
    out = set(git("diff", "--name-only", "--diff-filter=AM", "origin/main...HEAD", "--", "docs/posts/*.md"))
    if chained:
        base = git("merge-base", "origin/main", "HEAD")
        if base:
            out |= set(git("diff", "--name-only", "--diff-filter=AM", base[0], "--", "docs/posts/*.md"))
        out |= set(git("ls-files", "--others", "--exclude-standard", "--", "docs/posts/*.md"))
except Exception:
    sys.exit(0)

bad = []
for rel in sorted(out):
    f = repo / rel
    if f.is_file():
        bad += [f"{f.name}: {p}" for p in problems(f.name, f.read_text(encoding="utf-8"))]
if bad:
    print("Blocked: this push carries a post the front-matter check rejects "
          "(it would turn main red):\n  " + "\n  ".join(bad) +
          "\nFix the file, then commit and push (`git add`/`git commit` chained before the push are fine: the files on disk are judged) (platform/ci/check_post_frontmatter.py).", file=sys.stderr)
    sys.exit(2)
