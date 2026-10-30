#!/usr/bin/env python3
"""Fail when a test directory exists that CLAUDE.md's merge checklist does not
name -- `*.test.mjs` for the Node suites, `test_*.py` for the Python ones.

    python3 platform/ci/checklist_coverage.py

## What this is here to catch

CLAUDE.md's "Ship without review ceremony" section lists the local verification
commands to run while Actions runners are starved. Three of those lines --
`platform/proposal/`, then `platform/privacy/` and `platform/webcheck/` -- were
each added only after the fact, by hand, after a guard in an un-enumerated
directory had already gone unrun for days:

  - `platform/proposal/term-ids.test.mjs` stayed red on `main` while five
    separate sessions shipped the exact bug it exists to catch, each recording
    a clean local verification, because the verification list they ran did not
    mention it.
  - `platform/privacy/` and `platform/webcheck/` were not red, but were found
    the same way: nobody had asked "what else is outside the list?" until
    CLAUDE.md itself said so, in prose, after the fact.

CLAUDE.md's own conclusion from that: "Enumerate the ground instead of
recalling it; the command is faster than the recollection and it cannot be
honestly wrong." This script is that enumeration, run as code instead of
prose, so the next `platform/<new-thing>/*.test.mjs` directory is a failing
check the day it is added rather than a paragraph added to CLAUDE.md after a
bug ships.

## The Python half, added 2026-09-06 -- and why it was missing

This file used to check `*.test.mjs` only, and said so on the reasoning that
the two Python lines already auto-discovered: the `platform/ci` unittest loop
is a glob, and `pytest portfolio/ledger` runs a whole tree, so "this is the one
place drift can quietly recur."

That was wrong in the way this whole file is about. Both Python lines
auto-discover *within the directory they name*, and neither says anything
about a Python test directory somewhere else. Enumerating instead of recalling
-- `find . -name 'test_*.py'` -- returns **54 directories** against the two
the checklist named. Four suites were red at the time nobody noticed, in
tooling that decides what ships:

  - `portfolio/scoring` -- four shipped ventures (`card-processing-fee-audit`,
    `dog-walking-route-pricing`, `equipment-lease-buyout-calculator`,
    `pet-grooming-bid-calculator`) had a `VENTURE.yaml` and no score row, so
    `portfolio/router` could not allocate a session to any of them. The check
    that catches this, `score_ventures.py --check`, had been failing since
    they graduated.
  - `portfolio/router` -- the same gap, from the other side.
  - `portfolio/ledger` -- `test_decision_queue.py` still asserted both origins
    were dark, months after Pages started serving.

So the rule is now the same for both languages: a directory carrying tests
must be named in the checklist, whatever the tests are written in.

## Directories run by their own tooling

`ventures/*` was already excluded, on the grounds that the checklist carries a
standing `ventures/<slug>/*.test.mjs` placeholder and a fresh venture is not
itself a checklist gap. Two Python trees work the same way and are covered the
same way, by a placeholder line rather than one line per directory:
`portfolio/research/*` and `portfolio/pipeline/probes/*`.

## The venture half, added 2026-09-17 -- the placeholder that did not reach

Crediting `ventures/` to that placeholder checks that a *line exists*. It never
checked that the line's **glob shape** reaches the files, and for 21 of 299
ventures it does not: they keep their suites in a `test/` subdirectory, which
`ventures/<slug>/*.test.mjs` cannot match. Measured 2026-09-17: 95 test files,
1055 assertions, invisible to the list a session follows during a starvation
window.

What that looks like to a session is the worst available shape, because it is
not an error:

    $ node --test ventures/commercial-photo-license-calculator/*.test.mjs
    # tests 0
    # pass 0
    # fail 0
    $ echo $?
    0

A green run that ran nothing, in a file whose own rule is that "a skip is a
green that means nothing ran ... and it is worse, because nobody investigates a
pass". CI does reach these (a venture workflow's bare `node --test` discovers
`test/` on its own), which is exactly why it stayed invisible -- and exactly
why it matters now, since while runners are starved CI running them is the
same as nothing running them.

So this half does not check for a line. It reads the placeholder's glob shape
out of the checklist, turns it into a matcher, and asks whether that matcher
reaches each venture test file actually on disk. That is deliberate and is the
same import-don't-restate rule the rest of this file follows: fix the line to
`ventures/<slug>/**/*.test.mjs` and this check goes quiet on its own, because
it is reading the fixed line rather than a copy of what the line ought to say.

This is not a courtesy exclusion -- it is forced, and measurably so. Those
trees cannot be run by one command from the repo root:

  - two probes carry their own `pyproject.toml`, and collecting them from the
    root aborts the whole run;
  - several modules import their siblings by bare name, so they resolve only
    with their own directory as the working directory (the same property that
    makes the `platform/ci` line `cd` first, and `--import-mode=importlib`
    breaks them rather than fixing it);
  - `test_measure.py` exists in four different research directories, which
    pytest rejects as an import file mismatch without per-project roots.

Each is a real project root, so each needs its own invocation -- exactly what
the placeholder line says. The placeholders are themselves checked: they are
ordinary covered prefixes below, so deleting one turns every directory under
it into a reported gap rather than into silence.

Exit 0: every test directory outside those placeholders is named somewhere in
the checklist block. Exit 1: prints each directory that is not, with the line
to add.
"""

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# The checklist block opens with this script's own line and is a fenced ```
# block in `.github/prompts/verify-and-merge.md`. (It opened with the
# `regen.mjs` line until that generator was retired on 2026-10-30.)
BLOCK_START_MARKER = "python3 platform/ci/checklist_coverage.py"

