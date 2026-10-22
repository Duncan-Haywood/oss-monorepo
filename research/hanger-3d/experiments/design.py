"""Design loop in 3D: CMA-ES over the hanger shape scored on the whole sheet (err_all), per arm half-depth.

python3 experiments/design.py     (about 35 min on 4 cores; needs numpy and hanger-fit's source)
Writes design_results.txt next to this file.
"""
import multiprocessing as mp
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[0] / "src"), str(HERE.parents[1] / "hanger-fit" / "src")]
from hanger_fit import model as m2  # noqa: E402
from hanger_fit.opt import cmaes, to_hanger  # noqa: E402
from hanger_3d.cloth3d import Arm, drape, score  # noqa: E402

ZHS = [1.5, 3.0, 6.0]
SEEDS = [0, 1]
BUDGET = 64
G = m2.garment("M", "tee")


def obj3(h, zh, key):
    X, sh = drape(Arm(h, zh), G)
    s = score(X, sh)
    return s[key] + m2.CREASE_COST * max(0.0, s["crease"] - m2.CREASE_OK), s


def loop3(args):
    zh, seed, key = args
    u, fb, hist = cmaes(lambda u: obj3(to_hanger(u), zh, key)[0], 4, BUDGET, seed)
    h = to_hanger(u)
    return args, h, obj3(h, zh, key)[1]


def loop2(seed):
    u, fb, hist = cmaes(lambda u: m2.objective(m2.score(to_hanger(u), G)), 4, 150, seed)
    return seed, to_hanger(u)


def fmt(h):
    return f"w={h.w:.1f} slope={h.slope:.1f} bow={h.bow:.2f} r={h.r:.2f}"


def main():
    P = mp.Pool()
    out = ["Design loop in 3D, M tee, CMA-ES 4 variables (w, slope, bow, r), budget %d drapes, objective = error + %.2f*max(0, crease-%g)"
           % (BUDGET, m2.CREASE_COST, m2.CREASE_OK),
           "loop zh seed err err_all crease sag design"]
    refs = P.map(loop2, SEEDS)
    jobs = [(zh, s, key) for key in ("err_all", "err") for zh in ZHS for s in SEEDS]
    # centre-column loops are the 2D-style objective run in 3D; only zh=3 is run to bound the time
    jobs = [j for j in jobs if j[2] == "err_all" or j[0] == 3.0]
    res = P.map(loop3, jobs, chunksize=1)
    for (zh, s, key), h, sc in res:
        out.append(f"3d-{key} {zh:g} {s} {sc['err']:.3f} {sc['err_all']:.3f} {sc['crease']:.1f} {sc['sag']:.2f} {fmt(h)}")
    out.append("")
    out.append("2D-designed hangers (hanger-fit loop, centre-line error, 150 drapes) drawn in 3D")
    out.append("loop zh seed err err_all crease sag design")
    cases = [(s, h, zh) for s, h in refs for zh in ZHS]
    sc = P.map(lambda_free, [(h, zh) for s, h, zh in cases])
    for (s, h, zh), x in zip(cases, sc):
        out.append(f"2d-design {zh:g} {s} {x['err']:.3f} {x['err_all']:.3f} {x['crease']:.1f} {x['sag']:.2f} {fmt(h)}")
    for n, h in m2.STOCK.items():
        for zh, x in zip(ZHS, P.map(lambda_free, [(h, zh) for zh in ZHS])):
            out.append(f"stock-{n} {zh:g} - {x['err']:.3f} {x['err_all']:.3f} {x['crease']:.1f} {x['sag']:.2f} {fmt(h)}")
    (HERE / "design_results.txt").write_text("\n".join(out) + "\n")


def lambda_free(a):
    h, zh = a
    X, sh = drape(Arm(h, zh), G)
    return score(X, sh)


if __name__ == "__main__":
    main()
