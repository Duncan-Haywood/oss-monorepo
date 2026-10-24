"""Count how runs here start: from a scheduled prompt or from a person's ask.

Reads prompts/runs/*.json (the run records) and prints the numbers used in
docs/reports/2026-10-24-human-requests-for-agents.md and
docs/posts/2026-10-24-how-one-person-steers-an-agent-fleet.md.

    python3 docs/reports/assets/human-asks/count_asks.py [--until 2026-10-24]

A run counts as scheduled when its `input` names a schedule, `prompt.md` or a
routine, or starts with "continue work"; everything else is a direct ask. The
kinds of ask come from a keyword sort, first rule wins: rough, spot-checked
by reading all of them, not a hand coding.
"""
import argparse
import collections
import glob
import json
import re
import statistics as st

KINDS = [
    ("change to how runs work", r"\b(drop|lift|transition|guideline|requirement|most runs|have some percent|red team|prompt|git pattern|rules)\b"),
    ("question answered as a report or post", r"(\?|analy[sz]e|report|blog|opinion|critique|study)"),
    ("new project or direction", r"(i want to|adding a project|add .*project|projects to add|lets add as a task|add to the action|work on|i sort of want|is it possible)"),
    ("feedback on the site or a product", r"(ghp|site|website|home page|visual)"),
]


def scheduled(text):
    t = (text or "").lower()
    return "scheduled" in t or "prompt.md" in t or "routine" in t or t.startswith("continue work") or not t.strip()


def med(xs):
    return round(st.median(xs), 2) if xs else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--until", default="2026-10-24", help="last date included (YYYY-MM-DD)")
    a = ap.parse_args()
    runs = []
    for f in sorted(glob.glob("prompts/runs/*.json")):
        try:
            d = json.load(open(f))
        except (OSError, ValueError):
            continue
        if str(d.get("date") or "") <= a.until:
            runs.append(d)
    dates = sorted(str(d.get("date")) for d in runs if d.get("date"))
    direct = [d for d in runs if not scheduled(d.get("input"))]
    sched = [d for d in runs if scheduled(d.get("input"))]
    print(f"runs {len(runs)} from {dates[0]} to {dates[-1]}; direct {len(direct)} ({100 * len(direct) / len(runs):.1f}%), scheduled {len(sched)}")
    per_day = collections.Counter(dates)
    full = [n for day, n in per_day.items() if n > 200]
    print(f"days with more than 200 runs: {len(full)}, range {min(full)}-{max(full)} runs a day")
    for name, g in (("direct", direct), ("scheduled", sched)):
        cost = [d["cost_usd"] for d in g if isinstance(d.get("cost_usd"), (int, float))]
        wall = [d["wall_minutes"] for d in g if isinstance(d.get("wall_minutes"), (int, float))]
        print(f"{name}: median cost ${med(cost)} (measured on {len(cost)} of {len(g)}), median wall {med(wall)} min (on {len(wall)})")
    print("direct asks by track:", dict(collections.Counter(d["track"] for d in direct).most_common()))
    kinds = collections.Counter()
    for d in direct:
        t = d["input"].lower()
        kinds[next((k for k, rx in KINDS if re.search(rx, t)), "other")] += 1
    print("direct asks by kind:", {k: f"{n} ({100 * n / len(direct):.0f}%)" for k, n in kinds.most_common()})
    shaped = sum(1 for d in direct if re.search(r"blog|report|agent doc", d["input"].lower()))
    print(f"direct asks naming a report, blog post or agent doc: {shaped}")


if __name__ == "__main__":
    main()
