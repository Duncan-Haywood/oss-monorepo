#!/usr/bin/env python3
"""Consolidate every egress-reachability measurement in portfolio/research/.

Eight independent probe passes in this directory each measured which hosts this
environment can reach. They used different schemas, different host sets, and in
three places they contradict each other. This script does three things:

  --ingest   normalise every sibling results-*.json into one (host, verdict,
             source) table, so the prior passes can be compared at all
  --probe    re-probe each distinct host once, live, with the methodology
             corrections the prior passes each discovered the hard way
  --report   diff the two and print what changed, what disagreed, and why

Read-only. Standard library only. No credentials, publishes nothing, registers
nothing, cannot spend money. `--report` runs with no network at all, from saved
data, which is how a reviewer checks the claim without re-running the probe.

Usage:
    python3 consolidate.py --ingest  -o prior-verdicts.json
    python3 consolidate.py --probe   -i prior-verdicts.json -o results-<date>.json
    python3 consolidate.py --report  -i prior-verdicts.json -r results-<date>.json
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from urllib.parse import urlsplit

RESEARCH_DIR = os.path.dirname(os.path.abspath(__file__))
PORTFOLIO_RESEARCH = os.path.dirname(RESEARCH_DIR)

UA = "monorepo-projects-research/1.0 (read-only egress reachability probe)"
TIMEOUT = 20

# Normalised verdicts. The three-way split is the whole measurement: two of
# these are facts about the network policy and one is a fact about this
# session's GitHub scoping, and prior passes conflated them.
REACHABLE = "reachable"          # the CONNECT completed; the origin answered something
EGRESS_DENIED = "egress_denied"  # the proxy refused the tunnel; the origin was never contacted
SCOPE_DENIED = "scope_denied"    # host reachable, but this session is not scoped to the data
ERROR = "error"                  # neither: DNS, TLS, timeout

# How each prior pass spelled its verdicts.
VERDICT_ALIASES = {
    "reachable": REACHABLE,
    "reached": REACHABLE,
    "origin_answered": REACHABLE,
    "egress_denied": EGRESS_DENIED,
    "egress-denied": EGRESS_DENIED,
    "proxy_denied": EGRESS_DENIED,
    "denied": EGRESS_DENIED,
    "unreachable": EGRESS_DENIED,
    "scope_denied": SCOPE_DENIED,
    "scope-denied": SCOPE_DENIED,
}

# This environment denies egress in TWO different ways, and they look nothing
# alike. Every prior pass knew about the first and at least three of them
# misread the second.
#
#   1. Out-of-band: the proxy refuses the CONNECT. curl reports exit 56 with
#      http_code 000; urllib raises URLError("Tunnel connection failed: 403").
#      No HTTP status ever comes back. This is the signature every prior pass
#      tested for.
#   2. In-band: the filter answers the request itself with a real HTTP 403
#      whose body is one of
#        "Host not in allowlist: <host>. Add this host to your network egress
#         settings to allow access."
#        'request blocked: no rule allows host "<host>"'
#
# The second is indistinguishable from an origin-side 403 by status code alone
# — and www.npmjs.com really does answer 403 (Cloudflare) while upload.pypi.org
# and jsr.io only appear to. The body is the only thing that separates them.
#
# Worse, which of the two a given host produces is not stable: api.wordpress.org
# and opencollective.com were observed alternating between (1) and (2) across
# consecutive attempts in the same session. So a probe that tests for only one
# signature does not merely mislabel a fixed set of hosts — it mislabels a
# different set on every run. That is enough on its own to explain part of the
# disagreement between the eight passes folded in here, and it is why every
# verdict that differs from the prior consensus is re-probed below.
TUNNEL_SIGNATURES = (
    "tunnel connection failed",
    "connect tunnel failed",
    "cannot connect to proxy",
    "connect_rejected",
    "host not in allowlist",
    "add this host to your network egress settings",
    "no rule allows host",
    "request blocked",
)

# GitHub answers, then refuses on scope. That is not a network denial.
SCOPE_SIGNATURES = (
    "not enabled for this session",
    "bound to their configured repositories",
    "sessions are bound to",
)


# --------------------------------------------------------------------------
# --ingest
# --------------------------------------------------------------------------

def _host(url: str) -> str:
    return urlsplit(url).hostname or ""


def _classify_note(note: str, status) -> str:
    low = (note or "").lower()
    if any(sig in low for sig in TUNNEL_SIGNATURES):
        return EGRESS_DENIED
    if any(sig in low for sig in SCOPE_SIGNATURES):
        return SCOPE_DENIED
    if isinstance(status, int) and status > 0:
        return REACHABLE
    return ERROR


def _records(blob):
    """Yield the per-target dicts out of whichever schema this pass used."""
    if isinstance(blob, list):
        yield from (r for r in blob if isinstance(r, dict))
        return
    if not isinstance(blob, dict):
        return
    for key in ("results", "targets", "probes", "records"):
        seq = blob.get(key)
        if isinstance(seq, list):
            yield from (r for r in seq if isinstance(r, dict))


# A record only counts as a probe if it carries a verdict or a status. Several
# results files also list advisory/package URLs as data; those are not probes
# and folding them in would swamp a host's verdict with records that never
# measured it.
PROBE_KEYS = ("verdict", "outcome", "result", "reached",
              "status", "http_status", "http_code")


def _normalise(rec: dict):
    """(host, verdict, url, detail) or None if this record is not a probe."""
    url = rec.get("url") or rec.get("endpoint") or ""
    if not url.startswith("http"):
        return None
    if not any(k in rec for k in PROBE_KEYS):
        return None
    host = _host(url)
    if not host:
        return None

    status = rec.get("status")
    if status is None:
        status = rec.get("http_status")
    if status is None:
        status = rec.get("http_code")

    raw = rec.get("verdict") or rec.get("outcome") or rec.get("result")
    verdict = VERDICT_ALIASES.get(str(raw).lower().strip()) if raw else None
    if raw and verdict is None and status is None and "reached" not in rec:
        # A verdict field about something other than reachability — e.g. the
        # CRA pass's true_positive/false_positive triage of advisories.
        return None

    if verdict is None and "reached" in rec:
        verdict = REACHABLE if rec["reached"] else None

    detail = str(rec.get("detail") or rec.get("note") or "")
    if verdict is None:
        verdict = _classify_note(detail, status)
    elif verdict == REACHABLE and any(s in detail.lower() for s in SCOPE_SIGNATURES):
        verdict = SCOPE_DENIED

    return host, verdict, url, detail


def ingest() -> dict:
    """Walk sibling research dirs and fold every probe into one host table."""
    by_host = defaultdict(lambda: {"urls": {}, "observations": []})
    files = []
    for dirpath, _dirnames, filenames in os.walk(PORTFOLIO_RESEARCH):
        if os.path.abspath(dirpath) == RESEARCH_DIR:
            continue  # our own outputs
        for name in sorted(filenames):
            if not name.endswith(".json"):
                continue
            if name.startswith("results") or "reachability" in name:
                files.append(os.path.join(dirpath, name))

    for path in sorted(files):
        rel = os.path.relpath(path, PORTFOLIO_RESEARCH)
        try:
            blob = json.load(open(path))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  skip {rel}: {exc}", file=sys.stderr)
            continue
        n = 0
        for rec in _records(blob):
            norm = _normalise(rec)
            if norm is None:
                continue
            host, verdict, url, detail = norm
            entry = by_host[host]
            entry["urls"][url] = entry["urls"].get(url, 0) + 1
            entry["observations"].append(
                {"source": rel, "verdict": verdict, "url": url, "detail": detail[:200]}
            )
            n += 1
        print(f"  {rel}: {n} probe records", file=sys.stderr)

    out = {}
    for host, entry in sorted(by_host.items()):
        verdicts = Counter(o["verdict"] for o in entry["observations"])
        # The most-probed URL is the representative one to re-probe.
        url = max(entry["urls"].items(), key=lambda kv: kv[1])[0]
        out[host] = {
            "probe_url": url,
            "prior_verdicts": dict(verdicts),
            "prior_consensus": verdicts.most_common(1)[0][0],
            "prior_disputed": len(verdicts) > 1,
            "sources": sorted({o["source"] for o in entry["observations"]}),
            "n_observations": len(entry["observations"]),
        }
    return {
        "ingested_from": sorted(os.path.relpath(f, PORTFOLIO_RESEARCH) for f in files),
        "n_source_files": len(files),
        "n_hosts": len(out),
        "hosts": out,
    }


# --------------------------------------------------------------------------
# --probe
# --------------------------------------------------------------------------

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect is an answer.

    An earlier pass followed redirects and recorded s3.amazonaws.com and
    gitlab.com as unreachable, because both answer with a redirect to a host
    that is itself denied. The redirect proves the first host was reachable.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _opener():
    ctx = ssl.create_default_context()
    bundle = os.environ.get("REQUESTS_CA_BUNDLE") or "/root/.ccr/ca-bundle.crt"
    if os.path.exists(bundle):
        try:
            ctx.load_verify_locations(bundle)
        except ssl.SSLError:
            pass
    return urllib.request.build_opener(
        _NoRedirect(), urllib.request.HTTPSHandler(context=ctx)
    )


def _verdict_from_body(body: str) -> str:
    """A status code alone cannot tell an origin answer from a denial here."""
    low = (body or "").lower()
    if any(sig in low for sig in TUNNEL_SIGNATURES):
        return EGRESS_DENIED
    if any(sig in low for sig in SCOPE_SIGNATURES):
        return SCOPE_DENIED
    return REACHABLE


def probe_host(host: str, url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with _opener().open(req, timeout=TIMEOUT) as resp:
            body = resp.read(2048).decode("utf-8", "replace")
            verdict = _verdict_from_body(body)
            return {"host": host, "url": url, "verdict": verdict,
                    "status": resp.status, "detail": f"HTTP {resp.status}"}
    except urllib.error.HTTPError as exc:
        # The origin answered. A 4xx here is the origin's own policy (auth,
        # user-agent, path) and is emphatically not an egress denial.
        body = ""
        try:
            body = exc.read(2048).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001 - body is best-effort context only
            pass
        verdict = _verdict_from_body(body)
        detail = (f"HTTP {exc.code} from origin" if verdict == REACHABLE
                  else f"HTTP {exc.code} in-band: {body.strip()[:120]}")
        return {"host": host, "url": url, "verdict": verdict,
                "status": exc.code, "detail": detail}
    except urllib.error.URLError as exc:
        reason = str(exc.reason)
        if any(sig in reason.lower() for sig in TUNNEL_SIGNATURES):
            return {"host": host, "url": url, "verdict": EGRESS_DENIED,
                    "status": 0, "detail": reason}
        return {"host": host, "url": url, "verdict": ERROR, "status": 0, "detail": reason}
    except Exception as exc:  # noqa: BLE001 - any other failure is not a verdict
        return {"host": host, "url": url, "verdict": ERROR, "status": 0,
                "detail": f"{type(exc).__name__}: {exc}"}


def proxy_status() -> dict:
    """The gateway's own view. `noProxy` hosts bypass the proxy entirely, so
    their reachability says nothing about the egress policy."""
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if not proxy:
        return {"available": False}
    try:
        req = urllib.request.Request(
            proxy.rstrip("/") + "/__agentproxy/status", headers={"User-Agent": UA}
        )
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
            req, timeout=10
        ) as resp:
            return {"available": True, "status": json.load(resp)}
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "error": f"{type(exc).__name__}: {exc}"}


def probe(prior: dict, stamp: str) -> dict:
    status = proxy_status()
    no_proxy = ""
    if status.get("available"):
        no_proxy = status["status"].get("noProxy", "")
    bypass = {h.strip().lstrip("*.") for h in no_proxy.split(",") if h.strip()}

    results = []
    hosts = prior["hosts"]
    for i, (host, meta) in enumerate(sorted(hosts.items()), 1):
        res = probe_host(host, meta["probe_url"])
        res["bypasses_proxy"] = host in bypass
        res["prior_consensus"] = meta["prior_consensus"]
        res["sources"] = meta["sources"]

        # Overturning a prior pass's verdict is the expensive kind of claim to
        # get wrong, and the denial signatures are not stable between attempts.
        # Re-probe anything that disagrees and record both attempts.
        if res["verdict"] != meta["prior_consensus"]:
            second = probe_host(host, meta["probe_url"])
            res["second_attempt"] = {"verdict": second["verdict"],
                                     "status": second["status"],
                                     "detail": second["detail"]}
            res["stable"] = second["verdict"] == res["verdict"]
            if not res["stable"]:
                # Denials are authoritative and reachability is not: one
                # observed denial means the host is not dependably usable.
                res["verdict"] = (EGRESS_DENIED
                                  if EGRESS_DENIED in (res["verdict"], second["verdict"])
                                  else res["verdict"])
                res["detail"] += f" | unstable, 2nd attempt: {second['detail'][:80]}"
        res["agrees_with_prior"] = res["verdict"] == meta["prior_consensus"]
        results.append(res)
        print(f"  [{i}/{len(hosts)}] {host}: {res['verdict']} ({res['detail'][:60]})",
              file=sys.stderr)

    return {
        "probed_at": stamp,
        "method": (
            "one HTTPS GET per host through this environment's egress proxy, "
            "redirects not followed, descriptive user-agent, 20s timeout. "
            "'egress_denied' means the proxy refused the CONNECT and the origin "
            "was never contacted; any HTTP status is an origin-side answer."
        ),
        "proxy": status,
        "n_hosts": len(results),
        "counts": dict(Counter(r["verdict"] for r in results)),
        "results": results,
    }


# --------------------------------------------------------------------------
# --report
# --------------------------------------------------------------------------

def report(prior: dict, fresh: dict) -> int:
    res = fresh["results"]
    counts = Counter(r["verdict"] for r in res)
    print(f"# Consolidated egress reachability — {fresh['probed_at']}\n")
    print(f"{fresh['n_hosts']} distinct hosts, folded from "
          f"{prior['n_source_files']} results files across "
          f"{len({s for m in prior['hosts'].values() for s in m['sources']})} "
          f"measurement passes.\n")
    for verdict in (REACHABLE, EGRESS_DENIED, SCOPE_DENIED, ERROR):
        if counts.get(verdict):
            print(f"  {verdict:<14} {counts[verdict]}")

    disputed = [h for h, m in prior["hosts"].items() if m["prior_disputed"]]
    print(f"\n## Hosts the prior passes disagreed about: {len(disputed)}\n")
    for host in sorted(disputed):
        meta = prior["hosts"][host]
        now = next((r for r in res if r["host"] == host), None)
        print(f"- `{host}` — prior: {meta['prior_verdicts']}; "
              f"now: {now['verdict'] if now else 'not probed'} "
              f"({', '.join(s.split('/')[0] for s in meta['sources'])})")

    changed = [r for r in res if not r["agrees_with_prior"]]
    print(f"\n## Hosts where this run disagrees with the prior consensus: "
          f"{len(changed)}\n")
    for r in sorted(changed, key=lambda r: r["host"]):
        print(f"- `{r['host']}` — was {r['prior_consensus']}, now {r['verdict']} "
              f"({r['detail'][:70]})")

    bypass = [r for r in res if r.get("bypasses_proxy")]
    print(f"\n## Hosts that bypass the proxy entirely (noProxy): {len(bypass)}\n")
    print("Their reachability is evidence about the toolchain allowlist, not "
          "about the egress policy, and should not be cited as either.\n")
    for r in sorted(bypass, key=lambda r: r["host"]):
        print(f"- `{r['host']}` — {r['verdict']}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ingest", action="store_true")
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("-i", "--prior", default=os.path.join(RESEARCH_DIR, "prior-verdicts.json"))
    ap.add_argument("-r", "--results")
    ap.add_argument("-o", "--out")
    ap.add_argument("--stamp", default="", help="date stamp to record in the output")
    args = ap.parse_args()

    if args.ingest:
        data = ingest()
        out = args.out or args.prior
        with open(out, "w") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"{data['n_hosts']} hosts from {data['n_source_files']} files -> {out}",
              file=sys.stderr)
        return 0

    prior = json.load(open(args.prior))

    if args.probe:
        data = probe(prior, args.stamp or "unstamped")
        out = args.out or os.path.join(RESEARCH_DIR, "results.json")
        with open(out, "w") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"{data['counts']} -> {out}", file=sys.stderr)
        return 0

    if args.report:
        if not args.results:
            ap.error("--report needs -r/--results")
        return report(prior, json.load(open(args.results)))

    ap.error("pick one of --ingest / --probe / --report")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
