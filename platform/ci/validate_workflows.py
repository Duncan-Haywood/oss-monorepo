#!/usr/bin/env python3
"""Validate that every .github/workflows file is a well-formed GitHub workflow.

Five invariants:

1. Parseability. An unparseable workflow file fails silently: GitHub registers
   it with its `name` set to its own path, then emits a zero-job
   `startup_failure` run (blank name, `path: "BuildFailed"`) for every event it
   would have matched. Nothing in the PR checks list turns red, so the file can
   sit broken for days while every push produces a failed run nobody can
   attribute to a workflow.

2. No duplicate mapping keys. PyYAML keeps the *last* of a repeated key, so a
   file carrying two `permissions:` blocks parses here without complaint while
   the later block silently overrides the earlier one -- a least-privilege
   floor can be widened with nothing turning red. This is not hypothetical:
   open PR #192 adds `permissions: contents: read` to seven workflows that
   have since gained the same block on `main`, so merging it lands two
   `permissions:` keys in each of those seven files.

3. Least privilege. Every workflow must declare an explicit `permissions:`
   scope for GITHUB_TOKEN -- either top-level or on every job. A file with none
   runs with the repository's default token scope, broader than any
   checkout/build/lint/test step needs. Every workflow on `main` already pins a
   scope; this check keeps a newly-added one from silently regressing that.

4. A `name:` unique across the repository. GitHub groups the PR checks list by
   workflow name, not by filename, so two files sharing a name produce two
   identically-labelled rows with no way to tell which is which without
   opening each one -- the exact anti-pattern `conflict-markers-ci.yml` and
   `duplicate-symbols-ci.yml` were each named to avoid (their own headers say
   so: "a red result should name its own cause without opening it"). Found by
   this check itself: `print-atelier-ci.yml`, `quick-pick-survey-ci.yml` and
   `retail-pilot-intel-ci.yml` all carried the generic `name: CI`, unlike every
   other venture workflow's `"<slug> CI"`.

5. No `vars.GITHUB_*` or `secrets.GITHUB_*` reference. GitHub reserves that
   prefix and refuses to create a configuration variable or secret carrying it,
   so such a reference resolves to the empty string forever -- and does it
   silently, because a job skipped by a false `if:` is a *successful* run. This
   is the one invariant here written from a bug that shipped:
   `portfolio-pages.yml` gated the entire Pages deploy on
   `vars.GITHUB_PAGES_ENABLED`, so the "one owner flip" that the decision
   queue, `portfolio/DIRECTION.md` and `platform/pages/README.md` all pointed
   at could never have published a page. Nothing was red; it was found by
   reading the file. `secrets.GITHUB_TOKEN` is GitHub's own and is allowed.

Usage: python3 platform/ci/validate_workflows.py
"""
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install -r portfolio/router/requirements.txt")

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"


class DuplicateKeyError(yaml.YAMLError):
    """A mapping in the document repeats a key."""


class _StrictLoader(yaml.SafeLoader):
    """SafeLoader that rejects duplicate mapping keys rather than keeping the last.

    Overriding construct_mapping covers nested mappings too, so a job that
    repeats `permissions:` is caught the same way a top-level repeat is.
    """

    def construct_mapping(self, node, deep=False):
        seen = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            try:
                duplicate = key in seen
            except TypeError:  # unhashable key; SafeLoader reports it itself
                continue
            if duplicate:
                raise DuplicateKeyError(
                    f"duplicate key {key!r} at {key_node.start_mark}"
                )
            seen.add(key)
        return super().construct_mapping(node, deep=deep)


def check(path, errors):
    def err(msg):
        errors.append(f"{path.relative_to(REPO_ROOT)}: {msg}")

    try:
        data = yaml.load(path.read_text(), Loader=_StrictLoader)
    except DuplicateKeyError as exc:
        err(
            f"repeats a mapping key -- {exc}. The later block silently wins, so a "
            "permissions floor (or any other setting) can be overridden with no "
            "check turning red; GitHub's own parser rejects the file outright"
        )
        return
    except yaml.YAMLError as exc:
        err(f"is not valid YAML, so GitHub cannot read it at all -- {exc}")
        return

    if not isinstance(data, dict):
        err("top level must be a mapping")
        return

    if not data.get("name"):
        err("has no `name:` -- GitHub will fall back to showing the file path")

    # PyYAML resolves an unquoted `on:` key to the boolean True (YAML 1.1),
    # so accept either spelling rather than reporting a missing trigger.
    if "on" not in data and True not in data:
        err("has no `on:` trigger block")

    jobs = data.get("jobs")
    if not isinstance(jobs, dict) or not jobs:
        err("has no `jobs:` mapping")
        return

    # Least privilege for GITHUB_TOKEN: a workflow with no `permissions:`
    # anywhere runs every job with the repository's default token scope, which
    # is broader than any CI/build/lint/test step needs. Every workflow on
    # `main` already declares an explicit scope (top-level, or on each job);
    # this keeps a newly-added one from silently reintroducing the default.
    if "permissions" not in data:
        jobs_without_scope = [
            name
            for name, body in jobs.items()
            if not (isinstance(body, dict) and "permissions" in body)
        ]
        if jobs_without_scope:
            err(
                "declares no `permissions:` scope for GITHUB_TOKEN "
                f"(missing at top level and on job(s): {', '.join(jobs_without_scope)}) "
                "-- add `permissions:` (e.g. `contents: read`) to pin least privilege"
            )

    for expr in sorted(reserved_github_refs(data)):
        err(
            f"references `{expr}`, whose name GitHub reserves -- a configuration "
            "variable or secret cannot be named with a `GITHUB_` prefix, so this "
            "reads as permanently unset and any gate built on it can never be "
            "switched on. Rename it without the prefix "
            f"(e.g. `{expr.split('.', 1)[0]}.{expr.split('_', 1)[1]}`)"
        )


