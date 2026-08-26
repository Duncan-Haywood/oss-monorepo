#!/usr/bin/env python3
"""Derive, from the workflow files, what a merge to `main` can publish.

    python3 platform/ci/publish_surface.py           # the table
    python3 platform/ci/publish_surface.py --json    # machine-readable
    python3 platform/ci/publish_surface.py --check   # compare to the snapshot

This answers a factual question -- what does a merge to `main` actually
publish? -- from the workflow files. It does not block merging product
code. Agents merge product PRs; this tool says whether that merge also
goes live. The answer used to be hand-derived into prose in four places
and then frozen:

  - `portfolio/ledger/asks.yaml`, as free-text `unlocks:` strings
  - `CLAUDE.md`'s agent-decidable list, which names no ventures at all
  - `portfolio/research/a11y-contrast-decidability/README.md` ("that venture
    has no deploy workflow")
  - two 2026-08-20 ledger entries that each re-derived the same table by hand

Frozen prose about a live configuration goes stale silently. `asks.yaml`'s
`next-16-upgrade` note asserted that #372 was "owner-gated only because merging
fires deploys to live sites"; on the evidence below no such deploy fires, and
nothing turned red when that sentence stopped being true. Adding a deploy
workflow, or deleting one `if:` gate, would falsify all four claims the same
way.

So this derives the surface instead of restating it, and `--check` pins the
result so the next change to it has to be deliberate.

## What counts as publishing

A step publishes if it matches `PUBLISH_ACTIONS` (by `uses:` prefix) or
`PUBLISH_COMMANDS` (by `run:` substring). Both lists are explicit and
deliberately narrow: this tool can only recognise mechanisms it has been told
about, so a novel one would be missed. That limit is the reason `--check`
compares the whole table rather than a summary count -- a new workflow shows up
as an unexpected entry even when its steps are unrecognised, because the
snapshot also records the workflows that publish *nothing*.

## What counts as reachable

Reachable means: `on:` includes `push` matching the default branch, and the
publishing step carries no `if:` gate at either the job or the step level. A
publish that fires only on `workflow_dispatch`, or only when an owner-set
secret or variable is non-empty, is not something a merge does.

Four classifications result, and only the first means a merge publishes:

  live         reachable on a push to `main`, ungated
  gated        reachable trigger, but every publish step is behind an `if:`
  dispatch     publishes, but no push trigger can reach it
  none         no publishing step at all
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO / ".github" / "workflows"
SNAPSHOT = Path(__file__).resolve().parent / "publish-surface.yaml"

DEFAULT_BRANCH = "main"

# Actions that transmit an artifact to a destination outside this repository.
# Matched as a prefix of `uses:`, so a SHA pin or version tag still matches.
#
# `actions/upload-pages-artifact` is deliberately absent: it hands a tarball to
# the Actions artifact store, which `actions/deploy-pages` then publishes. The
# upload alone reaches no audience, and treating it as a publish would mark
# retail-pilot-intel live on a run whose deploy job demonstrably skipped.
PUBLISH_ACTIONS = (
    "cloudflare/wrangler-action",
    "actions/deploy-pages",
    "amondnet/vercel-action",
    "JamesIves/github-pages-deploy-action",
    "peaceiris/actions-gh-pages",
    "pypa/gh-action-pypi-publish",
    "docker/build-push-action",
    "softprops/action-gh-release",
    "ncipollo/release-action",
)

# Substrings of a `run:` block that ship something outward.
PUBLISH_COMMANDS = (
    "npm publish",
    "pnpm publish",
    "yarn publish",
    "npm run deploy",
    "pnpm deploy",
    "pnpm run deploy",
    "wrangler pages deploy",
    "wrangler deploy",
    "vercel --prod",
    "vercel deploy",
    "netlify deploy",
    "firebase deploy",
    "twine upload",
    "docker push",
    "gh release create",
    "aws s3 sync",
    "aws s3 cp",
    "gcloud app deploy",
    "gcloud run deploy",
)

CLASSIFICATIONS = ("live", "gated", "dispatch", "none")


class DuplicateKeyError(yaml.YAMLError):
    """A mapping in the document repeats a key."""


class _StrictLoader(yaml.SafeLoader):
    """SafeLoader that rejects duplicate mapping keys rather than keeping the last.

    Shares `validate_workflows.py`'s reasoning: PyYAML keeps the last of a
    repeated key, so a second `if:` on a job would silently replace the gate
    this tool is reading.
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
                raise DuplicateKeyError(f"duplicate key {key!r} at {key_node.start_mark}")
            seen.add(key)
        return super().construct_mapping(node, deep=deep)


