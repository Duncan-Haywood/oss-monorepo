#!/usr/bin/env python3
"""What a run cost: tokens, models, time, API-equivalent dollars, human-equivalent dollars.

Reads the Claude Code session transcript(s) the run itself produced
(~/.claude/projects/*/<session id>.jsonl, plus any subagent transcripts under
<session id>/), so nothing is typed by hand except the human-hours estimate.

    python3 prompts/runcost.py measure [--session ID] [--since ISO] [--json]
    python3 prompts/runcost.py attach prompts/runs/<record>.json \\
        --human-hours 3 --human-basis "one engineer: read the scorer, write the CLI and tests"
    python3 prompts/runcost.py report [--json]

`attach` writes a `usage` block into the run record (and fills the record's
null tokens_in / tokens_out / cost_usd / wall_minutes / models_seen /
started / tool_calls). `report` aggregates every record that has one, by
model, track and prompt version. The certainty of each figure is stated in
the block itself; see prompts/README.md, "What a run cost".
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent
VERSION = 1
# A gap longer than this between two machine events (a tool finishing, the
# model answering) is a stall: a container sleeping, a lost connection. It is
# counted, not timed.
STALL_MINUTES = 30.0

CERTAINTY = {
    "tokens": "high: summed from the per-request `usage` the API returned, as the transcript recorded it, "
              "deduplicated by message id",
    "model": "high: the `model` field on each API response, not the configured model",
    "api_equivalent_usd": "medium: measured tokens x list prices in prompts/pricing.json (as_of stated); "
                          "an equivalent, not a charge: these runs are billed under a subscription",
    "time": "medium: from transcript timestamps; model time is request-to-response, tool time is "
            "call-to-result, time waiting on a person is excluded from active time",
    "human_equivalent": "low: the agent's own estimate of how long a competent person would take, "
                        "with its basis written down; never measured",
}
NOT_COUNTED = [
    "requests the harness makes outside the transcript (context compaction summaries, title generation, "
    "safety classifiers), if any",
    "transcripts lost when a cloud session moved to a new container: only files present in this "
    "container are read, so a resumed session can undercount",
    "server-tool fees (web search is billed per search, not per token); the count is recorded, not priced",
    "CI minutes and the reviewer bots' own model calls",
]


# --------------------------------------------------------------------------
# Finding and reading transcripts


def projects_dir() -> Path:
    base = os.environ.get("CLAUDE_CONFIG_DIR") or str(Path.home() / ".claude")
    return Path(base) / "projects"


def find_transcripts(session: str | None, base: Path | None = None) -> list[Path]:
    """The session's own transcript first, then any subagent transcripts beneath it."""
    base = base or projects_dir()
    session = session or os.environ.get("CLAUDE_CODE_SESSION_ID")
    if not base.is_dir():
        return []
    if not session:
        files = sorted(base.glob("*/*.jsonl"), key=lambda p: p.stat().st_mtime)
        if not files:
            return []
        session = files[-1].stem
    main = sorted(base.glob(f"*/{session}.jsonl"))
    subs = sorted(p for p in base.glob(f"*/{session}/**/*.jsonl"))
    return main + subs


