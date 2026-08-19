#!/usr/bin/env python3
"""Measure which of the candidate pipeline's critical hosts an unattended agent
in this environment can actually reach.

Why this exists
---------------
`portfolio/pipeline/` (PR #79) scores eight candidates on eight dimensions.
None of them asks whether the agent that has to build and operate the business
can reach that business's primary sources, its distribution channel, or the
data it would ingest every day. Two prior runs hit this constraint sideways --
PR #103 found nine candidate-critical domains blocked while verifying claims,
PR #111 could only measure npm -- but neither mapped it.

This script maps it, and separates the *reasons* a host can be unreachable,
because they correspond to different settings and therefore to different asks:

  REACHABLE       the origin answered us.
  EGRESS_DENIED   the egress gateway refused. Two wire forms, same cause:
                  a 403 to the CONNECT tunnel, or an HTTP 403 whose body says
                  "Host not in allowlist". Fixed by the environment's network
                  egress settings.
  SCOPE_DENIED    the host is reachable and answered, but this session's
                  credentials are not scoped to the resource. Observed on
                  api.github.com, which is limited to this repository. Fixed by
                  the GitHub app's repository scope, NOT by network settings.
  UNREACHABLE     DNS/TLS/timeout failure that is not a policy denial.

Conflating these would misprice the ask: EGRESS_DENIED and SCOPE_DENIED are two
different switches, and UNREACHABLE may not be a switch at all.

The route column is orthogonal and records *how* a reachable host was reached:

  DIRECT          host is in the proxy's noProxy allowlist; connects directly.
  GATEWAY         host goes through the egress gateway.

Read-only. Stdlib only. No credentials. Issues one small GET per host.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

# ---------------------------------------------------------------------------
# What we probe, and why each host matters to a specific candidate.
#
# `role` is the part of the business the host is load-bearing for:
#   premise  -- the primary source that establishes the candidate is real
#               (a regulation, a spec, a standard). Unverifiable premise means
#               the candidate cannot be de-risked from here at all.
#   channel  -- where the product would be listed or sold.
#   operate  -- the data the business must ingest to produce its output on an
#               ongoing basis. This is the one that decides whether the thing
#               can *run* unattended, as opposed to merely be researched.
#   measure  -- a source that would let us quantify demand on a channel.
# ---------------------------------------------------------------------------

TARGETS: list[dict[str, str]] = [
    # -- shared regulatory / standards premises -----------------------------
    {"url": "https://eur-lex.europa.eu/homepage.html", "candidate": "eaa-remediation-pipeline,cra-evidence-desk,einvoice-preflight", "role": "premise", "note": "EU primary legislation (EAA, CRA, e-invoicing)"},
    {"url": "https://www.w3.org/WAI/standards-guidelines/wcag/", "candidate": "eaa-remediation-pipeline,shopify-a11y-evidence", "role": "premise", "note": "WCAG success criteria the audits are graded against"},
    {"url": "https://www.etsi.org/", "candidate": "eaa-remediation-pipeline", "role": "premise", "note": "EN 301 549, the EU harmonised accessibility standard"},

    # -- eaa-remediation-pipeline -------------------------------------------
    {"url": "https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request%5Bslug%5D=akismet", "candidate": "eaa-remediation-pipeline", "role": "channel", "note": "WordPress.org plugin directory API (listing + active_installs)"},
    {"url": "https://developer.wordpress.org/plugins/", "candidate": "eaa-remediation-pipeline", "role": "channel", "note": "WordPress plugin submission docs"},

    # -- shopify-a11y-evidence ----------------------------------------------
    {"url": "https://shopify.dev/docs/apps", "candidate": "shopify-a11y-evidence", "role": "channel", "note": "Shopify app platform docs"},
    {"url": "https://apps.shopify.com/", "candidate": "shopify-a11y-evidence", "role": "channel", "note": "Shopify App Store listing surface"},

    # -- mcp-supply-chain-watch ---------------------------------------------
    {"url": "https://registry.npmjs.org/@modelcontextprotocol/sdk", "candidate": "mcp-supply-chain-watch", "role": "operate", "note": "npm registry -- the drift signal PR #103 measured"},
    {"url": "https://registry.modelcontextprotocol.io/v0/servers?limit=1", "candidate": "mcp-supply-chain-watch", "role": "operate", "note": "official MCP server registry"},
    # Two routes to the *same* source. Grouped by `source` so that one working
    # route is enough -- otherwise the scope-limited API route would score the
    # premise unverifiable when it demonstrably is not.
    {"url": "https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol", "candidate": "mcp-supply-chain-watch", "role": "premise", "source": "mcp-spec-repo", "note": "MCP spec source repo via GitHub API"},
    {"url": "https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/README.md", "candidate": "mcp-supply-chain-watch", "role": "premise", "source": "mcp-spec-repo", "note": "MCP spec source over raw.githubusercontent (the route PR #103 used)"},

    # -- cra-evidence-desk ---------------------------------------------------
    {"url": "https://api.osv.dev/v1/query", "candidate": "cra-evidence-desk", "role": "operate", "note": "OSV vulnerability feed -- the SBOM evidence input"},
    {"url": "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1", "candidate": "cra-evidence-desk", "role": "operate", "note": "NVD CVE feed"},
    {"url": "https://openssf.org/", "candidate": "cra-evidence-desk", "role": "premise", "note": "OpenSSF, cited as the ecosystem reference"},

    # -- tender-radar --------------------------------------------------------
    {"url": "https://ted.europa.eu/en/", "candidate": "tender-radar", "role": "operate", "note": "TED, the EU tender feed the product resells"},

    # -- einvoice-preflight --------------------------------------------------
    {"url": "https://docs.peppol.eu/", "candidate": "einvoice-preflight", "role": "operate", "note": "Peppol BIS spec the validator checks against"},

    # -- public-record-watch -------------------------------------------------
    {"url": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-K&count=1", "candidate": "public-record-watch", "role": "operate", "note": "SEC EDGAR, representative public-record source"},
    {"url": "https://data.gov/", "candidate": "public-record-watch", "role": "operate", "note": "US open-data portal index"},

    # -- agent-permission-harness --------------------------------------------
    {"url": "https://dev.to/", "candidate": "agent-permission-harness", "role": "channel", "note": "developer-audience publishing surface cited in the write-up"},

    # -- channels from channel-inventory.md ----------------------------------
    {"url": "https://open-vsx.org/api/-/search?query=test&size=1", "candidate": "*", "role": "channel", "note": "Open VSX -- listed as free and agent-listable"},
    {"url": "https://marketplace.visualstudio.com/", "candidate": "*", "role": "channel", "note": "VS Code Marketplace"},
    {"url": "https://chromewebstore.google.com/", "candidate": "*", "role": "channel", "note": "Chrome Web Store"},
    {"url": "https://api.github.com/marketplace_listing/plans", "candidate": "*", "role": "channel", "note": "GitHub Marketplace API"},

    # -- payment rails -------------------------------------------------------
    # All four rails channel-inventory.md contemplates for the "one payout rail,
    # established once" ask, so the finding covers the whole set rather than a
    # sample of it.
    {"url": "https://api.stripe.com/v1", "candidate": "*", "role": "channel", "note": "Stripe API"},
    {"url": "https://api.lemonsqueezy.com/v1/", "candidate": "*", "role": "channel", "note": "Lemon Squeezy merchant-of-record rail"},
    {"url": "https://api.paddle.com/", "candidate": "*", "role": "channel", "note": "Paddle merchant-of-record rail"},
    {"url": "https://api.polar.sh/v1/products/", "candidate": "*", "role": "channel", "note": "Polar merchant-of-record rail"},

    # -- demand measurement sources -----------------------------------------
    {"url": "https://registry.npmjs.org/-/v1/search?text=sbom&size=1", "candidate": "*", "role": "measure", "note": "npm search -- the only demand signal PR #111 could use"},
    {"url": "https://pypi.org/pypi/requests/json", "candidate": "*", "role": "measure", "note": "PyPI metadata (download counts are disabled -- see README)"},
    {"url": "https://pypistats.org/api/packages/requests/recent", "candidate": "*", "role": "measure", "note": "PyPI download stats"},
    {"url": "https://crates.io/api/v1/crates?q=sbom&per_page=1", "candidate": "*", "role": "measure", "note": "crates.io API (download counts)"},
    {"url": "https://index.crates.io/config.json", "candidate": "*", "role": "measure", "note": "crates.io sparse index (no download counts)"},
    {"url": "https://jsr.io/@std/fs/meta.json", "candidate": "*", "role": "measure", "note": "JSR package metadata"},
]

# crates.io's crawler policy requires a User-Agent that identifies the caller and
# carries a contact address; several other registries rate-limit anonymous ones.
USER_AGENT = os.environ.get(
    "REACHABILITY_PROBE_UA",
    "monorepo-projects-reachability-probe/1.0 (portfolio research; read-only)",
)


def no_proxy_hosts() -> set[str]:
    """Hosts the proxy is configured to bypass, i.e. reachable directly."""
    raw = os.environ.get("NO_PROXY") or os.environ.get("no_proxy") or ""
    out = set()
    for part in raw.split(","):
        part = part.strip().lstrip("*").lstrip(".")
        if part:
            out.add(part.lower())
    return out


def classify(host: str, direct: set[str]) -> str:
    """DIRECT if the proxy is configured to bypass this host, else GATEWAY."""
    host = host.lower()
    if host in direct:
        return "DIRECT"
    # ".example.com" entries in noProxy cover subdomains of example.com
    if any(host.endswith("." + d) for d in direct):
        return "DIRECT"
    return "GATEWAY"


def probe(url: str, timeout: float = 25.0) -> dict:
    """One small GET. Returns a verdict dict; never raises."""
    host = urlsplit(url).hostname or ""
    started = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT}, method="GET")
    result: dict = {"host": host, "url": url}
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp.read(2048)  # touch the body so TLS + transfer really happened
            result.update(verdict="REACHABLE", http_status=resp.status, detail="")
    except urllib.error.HTTPError as exc:
        # Something answered, but not necessarily the origin. The gateway also
        # denies *in-band*, as an HTTP 403 whose body names the allowlist, and
        # this session's GitHub app answers 403 for repositories outside its
        # scope. Both would read as "the origin replied" if we only looked at
        # the status code, so read the body and tell them apart.
        try:
            body = exc.read(400).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            body = ""
        snippet = " ".join(body.split())[:200]
        if "not in allowlist" in body.lower():
            verdict = "EGRESS_DENIED"
            detail = f"gateway refused in-band: {snippet}"
        elif "is not enabled for this session" in body or "add_repo" in body:
            verdict = "SCOPE_DENIED"
            detail = f"host reachable; session credentials not scoped: {snippet}"
        else:
            verdict = "REACHABLE"
            detail = f"origin returned HTTP {exc.code}: {snippet}"
        result.update(verdict=verdict, http_status=exc.code, detail=detail)
    except urllib.error.URLError as exc:
        reason = exc.reason
        text = str(reason)
        if "CONNECT" in text or "tunnel" in text.lower() or "403" in text:
            verdict, detail = "EGRESS_DENIED", "gateway answered 403 to CONNECT (policy denial)"
        elif isinstance(reason, socket.timeout) or "timed out" in text.lower():
            verdict, detail = "UNREACHABLE", "timeout"
        elif isinstance(reason, ssl.SSLError):
            verdict, detail = "UNREACHABLE", f"TLS error: {text}"
        else:
            verdict, detail = "UNREACHABLE", text
        result.update(verdict=verdict, http_status=None, detail=detail)
    except Exception as exc:  # noqa: BLE001 - a probe must never abort the run
        result.update(verdict="UNREACHABLE", http_status=None,
                      detail=f"{type(exc).__name__}: {exc}")
    result["elapsed_s"] = round(time.monotonic() - started, 2)
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", help="write results JSON here")
    ap.add_argument("--timeout", type=float, default=25.0)
    ap.add_argument("--pace", type=float, default=0.4,
                    help="seconds between probes; these are third-party hosts")
    args = ap.parse_args()

    direct = no_proxy_hosts()
    rows = []
    for i, target in enumerate(TARGETS, 1):
        row = dict(target)
        row.update(probe(target["url"], timeout=args.timeout))
        row["route"] = classify(row["host"], direct)
        rows.append(row)
        print(f"[{i:2d}/{len(TARGETS)}] {row['verdict']:<15} {row['route']:<8} "
              f"{row['host']}", file=sys.stderr)
        time.sleep(args.pace)

    # ---- summary ---------------------------------------------------------
    by_verdict: dict[str, int] = {}
    for r in rows:
        by_verdict[r["verdict"]] = by_verdict.get(r["verdict"], 0) + 1

    # Per-candidate: a candidate is "operable" only if every host it needs for
    # `operate` and `channel` is reachable, and "verifiable" only if its
    # `premise` hosts are.
    # A candidate needs *every distinct source* in a role, but a source with more
    # than one route only needs one route to work. `source` defaults to the host,
    # so single-route entries behave exactly as before.
    candidates: dict[str, dict] = {}
    for r in rows:
        for cand in r["candidate"].split(","):
            cand = cand.strip()
            if cand == "*":
                continue
            entry = candidates.setdefault(cand, {"premise": [], "channel": [], "operate": []})
            entry.setdefault(r["role"], []).append({
                "host": r["host"],
                "source": r.get("source") or r["host"],
                "verdict": r["verdict"],
                "note": r["note"],
            })

    for cand, roles in candidates.items():
        def ok(role: str) -> bool | None:
            hosts = roles.get(role) or []
            if not hosts:
                return None
            by_source: dict[str, list[str]] = {}
            for h in hosts:
                by_source.setdefault(h["source"], []).append(h["verdict"])
            return all(any(v == "REACHABLE" for v in vs) for vs in by_source.values())
        roles["premise_verifiable"] = ok("premise")
        roles["channel_reachable"] = ok("channel")
        roles["operable"] = ok("operate")
        # The headline: can an unattended agent both establish this is real and
        # keep it running? Roles the candidate does not use are not held against it.
        roles["agent_executable"] = all(
            roles[k] is not False
            for k in ("premise_verifiable", "channel_reachable", "operable")
        )

    payload = {
        "generated_by": "portfolio/research/agent-reachability/probe_reachability.py",
        "no_proxy_allowlist": sorted(direct),
        "counts": by_verdict,
        "n_targets": len(rows),
        "results": rows,
        "per_candidate": candidates,
    }

    print("\n== verdict counts ==", file=sys.stderr)
    for k in sorted(by_verdict):
        print(f"  {k:<15} {by_verdict[k]}", file=sys.stderr)

    text = json.dumps(payload, indent=2, sort_keys=False)
    if args.out:
        with open(args.out, "w") as fh:
            fh.write(text + "\n")
        print(f"\nwrote {args.out}", file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
