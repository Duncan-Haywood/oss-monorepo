#!/usr/bin/env python3
"""Decide, without re-running anything, whether a prior verification still holds.

`break-even.md` measured that 48.2% of this month's ledger entries record
re-verifying something another session had already verified, and priced that as
the largest agent-controllable line in a portfolio whose revenue ceiling is
structurally $0.

That behaviour is not disobedience -- `CLAUDE.md` already says not to re-derive.
It is an epistemic gap. A session arriving at a `main` that moves hourly cannot
tell whether the drift since the last verification touches the pull request in
front of it, so re-running everything is the only safe default it has. Prose
cannot close that gap; the missing thing is a fact about git.

Given a record of what was verified and the `main` tip it was verified against,
the two questions a session actually has are decidable from git alone:

1. **Build staleness.** Did `main` change anything inside the project
   directories the pull request touches? If not, a rebuild cannot return a
   different answer, and re-running it buys nothing.
2. **Check staleness.** Did `main` change the workflow files that produced the
   check runs already attached to the pull request? If not, those results still
   describe the current CI definition, and `CLAUDE.md`'s rule applies -- read the
   attached result rather than hand-running it.

The useful answer is usually partial rather than yes/no, and that is where the
saving is. On #222 when this was written, five of the six apps the previous
verification had rebuilt were provably unaffected by the drift since; only
`ai-first-markets` had moved underneath it.

Scoping is deliberately coarse: a path is attributed to its top two components,
so `ventures/photo-editing/docs-site/x` counts as `ventures/photo-editing`.
Coarse scoping over-invalidates, which is the safe direction for an error here.

What this does not do: it does not verify anything, and it cannot help a session
that never runs it. It also assumes the recorded head is still the pull
request's head -- if the branch was pushed since, the record is void, which the
report states rather than detects.

Usage:
    python3 portfolio/ledger/verification_status.py            # status report
    python3 portfolio/ledger/verification_status.py --check    # schema only (CI)
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install -r portfolio/router/requirements.txt")

REPO_ROOT = Path(__file__).resolve().parents[2]
RECORDS_PATH = REPO_ROOT / "portfolio" / "ledger" / "verifications.yaml"

# Repo-root files whose contents feed every workspace's install or build, so a
# change to one invalidates a build verification regardless of scope. Root
# documentation (CLAUDE.md, README.md) is edited most hours and affects no
# build, so it is deliberately not in this set.
GLOBAL_BUILD_FILES = {
    ".npmrc",
    "package-lock.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "requirements.txt",
    "tsconfig.json",
    "yarn.lock",
}

# Router and scoring metadata. No venture's install, lint, build or test reads
# these, and a scoring pass rewrites every one of them in a single commit, so
# counting them as drift would invalidate every record roughly hourly.
NON_BUILD_FILENAMES = {"NOT-A-VENTURE", "VENTURE.yaml"}

SHA_RE = re.compile(r"\A[0-9a-f]{40}\Z")
TIMESTAMP_RE = re.compile(r"\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\Z")
RESULTS = {"pass", "fail"}


def scope_of(path):
    """Attribute a repo-relative path to ('root'|'ci'|'project', key)."""
    parts = path.split("/")
    if len(parts) == 1:
        return ("root", path)
    if parts[0] == ".github":
        return ("ci", path)
    return ("project", "/".join(parts[:2]))


def classify(paths):
    """Split a list of changed paths into the three buckets a verdict needs."""
    projects, workflows, global_build = set(), set(), set()
    for path in paths:
        if path.rsplit("/", 1)[-1] in NON_BUILD_FILENAMES:
            continue
        kind, key = scope_of(path)
        if kind == "project":
            projects.add(key)
        elif kind == "ci":
            if path.startswith(".github/workflows/"):
                workflows.add(path)
        elif key in GLOBAL_BUILD_FILES:
            global_build.add(key)
    return {"projects": projects, "workflows": workflows, "global_build": global_build}


def verdict(pr_paths, drift_paths):
    """Compare what a pull request touches against what `main` changed since.

    `pr_paths` are the files the pull request changes; `drift_paths` are the
    files `main` changed between the verified tip and the current one.
    """
    pr = classify(pr_paths)
    drift = classify(drift_paths)
    affected = pr["projects"] & drift["projects"]
    return {
        "pr_projects": sorted(pr["projects"]),
        "affected_projects": sorted(affected),
        "unaffected_projects": sorted(pr["projects"] - affected),
        "global_build": sorted(drift["global_build"]),
        "workflows": sorted(drift["workflows"]),
        "build_valid": not affected and not drift["global_build"],
        "checks_valid": not drift["workflows"],
    }


def validate_records(records):
    """Return a list of schema problems, empty if the file is well-formed."""
    errors = []
    if not isinstance(records, list):
        return ["top level must be a list of verification records"]

    seen = set()
    for index, record in enumerate(records):
        label = f"record {index}"
        if not isinstance(record, dict):
            errors.append(f"{label}: must be a mapping")
            continue

        pr = record.get("pr")
        if not isinstance(pr, int) or isinstance(pr, bool) or pr <= 0:
            errors.append(f"{label}: `pr` must be a positive integer")
        else:
            label = f"#{pr}"
            if pr in seen:
                errors.append(f"{label}: duplicated; keep one record per pull request")
            seen.add(pr)

        for field in ("head_sha", "verified_against_main"):
            value = record.get(field)
            if not isinstance(value, str) or not SHA_RE.match(value):
                errors.append(f"{label}: `{field}` must be a full 40-character sha")

        stamp = record.get("verified_at")
        if not isinstance(stamp, str):
            # PyYAML resolves an unquoted timestamp to a datetime, which then
            # fails to round-trip through json; quote it.
            errors.append(f"{label}: `verified_at` must be a quoted string")
        elif not TIMESTAMP_RE.match(stamp):
            errors.append(f"{label}: `verified_at` must be YYYY-MM-DDTHH:MM:SSZ")

        if record.get("result") not in RESULTS:
            errors.append(f"{label}: `result` must be one of {sorted(RESULTS)}")

        note = record.get("note")
        if not isinstance(note, str) or not note.strip():
            errors.append(f"{label}: `note` must say what was actually run")

    return errors


def git(*args):
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    return result.stdout


def resolve(ref):
    out = git("rev-parse", "--verify", f"{ref}^{{commit}}")
    return out.strip() if out else None


def changed_files(base, head):
    out = git("diff", "--name-only", base, head)
    return [line for line in out.splitlines() if line] if out else []


def load_records():
    if not RECORDS_PATH.exists():
        return []
    data = yaml.safe_load(RECORDS_PATH.read_text()) or {}
    if not isinstance(data, dict):
        return data
    return data.get("records") or []


def report(records, main_ref):
    main_sha = resolve(main_ref)
    if main_sha is None:
        print(f"Cannot resolve {main_ref}; run `git fetch origin main` first.", file=sys.stderr)
        return 1

    print(f"main tip: {main_sha[:7]} ({main_ref})")
    if not records:
        print("No verification records on file.")
        return 0
    print(f"{len(records)} record(s).\n")

    for record in records:
        pr = record["pr"]
        head, verified = record["head_sha"], record["verified_against_main"]
        print(
            f"#{pr}  head {head[:7]}  verified against {verified[:7]}"
            f"  ({record['verified_at']}, {record['result']})"
        )

        if resolve(head) is None or resolve(verified) is None:
            print("  UNRESOLVABLE - a recorded commit is not in this clone; treat as stale.\n")
            continue

        base = git("merge-base", verified, head)
        if not base:
            print("  UNRESOLVABLE - no merge base with the verified tip; treat as stale.\n")
            continue

        result = verdict(changed_files(base.strip(), head), changed_files(verified, main_sha))

        if result["build_valid"]:
            print(
                "  BUILD  VALID  - main has not touched "
                + ", ".join(result["pr_projects"])
                + "; a rebuild cannot differ."
            )
        else:
            if result["affected_projects"]:
                print("  BUILD  STALE  - re-verify only: " + ", ".join(result["affected_projects"]))
                if result["unaffected_projects"]:
                    print(
                        "                  unaffected, do not re-run: "
                        + ", ".join(result["unaffected_projects"])
                    )
            if result["global_build"]:
                print("  BUILD  STALE  - root build config changed: " + ", ".join(result["global_build"]))

        if result["checks_valid"]:
            print("  CHECKS VALID  - no workflow changed since; read the attached check runs.")
        else:
            print(
                f"  CHECKS STALE  - {len(result['workflows'])} workflow file(s) changed since; "
                "the attached check runs predate them."
            )
        print()

    print("If a pull request's live head differs from the head recorded here, the record is void.")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="validate the record schema only")
    parser.add_argument("--main", default="origin/main", help="the main ref to compare against")
    args = parser.parse_args()

    try:
        records = load_records()
    except yaml.YAMLError as exc:
        print(f"{RECORDS_PATH.name} is not valid YAML: {exc}", file=sys.stderr)
        return 1

    errors = validate_records(records)
    if errors:
        print(f"{len(errors)} problem(s) in {RECORDS_PATH.name}:\n", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    if args.check:
        print(f"{len(records)} verification record(s) are well-formed.")
        return 0

    return report(records, args.main)


if __name__ == "__main__":
    sys.exit(main())
