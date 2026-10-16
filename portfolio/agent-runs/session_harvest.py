#!/usr/bin/env python3
"""Trace commits back to the Claude Code sessions that wrote them.

Two steps, because only an agent can read session transcripts (the
Claude Code Remote MCP tools `get_session` / `list_events` are not reachable
from a plain script):

1. extract   git log -> sessions.json: every session ID named in a commit
             trailer (claude.ai/code/session_..., Claude-Session: ...), with
             the commits it produced.
2. (agent)   for each ID, call get_session and list_events and write one JSON
             object per line to a harvest .jsonl file. See README.md.
3. report    harvest .jsonl -> a CSV and a Markdown summary.
             --public drops prompt and result text, keeping metadata only.

Usage:
  python3 session_harvest.py extract --repo . --out sessions.json
  python3 session_harvest.py report harvest.jsonl --csv runs.csv --md runs.md [--public]
"""
import argparse
import collections
import csv
import json
import re
import subprocess

SESSION_RE = re.compile(r"(?:session|cse)_[A-Za-z0-9]{20,}")


def extract(repo, out):
    log = subprocess.run(
        ["git", "-C", repo, "log", "--all", "--format=%x1e%H%x1f%aI%x1f%s%x1f%B"],
        capture_output=True, text=True, check=True).stdout
    sessions = {}
    for rec in log.split("\x1e")[1:]:
        sha, date, subject, body = rec.split("\x1f", 3)
        for sid in set(SESSION_RE.findall(body)):
            sid = "session_" + sid.split("_", 1)[1]  # cse_X and session_X are one ID
            e = sessions.setdefault(sid, {"session": sid, "commit_first": date,
                                          "commit_last": date, "commits": []})
            e["commit_first"] = min(e["commit_first"], date)
            e["commit_last"] = max(e["commit_last"], date)
            e["commits"].append({"sha": sha[:10], "date": date, "subject": subject[:160]})
    rows = sorted(sessions.values(), key=lambda e: e["commit_first"])
    with open(out, "w") as f:
        json.dump(rows, f, indent=1)
    print(f"{len(rows)} sessions, {rows[0]['commit_first'][:10]} .. {rows[-1]['commit_first'][:10]}"
          if rows else "0 sessions")


def report(harvest, csv_out, md_out, public):
    rows = [json.loads(line) for line in open(harvest) if line.strip()]
    fields = ["session", "commit_first", "status", "title", "routine", "origin", "created_at",
              "model", "cost_usd", "prompt_version", "prompt_source", "commits", "subjects"]
    if not public:
        fields += ["prompt", "result"]
    with open(csv_out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            r = dict(r)
            c = r.get("commits")
            r["commits"] = len(c) if isinstance(c, list) else c
            r["subjects"] = " | ".join(r.get("subjects") or [])
            if not public:
                res = r.get("results") or []
                last = res[-1] if res and isinstance(res[-1], dict) else {}
                r["result"] = last.get("result") or last.get("text") or ""
            w.writerow(r)

    found = [r for r in rows if r.get("status") == "found"]
    by_month = collections.defaultdict(lambda: [0, 0])
    for r in rows:
        by_month[(r.get("commit_first") or "?")[:7]][r.get("status") == "found"] += 1
    cost = sum(float(r.get("cost_usd") or 0) for r in found)
    by_title = collections.Counter(r.get("title") or "?" for r in found)
    by_version = collections.Counter(r.get("prompt_version") or "?" for r in found)
    lines = [
        f"# Agent runs traced from commit trailers",
        "",
        f"- Sessions named in commits: **{len(rows)}**",
        f"- Transcript still retrievable: **{len(found)}**",
        f"- Total recorded cost of retrievable runs: **${cost:,.2f}**"
        + (f" (mean ${cost / len(found):.2f})" if found else ""),
        "",
        "| Month (first commit) | not found | found |",
        "|---|---|---|",
    ] + [f"| {m} | {v[0]} | {v[1]} |" for m, v in sorted(by_month.items())] + [
        "",
        "| Retrievable runs by session title | count |",
        "|---|---|",
    ] + [f"| {t} | {n} |" for t, n in by_title.most_common()] + [
        "",
        "| Prompt version | runs |",
        "|---|---|",
    ] + [f"| {v} | {n} |" for v, n in sorted(by_version.items())]
    with open(md_out, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"{len(rows)} rows -> {csv_out}, {md_out}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract")
    e.add_argument("--repo", default=".")
    e.add_argument("--out", default="sessions.json")
    r = sub.add_parser("report")
    r.add_argument("harvest")
    r.add_argument("--csv", required=True)
    r.add_argument("--md", required=True)
    r.add_argument("--public", action="store_true", help="omit prompt and result text")
    a = p.parse_args()
    if a.cmd == "extract":
        extract(a.repo, a.out)
    else:
        report(a.harvest, a.csv, a.md, a.public)
