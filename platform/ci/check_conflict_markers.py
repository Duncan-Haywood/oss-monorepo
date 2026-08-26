#!/usr/bin/env python3
"""Fail if any tracked file still carries a git conflict marker.

On 2026-08-26 #1032 merged with `<<<<<<< HEAD` / `======= ` / `>>>>>>>
origin/main` left in two files. `ventures/cut-list-optimizer/VENTURE.yaml`
stopped being YAML, so `portfolio/router/validate.py` failed and every
push to `main` after it inherited a red `Portfolio validate` -- and
`portfolio/ledger/2026-08.yaml` silently lost one session's outcome row
inside a marker block, which no validator reads closely enough to notice.

Nothing in CI looked for the markers themselves. The YAML parser caught
one file by accident, four steps into the job and with an error message
about a "simple key" rather than about an unfinished merge; the ledger
would not have been caught at all. This runs first and says what is
actually wrong.

Only tracked files are scanned, so a scratch file in the working tree
cannot fail the build. This file quotes markers as split strings so it
does not report itself.

Exit 0 = clean. Exit 1 = at least one marker, listed with file and line.
"""
import subprocess
import sys

# Assembled at runtime rather than written literally, so scanning this
# repository does not flag this script.
MARKERS = ("<" * 7, "=" * 7, ">" * 7)


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files", "-z"], capture_output=True, text=True, check=True
    )
    # During an unresolved merge `git ls-files` prints one line per stage, so
    # a conflicted path appears three times. Report each path once.
    return sorted({p for p in out.stdout.split("\0") if p})


def markers_in(path):
    """(line number, marker) for every conflict marker starting a line."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except (OSError, UnicodeError):
        return []  # binary or unreadable: not our business
    found = []
    for n, line in enumerate(lines, 1):
        for marker in MARKERS:
            # A marker only counts at the start of a line. `=======` also
            # underlines headings in reStructuredText and shows up mid-line
            # in code, so require the marker to be followed by a space, a
            # newline, or nothing -- which is what git writes.
            if line.startswith(marker) and line[7:8] in ("", " ", "\n", "\r"):
                found.append((n, marker))
                break
    return found


def main():
    problems = []
    for path in tracked_files():
        for line_no, marker in markers_in(path):
            problems.append(f"  {path}:{line_no}: {marker}")

    if problems:
        print(
            f"{len(problems)} unresolved conflict marker(s) in tracked files:\n"
            + "\n".join(problems)
            + "\n\nA merge was committed without finishing it. Resolve the "
            "conflict and commit the result;\ndo not delete the markers and "
            "keep one side without reading both.",
            file=sys.stderr,
        )
        return 1

    print("No conflict markers in tracked files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
