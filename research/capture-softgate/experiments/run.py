"""Does a soft confidence weight, or the stereo matching cost, recover more of the gate's headroom?

    python experiments/run.py            # writes experiments/results.txt

Parameters are chosen on development seeds 0-2 (section A, by the printed rule), then frozen for every other section,
including the held-out seeds 7-9.
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from capture_softgate.scene import render, stereo_pair  # noqa: E402
from capture_softgate.stereo import match  # noqa: E402
from capture_softgate.synth import psnr  # noqa: E402
from capture_softgate.hybrid import make  # noqa: E402

BASE = 20.0
BYST = ((0.9, 0.6, 0.22, 1.7),)
STRATS = ["fill", "hard", "soft", "cost", "softcost", "oracle"]
DEV, HELD = (0, 1, 2), (7, 8, 9)
_cache = {}


def inputs(gap, b, noise, byst, seed):
    key = (gap, b, noise, byst, seed)
    if key not in _cache:
        a, c, t = BASE - gap / 2, BASE + gap / 2, BASE
        srcs = []
        for ang, s in ((a, seed), (c, seed + 10)):
            lc, _, rc, _ = stereo_pair(ang, b, byst, noise, s)
            z, _, _, cost = match(lc, rc, b)
            srcs.append((lc, z, ang, cost))
        truth, _ = render(t, byst)
        _cache[key] = (srcs, t, truth, min(srcs, key=lambda s: abs(s[2] - t))[0])
    return _cache[key]


def edge_excess(img, truth):
    """Mean gradient magnitude of img minus that of the truth (grey): positive = edges that are not in the scene (seams)."""
    def g(a):
        a = a.mean(-1)
        return np.abs(np.diff(a, axis=0))[:, :-1].mean() + np.abs(np.diff(a, axis=1))[:-1].mean()
    return float(g(img) - g(truth))


def avg(gap=15.0, b=0.2, noise=0.01, byst=(), seeds=DEV, strats=STRATS, **kw):
    acc = {k: [] for k in strats + ["near"]}
    seam = {k: [] for k in strats + ["near"]}
    for s in seeds:
        srcs, t, truth, nearest = inputs(gap, b, noise, byst, s * 100)
        for k in strats:
            out = make(k, srcs, t, truth=truth, **kw)
            acc[k].append(psnr(out, truth))
            seam[k].append(edge_excess(out, truth))
        acc["near"].append(psnr(nearest, truth))
        seam["near"].append(edge_excess(nearest, truth))
    return {k: float(np.mean(v)) for k, v in acc.items()}, {k: float(np.mean(v)) for k, v in seam.items()}


def row(label, r, keys=None, nd=2):
    keys = keys or STRATS + ["near"]
    return f"{label:>12}  " + "  ".join(f"{r[k]:8.{nd}f}" for k in keys)


def main():
    cols = STRATS + ["near"]
    H = "              " + "  ".join(f"{k:>8}" for k in cols)
    L = []
    # A. parameter selection on dev seeds only
    L += ["== A. Parameter sweeps on development seeds 0-2 (gap 15 deg, baseline 0.2 m, noise 0.01, no bystander); PSNR dB", "hard gate tau   psnr"]
    taus = [0.1, 0.2, 0.3, 0.5]
    hs = {t: avg(strats=["hard"], t0=t)[0]["hard"] for t in taus}
    L += [f"{t:13.2f}  {hs[t]:6.2f}" for t in taus]
    tau = max(hs, key=hs.get)
    L += [f"chosen tau = {tau} (best of the sweep)", "", "soft gate (t0, t1)   psnr"]
    pairs = [(0.05, 0.3), (0.1, 0.5), (0.15, 0.5), (0.1, 1.0), (0.2, 1.0)]
    ss = {p: avg(strats=["soft"], t0=p[0], t1=p[1])[0]["soft"] for p in pairs}
    L += [f"{str(p):>19}  {ss[p]:6.2f}" for p in pairs]
    t0, t1 = max(ss, key=ss.get)
    L += [f"chosen (t0, t1) = ({t0}, {t1})", "", "cost gate ct   psnr"]
    cts = [0.05, 0.07, 0.1, 0.15, 0.25]
    cs = {c: avg(strats=["cost"], ct=c)[0]["cost"] for c in cts}
    L += [f"{c:12.2f}  {cs[c]:6.2f}" for c in cts]
    ct = max(cs, key=cs.get)
    L += [f"chosen ct = {ct}", ""]
    kw = dict(t0=t0, t1=t1, ct=ct)

    # the hard gate keeps t0 as its threshold: use the chosen tau for it via a wrapper below
    def full(**a):
        r, s = avg(**a, **kw)
        rh, sh = avg(strats=["hard"], t0=tau, **{k: v for k, v in a.items() if k != "strats"})
        r["hard"], s["hard"] = rh["hard"], sh["hard"]
        return r, s

    def table(title, rows, seam=False):
        L.extend(["", title, H])
        for label, kws in rows:
            r, s = full(**kws)
            L.append(row(label, s, nd=4) if seam else row(label, r))
    L.pop() if L[-1] == "" else None
    table("== B. By gap between the source cameras (PSNR dB, seeds 0-2)", [(f"gap {g}", dict(gap=g)) for g in [8, 15, 30]])
    table("== C. Held out: seeds 7-9, parameters frozen from A (PSNR dB)",
          [("no bystand", dict(seeds=HELD)), ("bystander", dict(seeds=HELD, byst=BYST))])
    table("== D. With a bystander, by gap (PSNR dB, seeds 0-2)", [(f"gap {g}", dict(gap=g, byst=BYST)) for g in [8, 15, 30]])
    table("== E. By sensor noise (gap 15 deg; PSNR dB, seeds 0-2)", [(f"noise {n}", dict(noise=n)) for n in [0.0, 0.03, 0.06]])
    table("== F. Seam score: mean gradient magnitude minus the truth's, held-out seeds (lower is better; 0 = no false edges)",
          [("no bystand", dict(seeds=HELD)), ("bystander", dict(seeds=HELD, byst=BYST))], seam=True)
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