def _triggers(data):
    """Return the `on:` block, tolerating YAML 1.1 resolving `on` to True."""
    if "on" in data:
        return data["on"]
    return data.get(True)


def pushes_to_default_branch(data) -> bool:
    """Does a push to the default branch start this workflow?

    A `push` trigger with no `branches` filter matches every branch, including
    the default one, so absence of a filter is reachable rather than unknown.
    """
    on = _triggers(data)
    if isinstance(on, str):
        return on == "push"
    if isinstance(on, list):
        return "push" in on
    if not isinstance(on, dict):
        return False
    if "push" not in on:
        return False
    push = on["push"]
    if not isinstance(push, dict):
        return True
    branches = push.get("branches")
    if branches is None:
        return "branches-ignore" not in push
    if isinstance(branches, str):
        branches = [branches]
    return DEFAULT_BRANCH in branches


def publish_marker(step) -> str | None:
    """Name the publishing mechanism in this step, or None if it has none."""
    if not isinstance(step, dict):
        return None
    uses = step.get("uses")
    if isinstance(uses, str):
        for action in PUBLISH_ACTIONS:
            if uses.startswith(action):
                return f"uses {action}"
    run = step.get("run")
    if isinstance(run, str):
        for command in PUBLISH_COMMANDS:
            if command in run:
                return f"runs {command!r}"
    return None


def _gate(value) -> str | None:
    """Normalise an `if:` value to a comparable string, or None if absent."""
    if value is None:
        return None
    return " ".join(str(value).split())


def publish_steps(data) -> list[dict]:
    """Every publishing step in the workflow, with the gates guarding it."""
    found = []
    jobs = data.get("jobs")
    if not isinstance(jobs, dict):
        return found
    for job_name, job in jobs.items():
        if not isinstance(job, dict):
            continue
        job_gate = _gate(job.get("if"))
        steps = job.get("steps")
        if not isinstance(steps, list):
            continue
        for step in steps:
            marker = publish_marker(step)
            if marker is None:
                continue
            gates = [g for g in (job_gate, _gate(step.get("if"))) if g]
            found.append({"job": job_name, "step": marker, "gates": gates})
    return found


def classify(data) -> tuple[str, list[dict]]:
    steps = publish_steps(data)
    if not steps:
        return "none", steps
    if not pushes_to_default_branch(data):
        return "dispatch", steps
    if any(not step["gates"] for step in steps):
        return "live", steps
    return "gated", steps


def survey() -> tuple[list[dict], list[str]]:
    """Classify every workflow file. Returns (rows, errors)."""
    rows, errors = [], []
    paths = sorted(p for p in WORKFLOWS.iterdir() if p.suffix in {".yml", ".yaml"})
    for path in paths:
        name = path.name
        try:
            data = yaml.load(path.read_text(), Loader=_StrictLoader)
        except yaml.YAMLError as exc:
            errors.append(f"{name}: unreadable, so its publish surface is unknown -- {exc}")
            continue
        if not isinstance(data, dict):
            errors.append(f"{name}: top level is not a mapping")
            continue
        classification, steps = classify(data)
        rows.append({"workflow": name, "classification": classification, "publishes": steps})
    return rows, errors


