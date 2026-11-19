#!/usr/bin/env python3
"""Run the seven venture browser sweeps on the ventures a diff touches.

Between 2026-11-18 and 2026-11-19 four explore/polish runs wrote seven
browser sweeps in this directory (`check_*.js`, served by `sweep_server.js`)
and fixed what they found: 11 ventures that showed $Infinity, NaN or did
nothing on a click (PR #17507), 8 more "between 0 and Infinity" messages
(#17508), ten broken analyzers (#17493) and 13 pages that rendered visitor
text as HTML, 8 of them through a share link (#17657). No workflow, test or
runner called any of the seven afterwards (grep of .github/workflows and
platform/ on 2026-11-19), so the next page to regress would ship until a
run happened to sweep by hand again. This runs them where a venture changes.

    python3 platform/ci/venture_sweeps.py                    # ventures changed vs origin/main
    python3 platform/ci/venture_sweeps.py --since <ref>
    python3 platform/ci/venture_sweeps.py some-slug other-slug
    python3 platform/ci/venture_sweeps.py --sample 60 --seed 2026-11-19   # a reproducible random slice
    python3 platform/ci/venture_sweeps.py --json out.json ...

About 12 s for one venture with all seven sweeps (one browser per sweep, all
ventures in one pass). Exit 0 clean, 1 when a gating sweep reports a hit, 2
when nothing could be checked (no Playwright, no venture with an index.html).
`page_runtime` (any NaN/undefined in the loaded page's text, prose included)
is listed but never gates: its own header says to review it by eye.
`run_workflow_locally.py --for-changes` calls this before its sweep when the
diff touches a venture page (`--no-browser-sweeps` skips it).
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HERE = os.path.dirname(os.path.abspath(__file__))

# name -> gates; the script is check_<name>.js beside this file.
SWEEPS = {
    "html_injection": True,
    "blank_inputs": True,
    "input_edges": True,
    "button_clicks": True,
    "select_keys": True,
    "textarea_edges": True,
    "page_runtime": False,
}
SLUG = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
# A venture page is index.html at most two levels under ventures/<slug>/ (the sweeps' find -maxdepth 3).
PAGE_EXT = (".html", ".js", ".mjs", ".css")


def venture_of(path: str) -> str | None:
    """ventures/<slug>/... -> slug, for a file a page loads (html/js/mjs/css), else None."""
    parts = path.split("/")
    if len(parts) < 3 or parts[0] != "ventures" or not path.endswith(PAGE_EXT):
        return None
    if any(p in ("node_modules", "test", "tests", "eval") for p in parts[2:-1]):
        return None
    if parts[-1].endswith((".test.mjs", ".test.js")):
        return None
    return parts[1] if SLUG.match(parts[1]) else None


def has_page(slug: str, repo: str = REPO) -> bool:
    return os.path.isfile(os.path.join(repo, "ventures", slug, "index.html"))


def touched_ventures(changed, repo: str = REPO) -> list[str]:
    """Slugs of ventures whose page files the diff touches and that still have an index.html."""
    slugs = {s for s in (venture_of(p) for p in changed) if s}
    return sorted(s for s in slugs if has_page(s, repo))


def changed_since(base: str, repo: str = REPO) -> list[str]:
    """Files differing from `base` (committed, staged, unstaged and untracked)."""
    out = set()
    for cmd in (["git", "diff", "--name-only", f"{base}...HEAD"],
                ["git", "diff", "--name-only", "HEAD"],
                ["git", "ls-files", "--others", "--exclude-standard"]):
        done = subprocess.run(cmd, cwd=repo, capture_output=True, text=True)
        if done.returncode == 0:
            out.update(l for l in done.stdout.splitlines() if l)
        elif "..." in cmd[3]:
            # no merge base in a shallow clone: fall back to a two-dot diff
            two = subprocess.run(["git", "diff", "--name-only", base, "HEAD"], cwd=repo,
                                 capture_output=True, text=True)
            out.update(l for l in two.stdout.splitlines() if l)
    return sorted(out)


def playwright_ok() -> bool:
    if not shutil.which("node"):
        return False
    done = subprocess.run(["node", "-e", "require('playwright')"], cwd=REPO,
                          capture_output=True, text=True)
    return done.returncode == 0


def run_sweep(name: str, slugs, timeout: int, repo: str = REPO) -> dict:
    """Run check_<name>.js over the slugs; {'hits': [...], 'error': str|None, 'summary': str}."""
    script = os.path.join(HERE, f"check_{name}.js")
    fd, out = tempfile.mkstemp(prefix=f"sweep-{name}-", suffix=".json")
    os.close(fd)
    env = dict(os.environ, SWEEP_ROOT=" ".join(f"ventures/{s}" for s in slugs))
    try:
        done = subprocess.run(["node", script, out], cwd=repo, env=env, capture_output=True,
                              text=True, timeout=timeout)
        try:
            with open(out) as f:
                hits = json.load(f)
            if isinstance(hits, dict):  # check_html_injection.js writes {pages, ..., hits: [...]}
                hits = hits.get("hits", [])
        except (OSError, ValueError):
            return {"hits": [], "error": (done.stderr or done.stdout).strip()[-400:] or f"exit {done.returncode}, no output",
                    "summary": ""}
        lines = done.stdout.strip().splitlines()
        return {"hits": hits, "error": None, "summary": lines[-1] if lines else ""}
    except subprocess.TimeoutExpired:
        return {"hits": [], "error": f"timed out after {timeout} s", "summary": ""}
    finally:
        try:
            os.unlink(out)
        except OSError:
            pass


def hit_line(hit) -> str:
    if isinstance(hit, dict):
        page = hit.get("f") or hit.get("file") or hit.get("page") or ""
        rest = {k: v for k, v in hit.items() if k not in ("f", "file", "page")}
        return f"{page} {json.dumps(rest, ensure_ascii=False)[:240]}"
    return str(hit)[:300]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("slugs", nargs="*", help="venture slugs (default: those the diff touches)")
    ap.add_argument("--since", default="origin/main", help="base ref for the diff (default origin/main)")
    ap.add_argument("--sample", type=int, help="sweep N random ventures instead of the diff's")
    ap.add_argument("--seed", default="0", help="seed for --sample")
    ap.add_argument("--only", help="comma-separated subset of: " + ", ".join(SWEEPS))
    ap.add_argument("--max", type=int, default=25, help="cap on ventures swept (default 25)")
    ap.add_argument("--timeout", type=int, default=300, help="per-sweep timeout in seconds")
    ap.add_argument("--json", help="write every sweep's hits here")
    a = ap.parse_args(argv)

    if a.slugs:
        bad = [s for s in a.slugs if not SLUG.match(s) or not has_page(s)]
        if bad:
            print(f"no ventures/<slug>/index.html for: {', '.join(bad)}", file=sys.stderr)
            return 2
        slugs = sorted(set(a.slugs))
    elif a.sample:
        pool = sorted(s for s in os.listdir(os.path.join(REPO, "ventures")) if SLUG.match(s) and has_page(s))
        slugs = sorted(random.Random(a.seed).sample(pool, min(a.sample, len(pool))))
    else:
        slugs = touched_ventures(changed_since(a.since))
        if not slugs:
            print(f"venture_sweeps: the diff against {a.since} touches no venture page; nothing to sweep.")
            return 0
    if len(slugs) > a.max:
        print(f"venture_sweeps: {len(slugs)} ventures, sweeping the first {a.max} (--max raises it)")
        slugs = slugs[: a.max]

    names = list(SWEEPS)
    if a.only:
        names = [n.strip() for n in a.only.split(",") if n.strip()]
        unknown = [n for n in names if n not in SWEEPS]
        if unknown:
            print(f"unknown sweep(s): {', '.join(unknown)}", file=sys.stderr)
            return 2
    if not playwright_ok():
        print("venture_sweeps: Playwright is not importable from node here; nothing was swept "
              "(cloud sessions have it preinstalled; CI runners do not).")
        return 2

    print(f"venture_sweeps: {len(names)} sweep(s) over {len(slugs)} venture(s): {', '.join(slugs[:8])}"
          + (" ..." if len(slugs) > 8 else ""), flush=True)
    results, gating, errors = {}, 0, 0
    for name in names:
        r = run_sweep(name, slugs, a.timeout)
        results[name] = r
        gate = SWEEPS[name]
        if r["error"]:
            errors += 1
            print(f"  {name:15} ERROR {r['error']}", flush=True)
            continue
        tag = "" if gate else " (advisory, review by eye)"
        print(f"  {name:15} {len(r['hits'])} hit(s){tag}  [{r['summary']}]", flush=True)
        for h in r["hits"][:10]:
            print(f"      {hit_line(h)}")
        if len(r["hits"]) > 10:
            print(f"      ... and {len(r['hits']) - 10} more (--json for all)")
        if gate:
            gating += len(r["hits"])
    if a.json:
        with open(a.json, "w") as f:
            json.dump({"slugs": slugs, "results": results}, f, indent=1)
    if gating:
        print(f"venture_sweeps: {gating} hit(s) in gating sweeps. Each check_<name>.js header says what a hit means; "
              "SWEEP_ROOT=ventures/<slug> node platform/ci/check_<name>.js out.json reruns one.")
        return 1
    if errors == len(names):
        return 2
    print("venture_sweeps: clean" + (f" ({errors} sweep(s) errored, see above)" if errors else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
