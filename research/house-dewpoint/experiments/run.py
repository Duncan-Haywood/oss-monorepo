"""Condensation by climate, season, vapor retarder and exterior foam. Writes experiments/results.txt.

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from house_dewpoint import CLIMATES, build_wall, condensation  # noqa: E402

RET = ["none", "paint", "kraft", "poly"]
EXT = ["none", "xps1", "xps2"]
TO_G_DAY = 86400 / 1e9


def cell(c, season, ret, ext):
    layers = build_wall(ret, ext)
    r = condensation(layers, *CLIMATES[c][season])
    # sheathing = OSB: find its outer node index
    names = [l.name for l in layers]
    osb_out = names.index("OSB 7/16") + 1
    return r["total"] * TO_G_DAY, r["rh"][osb_out]


def main():
    out = ["house-dewpoint results (deterministic; steady-state Glaser, assumed inputs)", ""]
    out.append("A. Condensation rate, g/m2/day (0 = none), then unclamped RH at the sheathing's outer face")
    for season in ("winter", "summer"):
        out.append(f"== {season} month")
        for c in CLIMATES:
            for ext in EXT:
                row = []
                for ret in RET:
                    g, rh = cell(c, season, ret, ext)
                    row.append(f"{ret}:{g:6.2f}@{rh*100:4.0f}%")
                out.append(f"  {c:14s} ext={ext:5s} " + "  ".join(row))
    out.append("")
    out.append("B. Every retarder + exterior-foam combination with zero condensation in both months")
    for c in CLIMATES:
        ok = [(ret, ext) for ret in RET for ext in EXT
              if all(cell(c, s, ret, ext)[0] == 0 for s in ("winter", "summer"))]
        out.append(f"  {c:14s} " + (", ".join(f"{r}+{e}" for r, e in ok) if ok else "none of the 12"))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
