#!/usr/bin/env python3
"""Check which of the free listing channels are reachable from an agent session at all.

Context
-------
`portfolio/pipeline/channel-inventory.md` sorts publishing channels by whether a
session working from this repo can complete a listing without an artifact
belonging to a legal person, and identifies four as free and "agent-listable":
WordPress.org, Open VSX, npm/PyPI, and GitHub Marketplace's free tier. Its
recommended next action is to publish the smallest honest version of a candidate
into one of them.

That recommendation assumes a session can *reach* the channel. Nobody checked.
"Agent-listable" (no payment card, no identity document) and "reachable from
this environment" (not denied by the egress proxy) are different properties, and
this script measures the second one.

Method
------
One HTTPS request per host, following the environment's normal proxy path. Three
outcomes are distinguished, because they mean different things:

* **reachable** — an HTTP status came back from the origin. The channel can be
  read, and its listing requirements and per-listing metrics are available.
* **egress-denied** — the proxy answered 403 to CONNECT. This is a policy
  decision in the environment, not a property of the channel, and it is
  therefore something the account owner can change with an allowlist entry.
* **unreachable** — anything else (DNS, timeout, TLS).

Nothing is published, no account is touched, and every request is a plain GET of
a public endpoint.

Usage
-----
    python3 check_channel_reachability.py
    python3 check_channel_reachability.py --out results.json
"""

from __future__ import annotations

import argparse
import json
import socket
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

USER_AGENT = "monorepo-projects-portfolio-research/1.0 (read-only reachability check)"

#: (host, url, why it matters). Hosts are the free channels named in
#: channel-inventory.md, plus the vulnerability sources the CRA candidate's own
#: first experiment depends on, since both are prerequisites for work the
#: pipeline says to do next.
TARGETS: list[tuple[str, str, str]] = [
    (
        "registry.npmjs.org",
        "https://registry.npmjs.org/-/v1/search?text=sbom&size=1",
        "free channel; per-listing download counts (used by free-listing-demand)",
    ),
    (
        "pypi.org",
        "https://pypi.org/pypi/requests/json",
        "free channel; package metadata",
    ),
    (
        "api.wordpress.org",
        "https://api.wordpress.org/plugins/info/1.2/?action=query_plugins",
        "free channel; publishes per-plugin active_installs — the business-buyer "
        "channel the accessibility candidates target",
    ),
    (
        "wordpress.org",
        "https://wordpress.org/plugins/",
        "free channel; listing requirements",
    ),
    (
        "plugins.svn.wordpress.org",
        "https://plugins.svn.wordpress.org/",
        "free channel; the actual publish endpoint for WordPress.org",
    ),
    (
        "open-vsx.org",
        "https://open-vsx.org/api/-/search?query=accessibility&size=1",
        "free channel; per-extension download counts",
    ),
    (
        "marketplace.visualstudio.com",
        "https://marketplace.visualstudio.com/vscode",
        "free channel; per-extension install counts",
    ),
    (
        "docs.github.com",
        "https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app",
        "the free/paid split and 100-install minimum that channel-inventory.md "
        "calls load-bearing and could not verify",
    ),
    (
        "euvd.enisa.europa.eu",
        "https://euvd.enisa.europa.eu/",
        "the EU Vulnerability Database — the wedge cra-evidence-desk's "
        "defensibility rests on",
    ),
    (
        "api.osv.dev",
        "https://api.osv.dev/v1/query",
        "the open advisory source any SBOM matching would compare EUVD against",
    ),
]


def classify(url: str) -> dict:
    """One request; distinguish an origin answer from an egress policy denial."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return {"outcome": "reachable", "status": response.status, "detail": None}
    except urllib.error.HTTPError as error:
        # An HTTP status from the origin still proves the host is reachable.
        return {"outcome": "reachable", "status": error.code, "detail": error.reason}
    except urllib.error.URLError as error:
        reason = str(error.reason)
        if "403" in reason or "CONNECT" in reason.upper() or "Tunnel" in reason:
            return {"outcome": "egress-denied", "status": None, "detail": reason}
        return {"outcome": "unreachable", "status": None, "detail": reason}
    except (socket.timeout, ssl.SSLError, TimeoutError) as error:
        return {"outcome": "unreachable", "status": None, "detail": str(error)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", help="write results as JSON to this path")
    args = parser.parse_args()

    rows = []
    for host, url, why in TARGETS:
        result = classify(url)
        rows.append({"host": host, "url": url, "why_it_matters": why, **result})
        status = result["status"] if result["status"] is not None else "-"
        print(f"{host:32} {result['outcome']:14} {status}", file=sys.stderr)

    payload = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "method": (
            "one HTTPS GET per host through the environment's egress proxy; "
            "'egress-denied' means the proxy answered 403 to CONNECT, which is "
            "an environment policy the account owner can change, not a property "
            "of the channel"
        ),
        "targets": rows,
        "summary": {
            outcome: [r["host"] for r in rows if r["outcome"] == outcome]
            for outcome in ("reachable", "egress-denied", "unreachable")
        },
    }

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=1, sort_keys=True)
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        json.dump(payload, sys.stdout, indent=1, sort_keys=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
