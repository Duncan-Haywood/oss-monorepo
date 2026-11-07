#!/usr/bin/env python3
"""Ongoing doctrine review of the repository's Catholic fiction.

The judgment (reading a story against strict traditional Catholic doctrine)
is an agent's job, done by RUBRIC.md. The routine is this script's:

  status   coverage by shelf, verdicts, findings by level (Markdown)
  check    every review is well formed, names a real story, and quotes it
           verbatim; exits 1 otherwise (so a misquote never stands)
  next     the next unreviewed or stale stories to read, religious shelves
           first, then the densest religious content
  stale    reviews whose story has changed since it was reviewed

A review stores the story's sha256 at review time, so an edited story shows
up as stale instead of silently keeping an old verdict.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
REVIEWS = HERE / "reviews.yaml"
HH = ROOT / "ventures" / "hearth-and-horizon" / "stories"
SBC = ROOT / "ventures" / "saints-by-candlelight" / "episodes"

LEVELS = ("D", "M", "L", "P", "T")
VERDICTS = ("faithful", "minor", "concern", "error")
SHELF_ORDER = ("little-lamps", "saints-by-candlelight", "hearth-and-horizon", "for-other-minds")
# Terms that mark a story as carrying doctrinal weight, for ordering the queue.
DENSITY = re.compile(
    r"\b(mass|eucharist|communion|consecrat\w*|confess\w*|absol\w*|anoint\w*|baptis\w*|"
    r"bless\w*|priest\w*|deacon|bishop|sacrament\w*|angelus|rosary|hail mary|our father|"
    r"purgatory|heaven|hell|soul\w*|grace|miracle\w*|pray\w*|funeral|marri\w*|embryo\w*|saint)\b",
    re.I,
)


def shelf_of(rid: str, path: Path) -> str:
    if rid.startswith("saints-by-candlelight/"):
        return "saints-by-candlelight"
    m = re.search(r"^shelf:\s*(\S+)", path.read_text(encoding="utf-8"), re.M)
    return m.group(1) if m else "unknown"


def corpus(hh: Path = HH, sbc: Path = SBC) -> dict[str, Path]:
    """Every reviewable story, keyed by review id (venture/stem)."""
    out: dict[str, Path] = {}
    for p in sorted(hh.glob("*.md")):
        out[f"hearth-and-horizon/{p.stem}"] = p
    for p in sorted(sbc.glob("*.md")):
        out[f"saints-by-candlelight/{p.stem}"] = p
    return out


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def load(path: Path = REVIEWS) -> list[dict]:
    if not path.exists():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return data.get("reviews", [])


def norm(s: str) -> str:
    """Compare quotes modulo whitespace and curly quotes, nothing else."""
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip()


def check(reviews: list[dict], stories: dict[str, Path]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for r in reviews:
        rid = r.get("id", "?")
        if rid in seen:
            errors.append(f"{rid}: reviewed twice")
        seen.add(rid)
        if rid not in stories:
            errors.append(f"{rid}: no such story")
            continue
        if r.get("verdict") not in VERDICTS:
            errors.append(f"{rid}: verdict {r.get('verdict')!r} not in {VERDICTS}")
        for k in ("reviewed", "sha256", "batch"):
            if not r.get(k):
                errors.append(f"{rid}: missing {k}")
        text = norm(stories[rid].read_text(encoding="utf-8"))
        levels = []
        for f in r.get("findings") or []:
            if f.get("level") not in LEVELS:
                errors.append(f"{rid}: finding level {f.get('level')!r} not in {LEVELS}")
            levels.append(f.get("level"))
            q = norm(str(f.get("quote", "")))
            if not q or q not in text:
                errors.append(f"{rid}: quote not found verbatim: {str(f.get('quote'))[:60]!r}")
            for k in ("issue", "fix"):
                if not f.get(k):
                    errors.append(f"{rid}: finding missing {k}")
        want = expected_verdict(levels, r.get("verdict"))
        if want and want != r.get("verdict"):
            errors.append(f"{rid}: verdict {r.get('verdict')} but findings imply {want}")
    return errors


def expected_verdict(levels: list[str], given: str | None) -> str | None:
    """The rubric's floor: D/M findings mean at least concern, L/P at least minor.

    Concern versus error is a judgment, so either is accepted for D/M.
    """
    if any(lv in ("D", "M") for lv in levels):
        return given if given in ("concern", "error") else "concern"
    if any(lv in ("L", "P") for lv in levels):
        return "minor"
    return "faithful"


def stale(reviews: list[dict], stories: dict[str, Path]) -> list[str]:
    return [r["id"] for r in reviews if r.get("id") in stories and r.get("sha256") != digest(stories[r["id"]])]


def queue(reviews: list[dict], stories: dict[str, Path], n: int) -> list[tuple[str, str, int]]:
    done = {r["id"] for r in reviews} - set(stale(reviews, stories))
    rows = []
    for rid, p in stories.items():
        if rid in done:
            continue
        shelf = shelf_of(rid, p)
        rank = SHELF_ORDER.index(shelf) if shelf in SHELF_ORDER else len(SHELF_ORDER)
        rows.append((rank, -len(DENSITY.findall(p.read_text(encoding="utf-8"))), rid, shelf))
    rows.sort()
    return [(rid, shelf, -dens) for _, dens, rid, shelf in rows[:n]]


def status(reviews: list[dict], stories: dict[str, Path]) -> str:
    shelf_by_id = {rid: shelf_of(rid, p) for rid, p in stories.items()}
    shelves = Counter(shelf_by_id.values())
    by_id = {r["id"]: r for r in reviews}
    lines = ["| Shelf | Stories | Reviewed | faithful | minor | concern | error |", "|---|---:|---:|---:|---:|---:|---:|"]
    tot = Counter()
    for shelf in SHELF_ORDER:
        ids = [rid for rid, s in shelf_by_id.items() if s == shelf]
        v = Counter(by_id[i]["verdict"] for i in ids if i in by_id)
        row = [shelves[shelf], sum(v.values())] + [v[x] for x in VERDICTS]
        tot.update(dict(zip(["n", "r", *VERDICTS], row)))
        lines.append(f"| {shelf} | " + " | ".join(str(x) for x in row) + " |")
    lines.append("| **all** | " + " | ".join(str(tot[k]) for k in ["n", "r", *VERDICTS]) + " |")
    lv = Counter(f["level"] for r in reviews for f in r.get("findings") or [])
    lines += ["", "Findings by level: " + ", ".join(f"{k} {lv[k]}" for k in LEVELS)]
    st = stale(reviews, stories)
    lines.append(f"Stale reviews (story changed since): {len(st)}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    sub.add_parser("check")
    sub.add_parser("stale")
    nx = sub.add_parser("next")
    nx.add_argument("-n", type=int, default=20)
    sub.add_parser("digest").add_argument("ids", nargs="+")
    a = ap.parse_args(argv)
    stories, reviews = corpus(), load()
    if a.cmd == "status":
        print(status(reviews, stories))
    elif a.cmd == "check":
        errs = check(reviews, stories)
        for e in errs:
            print(e)
        print(f"{len(reviews)} reviews, {len(errs)} problems")
        return 1 if errs else 0
    elif a.cmd == "stale":
        print("\n".join(stale(reviews, stories)))
    elif a.cmd == "next":
        for rid, shelf, dens in queue(reviews, stories, a.n):
            print(f"{rid}\t{shelf}\t{dens}")
    elif a.cmd == "digest":
        for rid in a.ids:
            print(rid, digest(stories[rid]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
