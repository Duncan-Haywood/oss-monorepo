"""Width curve of the stock hanger on each KES fabric at three stretch stiffnesses.

python3 experiments/run.py      # about 1-2 min on 4 cores; writes results.txt
"""
import multiprocessing as mp
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from hanger_kes.kes import EAS, KES, OFFSETS, best_offsets  # noqa: E402


def job(a):
    code, ea = a
    s, errs = best_offsets(code, ea)
    return code, ea, s, errs


if __name__ == "__main__":
    with mp.Pool(4) as p:
        res = p.map(job, [(c, e) for c in KES for e in EAS])
    out = ["size M tee-shaped garment, 20 cm strip, wood-shaped stock hanger, arm half width = half shoulder + offset",
           "fabric B and weight from KES-FB Table 3 (see README); EA swept",
           "== fabric code B W_mg_cm2 EA best_offset best_err err_at_+1 | err at offsets " + " ".join(f"{o:+.0f}" for o in OFFSETS)]
    for code, ea, s, errs in res:
        _, B, W = KES[code]
        out.append(f"{code} {B} {W} {ea:.0f} {s['best_offset']:+.0f} {s['best_err']:.3f} {s['err_at_1']:.3f} | "
                   + " ".join(f"{e:.3f}" for e in errs))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