def render(rows) -> str:
    by_class = {c: [r for r in rows if r["classification"] == c] for c in CLASSIFICATIONS}
    out = ["What a merge to `main` can publish", ""]
    live = by_class["live"]
    if live:
        out.append(f"  {len(live)} workflow(s) publish on a push to {DEFAULT_BRANCH}, ungated:")
        for row in live:
            for step in row["publishes"]:
                out.append(f"    {row['workflow']}  [{step['job']}] {step['step']}")
    else:
        out.append(f"  No workflow publishes anything on a push to {DEFAULT_BRANCH}.")
    out.append("")

    for classification, heading in (
        ("gated", "publish only behind an owner-set gate"),
        ("dispatch", "publish, but no push trigger reaches them"),
    ):
        group = by_class[classification]
        if not group:
            continue
        out.append(f"  {len(group)} workflow(s) {heading}:")
        for row in group:
            out.append(f"    {row['workflow']}")
            for step in row["publishes"]:
                gates = "; ".join(step["gates"]) or "no gate"
                out.append(f"      [{step['job']}] {step['step']}")
                out.append(f"        gated by: {gates}")
        out.append("")

    out.append(f"  {len(by_class['none'])} workflow(s) publish nothing at all.")
    out.append("")
    out.append(
        "  Recognises only the mechanisms in PUBLISH_ACTIONS/PUBLISH_COMMANDS; a "
        "novel\n  one would be missed, which is why --check pins every workflow "
        "and not a count."
    )
    return "\n".join(out)


# Destinations that serve exactly one thing per repository. Two workflows able
# to publish to one of these at the same time do not merge their output -- the
# live site ends up as whichever finished last.
SINGLETON_DESTINATIONS = {
    "uses actions/deploy-pages": "the repository's one GitHub Pages site",
}

VARS_RE = re.compile(r"vars\.([A-Z0-9_]+)")


def singleton_collisions(rows) -> list[str]:
    """
    Workflows that could publish to the same one-per-repository destination.

    This exists because the surface snapshot cannot see it. `--check` pins each
    workflow's gates individually, so two workflows gating a `deploy-pages` job
    on the SAME owner variable both look correct on their own row and the
    collision is invisible.

    It happened: #1718 and #1724 both landed a full Pages build gated on
    `GITHUB_PAGES_ENABLED`, in different concurrency groups, twenty minutes
    apart. One owner flip would have fired both on every push to `main` and left
    the public site flapping between two different builds of the same products.
    The hazard was already known -- a ledger entry and a code comment both
    described it -- and was reintroduced anyway, because nothing failed. This is
    the thing that fails.

    A workflow whose publish step has no gate at all collides with every other
    workflow reaching the same destination, since it always deploys.
    """
    problems = []

    for marker, description in sorted(SINGLETON_DESTINATIONS.items()):
        # variable name (or the always-deploys sentinel) -> workflows claiming it
        claimants: dict[str, list[str]] = {}
        for row in rows:
            # A workflow no push can reach cannot race one on a merge.
            if row["classification"] == "none":
                continue
            for step in row["publishes"]:
                if step["step"] != marker:
                    continue
                names = sorted({v for gate in step["gates"] for v in VARS_RE.findall(gate)})
                for key in names or ["<ungated>"]:
                    claimants.setdefault(key, []).append(row["workflow"])

        for key, workflows in sorted(claimants.items()):
            distinct = sorted(set(workflows))
            if len(distinct) < 2:
                continue
            if key == "<ungated>":
                problems.append(
                    f"{', '.join(distinct)}: each can publish to {description} with no owner "
                    "gate, so every push to the default branch starts competing deployments. "
                    "Give each its own variable, or consolidate them."
                )
            else:
                problems.append(
                    f"{', '.join(distinct)}: all gate publishing to {description} on the same "
                    f"`vars.{key}`. Setting it once starts more than one deployment and the live "
                    "site becomes whichever finished last. Give each workflow its own variable "
                    "(see retail-pilot-intel-deploy-docs.yml) or consolidate them into one."
                )

    return problems


def load_snapshot():
    if not SNAPSHOT.exists():
        return None
    return yaml.safe_load(SNAPSHOT.read_text())


