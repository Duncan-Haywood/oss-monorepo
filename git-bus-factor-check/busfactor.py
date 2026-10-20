#!/usr/bin/env python3
"""git-bus-factor-check: who actually knows each part of this repository?

Reads `git log --numstat` (run locally, or piped in) and, per directory,
computes a recency-weighted ownership split, the bus factor (the fewest people
whose combined share reaches half of the weighted work) and whether the person
who owns it is still around. Zero dependencies, no network calls.

    python3 busfactor.py                      # analyse the repo in the cwd
    python3 busfactor.py path/to/repo --depth 3
    git log --no-merges --format='@@|%an|%ae|%at' --numstat | python3 busfactor.py --log -
    python3 busfactor.py --format json --fail-on-orphaned

classify.mjs is the same logic for the browser page; test_busfactor.py and
classify.test.mjs pin both to the same fixtures.
"""
import argparse
import json
import math
import re
import subprocess
import sys

LOG_FORMAT = "@@|%an|%ae|%at"
PER_FILE_CAP = 500  # lines; one giant generated commit must not own a directory
DAY = 86400
BOT = re.compile(r"\[bot\]|dependabot|renovate|github-actions|greenkeeper", re.I)
NOISE = re.compile(
    r"(^|/)(node_modules|vendor|dist|build|\.git|third_party)/"
    r"|(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|"
    r"go\.sum|Gemfile\.lock|composer\.lock|uv\.lock)$"
    r"|\.min\.(js|css)$|\.map$"
)


def clean_path(raw):
    """Resolve git's rename notations to the new path."""
    p = raw.strip()
    m = re.match(r"^(.*)\{(.*) => (.*)\}(.*)$", p)
    if m:
        p = m.group(1) + m.group(3) + m.group(4)
        p = p.replace("//", "/")
    elif " => " in p:
        p = p.split(" => ")[-1]
    return p.strip('"')


def parse_log(text):
    commits = []
    cur = None
    for line in text.splitlines():
        if line.startswith("@@|"):
            parts = line.split("|")
            if len(parts) < 4:
                cur = None
                continue
            try:
                ts = int(parts[-1])
            except ValueError:
                cur = None
                continue
            email = parts[-2].strip().lower()
            name = "|".join(parts[1:-2]).strip() or email
            cur = {"name": name, "email": email, "ts": ts, "files": []}
            commits.append(cur)
        elif cur is not None and "\t" in line:
            bits = line.split("\t", 2)
            if len(bits) != 3:
                continue
            a, d, path = bits
            lines = (int(a) if a.isdigit() else 0) + (int(d) if d.isdigit() else 0)
            cur["files"].append((clean_path(path), max(lines, 1)))
    return commits


def dir_key(path, depth):
    segs = path.split("/")[:-1]
    return "/".join(segs[:depth]) if segs else "(root)"


