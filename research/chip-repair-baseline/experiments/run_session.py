"""Score the committed session attempts (attempts/<task>/round<k>.v) with the checker.

Round 1 was written from the spec alone. Later rounds were written after reading the
checker feedback for the previous round. Usage: python experiments/run_session.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_repair_baseline import check, task_names  # noqa: E402


def rounds(task):
    files = sorted((ROOT / "attempts" / task).glob("round*.v"),
                   key=lambda p: int(re.search(r"\d+", p.stem).group()))
    return files


def main():
    print(f"{'task':10} round stage    sim_fail/total lint_warn formal  feedback")
    for task in task_names():
        for f in rounds(task):
            r = check(task, f.read_text())
            n = re.search(r"\d+", f.stem).group()
            sim = f"{r['fail']}/{r['total']}" if r["total"] else "-"
            print(f"{task:10} {n:5} {r['stage']:8} {sim:14} {r['lint_warnings']:9} {str(r['formal']):7} {r['feedback']}")
            if r["ok"]:
                break


if __name__ == "__main__":
    main()
