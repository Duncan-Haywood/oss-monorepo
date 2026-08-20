#!/usr/bin/env python3
"""Probe whether the *demand measurement* PR #137's "Ask 0" promises is
readable from this environment.

#137 established which channels this environment can *publish* to. It did not
establish whether the number those channels are supposed to produce -- the
install/download count -- can be read back. Ask 0 says a registry account is
"sufficient for a free artifact to be published and its installs counted". This
probe tests the second half.

It also probes a channel class prior runs did not enumerate: channels whose
publication route is a git repository or a pull request rather than a
marketplace upload form.

Read-only GETs against public, documented endpoints, for packages this
portfolio does not own. No credentials are sent to any third party. Nothing is
published, registered, or uploaded.

Verdicts reuse #126/#130/#137's vocabulary so all four result sets read side by
side:

  REACHABLE       the host answered
  EGRESS_DENIED   the agent proxy refused to tunnel to this host
  BOT_CHALLENGED  a bot interstitial was served to a non-browser client
  SCOPE_DENIED    the host answered but this session's credentials cannot reach
                  the resource
  UNREACHABLE     DNS/TLS/connection failure that is not one of the above
  HTTP_<n>        the host answered with an unexpected status

Usage:
  python3 probe_demand_signals.py --out results.json
  python3 probe_demand_signals.py --recompute-from results.json   # no network
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

UA = "monorepo-projects-research/1.0 (read-only reachability probe; no credentials sent)"
TIMEOUT = 25
PACE_SECONDS = 1.0
ATTEMPTS = 2
READ_LIMIT = 4_000_000
CA_BUNDLE = "/root/.ccr/ca-bundle.crt"

# gate: which question about a channel this target answers.
#   publish  - can an artifact be uploaded (re-probed from #137 as a control)
#   stats    - can the resulting install/download count be read back
#   store    - can the channel's storefront be read at all
GATE_PUBLISH = "publish"
GATE_STATS = "stats"
GATE_STORE = "store"

# `public_count` records, independently of any measurement, whether the channel
# publishes a per-artifact install/download number to the public at all. It is a
# property of the channel, not of this environment, and it is stated here so
# that "no number" is never inferred from a failed probe when the real reason is
# that the number does not exist.
#
# (channel, gate, url, json path to the count, public_count, note)
TARGETS: list[tuple[str, str, str, list | None, bool | None, str]] = [
    # ---- the eight channels #137 Finding 2 found publishable end-to-end ----
    ("crates.io", GATE_PUBLISH, "https://index.crates.io/se/rd/serde", None, None,
     "sparse index; in NO_PROXY, direct"),
    ("crates.io", GATE_STATS, "https://crates.io/api/v1/crates/serde",
     ["crate", "downloads"], True, "public per-crate download total"),
    ("rubygems", GATE_PUBLISH, "https://rubygems.org/api/v1/gems.json", None, None,
     "publish/whoami route; 401 means the host answers"),
    ("rubygems", GATE_STATS, "https://rubygems.org/api/v1/gems/rails.json",
     ["downloads"], True, "public per-gem download total"),
    ("rubygems", GATE_STATS, "https://rubygems.org/api/v1/downloads/rails-8.1.3.1.json",
     ["total_downloads"], True, "per-version endpoint"),
    ("nuget", GATE_PUBLISH, "https://api.nuget.org/v3/index.json", None, None,
     "service index; names the search/stats host"),
    ("nuget", GATE_STATS, "https://azuresearch-usnc.nuget.org/query?q=packageid:newtonsoft.json",
     ["data", 0, "totalDownloads"], True,
     "the only public download-count surface NuGet exposes"),
    ("packagist", GATE_PUBLISH, "https://repo.packagist.org/p2/monolog/monolog.json", None, None,
     "metadata mirror; carries no counts"),
    ("packagist", GATE_STATS, "https://packagist.org/packages/monolog/monolog.json",
     ["package", "downloads", "total"], True, "public per-package download total"),
    ("hex", GATE_PUBLISH, "https://hex.pm/api/packages?search=phoenix", None, None,
     "API root the publish route sits on"),
    ("hex", GATE_STATS, "https://hex.pm/api/packages/phoenix",
     ["downloads", "all"], True, "public per-package download total"),
    ("dockerhub", GATE_PUBLISH, "https://hub.docker.com/v2/", None, None,
     "API root; 404 on the bare path still means the host answers"),
    ("dockerhub", GATE_STATS, "https://hub.docker.com/v2/repositories/library/alpine/",
     ["pull_count"], True, "public pull count"),
    ("ghcr", GATE_PUBLISH, "https://ghcr.io/v2/", None, None,
     "registry root; 401 means the host answers"),
    ("ghcr", GATE_STATS, None, None, False,
     "GitHub Packages exposes no public per-image pull count. Not probed because "
     "there is no endpoint to probe -- the gate fails on the channel, not on this "
     "environment"),
    ("go-proxy", GATE_PUBLISH, "https://proxy.golang.org/github.com/gorilla/mux/@v/list",
     None, None, "publication == tagging a public repo; no account needed"),
    ("go-proxy", GATE_STATS, "https://index.golang.org/index?limit=1", None, False,
     "the module index publishes new-version events, not download counts. Probed "
     "to confirm the host answers and that what it returns carries no count"),

    # ---- channel class prior runs did not enumerate: git/PR-based publication ----
    ("homebrew", GATE_STATS, "https://formulae.brew.sh/api/analytics/install/30d.json",
     None, True, "public install analytics -- homebrew-core only, not third-party taps"),
    ("homebrew", GATE_STORE, "https://formulae.brew.sh/api/formula.json", None, None,
     "the searchable catalogue"),
    ("raycast", GATE_STORE, "https://www.raycast.com/store", None, True,
     "storefront shows per-extension install counts; buyer is a knowledge worker, "
     "not a developer"),
    ("obsidian", GATE_STORE, "https://obsidian.md/plugins", None, True,
     "storefront shows per-plugin download counts; buyer is a knowledge worker, "
     "many on commercial licences"),
    ("zed", GATE_STORE, "https://zed.dev/extensions", None, True, "storefront"),
    ("github-git", GATE_PUBLISH, "https://api.github.com/", None, None,
     "the API host every git/PR-based channel is published through"),
    ("github-git", GATE_PUBLISH, "https://raw.githubusercontent.com/robots.txt", None, None,
     "raw file host these channels' catalogues are served from. A bare non-repo "
     "path, deliberately: this session is scoped to one repository and does not "
     "read others"),
    ("github-git", GATE_PUBLISH, "https://codeload.github.com/robots.txt", None, None,
     "tarball host the module/tap fetchers use. Same bare non-repo path"),

    # ---- controls, so this run's classifier can be compared to #137's ----
    ("control-reachable", "control", "https://pypi.org/pypi/requests/json",
     ["info", "version"], None, "known REACHABLE in #130/#137"),
    ("control-denied", "control", "https://wordpress.org/plugins/", None, None,
     "known EGRESS_DENIED in #137"),
]


def fetch(url: str) -> tuple[int | None, bytes, dict]:
    last: tuple[int | None, bytes, dict] = (None, b"no attempt", {})
    for attempt in range(ATTEMPTS):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            ctx = ssl.create_default_context()
            if os.path.exists(CA_BUNDLE):
                ctx.load_verify_locations(CA_BUNDLE)
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
                return r.status, r.read(READ_LIMIT), dict(r.headers)
        except urllib.error.HTTPError as e:
            return e.code, e.read(8000), dict(e.headers)
        except Exception as e:  # noqa: BLE001
            last = (None, f"{type(e).__name__}: {e}".encode(), {})
            if attempt + 1 < ATTEMPTS:
                time.sleep(2.0)
    return last


def verdict(status: int | None, body: bytes) -> str:
    text = body[:4000].decode("utf-8", "replace")
    low = text.lower()
    # #126's classifier, kept verbatim: the GitHub gateway answers for hosts it
    # permits but refuses resources outside this session's configured
    # repositories. That is a credential-scope refusal, not a network one.
    if "sessions are bound to their configured repositories" in low:
        return "SCOPE_DENIED"
    if status is None:
        # The agent proxy refuses a disallowed host at CONNECT time, which
        # surfaces as a tunnel error rather than an HTTP response. That is the
        # same signature the known-denied control produces, which is why this
        # is classified as EGRESS_DENIED rather than UNREACHABLE.
        if "tunnel connection failed: 403" in low or "tunnel connection failed: 407" in low:
            return "EGRESS_DENIED"
        return "UNREACHABLE"
    if "just a moment" in low or "cf-browser-verification" in low or "attention required" in low:
        return "BOT_CHALLENGED"
    if status in (403, 407) and ("agentproxy" in low or "proxy" in low and "denied" in low):
        return "EGRESS_DENIED"
    if 200 <= status < 400:
        return "REACHABLE"
    if status == 401:
        # Host answered and asked for credentials: the network path works.
        return "REACHABLE"
    return f"HTTP_{status}"


def dig(obj, path):
    cur = obj
    for k in path:
        cur = cur[k]
    return cur


def summarize(rows: list[dict]) -> dict:
    by_channel: dict[str, dict] = {}
    for r in rows:
        if r["gate"] == "control":
            continue
        c = by_channel.setdefault(r["channel"], {
            "publish": None, "stats": None, "store": None,
            "channel_publishes_a_count": None, "count_read": None,
        })
        gate = r["gate"]
        # a channel's gate passes if any probed surface for it answered
        if c.get(gate) != "REACHABLE":
            c[gate] = r["verdict"]
        if r.get("public_count") is not None and c["channel_publishes_a_count"] is not True:
            c["channel_publishes_a_count"] = r["public_count"]
        if r.get("count_value") is not None and c["count_read"] is None:
            c["count_read"] = r["count_value"]

    # The question Ask 0 turns on: a channel is usable for a demand measurement
    # only if an artifact can be uploaded to it AND the resulting number can be
    # read back from here. Both, or the measurement does not happen.
    countable, no_count_exists, count_blocked = [], [], []
    for name, v in by_channel.items():
        if v["count_read"] is not None:
            countable.append(name)
        elif v["channel_publishes_a_count"] is False:
            no_count_exists.append(name)
        else:
            count_blocked.append(name)
    return {
        "by_channel": by_channel,
        "count_readable_from_here": sorted(countable),
        "channel_publishes_no_count_at_all": sorted(no_count_exists),
        "count_exists_but_is_not_readable_from_here": sorted(count_blocked),
    }


def run(out_path: str) -> None:
    rows = []
    for channel, gate, url, path, public_count, note in TARGETS:
        if url is None:
            # No endpoint exists to probe. Recorded rather than omitted so the
            # gate failure is attributed to the channel, not to this network.
            rows.append({
                "channel": channel, "gate": gate, "url": None, "note": note,
                "http_status": None, "verdict": "NO_SUCH_SURFACE",
                "count_field": None, "count_value": None, "parse_error": None,
                "public_count": public_count, "bytes": 0, "snippet": "",
            })
            print(f"{channel:18s} {gate:8s} {'-':5s} {'NO_SUCH_SURFACE':15s} count=None")
            continue
        status, body, headers = fetch(url)
        v = verdict(status, body)
        count, parse_err = None, None
        if v == "REACHABLE" and path:
            try:
                count = dig(json.loads(body.decode("utf-8", "replace")), path)
            except Exception as e:  # noqa: BLE001
                parse_err = f"{type(e).__name__}: {e}"
        rows.append({
            "channel": channel, "gate": gate, "url": url, "note": note,
            "http_status": status, "verdict": v,
            "count_field": ".".join(str(p) for p in path) if path else None,
            "count_value": count, "parse_error": parse_err,
            "public_count": public_count,
            "bytes": len(body),
            "snippet": body[:220].decode("utf-8", "replace").replace("\n", " "),
        })
        print(f"{channel:18s} {gate:8s} {str(status):5s} {v:15s} count={count}")
        sys.stdout.flush()
        time.sleep(PACE_SECONDS)
    payload = {"targets": len(rows), "results": rows, "summary": summarize(rows)}
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(json.dumps(payload["summary"], indent=2))


def recompute(path: str) -> None:
    with open(path) as f:
        payload = json.load(f)
    print(json.dumps(summarize(payload["results"]), indent=2))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="results.json")
    ap.add_argument("--recompute-from")
    a = ap.parse_args()
    if a.recompute_from:
        recompute(a.recompute_from)
    else:
        run(a.out)


if __name__ == "__main__":
    main()