def analyze(commits, depth=2, half_life_days=180, inactive_days=90, min_commits=3, now=None):
    commits = [c for c in commits if not BOT.search(c["name"] + " " + c["email"])]
    if not commits:
        return {"error": "no human commits found in the log"}
    now = now if now is not None else max(c["ts"] for c in commits)
    hl = half_life_days * DAY
    people, dirs = {}, {}
    for c in commits:
        p = people.setdefault(c["email"], {"name": c["name"], "last": 0, "first": c["ts"], "weight": 0.0, "commits": 0})
        if c["ts"] >= p["last"]:
            p["last"], p["name"] = c["ts"], c["name"]
        p["first"] = min(p["first"], c["ts"])
        p["commits"] += 1
        decay = 0.5 ** (max(now - c["ts"], 0) / hl)
        touched = set()
        for path, lines in c["files"]:
            if NOISE.search(path):
                continue
            w = min(lines, PER_FILE_CAP) * decay
            k = dir_key(path, depth)
            d = dirs.setdefault(k, {"w": {}, "commits": set(), "total": 0.0})
            d["w"][c["email"]] = d["w"].get(c["email"], 0.0) + w
            d["total"] += w
            touched.add(k)
            p["weight"] += w
        for k in touched:
            dirs[k]["commits"].add(id(c))

    def split(weights, total):
        ranked = sorted(weights.items(), key=lambda kv: (-kv[1], kv[0]))
        run, bf = 0.0, 0
        for _, w in ranked:
            run += w
            bf += 1
            if run >= total * 0.5:
                break
        return ranked, bf

    def is_active(email):
        return (now - people[email]["last"]) <= inactive_days * DAY

    out_dirs = []
    grand = sum(d["total"] for d in dirs.values()) or 1.0
    for k, d in dirs.items():
        if len(d["commits"]) < min_commits or d["total"] <= 0:
            continue
        ranked, bf = split(d["w"], d["total"])
        top, top_w = ranked[0]
        share = top_w / d["total"]
        if share >= 0.5 and not is_active(top):
            status = "orphaned"
        elif bf == 1 and share >= 0.8:
            status = "single-owner"
        else:
            status = "shared"
        backup = next((e for e, _ in ranked[1:] if is_active(e) and e != top), None)
        out_dirs.append({
            "dir": k,
            "busFactor": bf,
            "status": status,
            "owner": people[top]["name"],
            "ownerShare": round(share, 4),
            "ownerActive": is_active(top),
            "ownerDaysSilent": int((now - people[top]["last"]) // DAY),
            "backup": people[backup]["name"] if backup else None,
            "commits": len(d["commits"]),
            "weightShare": round(d["total"] / grand, 4),
        })
    rank = {"orphaned": 0, "single-owner": 1, "shared": 2}
    out_dirs.sort(key=lambda r: (rank[r["status"]], -r["weightShare"], r["dir"]))
    all_w = {e: p["weight"] for e, p in people.items() if p["weight"] > 0}
    _, repo_bf = split(all_w, sum(all_w.values())) if all_w else (None, 0)
    active = sum(1 for e in people if is_active(e))
    return {
        "commits": len(commits),
        "contributors": len(people),
        "activeContributors": active,
        "repoBusFactor": repo_bf,
        "directories": out_dirs,
        "orphaned": sum(1 for r in out_dirs if r["status"] == "orphaned"),
        "singleOwner": sum(1 for r in out_dirs if r["status"] == "single-owner"),
    }


def summary_line(r):
    if "error" in r:
        return r["error"]
    return (f"Repo bus factor {r['repoBusFactor']} ({r['activeContributors']} of {r['contributors']} "
            f"contributors active); {r['orphaned']} orphaned and {r['singleOwner']} single-owner "
            f"of {len(r['directories'])} directories.")


def render_text(r):
    if "error" in r:
        return r["error"]
    lines = [summary_line(r), ""]
    for d in r["directories"]:
        if d["status"] == "shared":
            continue
        who = f"{d['owner']} ({round(d['ownerShare'] * 100)}%)"
        tail = f"silent {d['ownerDaysSilent']}d" if d["status"] == "orphaned" else "active"
        pair = f"; pair with {d['backup']}" if d["backup"] else "; nobody else active here yet"
        lines.append(f"{d['status'].upper():<13} {d['dir']:<32} {who} {tail}{pair}")
    if len(lines) == 2:
        lines.append("No orphaned or single-owner directories at this threshold.")
    lines.append("")
    lines.append("Heuristic from commit history, not a measure of who understands the code. No warranty.")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("repo", nargs="?", default=".")
    ap.add_argument("--log", help="read a git log from this file, or - for stdin, instead of running git")
    ap.add_argument("--since", default="2.years")
    ap.add_argument("--depth", type=int, default=2)
    ap.add_argument("--half-life", type=int, default=180, help="days until a change counts half")
    ap.add_argument("--inactive-days", type=int, default=90)
    ap.add_argument("--min-commits", type=int, default=3)
    ap.add_argument("--now", type=int, help="unix time to measure from (default: newest commit)")
    ap.add_argument("--format", choices=["text", "json"], default="text")
    ap.add_argument("--fail-on-orphaned", action="store_true", help="exit 2 if any directory is orphaned")
    a = ap.parse_args(argv)
    if a.log:
        text = sys.stdin.read() if a.log == "-" else open(a.log, encoding="utf-8", errors="replace").read()
    else:
        try:
            text = subprocess.run(
                ["git", "-C", a.repo, "log", "--no-merges", f"--since={a.since}",
                 f"--format={LOG_FORMAT}", "--numstat"],
                check=True, capture_output=True, text=True, errors="replace").stdout
        except (OSError, subprocess.CalledProcessError) as e:
            print(f"could not run git log: {e}", file=sys.stderr)
            return 1
    r = analyze(parse_log(text), a.depth, a.half_life, a.inactive_days, a.min_commits, a.now)
    print(json.dumps(r, indent=2) if a.format == "json" else render_text(r))
    if "error" in r:
        return 1
    return 2 if a.fail_on_orphaned and r["orphaned"] else 0


if __name__ == "__main__":
    sys.exit(main())
