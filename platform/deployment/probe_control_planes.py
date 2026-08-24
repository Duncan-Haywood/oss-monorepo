#!/usr/bin/env python3
"""Which deployment control planes this environment can reach.

The deployment-platform decision in README.md rests on one measured claim and
several unmeasurable ones. This script covers the measured one: **no hosting
vendor's control plane is reachable from an agent session's own network**, so
whichever platform is chosen, deploys run from GitHub Actions runners and a
session cannot inspect, throttle, or stop one from here.

That is not a reason to pick any particular vendor. It is the reason the
decision has to be made on *what the platform does when unattended and
over-budget*, rather than on what an agent could do about it in the moment.

    python3 probe_control_planes.py --probe -o results-2026-08-24.json
    python3 probe_control_planes.py --report -r results-2026-08-24.json
    python3 probe_control_planes.py --check                    # CI, offline

`--report` and `--check` need no network: they re-derive every count in
README.md from the committed JSON, which is how a reviewer checks this
without re-running the probe.

Read-only GETs to public marketing and API roots. No credential, no account,
nothing published, nothing spent.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import ssl
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_RESULTS = HERE / "results-2026-08-24.json"
CA_BUNDLE = "/root/.ccr/ca-bundle.crt"

# The proxy refuses a denied host at CONNECT time, before TLS. That failure is
# textually distinct from anything an origin can say, which is what lets
# `egress_denied` be told apart from a 403 the origin itself chose to send.
DENIAL_SIGNATURE = "Tunnel connection failed: 403 Forbidden"

# Grouped by the billing question README.md turns on, not by vendor size.
HOSTS: list[tuple[str, str]] = [
    # candidate platforms named in the decision
    ("api.cloudflare.com", "cloudflare"),
    ("dash.cloudflare.com", "cloudflare"),
    ("pages.dev", "cloudflare"),
    ("workers.dev", "cloudflare"),
    ("api.vercel.com", "vercel"),
    ("vercel.com", "vercel"),
    ("api.hetzner.cloud", "hetzner"),
    ("console.hetzner.cloud", "hetzner"),
    ("www.hetzner.com", "hetzner"),
    ("aws.amazon.com", "aws"),
    ("ec2.amazonaws.com", "aws"),
    ("management.azure.com", "azure"),
    ("portal.azure.com", "azure"),
    ("cloudresourcemanager.googleapis.com", "gcp"),
    ("console.cloud.google.com", "gcp"),
    # platforms considered and not shortlisted, probed so the table is complete
    ("api.netlify.com", "netlify"),
    ("api.fly.io", "fly"),
    ("api.render.com", "render"),
    ("api.digitalocean.com", "digitalocean"),
    ("deno.com", "deno"),
    # controls: one host known reachable, one general-web host known denied.
    # Without these a blanket denial is indistinguishable from a broken probe.
    ("registry.npmjs.org", "control-reachable"),
    ("example.com", "control-denied"),
]


def probe(host: str, timeout: int = 12) -> dict:
    ctx = ssl.create_default_context(cafile=CA_BUNDLE)
    req = urllib.request.Request(
        f"https://{host}/", method="GET",
        headers={"User-Agent": "monorepo-projects-deployment-probe"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return {"host": host, "verdict": "reachable", "status": r.status, "detail": ""}
    except urllib.error.HTTPError as e:
        # The origin answered, with an opinion. 401/403/404/405 all count as
        # reached -- we are measuring the network, not our authorisation.
        return {"host": host, "verdict": "reachable", "status": e.code, "detail": ""}
    except Exception as e:  # noqa: BLE001 - any failure is a non-answer
        detail = f"{type(e).__name__}: {e}"
        verdict = "egress_denied" if DENIAL_SIGNATURE in detail else "error"
        return {"host": host, "verdict": verdict, "status": 0, "detail": detail[:200]}


def run_probe(out: pathlib.Path) -> dict:
    records = []
    for host, group in HOSTS:
        rec = probe(host)
        rec["group"] = group
        records.append(rec)
        print(f"  {host:38} {rec['verdict']:14} {rec['status']}", file=sys.stderr)
    payload = {"hosts": len(HOSTS), "results": records}
    out.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"wrote {out}", file=sys.stderr)
    return payload


def load(results: pathlib.Path) -> list[dict]:
    if not results.exists():
        sys.exit(f"no results file at {results} -- run --probe first")
    return json.loads(results.read_text())["results"]


def report(records: list[dict]) -> None:
    print("Deployment control-plane reachability\n")
    width = max(len(r["host"]) for r in records)
    for r in records:
        status = r["status"] or ""
        print(f"  {r['host']:{width}}  {r['group']:18} {r['verdict']:14} {status}")
    print()
    for verdict in ("reachable", "egress_denied", "error"):
        n = sum(1 for r in records if r["verdict"] == verdict)
        if n:
            print(f"  {verdict:14} {n}")


def check(records: list[dict]) -> int:
    """Re-derive README.md's load-bearing claims from the committed JSON."""
    problems: list[str] = []

    by_host = {r["host"]: r for r in records}
    missing = [h for h, _ in HOSTS if h not in by_host]
    if missing:
        problems.append(f"results missing hosts: {', '.join(missing)}")

    ctl_ok = by_host.get("registry.npmjs.org", {}).get("verdict")
    if ctl_ok != "reachable":
        problems.append(
            f"reachable control registry.npmjs.org is {ctl_ok!r}: the probe itself "
            "is broken, so no denial in this file means anything"
        )
    ctl_no = by_host.get("example.com", {}).get("verdict")
    if ctl_no != "egress_denied":
        problems.append(
            f"denied control example.com is {ctl_no!r}: the denial signature has "
            "changed, so egress_denied verdicts are no longer trustworthy"
        )

    # The claim README.md makes: every candidate platform's *write* surface --
    # the API a deploy or a teardown would call -- is denied from here.
    write_surfaces = {
        "api.cloudflare.com", "api.vercel.com", "api.hetzner.cloud",
        "ec2.amazonaws.com", "management.azure.com", "api.netlify.com",
        "api.fly.io", "api.render.com", "api.digitalocean.com",
    }
    reachable_writes = sorted(
        h for h in write_surfaces
        if by_host.get(h, {}).get("verdict") == "reachable"
    )
    if reachable_writes:
        problems.append(
            "README.md says no vendor control plane is reachable, but these "
            f"answered: {', '.join(reachable_writes)}. Update the document."
        )

    if problems:
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print(f"control-plane probe: {len(records)} hosts, claims OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true", help="re-measure (needs network)")
    ap.add_argument("--report", action="store_true", help="print the table, offline")
    ap.add_argument("--check", action="store_true", help="validate claims, offline (CI)")
    ap.add_argument("-o", "--out", type=pathlib.Path, default=DEFAULT_RESULTS)
    ap.add_argument("-r", "--results", type=pathlib.Path, default=DEFAULT_RESULTS)
    args = ap.parse_args()

    if args.probe:
        run_probe(args.out)
        return 0
    if args.report:
        report(load(args.results))
        return 0
    return check(load(args.results))


if __name__ == "__main__":
    raise SystemExit(main())
