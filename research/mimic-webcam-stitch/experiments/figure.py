"""Write experiments/stitch.svg: reference AUROC against block length, parsed from ../results/stitch.txt.

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

MODES = ("random", "person", "match", "person+match")


def main():
    rows = [l.split("\t") for l in (HERE.parent / "results" / "stitch.txt").read_text().splitlines()[1:]]
    auc = {r[0]: float(r[1]) for r in rows}
    segs = sorted({int(k.rsplit(" ", 1)[1]) for k in auc if k.rsplit(" ", 1)[0] in MODES})
    series = [(m, [float(s) for s in segs], [auc[f"{m} {s}"] for s in segs]) for m in MODES]
    write_lines(HERE, "stitch.svg", "Stitched real webcam signals: AUROC against block length",
                "Line plot of reference-detector AUROC against stitched block length in frames for four stitching modes; "
                "AUROC falls from 1.0 at 5 frames to about 0.59 for same-person join-matched 50-frame blocks",
                "block length (frames, 10 per second)", "reference AUROC (0.5 = chance)", series,
                logx=True, logy=False, hline=auc["replay whole windows (ceiling)"])


if __name__ == "__main__":
    main()