TEST_MJS_GLOB_RE = re.compile(r"(\S+?)/\*\.test\.mjs")

# Any path-ish token in the checklist block. Used for the Python side, where a
# directory can be named by several different command shapes -- `pytest <dir>`,
# a `cd <dir> && ...` loop, or a `<dir>/<placeholder>/` line -- and matching
# each shape with its own regex would go stale the first time someone writes a
# fourth one. A token is reduced to its literal directory prefix by
# `literal_prefix` below, so `ventures/<slug>/*.test.mjs` covers `ventures`.
CHECKLIST_PATH_RE = re.compile(r"[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.<>*-]+)+")

# Filenames pytest and unittest both collect.
TEST_PY_RE = re.compile(r"^(test_.+|.+_test)\.py$")

# Never a project directory, however the path is spelled.
IGNORED_PARTS = ("node_modules", "__pycache__", "site-packages")


def literal_prefix(token):
    """The leading, literal directory part of a checklist path token.

    Stops at the first segment carrying a glob or a `<placeholder>`, and drops
    a trailing filename segment, so:

        ventures/<slug>/*.test.mjs   -> ventures
        platform/privacy/*.test.mjs  -> platform/privacy
        portfolio/scoring            -> portfolio/scoring
        portfolio/ledger/README.md   -> portfolio/ledger
    """
    segments = []
    for segment in token.split("/"):
        if "*" in segment or "<" in segment or ">" in segment:
            break
        segments.append(segment)
    # A token ending in a filename names the directory holding it, not itself.
    if segments and "." in segments[-1] and not segments[-1].startswith("."):
        segments.pop()
    return "/".join(segments)


def checklist_paths(block_text):
    """Every literal directory prefix the checklist block names, in any command
    shape. Language-agnostic, unlike `checklist_directories`."""
    prefixes = set()
    for match in CHECKLIST_PATH_RE.finditer(block_text):
        prefix = literal_prefix(match.group(0))
        if prefix:
            prefixes.add(prefix)
    return prefixes


