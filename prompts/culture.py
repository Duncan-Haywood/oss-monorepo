#!/usr/bin/env python3
"""Who is writing this organisation's culture, and is it drifting?

Measures, from files and git only (no GitHub API), the numbers behind
docs/reports/2026-10-21-engineering-culture-for-agents.md:

- how big the rulebook a run reads is, in total and per file, and how much of
  it is the owner's own quoted words rather than agents' prose about them;
- the mix of recorded runs by track (meta-work: process, review, redteam);
- how often runs record a deviation (the signal steering.md relies on);
- how many direct owner asks reach runs each day (non-routine starting messages);
- how many product usage readings came from anyone outside the fleet.

    python3 prompts/culture.py report [--history] [--json]

`--history` samples the rulebook size weekly from git (needs an unshallowed
clone: `git fetch --unshallow origin main`). Every figure is a count, not a
judgement; the report and post say what the counts mean and how sure they are.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent.parent
# The files every run reads or is routed through before task-specific reading.
RULEBOOK = ["CLAUDE.md", "AGENTS.md", "portfolio/DIRECTION.md", "PRODUCT_PLAYBOOK.md",
            "prompt.md", "prompts/goals.md", "prompts/steering.md"]
RUNBOOK_DIR = ".github/prompts"
META_TRACKS = ("process", "review", "redteam")
# A quoted span of 20+ characters inside a paragraph that mentions the owner.
QUOTE = re.compile(r'"((?:[^"\n]|\n(?!\s*\n)){20,1500}?)"')
ROUTINE = re.compile(r"prompt\.md", re.I)


def owner_quoted_bytes(text: str) -> int:
    """Bytes of quoted text in paragraphs that name the owner (an upper bound
    on the owner's verbatim words: a few quotes are of other people)."""
    total = 0
    for para in re.split(r"\n\s*\n", text):
        if re.search(r"owner", para, re.I):
            total += sum(len(m.encode()) for m in QUOTE.findall(para))
    return total


def rulebook_files(listing: Iterable[str]) -> list[str]:
    runbooks = sorted(p for p in listing if p.startswith(RUNBOOK_DIR + "/") and p.endswith(".md"))
    return RULEBOOK + runbooks


def measure_texts(texts: dict[str, str]) -> dict[str, Any]:
    per = {p: len(t.encode()) for p, t in texts.items() if t}
    quoted = sum(owner_quoted_bytes(t) for t in texts.values())
    total = sum(per.values())
    return {"files": len(per), "bytes": total, "owner_quoted_bytes": quoted,
            "owner_share": round(quoted / total, 3) if total else 0.0, "per_file": per}


def classify_input(text: str) -> str:
    """routine (a scheduled 'follow prompt.md'), scheduled (a scheduled brief),
    or ask (a person's direct request)."""
    t = (text or "").strip()
    if not t or (ROUTINE.search(t) and len(t) < 80):
        return "routine"
    if t.lower().startswith("scheduled") or "(scheduled)" in t.lower():
        return "scheduled"
    return "ask"


def runs_summary(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    tracks: Counter[str] = Counter()
    asks_by_day: Counter[str] = Counter()
    n = with_dev = 0
    for r in records:
        n += 1
        tracks[str(r.get("track"))] += 1
        if r.get("deviations"):
            with_dev += 1
        if classify_input(r.get("input") or "") == "ask":
            day = str(r.get("date") or r.get("started") or "")[:10]
            asks_by_day[day] += 1
    meta = sum(tracks[t] for t in META_TRACKS)
    return {"runs": n, "by_track": dict(tracks.most_common()),
            "meta_share": round(meta / n, 3) if n else 0.0,
            "deviation_rate": round(with_dev / n, 3) if n else 0.0,
            "owner_asks_by_day": dict(sorted(asks_by_day.items()))}


def outside_usage(usage: dict[str, Any]) -> dict[str, int]:
    """Readings with a non-null live visitor count: the only signal that
    cannot come from the fleet's own test runs."""
    products = usage.get("products") or []
    readings = [r for p in products for r in (p.get("readings") or [])]
    visitors = sum(1 for r in readings if (r.get("signals") or {}).get("live_url_visitors") is not None)
    return {"products": len(products), "readings": len(readings), "visitor_readings": visitors}


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout


def rulebook_now() -> dict[str, Any]:
    listing = [str(p.relative_to(ROOT)) for p in (ROOT / RUNBOOK_DIR).glob("*.md")]
    texts = {p: (ROOT / p).read_text() if (ROOT / p).exists() else "" for p in rulebook_files(listing)}
    return measure_texts(texts)


def rulebook_at(commit: str) -> dict[str, Any]:
    listing = _git("ls-tree", "-r", "--name-only", commit, RUNBOOK_DIR).split()
    texts = {p: _git("show", f"{commit}:{p}") for p in rulebook_files(listing)}
    return measure_texts(texts)


def history(ref: str = "origin/main", weeks: int = 12) -> list[dict[str, Any]]:
    rows = []
    for w in range(weeks, -1, -1):
        commit = _git("rev-list", "-1", "--first-parent", f"--before={w} weeks ago", ref).strip()
        if not commit:
            continue
        date = _git("show", "-s", "--format=%cs", commit).strip()
        m = rulebook_at(commit)
        if not m["bytes"] or (rows and rows[-1]["date"] == date):
            continue
        rows.append({"date": date, "bytes": m["bytes"], "files": m["files"],
                     "owner_share": m["owner_share"]})
    return rows


def load_records() -> list[dict[str, Any]]:
    out = []
    for f in sorted((ROOT / "prompts" / "runs").glob("*.json")):
        try:
            out.append(json.loads(f.read_text()))
        except (OSError, ValueError):
            continue
    return out


def load_usage() -> dict[str, Any]:
    path = ROOT / "portfolio" / "usage" / "usage.yaml"
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError:
        return {}
    return yaml.safe_load(path.read_text()) if path.exists() else {}


def report(with_history: bool) -> dict[str, Any]:
    out: dict[str, Any] = {"rulebook": rulebook_now(), "runs": runs_summary(load_records()),
                           "usage": outside_usage(load_usage())}
    if with_history:
        out["history"] = history()
    return out


def print_report(r: dict[str, Any]) -> None:
    rb, runs, use = r["rulebook"], r["runs"], r["usage"]
    print("# Culture report (prompts/culture.py)\n")
    print(f"Rulebook: {rb['bytes']:,} bytes in {rb['files']} files; "
          f"owner's quoted words {rb['owner_quoted_bytes']:,} bytes ({rb['owner_share']:.0%}).")
    for p, b in sorted(rb["per_file"].items(), key=lambda kv: -kv[1]):
        print(f"  {b:>7,}  {p}")
    print(f"\nRuns recorded: {runs['runs']:,}; meta tracks ({', '.join(META_TRACKS)}) "
          f"{runs['meta_share']:.0%}; runs recording a deviation {runs['deviation_rate']:.0%}.")
    print("By track: " + ", ".join(f"{k} {v}" for k, v in runs["by_track"].items()))
    print("Direct owner asks by day: " + ", ".join(f"{k} {v}" for k, v in runs["owner_asks_by_day"].items()))
    if use:
        print(f"\nUsage: {use['products']} products, {use['readings']} readings, "
              f"{use['visitor_readings']} with a live visitor count.")
    if "history" in r:
        print("\n| date | bytes | files | owner's words |\n|---|---:|---:|---:|")
        for h in r["history"]:
            print(f"| {h['date']} | {h['bytes']:,} | {h['files']} | {h['owner_share']:.0%} |")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    rp = sub.add_parser("report")
    rp.add_argument("--history", action="store_true")
    rp.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    r = report(a.history)
    if a.json:
        json.dump(r, sys.stdout, indent=2)
        print()
    else:
        print_report(r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
