#!/usr/bin/env python3
"""Measure whether Ask 0's five registries are interchangeable as a demand probe.

Issue #139 presents Ask 0 as "one account signup on crates.io, RubyGems,
Packagist, Hex, **or** Docker Hub" -- five options, any one of which buys "the
demand measurement five cycles have asked for." That framing treats the five as
interchangeable. This script tests that.

A registry produces a demand number for a candidate only if the candidate's
buyer searches that registry AND this portfolio can publish where those
searchers land. So for each registry we measure, read-only:

  1. ECOSYSTEM PRESENCE -- how many packages matching the candidate's search
     terms already exist there. A registry where the category is empty cannot
     tell you whether the category has demand; a listing there is not found
     because nobody looks, which is not the same finding as "nobody wants it."
  2. CATEGORY PRECISION -- of the top relevance-ranked results, how many are
     genuinely in the category. Registry search totals are fuzzy/OR-matched
     across terms, so the raw total from (1) overstates category size by orders
     of magnitude and must not be read as a count. Precision@10 is what makes
     (1) interpretable.
  3. TOP-RESULT PULL -- the download counts of the packages that do match, so
     the probe's power can be estimated before it is run rather than argued
     about after.
  4. NAMESPACE CONCENTRATION -- what share of the category's search visibility
     and download volume sits in a namespace an outside publisher cannot
     publish into. A registry whose category is real but closed is worse than
     one whose category is smaller and open, and raw totals hide exactly this.

Read-only public API calls, stdlib only, paced. No credentials are sent, no
account is created, nothing is published or registered.

Usage:
    python3 measure_audience_match.py                 # live measurement
    python3 measure_audience_match.py --out FILE      # write JSON results
    python3 measure_audience_match.py --recompute-from FILE   # offline, no network
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "monorepo-projects-portfolio-research/1.0 (read-only registry survey)"
TIMEOUT = 20
PACE_SECONDS = 1.0

# The search terms a buyer for candidate #3 (mcp-supply-chain-watch) would use,
# plus the broader agent-tooling category the pipeline's developer-audience
# candidates sit in. Kept identical across registries so counts are comparable.
QUERIES = ["mcp", "model context protocol", "agent tools"]

# Registries Ask 0 offers (issue #139, amended by #150), plus the two where the
# MCP ecosystem actually lives -- included as controls, NOT as proposals. Both
# are publish-blocked from this environment per #137; they are measured here
# only to establish what a populated category looks like.
REGISTRIES = {
    "crates.io": {
        "ask0": True,
        "language": "Rust",
        "search": lambda q: (
            "https://crates.io/api/v1/crates?q="
            + urllib.parse.quote(q)
            + "&per_page=20"
        ),
        "parse": lambda d: (
            d.get("meta", {}).get("total", 0),
            [
                {"name": c.get("name"), "downloads": c.get("downloads", 0)}
                for c in d.get("crates", [])[:10]
            ],
        ),
    },
    "rubygems.org": {
        "ask0": True,
        "language": "Ruby",
        "search": lambda q: (
            "https://rubygems.org/api/v1/search.json?query="
            + urllib.parse.quote(q)
        ),
        # RubyGems' search endpoint returns a bare list with no total; the
        # length of the first page is a floor, recorded as such.
        "parse": lambda d: (
            len(d) if isinstance(d, list) else 0,
            [
                {"name": g.get("name"), "downloads": g.get("downloads", 0)}
                for g in (d if isinstance(d, list) else [])[:10]
            ],
        ),
    },
    "packagist.org": {
        "ask0": True,
        "language": "PHP",
        "search": lambda q: (
            "https://packagist.org/search.json?q=" + urllib.parse.quote(q)
        ),
        "parse": lambda d: (
            d.get("total", 0),
            [
                {"name": p.get("name"), "downloads": p.get("downloads", 0)}
                for p in d.get("results", [])[:10]
            ],
        ),
    },
    "hex.pm": {
        "ask0": True,
        "language": "Elixir/Erlang",
        "search": lambda q: (
            "https://hex.pm/api/packages?search=" + urllib.parse.quote(q)
        ),
        # Hex returns a bare list with no total; page length is a floor.
        "parse": lambda d: (
            len(d) if isinstance(d, list) else 0,
            [
                {
                    "name": p.get("name"),
                    "downloads": (p.get("downloads") or {}).get("all", 0),
                }
                for p in (d if isinstance(d, list) else [])[:10]
            ],
        ),
    },
    "hub.docker.com": {
        "ask0": True,
        "language": "any (container)",
        "search": lambda q: (
            "https://hub.docker.com/v2/search/repositories/?query="
            + urllib.parse.quote(q)
            + "&page_size=20"
        ),
        "parse": lambda d: (
            d.get("count", 0),
            [
                {
                    "name": r.get("repo_name"),
                    "downloads": r.get("pull_count", 0),
                }
                for r in d.get("results", [])[:10]
            ],
        ),
    },
    "registry.npmjs.org": {
        "ask0": False,  # control: publish-blocked per #137
        "language": "JavaScript",
        "search": lambda q: (
            "https://registry.npmjs.org/-/v1/search?text="
            + urllib.parse.quote(q)
            + "&size=20"
        ),
        "parse": lambda d: (
            d.get("total", 0),
            [
                {
                    "name": o.get("package", {}).get("name"),
                    "downloads": None,  # npm search carries no download count
                }
                for o in d.get("objects", [])[:10]
            ],
        ),
    },
}


def fetch_json(url: str) -> tuple[str, object]:
    """Return (verdict, payload). Verdict is REACHABLE / EGRESS_DENIED / ERROR."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return "REACHABLE", json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # The egress proxy answers CONNECT-refused as 403 before the origin is
        # reached; a 403 from the origin itself is indistinguishable here, so
        # both are recorded under one verdict rather than guessed apart.
        if exc.code in (403, 407):
            return "EGRESS_DENIED", {"http_status": exc.code}
        return "ERROR", {"http_status": exc.code, "reason": str(exc.reason)}
    except Exception as exc:  # noqa: BLE001 - network survey, record and continue
        return "ERROR", {"reason": f"{type(exc).__name__}: {exc}"}