def read_checklist_block(claude_md_text):
    """Return the fenced code block that contains BLOCK_START_MARKER, or None."""
    idx = claude_md_text.find(BLOCK_START_MARKER)
    if idx == -1:
        return None
    # Walk backward to the opening ``` of the fence this line lives in.
    start_fence = claude_md_text.rfind("```", 0, idx)
    if start_fence == -1:
        return None
    end_fence = claude_md_text.find("```", idx)
    if end_fence == -1:
        return None
    return claude_md_text[start_fence:end_fence]


def checklist_directories(block_text):
    """Directories the checklist names via a `<dir>/*.test.mjs` glob.

    A line may name more than one glob (`node --test a/*.test.mjs b/*.test.mjs`).
    `ventures/<slug>` is returned as the literal string "ventures" -- callers
    that exclude ventures/* from the disk scan don't need to special-case it,
    but it is reported as covered rather than as a real, checkable directory.
    """
    dirs = set()
    for match in TEST_MJS_GLOB_RE.finditer(block_text):
        dirs.add(match.group(1))
    return dirs


def nested_checkout_filter(repo_root):
    """Return `is_nested(rel)` for one scan of one repo_root.

    A factory rather than a plain function with a cached default, because the
    cache must not outlive the scan. It did: the first version keyed a
    module-level `_cache={}` on the ancestor tuple alone, so in a process that
    scans more than one root -- the test suite does, and so would any future
    caller -- a `sweepwt` checkout in the first root made ordinary
    `sweepwt/**` tests in a later root vanish from the scan. Reversing the
    order flipped which repo got the wrong answer.

    Caught by an automated reviewer on #4646 after it merged, and it deserved
    catching: silently dropping a directory from the scan is precisely the
    failure this whole exclusion exists to prevent, reintroduced by the fix
    for it. A cache keyed on less than it depends on is the same defect as a
    stale checklist line, one layer down.

    A `git worktree` added inside the repository -- which CLAUDE.md tells you
    to use, for a supersession check and to read `main` without disturbing
    your tree -- is a second complete copy of every file, untracked by the
    outer repo. Without this, the scans below find all 65 test directories
    twice and this checker fails with 65 findings that name paths like
    `sweepwt/portfolio/ledger/`, instructing the reader to add them to
    CLAUDE.md.

    Measured 2026-09-11, on a session that had a sweep running in
    `./sweepwt`. Everything about that report is wrong, and it is wrong in
    the most expensive direction: a guard that cries wolf is one a reader
    learns to wave through, and this guard's whole job is to be believed the
    one time a genuinely uncovered directory appears.

    Detected by the presence of a `.git` entry (a directory for a clone or
    submodule, a file for a linked worktree) rather than by name, so it also
    covers a stray clone someone left in the tree.
    """
    cache = {}

    def is_nested(rel):
        for i in range(1, len(rel.parts)):
            ancestor = rel.parts[:i]
            if ancestor not in cache:
                cache[ancestor] = (repo_root.joinpath(*ancestor) / ".git").exists()
            if cache[ancestor]:
                return True
        return False

    return is_nested


def actual_test_mjs_dirs(repo_root):
    """Directories under repo_root holding a `*.test.mjs` file, as repo-root-relative
    POSIX paths, excluding ventures/*, node_modules, and dotdirs."""
    found = set()
    is_nested = nested_checkout_filter(repo_root)
    for path in repo_root.rglob("*.test.mjs"):
        rel = path.relative_to(repo_root)
        parts = rel.parts
        if parts[0] in ("node_modules", "ventures") or parts[0].startswith("."):
            continue
        if any(p.startswith(".") or p == "node_modules" for p in parts):
            continue
        if is_nested(rel):
            continue
        found.add(rel.parent.as_posix())
    return found


