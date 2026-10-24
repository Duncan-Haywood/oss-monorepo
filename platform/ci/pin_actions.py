#!/usr/bin/env python3
"""Pin the repository's own `uses: owner/repo@ref` lines to commit SHAs.

    python3 platform/ci/pin_actions.py            # dry run: list refs and SHAs
    python3 platform/ci/pin_actions.py --write    # rewrite the workflow files

A tag or branch can be repointed by its owner (the 2025 tj-actions/changed-files
compromise did exactly that to every `@v<N>` consumer); a commit SHA cannot.
`pinned-actions-check` reports the gap, this tool closes it. Each distinct
`owner/repo@ref` is resolved once with `git ls-remote` (annotated tags are
peeled to their commit) and every use is rewritten to `@<sha> # <ref>`, which
Dependabot and Renovate both understand. Local (`./`) and `docker://` uses and
refs that are already a 40-hex SHA are left alone. A ref that cannot be
resolved is reported and its lines are not touched.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"

USES = re.compile(
    r"^(?P<head>\s*(?:-\s+)?uses:\s*)(?P<repo>[\w.-]+/[\w.-]+)(?P<sub>/[^@\s]*)?"
    r"@(?P<ref>[^\s#]+)(?P<tail>\s*(?:#.*)?)$"
)
SHA = re.compile(r"^[0-9a-f]{40}$")


def ls_remote(repo, ref):
    """Commit SHA for `ref` in github.com/<repo>, or None."""
    patterns = [f"refs/tags/{ref}^{{}}", f"refs/tags/{ref}", f"refs/heads/{ref}"]
    out = subprocess.run(
        ["git", "ls-remote", f"https://github.com/{repo}", *patterns],
        capture_output=True, text=True, timeout=60,
    ).stdout
    found = {}
    for line in out.splitlines():
        sha, _, name = line.partition("\t")
        found[name] = sha
    for p in patterns:
        if p in found:
            return found[p]
    return None


def pin_text(text, resolve):
    """Return (new_text, pinned, unresolved) for one file's text."""
    pinned, unresolved, lines = 0, set(), []
    for line in text.split("\n"):
        m = USES.match(line)
        if not m or SHA.match(m["ref"]):
            lines.append(line)
            continue
        sha = resolve(m["repo"], m["ref"])
        if sha is None:
            unresolved.add(f"{m['repo']}@{m['ref']}")
            lines.append(line)
            continue
        pinned += 1
        lines.append(
            f"{m['head']}{m['repo']}{m['sub'] or ''}@{sha} # {m['ref']}"
        )
    return "\n".join(lines), pinned, unresolved


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--write", action="store_true", help="rewrite files in place")
    ap.add_argument("--dir", type=Path, default=WORKFLOWS)
    args = ap.parse_args(argv)

    cache = {}

    def resolve(repo, ref):
        if (repo, ref) not in cache:
            cache[(repo, ref)] = ls_remote(repo, ref)
        return cache[(repo, ref)]

    total, bad, files = 0, set(), 0
    for path in sorted([*args.dir.glob("*.yml"), *args.dir.glob("*.yaml")]):
        text = path.read_text()
        new, n, unresolved = pin_text(text, resolve)
        total += n
        bad |= unresolved
        if n:
            files += 1
            if args.write and new != text:
                path.write_text(new)
    for (repo, ref), sha in sorted(cache.items()):
        print(f"{repo}@{ref} -> {sha or 'UNRESOLVED'}")
    verb = "pinned" if args.write else "would pin"
    print(f"{verb} {total} use(s) in {files} file(s); {len(bad)} unresolved")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