def in_category(name: str | None) -> bool:
    """Is this package plausibly an MCP-ecosystem package, by name alone?

    Deliberately generous and name-only: it under-counts packages that are MCP
    tooling without saying so in the name, and cannot see repository metadata.
    Used to establish that a registry's search *total* is fuzzy, not to score
    packages.
    """
    if not name:
        return False
    lowered = name.lower()
    tokens = set(lowered.replace("/", "-").replace("_", "-").replace("@", "").split("-"))
    return "mcp" in tokens or "mcp" in lowered.split("/")[-1][:4]


def measure_namespace_concentration(pages: int = 6, per_page: int = 25) -> dict:
    """Docker Hub only: split the top MCP results by publishable-vs-closed namespace.

    `mcp/` on Docker Hub is a single verified-publisher Organization (checked
    separately), so an outside publisher cannot publish into it. This measures
    how much of the category's visibility that namespace holds.
    """
    inside = outside = 0
    pulls_inside = pulls_outside = 0
    open_examples: list[dict] = []
    for page in range(1, pages + 1):
        url = (
            "https://hub.docker.com/v2/search/repositories/"
            f"?query=mcp&page_size={per_page}&page={page}"
        )
        verdict, payload = fetch_json(url)
        if verdict != "REACHABLE" or not isinstance(payload, dict):
            break
        for repo in payload.get("results", []):
            name = repo.get("repo_name", "") or ""
            pulls = repo.get("pull_count", 0) or 0
            if name.startswith("mcp/"):
                inside += 1
                pulls_inside += pulls
            else:
                outside += 1
                pulls_outside += pulls
                if len(open_examples) < 6:
                    open_examples.append({"name": name, "pulls": pulls})
        time.sleep(PACE_SECONDS * 2)
    total_pulls = pulls_inside + pulls_outside
    return {
        "registry": "hub.docker.com",
        "closed_namespace": "mcp/",
        "results_examined": inside + outside,
        "repos_in_closed_namespace": inside,
        "repos_in_open_namespaces": outside,
        "pulls_in_closed_namespace": pulls_inside,
        "pulls_in_open_namespaces": pulls_outside,
        "closed_share_of_pulls": (pulls_inside / total_pulls) if total_pulls else None,
        "open_namespace_examples": open_examples,
    }


def measure_docker_namespace_owner() -> dict:
    """Confirm `mcp/` is a single org rather than an open community prefix."""
    verdict, payload = fetch_json("https://hub.docker.com/v2/orgs/mcp/")
    repo_verdict, repo_payload = fetch_json(
        "https://hub.docker.com/v2/repositories/mcp/?page_size=1"
    )
    out = {"verdict": verdict}
    if verdict == "REACHABLE" and isinstance(payload, dict):
        out.update(
            {
                "orgname": payload.get("orgname"),
                "type": payload.get("type"),
                "badge": payload.get("badge"),
                "date_joined": payload.get("date_joined"),
            }
        )
    if repo_verdict == "REACHABLE" and isinstance(repo_payload, dict):
        out["repositories"] = repo_payload.get("count")
    return out