def check(rows) -> list[str]:
    """Compare the derived surface to the committed snapshot."""
    snapshot = load_snapshot()
    if snapshot is None:
        return [f"{SNAPSHOT.name} is missing; run with --write to create it"]
    expected = {r["workflow"]: r for r in snapshot.get("workflows", [])}
    actual = {r["workflow"]: r for r in rows}
    problems = []

    for name in sorted(set(actual) - set(expected)):
        row = actual[name]
        problems.append(
            f"{name}: new workflow, classified {row['classification']!r} and not in "
            f"{SNAPSHOT.name}. Add it there once you have confirmed the classification is intended."
        )
    for name in sorted(set(expected) - set(actual)):
        problems.append(f"{name}: in {SNAPSHOT.name} but no longer present in .github/workflows/")

    for name in sorted(set(actual) & set(expected)):
        want, got = expected[name], actual[name]
        if want.get("classification") != got["classification"]:
            problems.append(
                f"{name}: classification changed {want.get('classification')!r} -> "
                f"{got['classification']!r}. A merge to {DEFAULT_BRANCH} now reaches a "
                "different set of publish steps than the snapshot records."
            )
            continue
        if (want.get("publishes") or []) != got["publishes"]:
            problems.append(
                f"{name}: publish steps or their `if:` gates changed. Expected "
                f"{want.get('publishes') or []}, derived {got['publishes']}."
            )
    return problems


def write_snapshot(rows) -> None:
    header = (
        "# Derived by platform/ci/publish_surface.py --write. Do not hand-edit.\n"
        "#\n"
        "# What a merge to `main` can publish, per workflow. `publish_surface.py\n"
        "# --check` re-derives this from .github/workflows/ and fails if it has\n"
        "# moved, so the claim that a venture \"deploys nothing\" cannot go stale\n"
        "# without a check turning red.\n"
        "#\n"
        "# classification: live | gated | dispatch | none  (see the module docstring)\n"
    )
    body = yaml.safe_dump({"workflows": rows}, sort_keys=False, width=100)
    SNAPSHOT.write_text(header + body)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--check", action="store_true", help="compare to the snapshot, for CI")
    parser.add_argument("--write", action="store_true", help="rewrite the snapshot")
    args = parser.parse_args()

    if not WORKFLOWS.is_dir():
        print(f"No {WORKFLOWS.relative_to(REPO)} directory; nothing to survey.")
        return 0

    rows, errors = survey()
    if errors:
        print("Could not derive the publish surface:\n", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    if args.write:
        write_snapshot(rows)
        print(f"Wrote {SNAPSHOT.relative_to(REPO)} ({len(rows)} workflows).")
        return 0

    if args.check:
        # Checked before the snapshot comparison, and reported separately: a
        # collision is a defect in the configuration itself, not a drift from
        # what was recorded. `--write` would happily snapshot a racing pair.
        collisions = singleton_collisions(rows)
        if collisions:
            print(
                f"{len(collisions)} workflow(s) can race for a one-per-repository "
                "destination:\n",
                file=sys.stderr,
            )
            for collision in collisions:
                print(f"  - {collision}", file=sys.stderr)
            print(
                "\nGitHub serves one Pages site per repository. Two workflows able to "
                "deploy on the same flip do not merge their output -- the live site "
                "becomes whichever finished last.",
                file=sys.stderr,
            )
            return 1

        problems = check(rows)
        if problems:
            print(f"{len(problems)} publish-surface change(s) not reflected in the snapshot:\n", file=sys.stderr)
            for problem in problems:
                print(f"  - {problem}", file=sys.stderr)
            print(
                "\nIf the change is intended, re-run with --write and say in the pull "
                "request what a merge can now publish.",
                file=sys.stderr,
            )
            return 1
        live = sum(1 for r in rows if r["classification"] == "live")
        print(f"Publish surface matches the snapshot ({len(rows)} workflows, {live} live).")
        return 0

    if args.json:
        print(json.dumps({"default_branch": DEFAULT_BRANCH, "workflows": rows}, indent=2))
        return 0

    print(render(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
