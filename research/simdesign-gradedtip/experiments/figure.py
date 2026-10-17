"""Write experiments/peak_vs_hmin.svg: peak stress against the local element size at the fillet tangent point,
from results.json (384-facet fillet, grading rate 0.3). Run run.py first if the experiment changes.

    python experiments/figure.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

DESIGNS = [(14.0, 10.0, 2.0), (14.0, 14.0, 2.0), (16.0, 15.0, 2.0), (12.0, 6.0, 15.0)]


def main():
    res = json.load(open(HERE / "results.json"))
    series = []
    for d, (w, r, b) in enumerate(DESIGNS):
        rr = sorted([x for x in res if x["design"] == d and x["grade"] == 0.3 and x["n_arc"] == 384], key=lambda x: x["hmin"])
        base = [x for x in rr if x["hmin"] == 1.5][0]["peak"]
        series.append((f"w={w:g} r={r:g} b={b:g}", [x["hmin"] for x in rr], [x["peak"] / base for x in rr]))
    write_lines(HERE, "peak_vs_hmin.svg", "Peak stress under local grading at the fillet tangent point",
                "Line plot of the peak element-centroid von Mises stress, relative to its value with 1.5 mm elements, against the "
                "smallest element size at the fillet tangent point for four bracket designs; each curve rises and then flattens at about 1.09 to 1.12",
                "smallest element size hmin (mm), logarithmic", "peak stress / peak stress at hmin = 1.5 mm", series, logx=True)


if __name__ == "__main__":
    main()
