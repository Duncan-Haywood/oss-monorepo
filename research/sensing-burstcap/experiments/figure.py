"""Write experiments/amax_vs_light.svg: largest area ratio an 8-frame burst matches against per-frame signal,
parsed from results.txt (section A, K = 8).

    python experiments/figure.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402

TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    start = next(i for i, l in enumerate(TEXT) if l.startswith("K = 8 "))
    head = [float(v) for v in TEXT[start + 1].split(" | ")[1:]]
    rows = [l.split(" | ") for l in TEXT[start + 2:start + 7]]
    series = [(f"read noise {r[0]} e-", head, [float(v) for v in r[1:]]) for r in rows]
    write_lines(HERE, "amax_vs_light.svg", "Largest sensor-area ratio an 8-frame burst can match",
                "Line plot of the largest area ratio against electrons per frame; every curve rises from the square root of 8 in the dark to 8 in bright light, and higher read noise shifts it right",
                "signal per frame (electrons per pixel)", "largest matched area ratio A", series, logx=True)


if __name__ == "__main__":
    main()
