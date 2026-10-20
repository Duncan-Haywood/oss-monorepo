"""Write experiments/small_step_penalty.svg: slow-down over uncompressed sync against participation p, from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
ALPHA = 0.05


def main():
    # section 2 has one row per (p, alpha); keep the alpha = 0.05 rows. Columns: p alpha unbiased 1/p ef 1+a*s*w.
    rows = {}
    for a in (ALPHA,):
        xs, ys = table(TEXT, "== 2.", 0, [1, 2, 3, 4])
        for x, al, ub, inv, ef in zip(xs, *ys):
            if al == a:
                rows[x] = (ub, inv, ef)
    if not rows:
        raise SystemExit("no alpha=0.05 rows parsed from results.txt")
    ps = sorted(rows)
    series = [("unbiased (simulated)", ps, [rows[p][0] for p in ps]),
              ("1/p (theory)", ps, [rows[p][1] for p in ps]),
              ("error feedback (simulated)", ps, [rows[p][2] for p in ps])]
    write_lines(HERE, "small_step_penalty.svg", "Sparse outer sync: slow-down over uncompressed (N=8, alpha s=0.05)",
                "Line plot of the small-step slow-down over uncompressed sync against participation probability p; "
                "the unbiased rule follows 1/p while error feedback stays close to 1",
                "participation probability p (logarithmic)", "slow-down factor", series, logx=True)


if __name__ == "__main__":
    main()
