#!/usr/bin/env python3
"""Validate that every .github/workflows file is a well-formed GitHub workflow.

Seven invariants (the count in this line was stale at "five" from the day
invariant 6 landed -- it is the same hand-typed-number defect invariant 7 is
about, one paragraph above where it is described):

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

6. Every job declares a `timeout-minutes`. A job with none rides GitHub's
   default 360-minute ceiling, so a hung pip install, a stalled API call, or a
   stuck checkout burns up to six hours of Actions minutes before it fails.
   That is the metered allowance whose exhaustion caused the 2026-08-26 CI
   starvation (see CLAUDE.md), which makes an uncapped job a portfolio-wide
   cost risk, not just a slow one. #3040 capped the eight workflows that gate
   every PR; this invariant keeps every other job -- and every job added later
   -- from reintroducing the gap. A job that only calls a reusable workflow
   (`uses:`) is exempt: it has no `runs-on` and GitHub does not accept a job
   timeout on it; the timeout belongs in the called workflow's own jobs.

7. Every venture that ships `*.test.mjs` has a workflow that runs them. The
   portfolio-wide workflows do not: `portfolio-validate.yml` checks structure
   and markup, `page-integrity-ci.yml` and `link-contrast-ci.yml` read HTML,
   and `proposal-module-ci.yml` runs exactly one filename
   (`ventures/*/proposal.test.mjs`). Nothing else executes `node --test`
   inside a venture, so a venture's own arithmetic is covered only by its own
   `<slug>-ci.yml` -- and that file is hand-written per venture, from a
   template nobody enforces.

   Measured 2026-09-07: 16 ventures were shipping 62 `*.test.mjs` files that
   no workflow ran. Eleven had no workflow at all (ten graduated after
   2026-09-02, one on 2026-09-03); five were Python ventures that later gained
   a browser page -- the "a CLI acquiring a page is a routine event here" case
   CLAUDE.md names -- whose workflow was never widened past `pytest`. All 62
   passed locally, so nothing was broken; what was missing was anything that
   would notice if they broke. Same failure mode as `checklist_coverage.py`
   and `test_readme_runs_on_count_matches_reality`: a list maintained by hand
   cannot notice the thing it describes grew.

   A venture is covered when some workflow both filters on
   `ventures/<slug>/...` and runs `node --test` (or `npm test`, whose
   `package.json` script is the same command). Filtering alone is not enough:
   five of the sixteen had a slug-filtered workflow that ran only Python.

8. No workflow only repeats `ventures-tests.yml` for one venture. That
   workflow runs `node --test` in every venture a change touches, so a
   `<slug>-ci.yml` whose trigger is that venture and whose only work is
   `node --test` costs every PR on the venture a second job and a second
   checkout of the whole tree, and verifies nothing the first did not. 802 such
   files accumulated, partly because invariant 7's message used to say "copy a
   sibling": P016 removed 384 byte-identical ones on 2026-10-16, and the 418
   that differed only in comments, job names or an explicit file list went on
   2026-10-29 (docs/history/ci-local-first-2026-10-29.md). A per-venture
   workflow that does anything more (pytest, a build, a service) is fine.

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
VENTURES_DIR = REPO_ROOT / "ventures"


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

    # Invariant 6: every job caps its own runtime. A reusable-workflow caller
    # (`uses:` at job level) is exempt -- GitHub rejects a job timeout there and
    # the cap belongs in the called workflow.
    uncapped = [
        name
        for name, body in jobs.items()
        if isinstance(body, dict)
        and "timeout-minutes" not in body
        and "uses" not in body
    ]
    if uncapped:
        err(
            f"job(s) {', '.join(uncapped)} declare no `timeout-minutes`, so they "
            "ride GitHub's 360-minute default -- a hung step there can burn hours "
            "of the metered Actions allowance before failing. Add a job-level "
            "`timeout-minutes:` sized with headroom over the job's real runtime"
        )

    for expr in sorted(reserved_github_refs(data)):
        err(
            f"references `{expr}`, whose name GitHub reserves -- a configuration "
            "variable or secret cannot be named with a `GITHUB_` prefix, so this "
            "reads as permanently unset and any gate built on it can never be "
            "switched on. Rename it without the prefix "
            f"(e.g. `{expr.split('.', 1)[0]}.{expr.split('_', 1)[1]}`)"
        )

    for job, step in unguarded_shallow_fetches(data):
        err(
            f"job `{job}` step `{step}` runs `git fetch --depth=...` without first "
            "checking `git rev-parse --is-shallow-repository`. A `--depth` fetch "
            "does not only limit what it downloads -- it writes `.git/shallow` and "
            "truncates the WHOLE repository, including refs the step never named. "
            "On a runner that is free, because `actions/checkout` already checked "
            "out depth 1; on a full clone it is destructive, and it is "
            "`run_workflow_locally.py` that runs these same `run:` steps against "
            "one. Guard it: `if [ \"$(git rev-parse --is-shallow-repository)\" = "
            "true ]; then git fetch --depth=1 ...; else git fetch ...; fi`"
        )


# A `git fetch` carrying `--depth` / `--depth=N`, anywhere in a `run:` body.
# `--unshallow` and `--deepen` are the opposite operation and are not matched.
_SHALLOW_FETCH = re.compile(r"git\s+fetch\b[^\n]*(?<!un)\B--depth[=\s]")

# The one question that makes such a fetch safe: it is only destructive on a
# clone that is NOT already shallow, and this is how a step tells the two apart.
_SHALLOW_GUARD = "is-shallow-repository"


def unguarded_shallow_fetches(data):
    """Every `(job, step)` whose `run:` shallow-fetches without asking first.

    Measured 2026-09-17: `portfolio-validate.yml` fetched its venture-regression
    base with an unconditional `git fetch --no-tags --depth=1`. Run on a runner
    that is exactly right -- `actions/checkout@v4` already made the checkout
    depth 1, so the flag costs nothing and changes nothing. Run by
    `run_workflow_locally.py --tree` on a full clone, the same line wrote
    `.git/shallow` and collapsed a 7,289-commit checkout of `main` to one
    commit. The very next step then needs `git merge-base --is-ancestor` to
    tell "a venture was deleted" from "your tree is behind the base", cannot
    get it out of a shallow clone, and correctly refuses to pass an unproven
    removal -- so the sweep reported `main` RED for a deletion that never
    happened, having caused the condition itself one step earlier.

    That sweep is what CLAUDE.md prescribes for "is `main` green right now?"
    during an Actions starvation window, which is precisely when no runner is
    checking and a false red has nothing to contradict it. The blast radius is
    wider than the one check, too: CLAUDE.md's "Duplicate PRs" section
    documents at length how a silently-shallow clone makes `git merge` refuse
    with "unrelated histories" and `git rev-list --count origin/main..<branch>`
    report every branch as carrying thousands of unique commits -- readings
    that argue equally for mass PR creation and for dismissing the whole
    backlog. It describes that state as a clone artifact to recover from; what
    nothing recorded is that a workflow step this repository runs locally is
    one of the things that creates it.

    Hence a validator rather than a comment: the guard is one `if` and the
    failure it prevents is invisible at the call site, which is the shape that
    gets "simplified" back out by the next person to read the line.
    """
    found = []
    jobs = data.get("jobs")
    if not isinstance(jobs, dict):
        return found
    for job_name, body in jobs.items():
        if not isinstance(body, dict):
            continue
        steps = body.get("steps")
        if not isinstance(steps, list):
            continue
        for index, step in enumerate(steps):
            if not isinstance(step, dict):
                continue
            run = step.get("run")
            if not isinstance(run, str):
                continue
            if _SHALLOW_FETCH.search(run) and _SHALLOW_GUARD not in run:
                found.append((job_name, step.get("name") or f"#{index + 1}"))
    return found


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


# `npm test` / `npm run test`, whose package.json script is `node --test ...`
# in every venture that uses it. Spelled as a pattern rather than a substring
# so `npm testfoo` or a comment mentioning "npm tests" cannot match.
_NPM_TEST = re.compile(r"\bnpm\s+(?:run\s+)?test\b")


def _trigger_paths(data):
    """Every `paths:` entry on this workflow's pull_request / push triggers.

    `on:` unquoted parses to the boolean True under YAML 1.1, the same trap
    check() already works around, so both spellings are read here too.
    """
    on = data.get("on", data.get(True))
    if not isinstance(on, dict):
        return []
    found = []
    for event in ("pull_request", "push"):
        config = on.get(event)
        if isinstance(config, dict):
            for entry in config.get("paths") or []:
                if isinstance(entry, str):
                    found.append(entry)
    return found


def _runs_js_tests(data):
    """True when some step runs the venture's `*.test.mjs` files.

    `node --test` is the repository's convention; `npm test` is accepted
    because the one venture spelling it that way (`no-show-fee-calculator`)
    defines that script as `node --test test/*.test.mjs`. A `uses:` step
    cannot be read this way and is not counted.
    """
    for job in (data.get("jobs") or {}).values():
        if not isinstance(job, dict):
            continue
        for step in job.get("steps") or []:
            if not isinstance(step, dict):
                continue
            run = step.get("run")
            if not isinstance(run, str):
                continue
            if "node --test" in run or _NPM_TEST.search(run):
                return True
    return False


def check_venture_tests_run(paths, ventures_dir=VENTURES_DIR):
    """Invariant 7: a venture's `*.test.mjs` files must run in some workflow.

    Takes the real path list for the same reason check_unique_names does: this
    is a question about the directory as a whole, not about one file, and
    check() sees one synthetic file at a time.

    Coverage needs both halves. A workflow has to be *triggered* by the
    venture -- a `paths:` entry under `ventures/<slug>/` -- and has to actually
    *run* the tests. Five of the sixteen ventures this check first found had
    the first half and not the second: a slug-filtered workflow that ran only
    `pytest`, added before the venture had a browser page.

    **The remedy this check names creates a second obligation, and saying so is
    part of the message (added 2026-09-11).** Adding `<slug>-ci.yml` is a new
    workflow, and `publish_surface.py --check` fails on any workflow absent
    from `publish-surface.yaml` -- deliberately, because a new workflow is a
    new thing a merge to `main` could publish and its classification is worth
    confirming by hand rather than inferring. So this check tells a session to
    do the exact thing that turns another check red, and until now it did not
    mention the second step.

    That is not hypothetical. #4573 graduated `actions-minutes-estimator`,
    followed this message, added the workflow, and left `main` red on
    `publish_surface.py --check` and `test_publish_surface` -- for the rest of
    the day, because Actions was starved (`runner_id: 0`) and no check that
    could have said so ever ran. The two graduations either side of it
    (#4559, #4567) updated the snapshot in the same commit and were fine, which
    is what a step carried by recollection rather than by the instruction looks
    like: mostly done, silently missed, and only visible when CI is watching.
    """
    if not ventures_dir.is_dir():
        return []

    runners = []
    for path in paths:
        try:
            data = yaml.safe_load(path.read_text())
        except yaml.YAMLError:
            continue  # check() reports the parse failure itself
        if not isinstance(data, dict) or not _runs_js_tests(data):
            continue
        runners.append(_trigger_paths(data))

    errors = []
    for venture in sorted(p for p in ventures_dir.iterdir() if p.is_dir()):
        # `node_modules` is excluded rather than merely absent: no venture
        # commits one, but a `npm install` in the one venture with a
        # package.json would fill this glob with a dependency's own suites and
        # report the venture as uncovered on that machine only.
        tests = sorted(
            t for t in venture.rglob("*.test.mjs") if "node_modules" not in t.parts
        )
        if not tests:
            continue
        prefix = f"ventures/{venture.name}/"
        # `ventures/**` is a portfolio-wide runner (ventures-tests.yml) that
        # runs each touched venture's suite, so it covers every venture.
        if any(
            entry.startswith(prefix) or entry in ("ventures/**", "ventures/**/*")
            for filters in runners
            for entry in filters
        ):
            continue
        names = ", ".join(str(t.relative_to(venture)) for t in tests)
        errors.append(
            f"ventures/{venture.name}: {len(tests)} test file(s) ({names}) run in "
            "no workflow -- no workflow both filters on "
            f"`{prefix}**` and runs `node --test`. The portfolio-wide workflows "
            "do not run venture unit tests, so these assertions execute only on "
            "a contributor's machine. `.github/workflows/ventures-tests.yml` "
            "is meant to cover every venture through its `ventures/**` filter; "
            "restore that filter rather than adding a per-venture copy "
            "(invariant 8)"
        )
    return errors


_SETUP_ACTIONS = ("actions/checkout@", "actions/setup-node@")
_NODE_TEST_ONLY = re.compile(r"node --test(?: [\w./*'\"-]+)*")


def duplicates_ventures_tests(name, data):
    """The venture slug when this workflow only re-runs `ventures-tests.yml`.

    True when every `paths:` entry is `ventures/<slug>/**` or the workflow
    itself, every `uses:` is checkout or setup-node, no job has services, a
    container or a matrix, and every `run:` is a bare `node --test` (optionally
    naming test files). That is exactly what `run_venture_tests.py` does for
    the slug, from the same directory.
    """
    paths = set(_trigger_paths(data))
    slugs = {p.split("/")[1] for p in paths if p.startswith("ventures/") and p.count("/") >= 2}
    if len(slugs) != 1:
        return None
    slug = next(iter(slugs))
    if paths - {f"ventures/{slug}/**", f".github/workflows/{name}"}:
        return None
    runs = []
    for job in (data.get("jobs") or {}).values():
        if not isinstance(job, dict) or any(job.get(k) for k in ("services", "container", "strategy", "uses")):
            return None
        for step in job.get("steps") or []:
            if not isinstance(step, dict):
                return None
            if "uses" in step:
                if not str(step["uses"]).startswith(_SETUP_ACTIONS):
                    return None
            elif isinstance(step.get("run"), str):
                runs.append(step["run"].strip())
            else:
                return None
    if runs and all(_NODE_TEST_ONLY.fullmatch(r) for r in runs):
        return slug
    return None


def check_no_duplicate_venture_test_workflows(paths):
    """Invariant 8: a per-venture workflow must do more than `node --test`."""
    errors = []
    for path in paths:
        try:
            data = yaml.safe_load(path.read_text())
        except yaml.YAMLError:
            continue
        if not isinstance(data, dict):
            continue
        slug = duplicates_ventures_tests(path.name, data)
        if slug:
            errors.append(
                f"{path.relative_to(REPO_ROOT)}: only runs `node --test` for "
                f"ventures/{slug}, which `ventures-tests.yml` already does on every "
                "change to it -- a second job and a second checkout for nothing. "
                f"Delete it (and run `python3 platform/ci/publish_surface.py "
                f"--write`); locally, `python3 platform/ci/run_venture_tests.py "
                f"{slug}` is the same check"
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
    errors.extend(check_venture_tests_run(paths))
    errors.extend(check_no_duplicate_venture_test_workflows(paths))

    if errors:
        print(f"{len(errors)} problem(s) found:\n", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(f"All {len(paths)} workflow files are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