def parse_ts(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def read_entries(path: Path) -> Iterable[dict[str, Any]]:
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(entry, dict):
                yield entry


def is_tool_result(entry: dict[str, Any]) -> bool:
    content = (entry.get("message") or {}).get("content")
    return isinstance(content, list) and any(
        isinstance(c, dict) and c.get("type") == "tool_result" for c in content)


# --------------------------------------------------------------------------
# Pricing


def load_pricing(root: Path = ROOT) -> dict[str, Any]:
    return json.loads((root / "pricing.json").read_text())


def price_request(model: str, u: dict[str, int], fast: bool, pricing: dict[str, Any]) -> float | None:
    rates = pricing["models"].get(model)
    if rates is None:
        return None
    prompt = u["input"] + u["cache_read"] + u["cache_write_5m"] + u["cache_write_1h"]
    if "long" in rates and prompt > rates.get("long_prompt_tokens", float("inf")):
        rates = {**rates, **rates["long"]}
    usd = (u["input"] * rates["input"] + u["output"] * rates["output"]
           + u["cache_read"] * rates["cache_read"]
           + u["cache_write_5m"] * rates["cache_write_5m"]
           + u["cache_write_1h"] * rates["cache_write_1h"]) / 1e6
    if fast:
        usd *= rates.get("fast_multiplier", 1.0)
    return usd


# --------------------------------------------------------------------------
# Measuring


TOKEN_KEYS = ("input", "output", "thinking", "cache_read", "cache_write_5m", "cache_write_1h")


def request_usage(usage: dict[str, Any]) -> tuple[dict[str, int], bool]:
    """Token counts for one API response; the flag says the cache-write TTL split was guessed."""
    created = int(usage.get("cache_creation_input_tokens") or 0)
    split = usage.get("cache_creation") or {}
    w5, w1 = split.get("ephemeral_5m_input_tokens"), split.get("ephemeral_1h_input_tokens")
    guessed = not isinstance(w5, int) or not isinstance(w1, int)
    if guessed:
        w5, w1 = created, 0
    details = usage.get("output_tokens_details") or {}
    return {
        "input": int(usage.get("input_tokens") or 0),
        "output": int(usage.get("output_tokens") or 0),
        "thinking": int(details.get("thinking_tokens") or 0),
        "cache_read": int(usage.get("cache_read_input_tokens") or 0),
        "cache_write_5m": int(w5),
        "cache_write_1h": int(w1),
    }, guessed and created > 0


def measure(paths: list[Path], pricing: dict[str, Any], since: datetime | None = None,
            until: datetime | None = None) -> dict[str, Any]:
    requests: dict[str, tuple[str, dict[str, int], bool, dict[str, Any]]] = {}
    tools: Counter[str] = Counter()
    seen_tools: set[str] = set()
    timeline: list[tuple[datetime, str]] = []
    sub_span: list[tuple[datetime, datetime]] = []
    guessed_ttl = 0
    session_id = None

    for index, path in enumerate(paths):
        main = index == 0
        first = last = None
        for e in read_entries(path):
            ts = parse_ts(e.get("timestamp"))
            if ts is None or (since and ts < since) or (until and ts > until):
                continue
            kind = e.get("type")
            if kind not in ("user", "assistant"):
                continue
            session_id = session_id or e.get("sessionId")
            first = first or ts
            last = ts
            msg = e.get("message") or {}
            if kind == "assistant":
                for block in msg.get("content") or []:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        bid = block.get("id") or f"{e.get('uuid')}:{block.get('name')}"
                        if bid not in seen_tools:
                            seen_tools.add(bid)
                            tools[block.get("name") or "?"] += 1
                model, usage = msg.get("model"), msg.get("usage")
                if model and model != "<synthetic>" and isinstance(usage, dict):
                    key = msg.get("id") or e.get("requestId") or e.get("uuid")
                    counts, guessed = request_usage(usage)
                    prev = requests.get(key)
                    # A response is written once per content block, with the same
                    # usage; keep the most complete copy.
                    if prev is None or counts["output"] >= prev[1]["output"]:
                        requests[key] = (model, counts, usage.get("speed") == "fast", usage)
                        if guessed and prev is None:
                            guessed_ttl += 1
                if main and not e.get("isSidechain"):
                    timeline.append((ts, "model"))
            elif main and not e.get("isSidechain"):
                timeline.append((ts, "tool" if is_tool_result(e) else "human"))
        if not main and first and last:
            sub_span.append((first, last))

    models: dict[str, dict[str, Any]] = {}
    unpriced: set[str] = set()
    web_searches = 0
    for model, counts, fast, usage in requests.values():
        row = models.setdefault(model, {"requests": 0, **{k: 0 for k in TOKEN_KEYS},
                                        "api_equivalent_usd": 0.0, "fast_requests": 0})
        row["requests"] += 1
        row["fast_requests"] += int(fast)
        for k in TOKEN_KEYS:
            row[k] += counts[k]
        usd = price_request(model, counts, fast, pricing)
        if usd is None:
            unpriced.add(model)
        else:
            row["api_equivalent_usd"] += usd
        web_searches += int(((usage.get("server_tool_use") or {}).get("web_search_requests")) or 0)
    for model, row in models.items():
        row["api_equivalent_usd"] = None if model in unpriced else round(row["api_equivalent_usd"], 4)

    totals = {"requests": sum(r["requests"] for r in models.values())}
    for k in TOKEN_KEYS:
        totals[k] = sum(r[k] for r in models.values())
    priced = [r["api_equivalent_usd"] for r in models.values() if r["api_equivalent_usd"] is not None]
    totals["api_equivalent_usd"] = round(sum(priced), 4) if priced or not models else None
    totals["api_equivalent_complete"] = not unpriced

    time = timing(timeline)
    time["subagent_minutes"] = round(sum((b - a).total_seconds() for a, b in sub_span) / 60, 2)
    primary = max(models, key=lambda m: models[m]["output"] + models[m]["input"], default=None)
    return {
        "measured_by": f"prompts/runcost.py v{VERSION}",
        "session_id": session_id,
        "transcripts": len(paths),
        "first": time.pop("first"),
        "last": time.pop("last"),
        "primary_model": primary,
        "models": models,
        "totals": totals,
        "cache_hit_share": round(totals["cache_read"] / max(1, totals["cache_read"] + totals["input"]
                                 + totals["cache_write_5m"] + totals["cache_write_1h"]), 3),
        "tool_calls": sum(tools.values()),
        "tools": dict(tools.most_common()),
        "web_searches": web_searches,
        "time": time,
        "pricing": {"as_of": pricing.get("as_of"), "source": pricing.get("source")},
        "human_equivalent": None,
        "leverage": None,
        "certainty": dict(CERTAINTY),
        "not_counted": list(NOT_COUNTED) + (
            [f"cache-write TTL split missing on {guessed_ttl} request(s); priced as 5-minute writes"]
            if guessed_ttl else []) + ([f"no price for: {', '.join(sorted(unpriced))}"] if unpriced else []),
    }


def timing(timeline: list[tuple[datetime, str]]) -> dict[str, Any]:
    timeline.sort()
    out = {"first": None, "last": None, "wall_minutes": 0.0, "active_minutes": 0.0,
           "model_minutes": 0.0, "tool_minutes": 0.0, "waiting_on_human_minutes": 0.0,
           "human_prompts": 0, "stalls": 0}
    if not timeline:
        return out
    out["first"] = timeline[0][0].strftime("%Y-%m-%dT%H:%M:%SZ")
    out["last"] = timeline[-1][0].strftime("%Y-%m-%dT%H:%M:%SZ")
    out["human_prompts"] = sum(1 for _, k in timeline if k == "human")
    for (a, _), (b, kind) in zip(timeline, timeline[1:]):
        minutes = (b - a).total_seconds() / 60
        if kind == "human":
            out["waiting_on_human_minutes"] += minutes
        elif minutes > STALL_MINUTES:
            out["stalls"] += 1
        else:
            out[f"{kind}_minutes"] += minutes
    out["wall_minutes"] = (timeline[-1][0] - timeline[0][0]).total_seconds() / 60
    out["active_minutes"] = out["model_minutes"] + out["tool_minutes"]
    for k, v in out.items():
        if isinstance(v, float):
            out[k] = round(v, 2)
    return out


def human_equivalent(usage: dict[str, Any], hours: float, basis: str, pricing: dict[str, Any]) -> None:
    if hours < 0 or not basis.strip():
        raise SystemExit("--human-hours must be >= 0 and --human-basis must say how you estimated it")
    rate = float(pricing["human"]["rate_usd_per_hour"])
    usd = round(hours * rate, 2)
    usage["human_equivalent"] = {"hours": hours, "basis": basis.strip(),
                                 "rate_usd_per_hour": rate, "usd": usd}
    api = usage["totals"].get("api_equivalent_usd")
    usage["leverage"] = round(usd / api, 1) if api else None


# --------------------------------------------------------------------------
# Attaching to a run record


def attach(record_path: Path, usage: dict[str, Any]) -> dict[str, Any]:
    rec = json.loads(record_path.read_text())
    rec["usage"] = usage
    t = usage["totals"]
    fill = {
        "tokens_in": t["input"] + t["cache_read"] + t["cache_write_5m"] + t["cache_write_1h"],
        "tokens_out": t["output"],
        "cost_usd": t["api_equivalent_usd"],
        "wall_minutes": usage["time"]["wall_minutes"],
        "models_seen": sorted(usage["models"]),
        "started": usage["first"],
        "tool_calls": usage["tool_calls"],
    }
    for key, value in fill.items():
        if rec.get(key) in (None, [], "") and value not in (None, []):
            rec[key] = value
    record_path.write_text(json.dumps(rec, indent=2) + "\n")
    return rec


# --------------------------------------------------------------------------
# Reporting across records


def _median(values: list[float]) -> float | None:
    return round(statistics.median(values), 2) if values else None


# The owner's project-size bars: 20 human hours (2026-10-21), then 200 and
# "maybe above 300" (both 2026-10-29).
PROJECT_HOUR_BARS = (20, 200, 300)


def _human_hours(rec: dict[str, Any]) -> float | None:
    u = rec.get("usage")
    h = (u.get("human_equivalent") or {}).get("hours") if isinstance(u, dict) else None
    return h if isinstance(h, (int, float)) else None


def by_project(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Estimated human hours summed per project named in `projects`.

    A run naming several projects counts in full for each: the estimate is for
    the run, and splitting it would guess at shares the record does not hold.
    """
    projects: dict[str, dict[str, Any]] = defaultdict(lambda: {"runs": 0, "runs_with_hours": 0, "human_hours": 0.0})
    with_hours = 0
    for rec in records:
        h = _human_hours(rec)
        with_hours += h is not None
        for name in rec.get("projects") or []:
            if not isinstance(name, str):
                continue
            row = projects[name]
            row["runs"] += 1
            if h is not None:
                row["runs_with_hours"] += 1
                row["human_hours"] = round(row["human_hours"] + h, 2)
    ranked = dict(sorted(projects.items(), key=lambda kv: (-kv[1]["human_hours"], kv[0])))
    return {"records": len(records), "records_with_hours": with_hours,
            "projects": ranked,
            "over": {str(bar): sum(r["human_hours"] > bar for r in ranked.values()) for bar in PROJECT_HOUR_BARS}}


def report(root: Path = ROOT) -> dict[str, Any]:
    recs, every = [], []
    for path in sorted((root / "runs").glob("*.json")):
        try:
            rec = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(rec, dict):
            continue
        every.append(rec)
        if isinstance(rec.get("usage"), dict) and rec["usage"].get("measured_by"):
            recs.append(rec)
    groups: dict[str, dict[str, list[dict[str, Any]]]] = {
        "model": defaultdict(list), "track": defaultdict(list), "prompt": defaultdict(list)}
    for rec in recs:
        u = rec["usage"]
        groups["model"][u.get("primary_model") or rec.get("model") or "unknown"].append(rec)
        groups["track"][rec.get("track") or "unknown"].append(rec)
        groups["prompt"][f"{rec.get('track')}/{rec.get('prompt_version')}"].append(rec)

    def summary(rs: list[dict[str, Any]]) -> dict[str, Any]:
        api = [r["usage"]["totals"]["api_equivalent_usd"] for r in rs
               if isinstance(r["usage"]["totals"].get("api_equivalent_usd"), (int, float))]
        human = [r["usage"]["human_equivalent"]["usd"] for r in rs if r["usage"].get("human_equivalent")]
        active = [r["usage"]["time"]["active_minutes"] for r in rs]
        good = [r for r in rs if r.get("outcome") == "success" and r.get("merged") is not False]
        return {
            "runs": len(rs),
            "successful": len(good),
            "api_usd_total": round(sum(api), 2),
            "api_usd_median": _median(api),
            "api_usd_per_success": round(sum(api) / len(good), 2) if good and api else None,
            "active_minutes_median": _median(active),
            "human_usd_median": _median(human),
            "leverage_median": _median([r["usage"]["leverage"] for r in rs
                                        if isinstance(r["usage"].get("leverage"), (int, float))]),
            "output_tokens_median": _median([r["usage"]["totals"]["output"] for r in rs]),
            "cache_hit_share_median": _median([r["usage"].get("cache_hit_share") or 0 for r in rs]),
        }

    return {"records_with_usage": len(recs),
            **{f"by_{k}": {name: summary(rs) for name, rs in sorted(g.items())} for k, g in groups.items()},
            "by_project": by_project(every),
            "caveat": "API-equivalent at list prices; human-equivalent is each agent's own estimate (low "
                      "certainty). Compare groups only once each has ~10 runs."}


def print_report(r: dict[str, Any]) -> None:
    print(f"Run cost report: {r['records_with_usage']} run record(s) carry a measured `usage` block\n")
    cols = ("runs", "successful", "api_usd_total", "api_usd_median", "api_usd_per_success",
            "active_minutes_median", "human_usd_median", "leverage_median")
    for key in ("by_model", "by_track", "by_prompt"):
        print(f"{key.replace('_', ' ')}:")
        print("  | name | " + " | ".join(cols) + " |")
        for name, s in r[key].items():
            print(f"  | {name} | " + " | ".join(str(s[c]) for c in cols) + " |")
        print()
    bp = r["by_project"]
    print(f"by project: {bp['records_with_hours']} of {bp['records']} run records carry a human-hours estimate; "
          + ", ".join(f"{n} project(s) over {bar} h" for bar, n in bp["over"].items()))
    print("  | project | runs | runs with hours | estimated human hours |")
    for name, row in list(bp["projects"].items())[:15]:
        print(f"  | {name} | {row['runs']} | {row['runs_with_hours']} | {row['human_hours']} |")
    print()
    print(r["caveat"])


def print_measure(u: dict[str, Any]) -> None:
    t, tm = u["totals"], u["time"]
    print(f"Session {u['session_id']}  ({u['transcripts']} transcript file(s), {u['first']} .. {u['last']})")
    for model, row in u["models"].items():
        print(f"  {model}: {row['requests']} requests, in {row['input']:,}  out {row['output']:,} "
              f"(thinking {row['thinking']:,})  cache read {row['cache_read']:,}  "
              f"cache write {row['cache_write_5m'] + row['cache_write_1h']:,}  ~${row['api_equivalent_usd']}")
    print(f"  API-equivalent total: ${t['api_equivalent_usd']}  (prices as of {u['pricing']['as_of']}; "
          f"cache hit share {u['cache_hit_share']})")
    print(f"  time: wall {tm['wall_minutes']} min, active {tm['active_minutes']} "
          f"(model {tm['model_minutes']}, tools {tm['tool_minutes']}), waiting on a person "
          f"{tm['waiting_on_human_minutes']}, subagents {tm['subagent_minutes']}, stalls {tm['stalls']}")
    print(f"  tool calls: {u['tool_calls']}  web searches: {u['web_searches']}")
    for note in u["not_counted"]:
        print(f"  not counted: {note}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("measure", "attach"):
        p = sub.add_parser(name)
        if name == "attach":
            p.add_argument("record", type=Path)
            p.add_argument("--human-hours", type=float,
                           help="your estimate of a competent person's active hours for the same work "
                                "(optional: omit it when you cannot estimate; tokens and dollars still attach)")
            p.add_argument("--human-basis", help="one line on how you estimated it (required with --human-hours)")
        p.add_argument("--session", help="session id (default: $CLAUDE_CODE_SESSION_ID)")
        p.add_argument("--transcript", type=Path, action="append",
                       help="read these files instead of finding the session's (repeatable)")
        p.add_argument("--since", help="ISO time: only count events from here (one PR of several)")
        p.add_argument("--until", help="ISO time: only count events up to here")
        p.add_argument("--json", action="store_true")
    p = sub.add_parser("report")
    p.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.cmd == "report":
        r = report()
        print(json.dumps(r, indent=2)) if args.json else print_report(r)
        return 0
    paths = args.transcript or find_transcripts(args.session)
    if not paths:
        print("runcost: no transcript found (is this a Claude Code session? pass --transcript)",
              file=sys.stderr)
        return 2
    pricing = load_pricing()
    usage = measure(paths, pricing, parse_ts(args.since), parse_ts(args.until))
    if args.cmd == "attach":
        if args.human_hours is not None:
            human_equivalent(usage, args.human_hours, args.human_basis or "", pricing)
        attach(args.record, usage)
        print(f"wrote usage into {args.record}")
    print(json.dumps(usage, indent=2)) if args.json else print_measure(usage)
    if usage.get("leverage") is not None:
        h = usage["human_equivalent"]
        print(f"  human-equivalent: {h['hours']} h x ${h['rate_usd_per_hour']}/h = ${h['usd']} "
              f"(leverage {usage['leverage']}x; low certainty)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
