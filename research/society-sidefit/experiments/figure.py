"""Write experiments/rho_c_by_eps.svg from results.txt.   python3 experiments/figure.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    rows, on = [], False
    for l in TEXT:
        if l.startswith("== B."):
            on = True
            continue
        if on and l.startswith("=="):
            break
        p = l.split()
        if on and len(p) == 4 and p[0][0].isdigit():
            rows.append((float(p[0]), [None if c == "none" else float(c.split("/")[1]) for c in p[1:]]))
    series = []
    for k, m in enumerate((5, 9, 17)):
        pts = [(e, v[k]) for e, v in rows if v[k] is not None]
        series.append((f"memory {m}", [a for a, _ in pts], [b for _, b in pts]))
    write_lines(HERE, "rho_c_by_eps.svg", "Tipping robot share along the fit to a measured 17% left share, by error rate",
                "Line plot of the mean-field tipping share of committed robots against the error rate, with the share of always-left people re-fitted at each error rate so a status-quo crowd shows 17% left choices, for memories 5, 9 and 17",
                "error rate eps (share of random choices)", "tipping robot share", series)


if __name__ == "__main__":
    main()
