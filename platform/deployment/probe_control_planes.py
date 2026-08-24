#!/usr/bin/env python3
"""Assert what the deployment-platform decision claims about reachability.

`README.md` chooses a deployment platform on the grounds that the spend cap has
to live *inside* the vendor, because deploys run on GitHub Actions runners and
no agent session can reach a vendor's control plane to inspect, throttle, or
stop one. That second half is a measurable claim, and this checks it.

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
    "api.netlify.com": "netlify",
    "api.fly.io": "fly",
    "api.render.com": "render",
    "api.digitalocean.com": "digitalocean",
}

# Probed alongside them and carried in the same table, but not load-bearing:
# dashboards and marketing roots a human would open, not an API a deploy calls.
CONTEXT_HOSTS = {
    "dash.cloudflare.com", "pages.dev", "workers.dev", "vercel.com",
    "console.hetzner.cloud", "www.hetzner.com", "aws.amazon.com",
    "railway.app", "railway.com",
    "portal.azure.com", "cloudresourcemanager.googleapis.com",
    "console.cloud.google.com", "deno.com",
}

# Without both, a blanket denial cannot be told from a broken probe.
CONTROL_REACHABLE = "registry.npmjs.org"
CONTROL_DENIED = "example.com"

ALL_HOSTS = sorted(set(WRITE_SURFACES) | CONTEXT_HOSTS)


def run_probe() -> None:
    consolidate = _canonical_probe()
    records = []
    for host in ALL_HOSTS + [CONTROL_REACHABLE, CONTROL_DENIED]:
        rec = consolidate.probe_host(host, f"https://{host}/")
        print(f"  {host:38} {rec['verdict']:14} {rec['status']}", file=sys.stderr)
        records.append(rec)
    print(json.dumps(records, indent=2))
    print(
        "\nFold these into portfolio/research/egress-reachability/"
        "unindexed-hosts.json, then run `consolidate.py --ingest` there.",
        file=sys.stderr,
    )


def load_table() -> dict:
    if not TABLE.exists():
        sys.exit(f"consolidated egress table not found at {TABLE}")
    return json.loads(TABLE.read_text())["hosts"]


def verdict_of(hosts: dict, host: str) -> str | None:
    entry = hosts.get(host)
    return entry.get("prior_consensus") if entry else None


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
        if h in hosts and verdict_of(hosts, h) != "egress_denied"
    )
    if unsupported:
        problems.append(
            "README.md argues the spend cap must live in the platform because "
            "every vendor write surface is denied from a session. These do not "
            f"carry an egress_denied verdict: {', '.join(unsupported)}. Either "
            "re-probe them or rewrite that section."
        )

    if problems:
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print(
        f"deployment control planes: {len(ALL_HOSTS)} hosts checked against the "
        f"{len(hosts)}-host table, every write surface denied, controls sane."
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
