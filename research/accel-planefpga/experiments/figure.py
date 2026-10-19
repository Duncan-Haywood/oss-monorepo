"""Write experiments/latency_vs_cells.svg: latency against logic cells on the iCE40 UP5K, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    groups = {}
    for l in (HERE / "results.txt").read_text().splitlines():
        c = [x.strip() for x in l.split("|")]
        if len(c) == 9 and c[8] == "yes":
            groups.setdefault(f"{c[0]}{', DSP' if c[2] == 'yes' else ''}", []).append((float(c[4]), float(c[7])))
    if not groups:
        raise SystemExit("no rows parsed")
    series = [(k, [x for x, _ in sorted(v)], [y for _, y in sorted(v)]) for k, v in groups.items()]
    write_lines(HERE, "latency_vs_cells.svg", "Accel-planefpga: latency against logic cells (iCE40 UP5K)",
                "Line plot of one 64x70 matrix-vector product's latency in microseconds against logic cells used on an iCE40 UP5K, "
                "one line per engine (output-stationary OS, reduction tree RT, pipelined tree RTp) with and without DSP multipliers, "
                "lane counts 1 to 32: latency falls from about 140 to about 10 microseconds as cells rise from about 200 to 3,800",
                "logic cells (post place-and-route)", "latency per product (us, cycles / Fmax)", series, logx=True, logy=True)


if __name__ == "__main__":
    main()
