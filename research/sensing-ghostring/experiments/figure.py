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
COLS = ["mean", "refguided", "aligned+rej", "band", "median", "ring=aligned", "ring=reject", "large"]


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
    keep = ["refguided", "aligned+rej", "band", "median", "ring=aligned", "large"]
    names = ["reject only", "aligned + reject", "ring: frame 0 only", "ring: temporal median", "ring: aligned + reject",
             "one large-sensor frame"]
    ys = [[float(r[3 + COLS.index(k)]) for r in rows] for k in keep]
    write_lines(HERE, "ring_vs_speed.svg", "Edge ring of a moving subject, N = 8 frames (4x area ratio)",
                "Line plot of display PSNR in the edge ring against subject speed; no ring treatment gets within 4 dB of the large frame",
                "subject speed (px per frame)", "display PSNR in the edge ring (dB)",
                list(zip(names, [xs] * len(keep), ys)), logx=True)


if __name__ == "__main__":
    main()
