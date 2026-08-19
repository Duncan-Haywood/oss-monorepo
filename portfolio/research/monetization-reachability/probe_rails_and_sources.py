#!/usr/bin/env python3
"""Probe the surface PR #126 did not: monetization rails and data sources that
ride on hosts this environment *already* permits.

Why this exists
---------------
PR #126 (`portfolio/research/agent-reachability/`) measured 33 targets and found
8 reachable hosts -- package registries plus GitHub plus Anthropic -- and 24
egress-denied. Two of its conclusions are load-bearing for decisions the account
owner has been asked to make eight cycles running:

  1. "All four payout rails are egress-denied, so approving a rail is not
     sufficient; it needs a paired egress change."
  2. "cra-evidence-desk cannot ingest the vulnerability data the product is made
     of" (api.osv.dev and services.nvd.nist.gov are both denied).

Both were measured correctly over the hosts probed. Neither asked the follow-up
question that decides how expensive the ask actually is:

  **Is there a rail, a channel, or a data source that rides on a host already
  in the allowlist?**

That is a different question from "is this specific vendor reachable", and it
has a different answer, because several of these services are distributed as
git repositories or as registry metadata rather than as their own API host.
This script measures it over 41 targets on 33 distinct hosts.

Verdicts follow PR #126 so the two result sets can be read together:

  REACHABLE       the origin answered us.
  EGRESS_DENIED   the egress gateway refused. Two wire forms, same cause: a 403
                  to the CONNECT tunnel, or an in-band HTTP 403 whose body names
                  the allowlist. Fixed by the environment's network egress
                  settings.
  SCOPE_DENIED    the host answered but this session's credentials/route are not
                  scoped to the resource. Fixed by the GitHub app's scope, which
                  is a different switch from network egress.
  UNREACHABLE     DNS/TLS/timeout failure that is not a policy denial.

and one verdict #126 had no need for:

  BOT_CHALLENGED  the network path works and the origin's own anti-bot layer
                  refused a non-browser client. Not a setting the account owner
                  controls, and not usable programmatically either -- so it is
                  neither "reachable" nor "denied" and is counted separately
                  rather than folded into either.

One classifier fix relative to #126, which its own jsr.io warning predicts:
GitHub's session proxy denies out-of-scope *API paths* with a body reading
"This GitHub API path is not available", distinct from the out-of-scope
*repository* body it already handled. #126 scored
`api.github.com/marketplace_listing/plans` REACHABLE for that reason. It is a
scope denial, and is classified as one here.

Read-only. Stdlib only. Sends no credentials of its own (urllib does not read
GH_TOKEN). One small GET per target.
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
# `kind` groups a target by the decision it informs:
#
#   rail     -- somewhere money could be collected. The eight-cycle blocker.
#   channel  -- somewhere a product could be listed, not probed by #126.
#   source   -- an operating input a candidate would ingest continuously.
#   baseline -- a control, so a surprising verdict elsewhere can be read against
#               a known-good and a known-denied point on the same run.
# ---------------------------------------------------------------------------

TARGETS: list[dict[str, str]] = [
    # -- baselines ----------------------------------------------------------
    {"url": "https://registry.npmjs.org/express", "kind": "baseline",
     "note": "known reachable in #126; confirms the allowlist has not changed under us"},
    {"url": "https://api.stripe.com/v1", "kind": "baseline",
     "note": "known egress-denied in #126; confirms denials are still denials"},
    {"url": "https://api.anthropic.com/v1/models", "kind": "baseline",
     "note": "the inference rail every candidate depends on"},

    # -- monetization rails -------------------------------------------------
    # #126 probed four SaaS payment APIs and found all four denied. These are
    # the rails it did not probe, chosen because each either rides on a host
    # already in the allowlist or is a merchant-of-record that removes the
    # tax-registration burden a self-serve rail creates.
    {"url": "https://api.github.com/marketplace_listing/plans", "kind": "rail",
     "note": "GitHub Marketplace billing API -- rides on api.github.com, which is reachable"},
    {"url": "https://api.github.com/user", "kind": "baseline",
     "note": "GitHub API under this session's own credentials -- the control that "
             "shows api.github.com itself answers, so a SCOPE_DENIED elsewhere on "
             "that host is about the path, not the host"},
    {"url": "https://github.com/sponsors", "kind": "rail",
     "note": "GitHub Sponsors -- listing surface on github.com"},
    {"url": "https://opencollective.com/", "kind": "rail",
     "note": "Open Collective -- fiscal host, so no company formation needed"},
    {"url": "https://api.opencollective.com/graphql/v2", "kind": "rail",
     "note": "Open Collective API"},
    {"url": "https://ko-fi.com/", "kind": "rail", "note": "Ko-fi"},
    {"url": "https://api.gumroad.com/v2/products", "kind": "rail",
     "note": "Gumroad -- merchant of record, sells digital goods without a store"},
    {"url": "https://liberapay.com/", "kind": "rail", "note": "Liberapay"},
    {"url": "https://tidelift.com/", "kind": "rail",
     "note": "Tidelift -- pays maintainers for packages already published; rail attached to a registry listing"},
    {"url": "https://thanks.dev/", "kind": "rail",
     "note": "thanks.dev -- dependency-weighted payouts to package maintainers"},
    {"url": "https://api.paypal.com/v1/", "kind": "rail",
     "note": "PayPal -- the one mainstream rail #126 did not probe"},

    # -- channels #126 did not probe ---------------------------------------
    # #126 established that every marketplace except npm is denied. These are
    # the publishing surfaces it did not test, and they matter because a
    # candidate's channel decides whether it can be distributed at all.
    {"url": "https://ghcr.io/v2/", "kind": "channel",
     "note": "GitHub Container Registry -- container distribution on a GitHub host"},
    {"url": "https://hub.docker.com/v2/repositories/library/nginx/", "kind": "channel",
     "note": "Docker Hub"},
    {"url": "https://huggingface.co/api/models?limit=1", "kind": "channel",
     "note": "Hugging Face -- model/space hosting and a discovery surface"},
    {"url": "https://proxy.golang.org/github.com/pkg/errors/@v/list", "kind": "channel",
     "note": "Go module proxy -- in the noProxy allowlist verbatim"},
    {"url": "https://pkg.go.dev/", "kind": "channel", "note": "Go package discovery surface"},
    {"url": "https://rubygems.org/api/v1/gems/rails.json", "kind": "channel",
     "note": "RubyGems"},
    {"url": "https://api.nuget.org/v3/index.json", "kind": "channel", "note": "NuGet"},
    {"url": "https://repo.packagist.org/p2/monolog/monolog.json", "kind": "channel",
     "note": "Packagist (PHP)"},
    {"url": "https://hex.pm/api/packages?search=json", "kind": "channel",
     "note": "Hex (Elixir/Erlang)"},
    {"url": "https://registry.terraform.io/v1/modules?limit=1", "kind": "channel",
     "note": "Terraform registry"},
    {"url": "https://formulae.brew.sh/api/formula/git.json", "kind": "channel",
     "note": "Homebrew formulae index"},
    {"url": "https://addons.mozilla.org/api/v5/addons/search/?q=test&page_size=1",
     "kind": "channel", "note": "Firefox add-ons -- the browser channel #126 did not probe"},
    {"url": "https://smithery.ai/", "kind": "channel",
     "note": "Smithery -- third-party MCP server directory"},
    {"url": "https://glama.ai/mcp/servers", "kind": "channel",
     "note": "Glama -- third-party MCP server directory"},
    {"url": "https://www.pulsemcp.com/", "kind": "channel",
     "note": "PulseMCP -- third-party MCP server directory"},
    {"url": "https://github.com/marketplace", "kind": "channel",
     "note": "GitHub Marketplace listing surface (github.com, not the API)"},
    {"url": "https://www.npmjs.com/package/express", "kind": "channel",
     "note": "npm website -- distinct host from registry.npmjs.org"},
    # Reading a registry and *publishing* to it are different hosts for some
    # ecosystems. A channel is only a channel if the upload endpoint answers.
    {"url": "https://upload.pypi.org/legacy/", "kind": "channel",
     "note": "PyPI upload endpoint -- distinct host from pypi.org"},
    {"url": "https://crates.io/api/v1/crates/new", "kind": "channel",
     "note": "crates.io publish endpoint"},

    # -- operating data sources #126 did not probe -------------------------
    # This is the cluster that could change #126's per-candidate table. It found
    # cra-evidence-desk unexecutable because api.osv.dev and NVD are denied. But
    # both the GitHub Advisory Database and the CVE Project's own list are
    # distributed as *git repositories on GitHub*, and raw.githubusercontent.com
    # is reachable. If those answer, the data is available by another route.
    {"url": "https://raw.githubusercontent.com/github/advisory-database/main/README.md",
     "kind": "source",
     "note": "GitHub Advisory Database as OSV-format files in a git repo"},
    {"url": "https://raw.githubusercontent.com/github/advisory-database/main/advisories/github-reviewed/2019/07/GHSA-jf85-cpcp-j695/GHSA-jf85-cpcp-j695.json",
     "kind": "source",
     "note": "a single advisory record, to confirm the data itself and not just the README"},
    {"url": "https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/2024/0xxx/CVE-2024-0001.json",
     "kind": "source",
     "note": "a single CVE record, to confirm the data itself and not just the README"},
    {"url": "https://raw.githubusercontent.com/CVEProject/cvelistV5/main/README.md",
     "kind": "source", "note": "CVE Project's official CVE list, distributed as a git repo"},
    {"url": "https://api.github.com/advisories?per_page=1", "kind": "source",
     "note": "GitHub Security Advisories API"},
    {"url": "https://api.deps.dev/v3alpha/systems/npm/packages/express", "kind": "source",
     "note": "Google Open Source Insights -- dependency graphs, licences, advisories"},
    {"url": "https://api.ecosyste.ms/api/v1/registries", "kind": "source",
     "note": "ecosyste.ms -- open cross-registry package metadata"},
    {"url": "https://libraries.io/api/npm/express", "kind": "source",
     "note": "Libraries.io cross-registry metadata"},
    {"url": "https://storage.googleapis.com/osv-vulnerabilities/PyPI/all.zip", "kind": "source",
     "note": "OSV's own GCS mirror -- the same data api.osv.dev serves, different host"},
    {"url": "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md",
     "kind": "source", "note": "the reference MCP server list, an operating input for mcp-supply-chain-watch"},
    {"url": "https://registry.modelcontextprotocol.io/v0/servers?limit=1", "kind": "source",
     "note": "official MCP registry -- reachable in #126, re-probed as a control for this cluster"},
    {"url": "https://raw.githubusercontent.com/rustsec/advisory-db/main/README.md",
     "kind": "source", "note": "RustSec advisory database, a git repo"},
]

USER_AGENT = os.environ.get(
    "RAILS_PROBE_UA",
    "monorepo-projects-monetization-probe/1.0 (portfolio research; read-only)",
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


def classify_route(host: str, direct: set[str]) -> str:
    host = host.lower()
    if host in direct or any(host.endswith("." + d) for d in direct):
        return "DIRECT"
    return "GATEWAY"


# Body markers that mean "policy refused this", not "the origin answered".
_EGRESS_MARKERS = ("not in allowlist",)
_SCOPE_MARKERS = (
    "is not enabled for this session",
    "add_repo",
    # The marker #126 did not have. GitHub's session proxy uses this for API
    # *paths* outside the session's scope, as distinct from repositories.
    "github api path is not available",
    "sessions are bound to their configured repo",
)
# An origin-side anti-bot interstitial. The network path works; the service
# still will not answer a script. Scoring this REACHABLE would overstate what a
# channel is worth, which is the same class of error #126 flagged for jsr.io.
_CHALLENGE_MARKERS = (
    "just a moment",
    "cf-browser-verification",
    "attention required! | cloudflare",
    "enable javascript and cookies to continue",
)


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
        try:
            body = exc.read(400).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            body = ""
        low = body.lower()
        snippet = " ".join(body.split())[:200]
        if any(m in low for m in _EGRESS_MARKERS):
            verdict, detail = "EGRESS_DENIED", f"gateway refused in-band: {snippet}"
        elif any(m in low for m in _SCOPE_MARKERS):
            verdict, detail = "SCOPE_DENIED", f"host reachable; route not scoped: {snippet}"
        elif any(m in low for m in _CHALLENGE_MARKERS):
            verdict, detail = "BOT_CHALLENGED", f"origin anti-bot layer refused a non-browser client: {snippet}"
        else:
            # The origin itself answered with an error. For our purposes that is
            # still a reachable host -- 401/403/404 from the real service tells
            # us the network path works.
            verdict, detail = "REACHABLE", f"origin returned HTTP {exc.code}: {snippet}"
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


def summarise(rows: list[dict]) -> dict:
    by_verdict: dict[str, int] = {}
    by_kind: dict[str, dict[str, int]] = {}
    for r in rows:
        by_verdict[r["verdict"]] = by_verdict.get(r["verdict"], 0) + 1
        k = by_kind.setdefault(r["kind"], {})
        k[r["verdict"]] = k.get(r["verdict"], 0) + 1
    return {"by_verdict": by_verdict, "by_kind": by_kind}


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", help="write results JSON here")
    ap.add_argument("--timeout", type=float, default=25.0)
    ap.add_argument("--pace", type=float, default=0.4,
                    help="seconds between probes; these are third-party hosts")
    ap.add_argument("--recompute-from", metavar="JSON",
                    help="re-derive the summary from a saved run without touching the network")
    args = ap.parse_args()

    if args.recompute_from:
        with open(args.recompute_from) as fh:
            saved = json.load(fh)
        print(json.dumps(summarise(saved["results"]), indent=2, sort_keys=True))
        return 0

    direct = no_proxy_hosts()
    rows = []
    for i, target in enumerate(TARGETS, 1):
        row = dict(target)
        row.update(probe(target["url"], timeout=args.timeout))
        row["route"] = classify_route(row["host"], direct)
        rows.append(row)
        print(f"[{i:2d}/{len(TARGETS)}] {row['verdict']:<15} {row['route']:<8} "
              f"{row['kind']:<9} {row['host']}", file=sys.stderr)
        time.sleep(args.pace)

    summary = summarise(rows)
    payload = {
        "generated_by": "portfolio/research/monetization-reachability/probe_rails_and_sources.py",
        "no_proxy_allowlist": sorted(direct),
        "n_targets": len(rows),
        "n_distinct_hosts": len({r["host"] for r in rows}),
        "summary": summary,
        "results": rows,
    }

    print("\n== verdict counts ==", file=sys.stderr)
    for k in sorted(summary["by_verdict"]):
        print(f"  {k:<15} {summary['by_verdict'][k]}", file=sys.stderr)

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
