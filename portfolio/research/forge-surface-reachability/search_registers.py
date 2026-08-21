#!/usr/bin/env python3
"""Does the newly-reachable GitLab search surface change a candidate's answer?

`register-change-rate/README.md` names its own weakest claim and the reason it
could not be fixed:

    The finding that no licensing, permitting, or safety register mirrors to git
    is the weakest claim here and is stated as "none found by hand" throughout.
    A real answer needs repository search, which is scope-denied from this
    session -- if that is ever granted, this probe takes a longer target list
    unchanged.

`probe_forges.py` found that repository search is *not* uniformly unavailable:
GitHub's is scope-denied, but GitLab.com's `/api/v4/projects?search=` answers
anonymously with no credential. That covers a different corpus, not the same
one, so it cannot fully settle the claim -- but it converts one third of it from
"none found by hand" into "none found by search", which is a different and
stronger statement.

This script runs that search across the three verticals `public-record-watch`
names, plus controls whose answer is known so a null result can be told apart
from a broken query.

Read-only, anonymous, no credential, no account, no spend.

    python3 search_registers.py --search -o register-search-YYYY-MM-DD.json
    python3 search_registers.py --recompute-from register-search-YYYY-MM-DD.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://gitlab.com/api/v4/projects"
PER_PAGE = 20
TIMEOUT_S = 30

# `vertical` matches public-record-watch's own three, plus `control`.
#
# The controls are the load-bearing part of this design. A search that returns
# nothing relevant is indistinguishable from a search that is silently broken,
# and the whole claim being tested is a negative one -- so the query set has to
# include terms whose *positive* answer is already known from
# register-change-rate's own target list.
QUERIES = [
    # public-office
    ("public-office", "legislators"),
    ("public-office", "officeholder"),
    ("public-office", "congress"),
    ("public-office", "parliament members"),
    ("public-office", "elected officials"),
    # sanctions
    ("sanctions", "sanctions list"),
    ("sanctions", "ofac"),
    ("sanctions", "opensanctions"),
    ("sanctions", "consolidated sanctions"),
    ("sanctions", "politically exposed persons"),
    # device-safety
    ("device-safety", "device recall"),
    ("device-safety", "medical device"),
    ("device-safety", "safety notice"),
    ("device-safety", "openfda"),
    ("device-safety", "product recall"),
    # licensing / permitting -- the class register-change-rate found nothing for
    ("licensing", "professional license"),
    ("licensing", "license board"),
    ("licensing", "permit register"),
    ("licensing", "licensee registry"),
    # controls: known-positive on the software-security vertical, which
    # register-change-rate *did* find mirrors for
    ("control", "known exploited vulnerabilities"),
    ("control", "advisory database"),
    ("control", "security advisories"),
]

# A hit only counts as a register mirror if its repository looks like published
# *data*, not tooling about the data. register-change-rate hit this same
# distinction (its `opensanctions` and `openfda` rows are controls precisely
# because they hold crawlers, not the register), so the same rule is applied
# here rather than counting raw search hits.
DATA_MARKERS = ("data", "dataset", "registry", "register", "list", "db", "database", "mirror", "dump", "archive")


def search(term: str, attempts: int = 3) -> dict:
    qs = urllib.parse.urlencode({
        "search": term,
        "per_page": PER_PAGE,
        "order_by": "last_activity_at",
        "visibility": "public",
    })
    req = urllib.request.Request(f"{API}?{qs}", headers={"User-Agent": "portfolio-research/forge-surface"})

    # The whole finding here is a *negative* one, so a term that silently
    # errored is worse than one that failed loudly: it looks exactly like a term
    # that found nothing. GitLab's anonymous search timed out on one term of 22
    # on the first run, which is enough to justify retrying rather than
    # recording a hole.
    body = status = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                body = json.loads(resp.read().decode("utf-8", "replace"))
                status = resp.status
            break
        except urllib.error.HTTPError as exc:
            return {"term": term, "error": f"HTTP {exc.code}", "projects": []}
        except Exception as exc:  # noqa: BLE001 - a probe reports failures
            if attempt == attempts - 1:
                return {"term": term, "error": f"{type(exc).__name__}: {exc}"[:200], "projects": []}
            time.sleep(2 * (attempt + 1))

    if not isinstance(body, list):
        return {"term": term, "error": f"unexpected payload: {str(body)[:150]}", "projects": []}

    projects = [{
        "path": p.get("path_with_namespace", ""),
        "name": p.get("name", ""),
        "description": (p.get("description") or "")[:300],
        "last_activity_at": (p.get("last_activity_at") or "")[:10],
        "stars": p.get("star_count", 0),
        "forks": p.get("forks_count", 0),
    } for p in body]
    return {"term": term, "status": status, "n": len(projects), "projects": projects}


def looks_like_data(project: dict) -> bool:
    hay = f"{project.get('path', '')} {project.get('name', '')} {project.get('description', '')}".lower()
    return any(m in hay for m in DATA_MARKERS)


def derive(payload: dict) -> dict:
    """Re-derive every reported claim from saved records. No network."""
    by_vertical: dict[str, dict] = {}
    for rec in payload.get("searches", []):
        vertical = rec.get("vertical", "?")
        slot = by_vertical.setdefault(vertical, {
            "vertical": vertical, "terms": 0, "hits": 0, "data_like": 0,
            "errors": 0, "examples": [],
        })
        slot["terms"] += 1
        if rec.get("error"):
            slot["errors"] += 1
            continue
        projects = rec.get("projects", [])
        slot["hits"] += len(projects)
        for p in projects:
            if looks_like_data(p):
                slot["data_like"] += 1
                if len(slot["examples"]) < 6:
                    slot["examples"].append({
                        "path": p["path"], "last": p["last_activity_at"],
                        "stars": p["stars"], "term": rec.get("term", ""),
                    })

    verticals = [by_vertical[k] for k in sorted(by_vertical)]
    controls = [v for v in verticals if v["vertical"] == "control"]
    candidate = [v for v in verticals if v["vertical"] != "control"]
    return {
        "measured_at": payload.get("measured_at", ""),
        "verticals": verticals,
        # If the controls found nothing either, the search itself is the
        # problem and no negative result below means anything.
        "control_found_something": bool(controls) and any(c["data_like"] > 0 for c in controls),
        "total_terms": sum(v["terms"] for v in verticals),
        "total_errors": sum(v["errors"] for v in verticals),
        "candidate_data_like": sum(v["data_like"] for v in candidate),
    }


def render(d: dict) -> str:
    out = []
    add = out.append
    add(f"GitLab.com public-project search for register mirrors — {d['measured_at']}")
    add("")
    add(f"  search terms .......... {d['total_terms']}")
    add(f"  errored ............... {d['total_errors']}")
    add(f"  control found data .... {d['control_found_something']}  (if False, nothing below is evidence)")
    add("")
    add(f"{'vertical':<18} {'terms':>6} {'hits':>6} {'data-like':>10}")
    add("-" * 44)
    for v in d["verticals"]:
        add(f"{v['vertical']:<18} {v['terms']:>6} {v['hits']:>6} {v['data_like']:>10}")
    add("")
    for v in d["verticals"]:
        if v["examples"]:
            add(f"{v['vertical']}:")
            for e in v["examples"]:
                add(f"  {e['path']:<52} last {e['last']}  ★{e['stars']}  ({e['term']})")
    return "\n".join(out)


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--search", action="store_true", help="query GitLab (needs network)")
    ap.add_argument("-o", "--json", help="write raw records here")
    ap.add_argument("--recompute-from", help="re-derive the tables from saved records, offline")
    ap.add_argument("--as-of", help="date stamp for the record (YYYY-MM-DD)")
    args = ap.parse_args(argv)

    if args.recompute_from:
        print(render(derive(json.loads(Path(args.recompute_from).read_text()))))
        return 0

    if not args.search:
        ap.error("pass --search to measure, or --recompute-from to re-derive offline")

    payload = {
        "measured_at": args.as_of or "",
        "method": (
            "Anonymous GET against https://gitlab.com/api/v4/projects?search=<term>, "
            "visibility=public, ordered by last activity, 20 per term. No credential, no "
            "account, read-only. Covers GitLab.com-hosted public projects only -- not GitHub, "
            "whose search surface is scope-denied from this session."
        ),
        "searches": [],
    }

    for vertical, term in QUERIES:
        print(f"… {vertical}: {term}", file=sys.stderr, flush=True)
        rec = search(term)
        rec["vertical"] = vertical
        payload["searches"].append(rec)
        if args.json:
            Path(args.json).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
        # Anonymous GitLab API traffic is rate-limited per IP. A read-only probe
        # should stay well inside that rather than discover the limit.
        time.sleep(1.0)

    if args.json:
        Path(args.json).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(render(derive(payload)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