def actual_test_py_dirs(repo_root):
    """Directories under repo_root holding a `test_*.py` or `*_test.py` file, as
    repo-root-relative POSIX paths, excluding node_modules, caches and dotdirs.

    `ventures/` is NOT excluded here, unlike the `.mjs` scan: the checklist's
    `ventures/<slug>/*.test.mjs` placeholder reduces to the prefix `ventures`,
    which covers a venture's Python tests too, so the exclusion is expressed
    once in the checklist rather than twice in this file.
    """
    found = set()
    is_nested = nested_checkout_filter(repo_root)
    for path in repo_root.rglob("*.py"):
        if not TEST_PY_RE.match(path.name):
            continue
        rel = path.relative_to(repo_root)
        parts = rel.parts
        if any(p.startswith(".") or p in IGNORED_PARTS for p in parts):
            continue
        if is_nested(rel):
            continue
        found.add(rel.parent.as_posix())
    return found


def glob_token_to_regex(token):
    """Compile a checklist path token into a matcher for repo-relative paths.

    Segment-wise so the three wildcard shapes keep their ordinary glob
    meanings and cannot leak across a `/`:

        <placeholder>  one whole segment       -> [^/]+
        *              within a segment        -> [^/]*
        **             zero or more segments   -> (?:[^/]+/)*

    `**` spanning *zero* segments is the case worth stating, because getting it
    wrong would silently re-break the flat majority this check exists to keep
    passing: `ventures/<slug>/**/*.test.mjs` has to match
    `ventures/foo/calc.test.mjs` as well as `ventures/foo/test/calc.test.mjs`.
    """
    compiled = []
    for segment in token.split("/"):
        if segment == "**":
            compiled.append("(?:[^/]+/)*")
            continue
        out = ""
        i = 0
        while i < len(segment):
            char = segment[i]
            if char == "<":
                close = segment.find(">", i)
                if close == -1:
                    out += re.escape(char)
                    i += 1
                    continue
                out += "[^/]+"
                i = close + 1
            elif char == "*":
                out += "[^/]*"
                i += 1
            else:
                out += re.escape(char)
                i += 1
        compiled.append(out + "/")
    pattern = "".join(compiled)
    if pattern.endswith("/"):
        pattern = pattern[:-1]
    return re.compile("^" + pattern + "$")


def actual_venture_test_mjs_files(repo_root):
    """Every `*.test.mjs` under ventures/, as repo-root-relative POSIX paths."""
    found = set()
    is_nested = nested_checkout_filter(repo_root)
    ventures_root = repo_root / "ventures"
    if not ventures_root.is_dir():
        return found
    for path in ventures_root.rglob("*.test.mjs"):
        rel = path.relative_to(repo_root)
        if any(p.startswith(".") or p in IGNORED_PARTS for p in rel.parts):
            continue
        if is_nested(rel):
            continue
        found.add(rel.as_posix())
    return found


def find_venture_glob_gaps(claude_md_text, repo_root):
    """Return (gaps, tokens) for venture tests the checklist's glob cannot reach.

    `gaps` maps a venture slug to the sorted test files under it that no
    `ventures/...` token in the checklist block matches. A venture appears only
    when at least one of its files is unreachable, so a venture that keeps some
    suites flat and some in `test/` is still reported rather than credited to
    the half that matches.
    """
    block = read_checklist_block(claude_md_text)
    if block is None:
        raise ValueError(
            "could not find the merge-checklist code block in verify-and-merge.md "
            f"(looked for a fenced block containing {BLOCK_START_MARKER!r})"
        )
    tokens = sorted(
        {
            m.group(0)
            for m in CHECKLIST_PATH_RE.finditer(block)
            if m.group(0).startswith("ventures/") and m.group(0).endswith(".test.mjs")
        }
    )
    matchers = [glob_token_to_regex(t) for t in tokens]
    gaps = {}
    for rel in sorted(actual_venture_test_mjs_files(repo_root)):
        if any(m.match(rel) for m in matchers):
            continue
        gaps.setdefault(rel.split("/")[1], []).append(rel)
    return gaps, tokens


