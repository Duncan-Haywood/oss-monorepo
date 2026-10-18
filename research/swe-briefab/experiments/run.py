"""Research brief v0 vs v1 on runs dated on/after the first v1 run. Writes results.txt."""
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_briefab import compare, load, window, wilson, split  # noqa: E402

RUNS = os.path.join(HERE, "..", "..", "..", "prompts", "runs")
START = "2026-10-15"


def main():
    runs = window(load(RUNS), "research", (0, 1), START)
    out = []
    n0 = sum(r["prompt_version"] == 0 for r in runs)
    n1 = sum(r["prompt_version"] == 1 for r in runs)
    out.append(f"research runs dated {START} or later: v0 n={n0}, v1 n={n1}")
    for v in (0, 1):
        days = sorted({r["date"] for r in runs if r["prompt_version"] == v})
        out.append(f"v{v} dates: {days[0]} .. {days[-1]}")
    out.append("")
    out.append("metric                  n0   n1     v0        v1       diff (95% boot)           p(perm)")
    for key, stat in [("has_error", statistics.mean), ("success", statistics.mean),
                      ("deviation", statistics.mean), ("friction", statistics.mean),
                      ("cost_usd", statistics.median), ("wall_minutes", statistics.median),
                      ("tokens_out", statistics.median)]:
        c = compare(runs, key, stat)
        if c is None:
            out.append(f"{key:22s} too few")
            continue
        out.append(f"{key:22s} {c['n_base']:4d} {c['n_cand']:4d} {c['base']:9.3f} {c['cand']:9.3f} "
                   f"{c['diff']:+8.3f} [{c['lo']:+.3f}, {c['hi']:+.3f}]  {c['p']:.4f}")
    out.append("(means for rates and friction counts; medians for cost, minutes, tokens)")
    out.append("")
    g = split(runs, "has_error")
    for v in (0, 1):
        k, n = int(sum(g[v])), len(g[v])
        lo, hi = wilson(k, n)
        out.append(f"v{v} runs with an error: {k}/{n} = {k/n:.1%}  (Wilson {lo:.1%} to {hi:.1%})")
    # by task: which kind of work each version drew
    tasks = {}
    for r in runs:
        tasks.setdefault(r.get("task") or "none", {0: 0, 1: 0})[r["prompt_version"]] += 1
    out.append("")
    out.append("task mix (v0 / v1):")
    for t, d in sorted(tasks.items(), key=lambda kv: -(kv[1][0] + kv[1][1]))[:8]:
        out.append(f"  {t:24s} {d[0]:4d} {d[1]:4d}")
    # confound check: the same comparison on runs that carry no task label
    sub = [r for r in runs if not r.get("task")]
    out.append("")
    out.append("runs with no task label only (the group both versions share):")
    for key in ("has_error", "friction"):
        c = compare(sub, key)
        if c:
            out.append(f"  {key:10s} n={c['n_base']}/{c['n_cand']} v0 {c['base']:.3f} v1 {c['cand']:.3f} "
                       f"diff {c['diff']:+.3f} [{c['lo']:+.3f}, {c['hi']:+.3f}] p {c['p']:.4f}")
    text = "\n".join(out) + "\n"
    with open(os.path.join(HERE, "results.txt"), "w") as f:
        f.write(text)
    print(text)


if __name__ == "__main__":
    main()
