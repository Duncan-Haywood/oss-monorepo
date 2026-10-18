"""Score banks of M random 8-bit constants in three forms, prove each equal to the operator form; write results.txt.
   python experiments/run.py"""
import random
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "chip-abc-sweep" / "src"))
from chip_abc_sweep.flow import equivalent, score  # noqa: E402
from chip_mcm.gens import adders, verilog  # noqa: E402

SIZES = [2, 4, 8, 16]
SETS = 40
FORMS = ["op", "csd", "mcm"]


def main():
    rows = ["== M set | op_cells op_depth | csd_cells csd_depth csd_adders | mcm_cells mcm_depth mcm_adders | all_equivalent | constants"]
    rng = random.Random(20261018)
    with tempfile.TemporaryDirectory() as d:
        for m in SIZES:
            for s in range(SETS):
                ks = sorted(rng.sample(range(1, 256), m))
                res, files = {}, {}
                for f in FORMS:
                    src, top = verilog(f, ks)
                    p = Path(d) / f"{top}.v"
                    p.write_text(src)
                    files[f] = (str(p), top)
                    res[f] = score(str(p), top)
                eq = all(equivalent(*files["op"], *files[f]) for f in ("csd", "mcm"))
                rows.append(f"{m} {s} | {res['op']['cells']} {res['op']['depth']} | {res['csd']['cells']} {res['csd']['depth']} "
                            f"{adders('csd', ks)} | {res['mcm']['cells']} {res['mcm']['depth']} {adders('mcm', ks)} | {int(eq)} | "
                            + ",".join(map(str, ks)))
                print(rows[-1], flush=True)
    (HERE / "results.txt").write_text("\n".join(rows) + "\n")
    print(f"{len(rows) - 1} banks written")


if __name__ == "__main__":
    main()
