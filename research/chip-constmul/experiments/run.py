"""Score x*K for every 8-bit K in three forms, prove each equal to the operator form; write results.txt.
   python experiments/run.py"""
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "chip-abc-sweep" / "src"))
from chip_abc_sweep.flow import equivalent, score  # noqa: E402
from chip_constmul.gens import binary_digits, csd, verilog  # noqa: E402

FORMS = ["op", "bin", "csd"]


def main():
    rows = ["== k popcount csd_digits | op_cells op_depth | bin_cells bin_depth | csd_cells csd_depth | all_equivalent"]
    with tempfile.TemporaryDirectory() as d:
        for k in range(1, 256):
            res, files = {}, {}
            for f in FORMS:
                src, top = verilog(f, k)
                p = Path(d) / f"{top}.v"
                p.write_text(src)
                files[f] = (str(p), top)
                res[f] = score(str(p), top)
            eq = all(equivalent(*files["op"], *files[f]) for f in ("bin", "csd"))
            rows.append(f"{k} {len(binary_digits(k))} {len(csd(k))} | {res['op']['cells']} {res['op']['depth']} | "
                        f"{res['bin']['cells']} {res['bin']['depth']} | {res['csd']['cells']} {res['csd']['depth']} | {int(eq)}")
    (HERE / "results.txt").write_text("\n".join(rows) + "\n")
    print(f"{len(rows) - 1} constants written")


if __name__ == "__main__":
    main()