ROOT_IGNORE_RE = re.compile(r"--ignore=(\S+?)(?=[\s\"']|$)")


def root_ignored_trees(repo_root):
    """Trees a repo-root `pytest` cannot reach, read from the root pyproject's
    `addopts`.

    This is read rather than recalled for the reason the whole file exists. The
    root `pyproject.toml` carries `--ignore=portfolio/pipeline/probes`, because
    those probes are self-contained packages whose identically-named `tests`
    packages collide on import when collected together. A checklist line naming
    `portfolio/pipeline` therefore runs **none** of them -- measured: 24 tests
    collected, 0 from probes -- so treating the parent as covering them would
    be precisely the silent false-negative this script is meant to make
    impossible.
    """
    pyproject = repo_root / "pyproject.toml"
    if not pyproject.is_file():
        return set()
    return {
        m.group(1).strip().rstrip("/")
        for m in ROOT_IGNORE_RE.finditer(pyproject.read_text())
    }


def _covered_by(prefixes, ignored_trees=frozenset()):
    """A directory is covered when the checklist names it or an ancestor.

    Exception: inside a tree the root pytest config ignores, only a checklist
    path at or below that tree counts. An ancestor line cannot reach in, so it
    must not be credited with doing so.
    """

    def covered(d):
        for c in prefixes:
            if not (d == c or d.startswith(c + "/")):
                continue
            blocking = next(
                (
                    t
                    for t in ignored_trees
                    if (d == t or d.startswith(t + "/"))
                    and not (c == t or c.startswith(t + "/"))
                ),
                None,
            )
            if blocking is None:
                return True
        return False

    return covered


def find_py_gaps(claude_md_text, repo_root):
    """Return (gaps, checklist_prefixes, disk_dirs) for Python test directories.

    Mirrors `find_gaps`, but matches against every path the checklist names
    rather than against `*.test.mjs` globs only, because a Python directory can
    be named by `pytest <dir>`, by a `cd <dir>` loop, or by a placeholder line.
    """
    block = read_checklist_block(claude_md_text)
    if block is None:
        raise ValueError(
            "could not find the merge-checklist code block in verify-and-merge.md "
            f"(looked for a fenced block containing {BLOCK_START_MARKER!r})"
        )
    prefixes = checklist_paths(block)
    disk_dirs = actual_test_py_dirs(repo_root)
    covered = _covered_by(prefixes, root_ignored_trees(repo_root))
    gaps = sorted(d for d in disk_dirs if not covered(d))
    return gaps, prefixes, disk_dirs


