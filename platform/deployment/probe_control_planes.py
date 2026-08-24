#!/usr/bin/env python3
"""Assert what the deployment-platform decision claims about reachability.

`README.md` chooses a deployment platform on the grounds that the spend cap has
to live *inside* the vendor, because deploys run on GitHub Actions runners and
an agent session cannot reach a vendor's control plane to inspect, throttle, or
stop one. That second half is a measurable claim, and this checks it.

It is not a blanket claim, and this file does not enforce one.
`cloudresourcemanager.googleapis.com` -- Google Cloud Resource Manager, a real
write API -- answers, and is carried in `EXPECTED_REACHABLE` as a documented
exception. The check therefore asserts "every write surface denied *except* the
listed exceptions, which must still be reachable", and fails on drift in either
direction. Anyone reading only the first paragraph would infer a stronger
statement than the code makes, which is why this one is here.

It deliberately keeps **no host table of its own.** The verdicts live in
`portfolio/research/egress-reachability/prior-verdicts.json`, the portfolio's
one consolidated table, which exists because nine passes once each re-probed an
overlapping host set into a different file. A second table here would be the
tenth. The control planes reached that table through
`egress-reachability/unindexed-hosts.json`, which is the designated hook for
hosts measured outside the `portfolio/research/` tree.

    python3 probe_control_planes.py --check     # offline; CI runs this
    python3 probe_control_planes.py --report    # offline; print the verdicts
    python3 probe_control_planes.py --probe     # re-measure (needs network)

To re-measure: run `--probe`, fold the records it prints into
`egress-reachability/unindexed-hosts.json`, then run `consolidate.py --ingest`
there. That keeps one table and one command.

Read-only GETs. No credential, no account, nothing published, nothing spent.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
TABLE = REPO / "portfolio" / "research" / "egress-reachability" / "prior-verdicts.json"
EGRESS_DIR = REPO / "portfolio" / "research" / "egress-reachability"

# `--probe` reuses the consolidated probe's own `probe_host` rather than
# carrying a second implementation. That is not only tidiness: an earlier pass
# there followed redirects and recorded `s3.amazonaws.com` and `gitlab.com` as
# unreachable, because both answer with a redirect to a host that is itself
# denied. `consolidate.py` disables redirects and classifies on the response
# body for exactly that reason, and a private copy here would have quietly
# reintroduced the bug it fixed.
def _canonical_probe():
    spec = importlib.util.spec_from_file_location(
        "egress_consolidate", EGRESS_DIR / "consolidate.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

# The write surfaces: the API a deploy, a scale-up, or a teardown would call.
# README.md's claim is about exactly these, so exactly these are checked.
WRITE_SURFACES = {
    "backboard.railway.app": "railway",
    "api.vercel.com": "vercel",
    "api.cloudflare.com": "cloudflare",
    "api.hetzner.cloud": "hetzner",
    "ec2.amazonaws.com": "aws",
    "management.azure.com": "azure",
    # Google Cloud Resource Manager: projects.create, projects.delete,
    # setIamPolicy. It was filed under "dashboards and context" in the first
    # draft, which was wrong and conveniently so -- putting a reachable write
    # API in the non-load-bearing bucket is how a check passes despite its own
    # contrary evidence. It belongs here, and it is the one exception below.
    "cloudresourcemanager.googleapis.com": "gcp",
    "api.netlify.com": "netlify",
    "api.fly.io": "fly",
    "api.render.com": "render",
    "api.digitalocean.com": "digitalocean",
}

# The measured truth is not "every write surface is denied" -- it is "every
# write surface is denied except this one". Encoding the exception explicitly,
# with the reason, is what keeps the check honest: it fails if anything *else*
# becomes reachable, and equally if this one goes quiet, because a table that
# silently stops recording a known-reachable host is drifting too.
EXPECTED_REACHABLE = {
    "ec2.amazonaws.com": (
        "answers 301 from the origin, stable across two attempts. Recorded as "
        "denied until 2026-08-24, and that was this probe's own bug rather "
        "than a change in the network: the first implementation followed "
        "redirects, so it chased the 301 to a destination that *is* denied and "
        "filed the denial against EC2. The code was switched to "
        "`consolidate.py`'s no-redirect prober when that was pointed out, but "
        "the committed verdicts were not re-measured, so the false denial "
        "outlived the fix. Fixing a prober does not fix the data it produced."
    ),
    "cloudresourcemanager.googleapis.com": (
        "answers 404 unauthenticated -- the network path to GCP's control "
        "plane exists from a session, though using it would still need a "
        "credential. Recorded because README.md's argument must survive it, "
        "not because it changes the GCP recommendation, which turns on the "
        "absence of a native spend cap rather than on reachability."
    ),
}

# Probed alongside them and carried in the same table, but not load-bearing:
# dashboards and marketing roots a human would open, not an API a deploy calls.
CONTEXT_HOSTS = {
    "dash.cloudflare.com", "pages.dev", "workers.dev", "vercel.com",
    "console.hetzner.cloud", "www.hetzner.com", "aws.amazon.com",
    "railway.app", "railway.com",
    "portal.azure.com", "console.cloud.google.com", "deno.com",
}

# Without both, a blanket denial cannot be told from a broken probe.
#
# The reachable control must traverse the *same proxy* as the vendor targets,
# and the obvious choice does not. `registry.npmjs.org` is in this
# environment's `no_proxy`, so it is fetched directly: if the egress proxy were
# down or rejecting every CONNECT, npm would still answer, `example.com` would
# still be denied, and this check would certify a batch of false vendor
# denials. That is precisely the broken-probe case the controls exist to
# exclude, and the control was blind to it because it was not on the path being
# measured. `ghcr.io` is reachable, undisputed in the consolidated table, and
# not in `no_proxy`, so a proxy failure takes it down with everything else.
CONTROL_REACHABLE = "ghcr.io"
CONTROL_DENIED = "example.com"

ALL_HOSTS = sorted(set(WRITE_SURFACES) | CONTEXT_HOSTS)


def run_probe() -> None:
    """Emit records `unindexed-hosts.json` can actually take.

    The first draft printed a bare array after a single attempt, under an
    instruction to paste it into that file. Following that instruction would
    have failed the ingest tests, which require the `results`/`controls` split,
    a `source`, and a second attempt that agrees -- one probe cannot separate a
    transient failure from a policy denial. So the schema is produced here
    rather than left as an exercise.
    """
    consolidate = _canonical_probe()

    def twice(host: str) -> dict:
        url = f"https://{host}/"
        first = consolidate.probe_host(host, url)
        second = consolidate.probe_host(host, url)
        rec = dict(first)
        rec["second_attempt"] = {k: second[k] for k in ("verdict", "status", "detail")}
        rec["stable"] = second["verdict"] == first["verdict"]
        print(f"  {host:38} {rec['verdict']:14} {rec['status']}  "
              f"stable={rec['stable']}", file=sys.stderr)
        return rec

    results = []
    for host in ALL_HOSTS:
        rec = twice(host)
        rec["source"] = "platform/deployment/README.md"
        rec["why_unindexed"] = (
            "Hosting control plane measured by "
            "platform/deployment/probe_control_planes.py, which lives outside "
            "the portfolio/research/ tree --ingest walks."
        )
        results.append(rec)

    controls = []
    for host, role in ((CONTROL_REACHABLE, "known-reachable control"),
                       (CONTROL_DENIED, "known-denied control")):
        rec = twice(host)
        rec["role"] = role
        controls.append(rec)

    print(json.dumps({"results": results, "controls": controls}, indent=2,
                     sort_keys=True))

    # Stability alone is not enough to license an ingest, and saying "merge the
    # results, that file has its own controls" was the gap: a run whose network
    # was broken denies *every* host, twice, and so reports stable -- then
    # merges next to an older reachable control and leaves --check green. The
    # controls have to be checked against this run, not a previous one.
    problems = []
    verdicts = {r["host"]: r["verdict"] for r in controls}
    if verdicts.get(CONTROL_REACHABLE) != "reachable":
        problems.append(
            f"{CONTROL_REACHABLE} did not answer this run "
            f"({verdicts.get(CONTROL_REACHABLE)}) -- every denial above is "
            "unreliable, because a broken probe looks exactly like this"
        )
    if verdicts.get(CONTROL_DENIED) != "egress_denied":
        problems.append(
            f"{CONTROL_DENIED} was not denied this run "
            f"({verdicts.get(CONTROL_DENIED)}) -- the denial signature has "
            "changed and the verdicts above do not mean what they say"
        )
    problems += [
        f"{r['host']} gave differing verdicts on two attempts"
        for r in results + controls if not r["stable"]
    ]

    if problems:
        print("\nDO NOT INGEST:", file=sys.stderr)
        for line in problems:
            print(f"  - {line}", file=sys.stderr)
        raise SystemExit(1)

    print(
        "\nControls agree with this run. Merge `results` into "
        "portfolio/research/egress-reachability/unindexed-hosts.json, then run "
        "`consolidate.py --ingest` there.",
        file=sys.stderr,
    )


def load_table() -> dict:
    if not TABLE.exists():
        sys.exit(f"consolidated egress table not found at {TABLE}")
    return json.loads(TABLE.read_text())["hosts"]


def verdict_of(hosts: dict, host: str) -> str | None:
    entry = hosts.get(host)
    return entry.get("prior_consensus") if entry else None


def disputed(hosts: dict, host: str) -> bool:
    """Does this host's evidence disagree with itself?

    `prior_consensus` alone is not enough to decide anything load-bearing. The
    consolidated table records a *conservative* consensus, so one new
    `reachable` observation against several existing denials can leave the
    consensus at `egress_denied` while `prior_disputed` flips true -- which is
    exactly the moment a write surface has started answering and exactly when
    this check would otherwise stay green. The reverse hides an exception going
    quiet. Three hosts in the committed table are disputed today, so this is a
    live condition rather than a hypothetical one.
    """
    entry = hosts.get(host) or {}
    return bool(entry.get("prior_disputed") or entry.get("prior_tied"))


def report(hosts: dict) -> None:
    print("Deployment control planes, per the consolidated egress table\n")
    width = max(len(h) for h in ALL_HOSTS)
    print("  write surfaces (what a deploy or teardown would call):")
    for host, vendor in sorted(WRITE_SURFACES.items()):
        print(f"    {host:{width}}  {vendor:14} {verdict_of(hosts, host)}")
    print("\n  dashboards and marketing roots (context, not load-bearing):")
    for host in sorted(CONTEXT_HOSTS):
        print(f"    {host:{width}}  {'':14} {verdict_of(hosts, host)}")
    print(f"\n  table: {len(hosts)} hosts, {TABLE.relative_to(REPO)}")


def check(hosts: dict) -> int:
    """Re-derive README.md's load-bearing claim from the consolidated table."""
    problems: list[str] = []

    if verdict_of(hosts, CONTROL_REACHABLE) != "reachable":
        problems.append(
            f"reachable control {CONTROL_REACHABLE} is "
            f"{verdict_of(hosts, CONTROL_REACHABLE)!r}: no denial in this table "
            "means anything if the probe behind it could not reach a live host"
        )
    if verdict_of(hosts, CONTROL_DENIED) != "egress_denied":
        problems.append(
            f"denied control {CONTROL_DENIED} is "
            f"{verdict_of(hosts, CONTROL_DENIED)!r}: the denial signature has "
            "changed, so egress_denied verdicts are no longer trustworthy"
        )

    contested = sorted(
        f"{h} ({verdict_of(hosts, h)}, disputed)"
        for h in list(WRITE_SURFACES) + [CONTROL_REACHABLE, CONTROL_DENIED]
        if h in hosts and disputed(hosts, h)
    )
    if contested:
        problems.append(
            "evidence disagrees with itself for hosts this claim rests on: "
            f"{', '.join(contested)}. A conservative consensus can hide a new "
            "reachable observation, so a disputed write surface, exception or "
            "control is not usable evidence -- re-probe and resolve it."
        )

    missing = sorted(h for h in ALL_HOSTS if h not in hosts)
    if missing:
        problems.append(
            "hosts README.md cites are absent from the consolidated table "
            f"({', '.join(missing)}). Re-probe and fold them into "
            "egress-reachability/unindexed-hosts.json."
        )

    # An `error` verdict is not evidence of a denial -- it is the absence of
    # evidence, usually a probe that failed for its own reasons. Requiring the
    # verdict to *equal* egress_denied is what makes a green check mean the
    # thing README.md claims, rather than merely "nothing answered".
    unsupported = sorted(
        f"{h} ({vendor}): {verdict_of(hosts, h)}"
        for h, vendor in WRITE_SURFACES.items()
        if h in hosts
        and h not in EXPECTED_REACHABLE
        and verdict_of(hosts, h) != "egress_denied"
    )
    if unsupported:
        problems.append(
            "README.md argues the spend cap must live in the platform because "
            "a session cannot reach a vendor's control plane. These are write "
            f"surfaces that no longer support it: {', '.join(unsupported)}. "
            "Either re-probe them or rewrite that section."
        )

    # Drift in the other direction matters too: if a documented exception stops
    # being reachable, the document is describing a world that has moved.
    # Must *equal* reachable, not merely differ from denied. An `error` verdict
    # on an exception means there is no usable measurement behind the sentence
    # README.md prints about it -- which is the same failure this check already
    # rejects for the denied surfaces, one level down.
    stale = sorted(
        f"{h}: {verdict_of(hosts, h)}"
        for h in EXPECTED_REACHABLE
        if h in hosts and verdict_of(hosts, h) != "reachable"
    )
    if stale:
        problems.append(
            "documented as reachable, and no longer measured as reachable: "
            f"{', '.join(stale)}. README.md's exception list is describing a "
            "state the table does not support -- re-probe, or drop the "
            "exception there and here."
        )

    if problems:
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print(
        f"deployment control planes: {len(ALL_HOSTS)} hosts checked against the "
        f"{len(hosts)}-host table; {len(WRITE_SURFACES) - len(EXPECTED_REACHABLE)} "
        f"of {len(WRITE_SURFACES)} write surfaces denied, "
        f"{len(EXPECTED_REACHABLE)} documented exception(s), controls sane."
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true", help="re-measure (needs network)")
    ap.add_argument("--report", action="store_true", help="print verdicts, offline")
    ap.add_argument("--check", action="store_true", help="validate the claim, offline (CI)")
    args = ap.parse_args()

    if args.probe:
        run_probe()
        return 0
    if args.report:
        report(load_table())
        return 0
    return check(load_table())


if __name__ == "__main__":
    raise SystemExit(main())
