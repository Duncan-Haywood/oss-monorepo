"""Write experiments/ghost_vs_frames.svg: whole-image PSNR against burst length with a slow moving subject,
parsed from results.txt (section C, region 'all').

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    start = next(i for i, l in enumerate(TEXT) if l.startswith("== C."))
    rows = [l.split(" | ") for l in TEXT[start + 2:] if " | all | " in l]
    xs = [float(r[0]) for r in rows]
    names = ["mean", "median", "sigclip", "refguided", "large"]
    ys = [[float(r[2 + j]) for r in rows] for j in range(len(names))]
    labels = ["plain mean", "median", "sigma-clip", "reference-guided", "one large-sensor frame"]
    write_lines(HERE, "ghost_vs_frames.svg", "Burst merge with a subject moving 0.25 px per frame (4x area ratio)",
                "Line plot of display PSNR against frames merged; the plain mean peaks near 8 frames then falls as the subject ghosts, while the reference-guided merge keeps rising",
                "frames merged, N", "display PSNR over whole image (dB)", list(zip(labels, [xs] * 5, ys)), logx=True)


if __name__ == "__main__":
    main()
