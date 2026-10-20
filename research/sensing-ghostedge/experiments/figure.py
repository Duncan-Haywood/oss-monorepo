"""Write experiments/ring_vs_speed.svg: ring-region PSNR against subject speed at N = 8, parsed from results.txt
(section A, region 'ring').

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()
COLS = ["refguided", "aligned+rej", "layered-fit", "layered-oracle", "large"]


def main():
    start = next(i for i, l in enumerate(TEXT) if l.startswith("== A."))
    rows = []
    for l in TEXT[start + 2:]:
        if not l.strip():
            break
        r = l.split(" | ")
        if len(r) > 3 and r[2] == "ring":
            rows.append(r)
    xs = [float(r[1]) for r in rows]
    keep = ["refguided", "aligned+rej", "layered-fit", "layered-oracle", "large"]
    names = ["reject only", "aligned + reject", "layered model, fitted disc", "layered model, true disc",
             "one large-sensor frame"]
    ys = [[float(r[3 + COLS.index(k)]) for r in rows] for k in keep]
    write_lines(HERE, "ring_vs_speed.svg", "Edge ring with a layered coverage model, N = 8 frames (4x area ratio)",
                "Line plot of display PSNR in the edge ring against subject speed; the layered coverage model reaches the large frame from 2 px per frame",
                "subject speed (px per frame)", "display PSNR in the edge ring (dB)",
                list(zip(names, [xs] * len(keep), ys)), logx=True)


if __name__ == "__main__":
    main()