def measure() -> dict:
    rows = []
    for name, spec in REGISTRIES.items():
        for query in QUERIES:
            url = spec["search"](query)
            verdict, payload = fetch_json(url)
            total, top = (0, [])
            if verdict == "REACHABLE":
                try:
                    total, top = spec["parse"](payload)
                except Exception as exc:  # noqa: BLE001
                    verdict = "ERROR"
                    top = [{"parse_error": f"{type(exc).__name__}: {exc}"}]
            in_cat = sum(1 for t in top if in_category(t.get("name")))
            rows.append(
                {
                    "registry": name,
                    "offered_in_ask0": spec["ask0"],
                    "language": spec["language"],
                    "query": query,
                    "verdict": verdict,
                    "fuzzy_total": total,
                    "top_results": top,
                    "in_category_at_10": in_cat,
                    "examined_at_10": len(top),
                    "url": url,
                }
            )
            print(
                f"{name:>20}  {query:<24} {verdict:<14} "
                f"fuzzy_total={total:<8} in_category@10={in_cat}/{len(top)}",
                file=sys.stderr,
            )
            time.sleep(PACE_SECONDS)

    print("\nmeasuring Docker Hub namespace concentration...", file=sys.stderr)
    return {
        "queries": QUERIES,
        "rows": rows,
        "docker_namespace_owner": measure_docker_namespace_owner(),
        "docker_namespace_concentration": measure_namespace_concentration(),
    }


def summarise(data: dict) -> None:
    rows = data["rows"]
    print("\n=== Category presence, 'mcp' query ===")
    print("fuzzy_total is the registry's own search total. It is OR-matched across")
    print("terms and is NOT a category count -- read in_category@10 beside it.\n")
    print(f"{'registry':>20}  {'ask0':<5} {'fuzzy_total':>12}  {'in_category@10':>15}")
    for name in REGISTRIES:
        r = next((x for x in rows if x["registry"] == name and x["query"] == "mcp"), None)
        if not r:
            continue
        ask0 = "yes" if r["offered_in_ask0"] else "-"
        if r["verdict"] != "REACHABLE":
            print(f"{name:>20}  {ask0:<5} {r['verdict']:>12}")
            continue
        print(
            f"{name:>20}  {ask0:<5} {r['fuzzy_total']:>12,}  "
            f"{str(r['in_category_at_10']) + '/' + str(r['examined_at_10']):>15}"
        )

    print("\n=== Top-result pull, 'mcp' query ===")
    for name in REGISTRIES:
        r = next((x for x in rows if x["registry"] == name and x["query"] == "mcp"), None)
        if not r or r["verdict"] != "REACHABLE":
            continue
        dls = [t["downloads"] for t in r["top_results"] if t.get("downloads") is not None]
        if dls:
            dls_sorted = sorted(dls)
            median = dls_sorted[len(dls_sorted) // 2]
            print(f"{name:>20}  n={len(dls):<3} max={max(dls):<12,} median={median:,}")
        else:
            print(f"{name:>20}  no download counts exposed by this search API")

    owner = data.get("docker_namespace_owner") or {}
    conc = data.get("docker_namespace_concentration") or {}
    if owner or conc:
        print("\n=== Docker Hub: can an outside publisher reach these searchers? ===")
        if owner.get("verdict") == "REACHABLE":
            print(
                f"  namespace 'mcp/' is a {owner.get('type')} "
                f"(badge={owner.get('badge')}, joined={(owner.get('date_joined') or '')[:10]}, "
                f"repositories={owner.get('repositories')})"
            )
        share = conc.get("closed_share_of_pulls")
        if share is not None:
            print(
                f"  of the top {conc['results_examined']} relevance-ranked 'mcp' results: "
                f"{conc['repos_in_closed_namespace']} in the closed namespace, "
                f"{conc['repos_in_open_namespaces']} in open namespaces"
            )
            print(f"  closed namespace holds {share:.1%} of the pull volume in that set")
            for ex in conc.get("open_namespace_examples", []):
                print(f"    open-namespace example: {ex['name']} ({ex['pulls']:,} pulls)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", help="write JSON results to this path")
    ap.add_argument("--recompute-from", help="re-derive the summary offline from a results file")
    args = ap.parse_args()

    if args.recompute_from:
        with open(args.recompute_from, encoding="utf-8") as fh:
            data = json.load(fh)
        summarise(data)
        return 0

    data = measure()
    summarise(data)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"\nwrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
