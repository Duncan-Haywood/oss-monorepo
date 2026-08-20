#!/usr/bin/env python3
"""Probe the *write* half of every channel this portfolio has been told it can
publish to for free.

Why this exists
---------------
PR #79's `portfolio/pipeline/channel-inventory.md` is the document the whole
portfolio's current unblock plan rests on. Its argument, compressed:

  1. "Run a probe to a real buyer" is two actions -- demand measurement and
     revenue capture -- and only the second needs a payout rail.
  2. Several channels are "agent-listable": free to list, no card, no ID.
     WordPress.org, Open VSX, npm/PyPI, GitHub Marketplace's free tier.
  3. Therefore the free half "is not blocked at all", and the cheap ask to the
     account owner is merely *permission* to publish a free listing.

Step 3 is the load-bearing claim, and it was never measured. It comes from
vendor blogs and search summaries; that document says so itself ("several
sources here are vendor blogs... should be re-checked against the channel's own
current terms"). It describes what each marketplace's *policy* requires. It does
not establish that this environment can reach the endpoint where an artifact is
actually uploaded.

PR #130 found the first counterexample without setting out to. `pypi.org` is
REACHABLE and `upload.pypi.org` is EGRESS_DENIED -- PyPI can be read from here
but not published to -- and it flagged the general case as open:

  "That distinction was not tested for every registry above, and a channel whose
  upload host is denied is not a channel."

This script tests it for every registry above, and for the non-registry channels
`channel-inventory.md` marks agent-listable.

The decomposition this run adds
-------------------------------
Prior runs probed one surface per channel and called the answer "the channel".
Publishing is three surfaces, and they fail independently:

  read      the surface a *consumer* of the package hits. What #126 and #130
            measured. Included here only as a control.
  register  where an account is created or a publish token is issued. An agent
            with no account cannot publish however open the upload host is.
  publish   where the artifact is actually uploaded.

A channel is only usable end-to-end if `register` and `publish` both answer.
Scoring a channel on its `read` surface is the error this script exists to
correct, and it is the error `channel-inventory.md`'s "Yes" column inherits.

Verdicts are PR #126's and PR #130's, unchanged, so all three result sets can be
read side by side. The classifier below is a reimplementation rather than an
import because PR #130 is still an unmerged branch; the marker lists and the
in-band-403 handling are deliberately identical, including the
`github api path is not available` fix #130 made to #126.

  REACHABLE       the origin answered us. A 401/403/404/405 *from the service*
                  counts: it proves the network path works.
  EGRESS_DENIED   the egress gateway refused. Two wire forms, same cause: 403 to
                  the CONNECT tunnel, or an in-band 403 whose body names the
                  allowlist. Fixed by network egress settings.
  SCOPE_DENIED    the host answered; this session's GitHub scope did not cover
                  the route. A different switch from egress.
  BOT_CHALLENGED  the origin's own anti-bot layer refused a non-browser client.
                  Neither reachable nor a policy denial the owner controls.
  UNREACHABLE     DNS/TLS/timeout that is not a policy denial.

What this measures, and what it does not
----------------------------------------
It measures whether the *host and path* answer an unauthenticated GET. That is
strictly weaker than "an authenticated upload would succeed", and the gap is
stated here rather than buried, because overstating exactly this is the failure
mode #126 and #130 both warned about:

  - A REACHABLE publish endpoint means the network permits it and the remaining
    gate is credentials. It does NOT mean a PUT/POST would be accepted.
  - An EGRESS_DENIED publish endpoint is conclusive in the other direction: no
    credential fixes it. This is the finding the script can establish firmly,
    and it is the one that changes the owner ask.

So the asymmetry is deliberate: denials here are proof, reachability here is
permission-to-hope.

Read-only. Stdlib only. Sends no credentials of its own. One small GET per
target, paced.
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
# `channel` names the marketplace. `gate` is which of the three surfaces this
# target is -- read / register / publish -- because the whole point is that a
# channel can pass one and fail another.
#
# `listable` mirrors the "Agent-listable" column in PR #79's
# channel-inventory.md, so the measurement can be read directly against the
# claim it is testing.
# ---------------------------------------------------------------------------

TARGETS: list[dict[str, str]] = [
    # -- baselines ----------------------------------------------------------
    {"url": "https://registry.npmjs.org/express", "channel": "_baseline", "gate": "read",
     "listable": "-", "note": "known reachable in #126/#130; confirms the allowlist is unchanged"},
    {"url": "https://api.stripe.com/v1", "channel": "_baseline", "gate": "read",
     "listable": "-", "note": "known egress-denied in #126/#130; confirms denials are still denials"},

    # -- WordPress.org: channel-inventory.md's flagship "Yes" ----------------
    # It is the channel three of eight candidates are mapped onto, and the only
    # gated-billing-free channel whose buyer is a business rather than a
    # developer. Publishing is an SVN commit, which is a different host from
    # both the directory and the account system.
    {"url": "https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=akismet",
     "channel": "wordpress.org", "gate": "read", "listable": "Yes",
     "note": "plugin metadata API -- the consumer-facing surface"},
    {"url": "https://wordpress.org/plugins/", "channel": "wordpress.org", "gate": "read",
     "listable": "Yes", "note": "the directory itself"},
    {"url": "https://login.wordpress.org/register", "channel": "wordpress.org", "gate": "register",
     "listable": "Yes", "note": "WP.org account creation -- the credential the inventory says costs nothing"},
    {"url": "https://wordpress.org/plugins/developers/add/", "channel": "wordpress.org",
     "gate": "register", "listable": "Yes", "note": "plugin submission form -- review is requested here"},
    {"url": "https://plugins.svn.wordpress.org/akismet/", "channel": "wordpress.org",
     "gate": "publish", "listable": "Yes",
     "note": "the SVN host every WP.org plugin is actually published through"},

    # -- Open VSX: the other unambiguous "Yes" ------------------------------
    {"url": "https://open-vsx.org/api/redhat/java", "channel": "open-vsx", "gate": "read",
     "listable": "Yes", "note": "extension metadata -- consumer surface"},
    {"url": "https://open-vsx.org/user-settings/tokens", "channel": "open-vsx", "gate": "register",
     "listable": "Yes", "note": "where a publish token is issued (Eclipse account)"},
    {"url": "https://open-vsx.org/api/-/publish", "channel": "open-vsx", "gate": "publish",
     "listable": "Yes", "note": "the publish endpoint itself"},

    # -- npm: reachable to read, and #130 found its website bot-challenged ---
    # If the website is the only place an account can be created, the registry
    # being reachable does not make the channel usable.
    {"url": "https://registry.npmjs.org/-/whoami", "channel": "npm", "gate": "publish",
     "listable": "Yes", "note": "publish/auth route on the registry host itself (npm publish PUTs here)"},
    {"url": "https://www.npmjs.com/signup", "channel": "npm", "gate": "register",
     "listable": "Yes", "note": "account creation -- #130 found this host Cloudflare-challenged"},

    # -- PyPI: the known counterexample, re-measured as a control -----------
    {"url": "https://pypi.org/simple/requests/", "channel": "pypi", "gate": "read",
     "listable": "Yes", "note": "in the noProxy allowlist; the install surface"},
    {"url": "https://pypi.org/account/register/", "channel": "pypi", "gate": "register",
     "listable": "Yes", "note": "account creation"},
    {"url": "https://upload.pypi.org/legacy/", "channel": "pypi", "gate": "publish",
     "listable": "Yes", "note": "#130 found this EGRESS_DENIED -- re-probed to confirm it holds"},

    # -- crates.io: #130 noted the publish route is on a reachable host, but
    # also that this establishes only that the host answers. Note the noProxy
    # entry is `index.crates.io` (read) and NOT `crates.io` (publish).
    {"url": "https://index.crates.io/config.json", "channel": "crates.io", "gate": "read",
     "listable": "Yes", "note": "sparse index -- the entry actually in the noProxy allowlist"},
    {"url": "https://crates.io/api/v1/crates/serde", "channel": "crates.io", "gate": "read",
     "listable": "Yes", "note": "web API host, distinct from the index"},
    {"url": "https://crates.io/settings/tokens", "channel": "crates.io", "gate": "register",
     "listable": "Yes", "note": "where a cargo publish token is issued"},
    {"url": "https://crates.io/api/v1/crates/new", "channel": "crates.io", "gate": "publish",
     "listable": "Yes", "note": "cargo publish PUTs here"},

    # -- the eight registries #130 newly found reachable, now tested on the
    # surface #130 explicitly said it had not tested for them.
    {"url": "https://rubygems.org/api/v1/gems/rails.json", "channel": "rubygems", "gate": "read",
     "listable": "Yes", "note": "#130: REACHABLE"},
    {"url": "https://rubygems.org/sign_up", "channel": "rubygems", "gate": "register",
     "listable": "Yes", "note": "account creation"},
    {"url": "https://rubygems.org/api/v1/gems", "channel": "rubygems", "gate": "publish",
     "listable": "Yes", "note": "gem push POSTs here"},

    {"url": "https://api.nuget.org/v3/index.json", "channel": "nuget", "gate": "read",
     "listable": "Yes", "note": "#130: REACHABLE"},
    {"url": "https://www.nuget.org/users/account/LogOn", "channel": "nuget", "gate": "register",
     "listable": "Yes", "note": "account/API-key surface, distinct host from api.nuget.org"},
    {"url": "https://www.nuget.org/api/v2/package", "channel": "nuget", "gate": "publish",
     "listable": "Yes", "note": "nuget push PUTs here"},

    {"url": "https://repo.packagist.org/p2/monolog/monolog.json", "channel": "packagist",
     "gate": "read", "listable": "Yes", "note": "#130: REACHABLE"},
    {"url": "https://packagist.org/register/", "channel": "packagist", "gate": "register",
     "listable": "Yes", "note": "account creation, distinct host from repo.packagist.org"},
    {"url": "https://packagist.org/api/create-package", "channel": "packagist", "gate": "publish",
     "listable": "Yes", "note": "package submission API"},

    {"url": "https://hex.pm/api/packages?search=json", "channel": "hex", "gate": "read",
     "listable": "Yes", "note": "#130: REACHABLE"},
    {"url": "https://hex.pm/signup", "channel": "hex", "gate": "register", "listable": "Yes",
     "note": "account creation"},
    {"url": "https://hex.pm/api/publish", "channel": "hex", "gate": "publish", "listable": "Yes",
     "note": "mix hex.publish POSTs here"},

    {"url": "https://hub.docker.com/v2/repositories/library/nginx/", "channel": "dockerhub",
     "gate": "read", "listable": "Yes", "note": "#130: REACHABLE"},
    {"url": "https://hub.docker.com/v2/users/login/", "channel": "dockerhub", "gate": "register",
     "listable": "Yes", "note": "auth surface"},
    {"url": "https://registry-1.docker.io/v2/", "channel": "dockerhub", "gate": "publish",
     "listable": "Yes", "note": "the registry docker push actually targets, NOT hub.docker.com"},

    {"url": "https://ghcr.io/v2/", "channel": "ghcr", "gate": "read", "listable": "Yes",
     "note": "#130: REACHABLE (401 from the origin's own auth)"},
    {"url": "https://ghcr.io/token?scope=repository:user/image:push", "channel": "ghcr",
     "gate": "publish", "listable": "Yes", "note": "push-scoped token endpoint"},

    # -- Go: the one channel where publishing needs no account at all -------
    # A Go module is "published" by tagging a public git repo and asking the
    # proxy to fetch it. Worth measuring precisely because it has no register
    # gate to fail.
    {"url": "https://proxy.golang.org/github.com/pkg/errors/@v/list", "channel": "go",
     "gate": "read", "listable": "Yes", "note": "in the noProxy allowlist verbatim"},
    {"url": "https://proxy.golang.org/github.com/pkg/errors/@latest", "channel": "go",
     "gate": "publish", "listable": "Yes",
     "note": "a module is published by the proxy fetching a tag; this is that trigger path"},

    # -- VS Code Marketplace: inventory says "Mostly" -----------------------
    {"url": "https://marketplace.visualstudio.com/items?itemName=ms-python.python",
     "channel": "vscode-marketplace", "gate": "read", "listable": "Mostly", "note": "listing page"},
    {"url": "https://marketplace.visualstudio.com/manage", "channel": "vscode-marketplace",
     "gate": "register", "listable": "Mostly", "note": "publisher management (Azure DevOps identity)"},

    # -- GitHub Marketplace free tier: inventory's other flagship "Yes" -----
    # channel-inventory.md maps cra-evidence-desk onto this and treats the
    # 100-install threshold as the go/no-go number.
    {"url": "https://github.com/marketplace/new", "channel": "github-marketplace",
     "gate": "register", "listable": "Yes", "note": "free listing creation surface"},
    {"url": "https://api.github.com/marketplace_listing/plans", "channel": "github-marketplace",
     "gate": "publish", "listable": "Yes", "note": "#130 reclassified this SCOPE_DENIED, not REACHABLE"},

    # -- the primary source channel-inventory.md could not read -------------
    # Its GitHub Marketplace free/paid split and 100-install minimum are taken
    # from search summaries because this host is blocked. Re-probed so the
    # caveat is either lifted or restated with evidence.
    {"url": "https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app",
     "channel": "_source-check", "gate": "read", "listable": "-",
     "note": "the primary requirements page #79 flagged as unreadable from this session"},
    {"url": "https://developer.wordpress.org/plugins/wordpress-org/", "channel": "_source-check",
     "gate": "read", "listable": "-", "note": "WP.org plugin handbook -- the other load-bearing primary source"},
]

USER_AGENT = os.environ.get(
    "PUBLISH_PROBE_UA",
    "monorepo-projects-publish-probe/1.0 (portfolio research; read-only)",
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


# Body markers, identical to PR #130's, including the fix it made to #126.
_EGRESS_MARKERS = ("not in allowlist",)
_SCOPE_MARKERS = (
    "is not enabled for this session",
    "add_repo",
    "github api path is not available",
    "sessions are bound to their configured repo",
)
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
            # The origin itself answered with an error. For a publish endpoint a
            # 401/403/405 is the *expected* good case: it proves the path exists
            # and only credentials are missing.
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


def rollup_by_channel(rows: list[dict]) -> dict[str, dict]:
    """The table that actually answers the question.

    A channel is `usable` only if every gate it needs is REACHABLE. `read`
    alone is explicitly not enough -- that conflation is what this run exists
    to correct.
    """
    chans: dict[str, dict] = {}
    for r in rows:
        if r["channel"].startswith("_"):
            continue
        c = chans.setdefault(r["channel"], {"listable_claim": r["listable"], "gates": {}})
        # Worst verdict wins per gate, so a channel with one denied publish
        # route is not rescued by a second reachable one.
        prev = c["gates"].get(r["gate"])
        if prev is None or _severity(r["verdict"]) > _severity(prev):
            c["gates"][r["gate"]] = r["verdict"]
    for c in chans.values():
        needed = [g for g in ("register", "publish") if g in c["gates"]]
        c["publishable"] = bool(needed) and all(c["gates"][g] == "REACHABLE" for g in needed)
        c["readable"] = c["gates"].get("read") == "REACHABLE"
    return chans


def _severity(verdict: str) -> int:
    return {"REACHABLE": 0, "BOT_CHALLENGED": 1, "SCOPE_DENIED": 2,
            "UNREACHABLE": 3, "EGRESS_DENIED": 4}.get(verdict, 0)


def summarise(rows: list[dict]) -> dict:
    by_verdict: dict[str, int] = {}
    by_gate: dict[str, dict[str, int]] = {}
    for r in rows:
        by_verdict[r["verdict"]] = by_verdict.get(r["verdict"], 0) + 1
        g = by_gate.setdefault(r["gate"], {})
        g[r["verdict"]] = g.get(r["verdict"], 0) + 1
    channels = rollup_by_channel(rows)
    return {
        "by_verdict": by_verdict,
        "by_gate": by_gate,
        "channels": channels,
        "n_channels": len(channels),
        "n_publishable": sum(1 for c in channels.values() if c["publishable"]),
        "n_readable": sum(1 for c in channels.values() if c["readable"]),
    }


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
              f"{row['gate']:<9} {row['channel']:<20} {row['host']}", file=sys.stderr)
        time.sleep(args.pace)

    summary = summarise(rows)
    payload = {
        "generated_by": "portfolio/research/publish-reachability/probe_publish_endpoints.py",
        "question": "Can this environment publish to the channels PR #79 marks agent-listable, "
                    "or only read from them?",
        "no_proxy_allowlist": sorted(direct),
        "n_targets": len(rows),
        "n_distinct_hosts": len({r["host"] for r in rows}),
        "summary": summary,
        "results": rows,
    }

    print("\n== verdict counts ==", file=sys.stderr)
    for k in sorted(summary["by_verdict"]):
        print(f"  {k:<15} {summary['by_verdict'][k]}", file=sys.stderr)
    print(f"\n== channels: {summary['n_readable']}/{summary['n_channels']} readable, "
          f"{summary['n_publishable']}/{summary['n_channels']} publishable ==", file=sys.stderr)
    for name in sorted(summary["channels"]):
        c = summary["channels"][name]
        gates = " ".join(f"{g}={v}" for g, v in sorted(c["gates"].items()))
        print(f"  {name:<20} claim={c['listable_claim']:<7} "
              f"publishable={str(c['publishable']):<5} {gates}", file=sys.stderr)

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
