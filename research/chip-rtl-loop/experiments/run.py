"""Run every proposal round of every task through the checker; write experiments/results.txt."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_rtl_loop.check import check, first_failure, load_task, passed, TASKS  # noqa: E402


def main():
    lines = []
    solved_by = {}
    tasks = sorted(p.name for p in TASKS.iterdir())
    for t in tasks:
        meta = load_task(t)
        for f in sorted((ROOT / "proposals" / t).glob("r*.v")):
            r = int(f.stem[1:])
            res, warns = check(meta, f)
            ff = first_failure(res)
            lines.append(f"{t:11s} round {r}: {'PASS' if ff is None else 'FAIL at ' + ff:12s} lint_warnings={warns}")
            if ff is None and t not in solved_by:
                solved_by[t] = r
    rounds = max(solved_by.values(), default=0)
    lines.append("")
    lines.append(f"tasks={len(tasks)}")
    for k in range(rounds + 1):
        n = sum(1 for v in solved_by.values() if v <= k)
        lines.append(f"cumulative pass after {k} feedback round(s): {n}/{len(tasks)}")
    out = "\n".join(lines) + "\n"
    (ROOT / "experiments" / "results.txt").write_text(out)
    print(out)


if __name__ == "__main__":
    main()
