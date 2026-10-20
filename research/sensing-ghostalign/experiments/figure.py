"""Write experiments/align_vs_frames.svg: whole-image PSNR against frames merged for a subject moving 1 px per
frame, parsed from results.txt (section B, region 'all').

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import table, write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    start = next(i for i, l in enumerate(TEXT) if l.startswith("== B."))
    rows = []
    for l in TEXT[start + 2:]:
        if not l.strip():
            break
        r = l.split(" | ")
        if r[1] == "all":
            rows.append(r)
    xs = [float(r[0]) for r in rows]
    names = ["plain mean", "reject only (reference-guided)", "aligned", "aligned + reject", "one large-sensor frame"]
    ys = [[float(r[2 + j]) for r in rows] for j in range(5)]
    write_lines(HERE, "align_vs_frames.svg", "Burst merge, subject moving 1 px per frame (4x area ratio)",
                "Line plot of display PSNR against frames merged; reject-only overtakes motion-compensated merging from about 8 frames",
                "frames merged, N", "display PSNR over whole image (dB)", list(zip(names, [xs] * 5, ys)), logx=True)


if __name__ == "__main__":
    main()