def find_gaps(claude_md_text, repo_root):
    """Return (gaps, checklist_dirs, disk_dirs). `gaps` is disk_dirs not covered
    by any checklist_dirs entry (a checklist dir covers itself and its
    subdirectories, since a line can glob a parent that contains several test
    files across nested folders)."""
    block = read_checklist_block(claude_md_text)
    if block is None:
        raise ValueError(
            "could not find the merge-checklist code block in verify-and-merge.md "
            f"(looked for a fenced block containing {BLOCK_START_MARKER!r})"
        )
    checklist_dirs = checklist_directories(block)
    disk_dirs = actual_test_mjs_dirs(repo_root)

    def covered(d):
        return any(d == c or d.startswith(c + "/") for c in checklist_dirs)

    gaps = sorted(d for d in disk_dirs if not covered(d))
    return gaps, checklist_dirs, disk_dirs


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--claude-md",
        default=str(REPO_ROOT / ".github" / "prompts" / "verify-and-merge.md"),
        help="path to the file holding the checklist (default: .github/prompts/verify-and-merge.md)",
    )
    parser.add_argument(
        "--repo-root",
        default=str(REPO_ROOT),
        help="repo root to scan for *.test.mjs files (default: this repo)",
    )
    args = parser.parse_args(argv)

    claude_md_text = Path(args.claude_md).read_text()
    repo_root = Path(args.repo_root)

    try:
        gaps, checklist_dirs, disk_dirs = find_gaps(claude_md_text, repo_root)
        py_gaps, py_prefixes, py_dirs = find_py_gaps(claude_md_text, repo_root)
        venture_gaps, venture_tokens = find_venture_glob_gaps(
            claude_md_text, repo_root
        )
    except ValueError as exc:
        print(f"checklist_coverage: {exc}", file=sys.stderr)
        return 2

    if venture_gaps:
        unreachable = sum(len(v) for v in venture_gaps.values())
        print(
            "checklist_coverage: the checklist's venture line cannot reach "
            f"{unreachable} test file(s) in {len(venture_gaps)} venture(s). "
            "`node --test` on a glob that matches nothing exits 0 printing "
            "'# pass 0', so following the checklist on one of these reports a "
            "clean run having executed nothing:\n"
        )
        for slug in sorted(venture_gaps):
            files = venture_gaps[slug]
            print(f"  {slug}  ({len(files)} file(s), e.g. {files[0]})")
        print(
            "\nThe checklist currently names: "
            + (", ".join(venture_tokens) or "(no ventures/ test glob at all)")
        )
        print(
            "Widen it to reach a venture's subdirectories -- "
            "`node --test 'ventures/<slug>/**/*.test.mjs'` (quoted, so node "
            "expands the `**` rather than the shell) -- in CLAUDE.md's \"Ship "
            "without review ceremony\" section. Quoting matters: bash without "
            "`globstar` leaves `**` meaning a single segment, which silently "
            "reintroduces the gap."
        )
        return 1

    if py_gaps:
        if len(py_gaps) == 1:
            noun = "1 directory that carries"
        else:
            noun = f"{len(py_gaps)} directories that carry"
        print(
            "checklist_coverage: the merge checklist (verify-and-merge.md) does not name "
            f"{noun} Python tests:\n"
        )
        for d in py_gaps:
            print(f"  {d}/  ->  add: python3 -m pytest {d} -q")
        print(
            "\nAdd each line to the checklist in verify-and-merge.md (\"Ship without "
            "review ceremony\" in CLAUDE.md links to it), in the same commit as whatever put "
            "tests there. If the directory is its own project root -- its own "
            "pyproject.toml, or modules importing siblings by bare name -- it "
            "needs its own `cd` invocation, like the platform/ci line, or a "
            "placeholder line covering the tree it belongs to."
        )
        return 1

    if gaps:
        if len(gaps) == 1:
            noun = "1 directory that carries"
        else:
            noun = f"{len(gaps)} directories that carry"
        print(
            "checklist_coverage: the merge checklist (verify-and-merge.md) does not name "
            f"{noun} *.test.mjs files:\n"
        )
        for d in gaps:
            print(f"  {d}/  ->  add: node --test {d}/*.test.mjs")
        print(
            "\nAdd each line to the checklist in verify-and-merge.md (\"Ship without "
            "review ceremony\" in CLAUDE.md links to it), in the same commit as whatever put "
            "tests there -- see the file's own note on platform/proposal, "
            "platform/privacy and platform/webcheck for why this recurs."
        )
        return 1

    print(
        f"checklist_coverage: {len(disk_dirs)} test.mjs "
        f"director{'y' if len(disk_dirs) == 1 else 'ies'} outside ventures/, "
        f"all named in the checklist ({len(checklist_dirs)} entries)."
    )
    print(
        f"checklist_coverage: {len(py_dirs)} Python test "
        f"director{'y' if len(py_dirs) == 1 else 'ies'}, all covered by "
        f"{len(py_prefixes)} path(s) the checklist names."
    )
    venture_files = actual_venture_test_mjs_files(repo_root)
    print(
        f"checklist_coverage: {len(venture_files)} venture test file(s), all "
        f"reachable by the checklist's venture glob ({', '.join(venture_tokens)})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
