"""Synthesise each block over a width sweep; write results.txt.   python experiments/run.py"""
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "chip-abc-sweep" / "src"))
from chip_abc_sweep.flow import score  # noqa: E402
from chip_scaling.blocks import BLOCKS, verilog  # noqa: E402
from chip_scaling.fit import power_fit  # noqa: E402

WIDTHS = {"mul": [4, 6, 8, 12, 16, 24, 32]}
DEFAULT = [4, 8, 16, 32, 64]


def main():
    out, fits = [], []
    with tempfile.TemporaryDirectory() as d:
        for kind in BLOCKS:
            ws = WIDTHS.get(kind, DEFAULT)
            out.append(f"== {kind}: width cells depth")
            cells = []
            for w in ws:
                src, top = verilog(kind, w)
                f = os.path.join(d, top + ".v")
                open(f, "w").write(src)
                r = score(f, top)
                cells.append(r["cells"])
                out.append(f"{w} {r['cells']} {r['depth']}")
            fits.append((kind, ws, cells))
    out.append("== fits: kind exponent coefficient r2 (cells ~ c*W^p, all widths)")
    for kind, ws, cells in fits:
        p, c, r2 = power_fit(ws, cells)
        out.append(f"{kind} {p:.2f} {c:.2f} {r2:.4f}")
    out.append("== fits_top: kind exponent (largest three widths only)")
    for kind, ws, cells in fits:
        out.append(f"{kind} {power_fit(ws[-3:], cells[-3:])[0]:.2f}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