# `${{ ... }}` expression bodies, wherever they appear in a scalar.
_EXPRESSION = re.compile(r"\$\{\{(.*?)\}\}", re.S)

# A `vars.` / `secrets.` reference inside one. `secrets.GITHUB_TOKEN` is
# GitHub's own built-in and is excluded below; every other `GITHUB_`-prefixed
# name is one a human would have had to create, and GitHub refuses to create it.
_GITHUB_PREFIXED = re.compile(r"\b(vars|secrets)\.(GITHUB_[A-Za-z0-9_]+)\b")


def reserved_github_refs(node):
    """Every `vars.GITHUB_*` / `secrets.GITHUB_*` an expression in `node` reads.

    GitHub rejects any configuration variable or user-defined secret whose name
    begins with `GITHUB_` (case-insensitively), reserving that prefix for its
    own context -- see the naming-conventions section of the Actions variables
    documentation. A workflow referencing one is therefore reading a value the
    owner was never able to set, and it fails *open and silently*: the
    expression resolves to the empty string, so a gate like
    `if: vars.GITHUB_X == 'true'` is simply always false.

    That is not hypothetical here. `portfolio-pages.yml` gated the whole Pages
    deploy on `vars.GITHUB_PAGES_ENABLED`, and the "one owner flip" that the
    decision queue, `portfolio/DIRECTION.md` and `platform/pages/README.md` all
    pointed at could never have published anything. It was found by reading the
    file, which is the part worth not repeating -- nothing turns red, because a
    skipped job is a successful run.

    Scans parsed YAML rather than the file's text on purpose: `GITHUB_`-prefixed
    names are discussed in several workflow headers precisely because of that
    bug, and a text scan would fail those files for describing the trap they
    already avoid.

    `secrets.GITHUB_TOKEN` is the one legitimate spelling -- GitHub injects it
    and nobody creates it -- so it is excluded rather than reported.
    """
    found = set()
    if isinstance(node, dict):
        for key, value in node.items():
            found |= reserved_github_refs(key)
            found |= reserved_github_refs(value)
    elif isinstance(node, list):
        for item in node:
            found |= reserved_github_refs(item)
    elif isinstance(node, str):
        for body in _EXPRESSION.findall(node):
            for context, name in _GITHUB_PREFIXED.findall(body):
                if (context, name) == ("secrets", "GITHUB_TOKEN"):
                    continue
                found.add(f"{context}.{name}")
    return found


def check_unique_names(paths):
    """Every workflow's `name:` must be unique across the whole directory.

    Takes the real list of paths rather than being folded into check(), which
    tests one synthetic file in isolation (platform/ci/test_validate_workflows.py)
    and has no notion of its siblings. A file that fails to parse, or has no
    `name:` at all, is reported by check() already and is skipped here rather
    than counted as a match against every other unnamed file.
    """
    names = {}
    for path in paths:
        try:
            data = yaml.safe_load(path.read_text())
        except yaml.YAMLError:
            continue
        if not isinstance(data, dict):
            continue
        name = data.get("name")
        if not name:
            continue
        names.setdefault(name, []).append(path)

    errors = []
    for name, owners in sorted(names.items()):
        if len(owners) < 2:
            continue
        rel = ", ".join(str(p.relative_to(REPO_ROOT)) for p in owners)
        errors.append(
            f"{len(owners)} workflows share the name {name!r}, so the PR checks "
            f"list cannot tell them apart without opening each one -- give each "
            f"a distinct name (e.g. \"<venture> CI\"): {rel}"
        )
    return errors


def main():
    if not WORKFLOWS_DIR.is_dir():
        print(f"No {WORKFLOWS_DIR.relative_to(REPO_ROOT)} directory; nothing to check.")
        return 0

    paths = sorted(
        p for p in WORKFLOWS_DIR.iterdir() if p.suffix in {".yml", ".yaml"}
    )
    errors = []
    for path in paths:
        check(path, errors)
    errors.extend(check_unique_names(paths))

    if errors:
        print(f"{len(errors)} problem(s) found:\n", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(f"All {len(paths)} workflow files are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
