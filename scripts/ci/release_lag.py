#!/usr/bin/env python3
"""
Release lag audit: how far committed work sits from the code that is deployed.

Every other control in this repository asks whether the work is *good*. None of
them asks whether it ever *shipped*, and on 2026-08-02 that turned out to be the
larger defect. `origin/main` was at `a4b8f23` from 2026-07-31 while 58 commits
sat across ~18 local `agent/*` branches, none pushed and none merged. Production
serves `origin/main`, so the measured effect of a day of engineering was zero:
live `marisstella.dev/app.js` was 5806 bytes, byte-identical to `origin/main`,
while `HEAD` had 6310 — the homepage's `rel="noopener"`, focus-restore,
`aria-hidden` and doubled-bullet fixes were all still absent from the page a
visitor loaded.

A grep for `dora|lead.time|deployment.frequency|release.lag` across the
repository hit only the roadmap sentence promising a scorecard. Nothing measured
this, so nothing could report it, so every run added quality to a branch that
never reached a customer.

This is the first DORA measure made real: lead time for changes, in its worst
case. A commit is *shipped* when it is an ancestor of the deployment ref
(`origin/main` by default, the ref `.gitea/workflows/*` deploy from). Everything
else is inventory.

What it reports:

  * unshipped commit count across local branches
  * the age of the oldest unshipped commit — worst-case lead time
  * the per-branch breakdown, so a stalled branch is named
  * which *deployed* services are affected, by mapping each commit's changed
    paths to a component with a non-null production URL. A venture nobody can
    reach yet accruing unshipped commits is untidy; a live service accruing them
    means customers are running old code, and those are different problems.

Why it is a ratchet and not a threshold. `platform/release-lag-policy.yaml`
carries the target, which is what good looks like, plus at most one
`acknowledged` entry raising the limit to what is true today, with an owner, an
issue, a reason and an expiry — the shape `platform/exception-register.yaml`
uses. An exact `count` would be wrong here, unlike in that register: the number
moves with every commit anyone makes, and a baseline rewritten hourly is a
baseline nobody reads. So each limit carries a `slack`, and the audit fails in
both directions:

  * above the effective limit fails — the backlog grew past what was reviewed
  * more than `slack` below it fails — the acknowledgement is stale, lower it
  * below the *target* while an acknowledgement exists fails — delete it, the
    target binds now
  * an expired acknowledgement fails, and `expires` may be at most 180 days out

Deliberately fails closed. A missing deployment ref, a repository that is not
git, an unreadable policy, an acknowledgement missing a field: each is a
failure, not a skip. That is the precise way this repository's gates have been
found to lie — see `platform/ci/test/fail-closed.test.mjs`. An audit that cannot
see `origin/main` knows nothing about what shipped, and "nothing is wrong" is
not the honest report of that state.

What it deliberately does not do: push, merge, or open a change. Shipping is an
outward action with a deploy on the other end, and it is the repository owner's
call. This measures and names the cost; a human decides.

Usage:
    python3 scripts/ci/release_lag.py              # audit, exit 1 on failure
    python3 scripts/ci/release_lag.py --report     # measure, always exit 0
    python3 scripts/ci/release_lag.py --json       # machine-readable
    python3 scripts/ci/release_lag.py --fetch      # refresh the deployment ref first
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import yaml

POLICY_PATH = "platform/release-lag-policy.yaml"

# Same cap as `platform/exception-register.yaml`. An acknowledgement nobody
# re-reads is a policy change made without review.
MAX_EXPIRY_DAYS = 180

REQUIRED_ACK_FIELDS = (
    "id",
    "owner",
    "issue",
    "reason",
    "max_unshipped_commits",
    "max_unshipped_age_days",
    "slack_commits",
    "slack_age_days",
    "expires",
)

LIMITS = (
    # (policy key, measurement attribute, human noun)
    ("max_unshipped_commits", "unshipped_commits", "unshipped commits"),
    ("max_unshipped_age_days", "oldest_unshipped_age_days", "days of unshipped age"),
)


class ReleaseLagError(Exception):
    """A condition that makes the audit unable to measure. Always fails closed."""


@dataclass(frozen=True)
class Commit:
    sha: str
    authored: date
    subject: str
    age_days: int


@dataclass(frozen=True)
class Service:
    """A component whose code reaches someone outside the repository."""

    id: str
    path: str
    production_url: Optional[str]


@dataclass
class ServiceLag:
    service: Service
    commits: List[Commit] = field(default_factory=list)

    @property
    def oldest_age_days(self) -> int:
        return max((c.age_days for c in self.commits), default=0)


@dataclass
class Measurement:
    deployment_ref: str
    deployment_sha: str
    deployment_age_days: int
    unshipped_commits: int
    oldest_unshipped_age_days: int
    branches: Dict[str, int]
    services: List[ServiceLag]

    @property
    def live_services(self) -> List[ServiceLag]:
        return [s for s in self.services if s.service.production_url]


@dataclass(frozen=True)
class Policy:
    deployment_ref: str
    target: Dict[str, int]
    acknowledged: Optional[Dict[str, Any]]
    extra_components: List[Service]


# --------------------------------------------------------------------------
# git
# --------------------------------------------------------------------------


def git(args: Sequence[str], repo: Path) -> str:
    """Run git with a neutered environment so host config cannot change results."""
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = os.devnull
    env["GIT_CONFIG_SYSTEM"] = os.devnull
    env["GIT_OPTIONAL_LOCKS"] = "0"
    result = subprocess.run(
        ["git", *args],
        cwd=str(repo),
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise ReleaseLagError(
            f"git {' '.join(args)} failed in {repo}: "
            f"{result.stderr.strip() or result.stdout.strip()}"
        )
    return result.stdout


def resolve_deployment_ref(repo: Path, ref: str) -> str:
    """The sha the deployment ref points at, or a failure.

    A deployment ref that does not exist locally is the most dangerous state
    this audit can be in: every commit looks unshipped, or none do, depending on
    which way the comparison degrades. Neither answer is knowledge, so refuse.
    """
    try:
        return git(["rev-parse", "--verify", f"{ref}^{{commit}}"], repo).strip()
    except ReleaseLagError as exc:
        raise ReleaseLagError(
            f"deployment ref {ref!r} does not resolve in {repo}. Nothing can be "
            f"known about what shipped without it. Locally, run `git fetch "
            f"origin` (or pass `--fetch`). In CI, this means the checkout is "
            f"shallow: `actions/checkout` fetches only the ref being built "
            f"unless it is given `fetch-depth: 0`. Underlying error: {exc}"
        ) from exc


def _parse_iso_date(value: str) -> date:
    return datetime.strptime(value.strip(), "%Y-%m-%d").date()


def local_branches(repo: Path) -> List[str]:
    out = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/"], repo)
    return [line.strip() for line in out.splitlines() if line.strip()]


def unshipped_commits(repo: Path, deployment_ref: str, today: date) -> List[Commit]:
    """Commits reachable from a local branch but not from the deployment ref.

    Local branches only. Other remote-tracking refs are somebody else's
    inventory; `refs/heads/*` is work committed on this machine, which is
    exactly the population that goes missing.
    """
    branches = local_branches(repo)
    if not branches:
        return []
    out = git(
        [
            "rev-list",
            "--no-merges",
            f"^{deployment_ref}",
            *branches,
            "--format=%H%x1f%ad%x1f%s",
            "--date=format:%Y-%m-%d",
        ],
        repo,
    )
    commits: List[Commit] = []
    for line in out.splitlines():
        if "\x1f" not in line:
            # `rev-list --format` emits a bare "commit <sha>" header line before
            # each formatted line. Skip those rather than parsing them.
            continue
        sha, authored, subject = line.split("\x1f", 2)
        authored_date = _parse_iso_date(authored)
        commits.append(
            Commit(
                sha=sha,
                authored=authored_date,
                subject=subject,
                age_days=max(0, (today - authored_date).days),
            )
        )
    return commits


def branch_breakdown(repo: Path, deployment_ref: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for branch in local_branches(repo):
        out = git(
            ["rev-list", "--count", "--no-merges", f"{deployment_ref}..{branch}"], repo
        )
        count = int(out.strip() or "0")
        if count:
            counts[branch] = count
    return counts


def commit_paths(repo: Path, sha: str) -> List[str]:
    out = git(["show", "--name-only", "--format=", sha], repo)
    return [line.strip() for line in out.splitlines() if line.strip()]


# --------------------------------------------------------------------------
# services
# --------------------------------------------------------------------------


def discover_services(repo: Path, extra: Iterable[Service]) -> List[Service]:
    """Every component whose code can reach someone outside the repository.

    Ventures declare themselves through `VENTURE.yaml`. Components that ship
    without one — the homepage is served straight out of `portfolio/` — are
    declared in the policy file instead, so adding a deployed thing without
    telling this audit about it takes a deliberate omission rather than an
    oversight.
    """
    services: List[Service] = []
    ventures_dir = repo / "ventures"
    if ventures_dir.is_dir():
        for manifest in sorted(ventures_dir.glob("*/VENTURE.yaml")):
            try:
                data = yaml.safe_load(manifest.read_text()) or {}
            except yaml.YAMLError as exc:
                raise ReleaseLagError(f"{manifest} is not readable YAML: {exc}") from exc
            links = data.get("links") or {}
            if not isinstance(links, dict):
                raise ReleaseLagError(f"{manifest} has a non-mapping `links` block")
            services.append(
                Service(
                    id=manifest.parent.name,
                    path=f"ventures/{manifest.parent.name}",
                    production_url=links.get("production") or None,
                )
            )
    services.extend(extra)
    # Longest path first so a nested component claims a path before its parent.
    return sorted(services, key=lambda s: (-len(s.path), s.id))


def attribute(
    repo: Path, commits: Sequence[Commit], services: Sequence[Service]
) -> List[ServiceLag]:
    lags = {s.id: ServiceLag(service=s) for s in services}
    for commit in commits:
        touched = commit_paths(repo, commit.sha)
        hit: set = set()
        for path in touched:
            for service in services:
                if path == service.path or path.startswith(service.path + "/"):
                    hit.add(service.id)
                    break
        for service_id in hit:
            lags[service_id].commits.append(commit)
    return [lag for lag in lags.values() if lag.commits]


# --------------------------------------------------------------------------
# policy
# --------------------------------------------------------------------------


def _require_int(block: Dict[str, Any], key: str, where: str) -> int:
    value = block.get(key)
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ReleaseLagError(
            f"{where}: `{key}` must be a non-negative integer, got {value!r}"
        )
    return value


def load_policy(repo: Path, path: str = POLICY_PATH) -> Policy:
    policy_file = repo / path
    if not policy_file.is_file():
        raise ReleaseLagError(
            f"{path} is missing. The audit has no limits to hold work to, and "
            f"an audit with no limits passes everything."
        )
    try:
        data = yaml.safe_load(policy_file.read_text()) or {}
    except yaml.YAMLError as exc:
        raise ReleaseLagError(f"{path} is not readable YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ReleaseLagError(f"{path} must be a mapping at the top level")

    deployment_ref = data.get("deployment_ref")
    if not isinstance(deployment_ref, str) or not deployment_ref.strip():
        raise ReleaseLagError(f"{path}: `deployment_ref` must be a non-empty string")

    target = data.get("target")
    if not isinstance(target, dict):
        raise ReleaseLagError(f"{path}: `target` must be a mapping")
    parsed_target = {
        key: _require_int(target, key, f"{path}: target") for key, _, _ in LIMITS
    }

    ack_raw = data.get("acknowledged")
    acknowledged: Optional[Dict[str, Any]] = None
    if ack_raw is not None:
        if isinstance(ack_raw, list):
            # One acknowledgement, not a register. A list of them would let the
            # loosest entry win silently.
            raise ReleaseLagError(
                f"{path}: `acknowledged` is a single mapping, not a list. The "
                f"whole repository has one release backlog."
            )
        if not isinstance(ack_raw, dict):
            raise ReleaseLagError(f"{path}: `acknowledged` must be a mapping or absent")
        missing = [f for f in REQUIRED_ACK_FIELDS if f not in ack_raw]
        if missing:
            raise ReleaseLagError(
                f"{path}: acknowledged entry is missing {', '.join(sorted(missing))}"
            )
        for key in (
            "max_unshipped_commits",
            "max_unshipped_age_days",
            "slack_commits",
            "slack_age_days",
        ):
            _require_int(ack_raw, key, f"{path}: acknowledged")
        for key in ("id", "owner", "issue", "reason"):
            value = ack_raw.get(key)
            if not isinstance(value, str) or not value.strip():
                raise ReleaseLagError(
                    f"{path}: acknowledged `{key}` must be a non-empty string"
                )
        expires = ack_raw.get("expires")
        if isinstance(expires, str):
            try:
                expires = _parse_iso_date(expires)
            except ValueError as exc:
                raise ReleaseLagError(
                    f"{path}: acknowledged `expires` must be YYYY-MM-DD: {exc}"
                ) from exc
        if not isinstance(expires, date):
            raise ReleaseLagError(
                f"{path}: acknowledged `expires` must be a YYYY-MM-DD date"
            )
        acknowledged = dict(ack_raw)
        acknowledged["expires"] = expires

    extra: List[Service] = []
    for entry in data.get("extra_components") or []:
        if not isinstance(entry, dict):
            raise ReleaseLagError(f"{path}: each `extra_components` entry is a mapping")
        for key in ("id", "path"):
            if not isinstance(entry.get(key), str) or not entry[key].strip():
                raise ReleaseLagError(
                    f"{path}: `extra_components` entry needs a non-empty `{key}`"
                )
        component_path = entry["path"].rstrip("/")
        if not (repo / component_path).exists():
            raise ReleaseLagError(
                f"{path}: `extra_components` entry {entry['id']!r} points at "
                f"{component_path!r}, which does not exist. A stale entry "
                f"silently stops attributing anything."
            )
        extra.append(
            Service(
                id=entry["id"],
                path=component_path,
                production_url=entry.get("production") or None,
            )
        )

    return Policy(
        deployment_ref=deployment_ref.strip(),
        target=parsed_target,
        acknowledged=acknowledged,
        extra_components=extra,
    )


# --------------------------------------------------------------------------
# measure and audit
# --------------------------------------------------------------------------


def measure(repo: Path, policy: Policy, today: Optional[date] = None) -> Measurement:
    today = today or datetime.now(timezone.utc).date()
    sha = resolve_deployment_ref(repo, policy.deployment_ref)
    deployed_on = _parse_iso_date(
        git(["show", "-s", "--format=%ad", "--date=format:%Y-%m-%d", sha], repo)
    )
    commits = unshipped_commits(repo, policy.deployment_ref, today)
    services = discover_services(repo, policy.extra_components)
    return Measurement(
        deployment_ref=policy.deployment_ref,
        deployment_sha=sha[:7],
        deployment_age_days=max(0, (today - deployed_on).days),
        unshipped_commits=len(commits),
        oldest_unshipped_age_days=max((c.age_days for c in commits), default=0),
        branches=branch_breakdown(repo, policy.deployment_ref),
        services=attribute(repo, commits, services),
    )


def audit(measurement: Measurement, policy: Policy, today: date) -> List[str]:
    """Every way the release backlog can be out of policy. Empty means clean."""
    failures: List[str] = []
    ack = policy.acknowledged

    if ack is not None and ack["expires"] < today:
        failures.append(
            f"{ack['id']}: the release-backlog acknowledgement expired on "
            f"{ack['expires']}. Ship the work or re-review the exception; an "
            f"acknowledgement nobody re-reads is a policy change made without "
            f"review. Owner: {ack['owner']}."
        )
    if ack is not None and (ack["expires"] - today).days > MAX_EXPIRY_DAYS:
        failures.append(
            f"{ack['id']}: `expires` is {(ack['expires'] - today).days} days out; "
            f"at most {MAX_EXPIRY_DAYS} is allowed."
        )

    within_target = all(
        getattr(measurement, attr) <= policy.target[key] for key, attr, _ in LIMITS
    )
    if ack is not None and within_target:
        failures.append(
            f"{ack['id']}: the backlog is back inside the target "
            f"({measurement.unshipped_commits} commits, "
            f"{measurement.oldest_unshipped_age_days} days old). Delete the "
            f"acknowledgement so the target binds again."
        )

    for key, attr, noun in LIMITS:
        actual = getattr(measurement, attr)
        target = policy.target[key]
        if ack is None:
            if actual > target:
                failures.append(
                    f"{actual} {noun}, above the target of {target}, with no "
                    f"acknowledged exception. Work that is committed and not "
                    f"shipped has no effect on any customer."
                )
            continue

        limit = ack[key]
        if limit < target:
            failures.append(
                f"{ack['id']}: `{key}` is {limit}, below the target of {target}. "
                f"An acknowledgement may only loosen a limit; delete it instead."
            )
        slack = ack["slack_commits" if key == "max_unshipped_commits" else "slack_age_days"]
        if actual > limit:
            failures.append(
                f"{actual} {noun}, above the acknowledged limit of {limit} "
                f"({ack['id']}, owner {ack['owner']}). The release backlog grew "
                f"past what was reviewed."
            )
        elif actual < limit - slack and actual > target:
            failures.append(
                f"{actual} {noun} against an acknowledged limit of {limit} with "
                f"{slack} slack. The acknowledgement is stale — lower it, or the "
                f"limit records the worst this was ever allowed to be rather "
                f"than where it is."
            )

    return failures


# --------------------------------------------------------------------------
# reporting
# --------------------------------------------------------------------------


def to_dict(measurement: Measurement, failures: Sequence[str]) -> Dict[str, Any]:
    return {
        "deployment_ref": measurement.deployment_ref,
        "deployment_sha": measurement.deployment_sha,
        "deployment_age_days": measurement.deployment_age_days,
        "unshipped_commits": measurement.unshipped_commits,
        "oldest_unshipped_age_days": measurement.oldest_unshipped_age_days,
        "branches": measurement.branches,
        "services": [
            {
                "id": lag.service.id,
                "production": lag.service.production_url,
                "unshipped_commits": len(lag.commits),
                "oldest_unshipped_age_days": lag.oldest_age_days,
            }
            for lag in sorted(
                measurement.services, key=lambda l: (-len(l.commits), l.service.id)
            )
        ],
        "failures": list(failures),
        "ok": not failures,
    }


def render(measurement: Measurement, failures: Sequence[str]) -> str:
    lines = [
        "Release lag",
        "===========",
        f"deployed ref     {measurement.deployment_ref} @ {measurement.deployment_sha} "
        f"({measurement.deployment_age_days}d old)",
        f"unshipped        {measurement.unshipped_commits} commits, oldest "
        f"{measurement.oldest_unshipped_age_days}d",
    ]
    live = measurement.live_services
    if live:
        lines.append("")
        lines.append("Live services running code older than HEAD:")
        for lag in sorted(live, key=lambda l: -len(l.commits)):
            lines.append(
                f"  {lag.service.id:<28} {len(lag.commits):>3} commits, oldest "
                f"{lag.oldest_age_days}d  {lag.service.production_url}"
            )
    dark = [s for s in measurement.services if not s.service.production_url]
    if dark:
        lines.append("")
        lines.append("Components with no production URL (nothing to be stale):")
        for lag in sorted(dark, key=lambda l: -len(l.commits)):
            lines.append(f"  {lag.service.id:<28} {len(lag.commits):>3} commits")
    if measurement.branches:
        lines.append("")
        lines.append("Unshipped by branch:")
        for branch, count in sorted(
            measurement.branches.items(), key=lambda kv: (-kv[1], kv[0])
        ):
            lines.append(f"  {branch:<52} {count:>3}")
    lines.append("")
    if failures:
        lines.append(f"FAIL ({len(failures)}):")
        lines.extend(f"  - {f}" for f in failures)
    else:
        lines.append("OK: the release backlog is within policy.")
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--repo", default=".", help="repository root (default: .)")
    parser.add_argument("--policy", default=POLICY_PATH)
    parser.add_argument(
        "--report", action="store_true", help="measure and print, always exit 0"
    )
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="refresh the deployment ref's remote before measuring",
    )
    args = parser.parse_args(argv)

    repo = Path(args.repo).resolve()
    today = datetime.now(timezone.utc).date()
    try:
        policy = load_policy(repo, args.policy)
        if args.fetch:
            remote = policy.deployment_ref.split("/", 1)[0]
            git(["fetch", "--quiet", remote], repo)
        measurement = measure(repo, policy, today)
        failures = audit(measurement, policy, today)
    except ReleaseLagError as exc:
        # Fail closed. An audit that cannot measure reports that, loudly.
        if args.json:
            print(json.dumps({"ok": False, "failures": [str(exc)]}, indent=2))
        else:
            print(f"release-lag audit could not run: {exc}", file=sys.stderr)
        return 0 if args.report else 1

    if args.json:
        print(json.dumps(to_dict(measurement, failures), indent=2))
    else:
        print(render(measurement, failures))
    if args.report:
        return 0
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
