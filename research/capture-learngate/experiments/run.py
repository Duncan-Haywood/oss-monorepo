"""Can a small regressor, trained on many random scenes, predict the per-pixel blend weight better than a hand-set ramp?

    python experiments/run.py            # writes experiments/results.txt (a few minutes)

Splits (every config draws its own camera gap, base azimuth, stereo baseline, noise, bystanders and ground texture):
  train   configs 0-39      fits the regressors and the hand-set gates (one sweep each, on the same data)
  val     configs 40-49     picks the regressor's size / penalty
  test    configs 100-139   new draws from the same ranges and new ground textures: the headline
  stress  configs 200-224   outside the training ranges (wider gap, three bystanders, heavy noise)
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from capture_learngate.scene import render, stereo_pair, SUBJECT  # noqa: E402
from capture_learngate.stereo import match  # noqa: E402
from capture_learngate.synth import psnr  # noqa: E402
from capture_learngate.hybrid import warped, plain, row_fill, weight  # noqa: E402
from capture_learngate.learn import features, ideal_weight, Ridge, MLP, FEATURES  # noqa: E402

TRAIN, VAL, TEST, STRESS = range(0, 40), range(40, 50), range(100, 140), range(200, 225)


def config(i, stress=False):
    rng = np.random.default_rng(1000 + i)
    c = dict(gap=rng.uniform(6, 32), base=rng.uniform(-10, 50), b=float(rng.choice([0.1, 0.2, 0.3])),
             noise=rng.uniform(0, 0.04), nby=int(rng.integers(0, 3)), tex=int(rng.integers(1, 5)))
    if i >= 100:
        c["tex"] = int(rng.integers(5, 9))           # ground textures never seen in training
    if stress:
        c.update(gap=rng.uniform(36, 46), nby=3, noise=rng.uniform(0.06, 0.09))
    by = []
    for _ in range(c["nby"]):
        a, r = rng.uniform(0, 2 * np.pi), rng.uniform(0.7, 1.8)
        by.append((r * np.sin(a), r * np.cos(a), rng.uniform(0.15, 0.3), rng.uniform(1.5, 1.9)))
    c["by"] = tuple(by)
    return c


def record(i, stress=False):
    c = config(i, stress)
    t = c["base"]
    srcs = []
    for k, ang in enumerate((t - c["gap"] / 2, t + c["gap"] / 2)):
        lc, _, rc, _ = stereo_pair(ang, c["b"], c["by"], c["noise"], 100 * i + 10 * k, c["tex"])
        z, _, _, cost = match(lc, rc, c["b"])
        srcs.append((lc, z, ang, cost))
    truth, _ = render(t, c["by"], tex=c["tex"])
    ws = warped(srcs, t)
    base, have = plain(ws)
    near = min(srcs, key=lambda s: abs(s[2] - t))[0]
    zbest = np.where(ws[0][1], ws[0][2], ws[1][2])
    X = features(ws, have, c["gap"])
    wstar, den = ideal_weight(base, near, truth)
    return dict(c=c, ws=ws, base=base, have=have, near=near, truth=truth, zbest=zbest, X=X, wstar=wstar, den=den)


def rows(recs, n=None, seed=0):
    X = np.concatenate([r["X"][r["have"]] for r in recs])
    y = np.concatenate([r["wstar"][r["have"]] for r in recs])
    w = np.concatenate([r["den"][r["have"]] for r in recs]) + 1e-3
    if n and len(X) > n:
        idx = np.random.default_rng(seed).choice(len(X), n, replace=False)
        X, y, w = X[idx], y[idx], w[idx]
    return X, y, w


def render_with(r, w):
    w = np.where(r["have"], w, 1.0)[..., None]
    return w * r["near"] + (1 - w) * r["base"]


def score(r, name, params=None, model=None):
    if name == "near":
        out = r["near"]
    elif name == "fill":
        out = row_fill(r["base"], r["have"], r["zbest"])
    elif name == "oracle":
        better = np.abs(r["near"] - r["truth"]).sum(-1) < np.abs(r["base"] - r["truth"]).sum(-1)
        out = np.where(better[..., None], r["near"], np.where(r["have"][..., None], r["base"], r["near"]))
    elif name == "lstsq":
        out = render_with(r, r["wstar"])
    elif name in ("hard", "soft"):
        out = render_with(r, weight(name, r["ws"], r["have"], params[0], params[1], 0.4, 1, 1))
    else:
        out = render_with(r, model.predict(r["X"].reshape(-1, len(FEATURES))).reshape(r["have"].shape))
    return psnr(out, r["truth"])


def mean_psnr(recs, name, params=None, model=None):
    return float(np.mean([score(r, name, params, model) for r in recs]))


def main():
    L = []
    print("rendering ...", flush=True)
    tr = [record(i) for i in TRAIN]; va = [record(i) for i in VAL]
    te = [record(i) for i in TEST]; st = [record(i, True) for i in STRESS]

    # A. hand-set gates, one sweep each on the training configs
    L += ["== A. Hand-set gates: sweep on the 40 training configs; mean PSNR dB", "hard tau   psnr"]
    hs = {t: mean_psnr(tr, "hard", (t, 0)) for t in [0.1, 0.2, 0.3, 0.5, 0.8]}
    L += [f"{t:8.2f}  {v:6.2f}" for t, v in hs.items()]
    tau = max(hs, key=hs.get)
    L += [f"chosen tau = {tau}", "", "soft (t0, t1)   psnr"]
    ss = {p: mean_psnr(tr, "soft", p) for p in [(0.05, 0.3), (0.1, 0.5), (0.15, 0.5), (0.1, 1.0), (0.2, 1.0), (0.3, 1.2)]}
    L += [f"{str(p):>13}  {v:6.2f}" for p, v in ss.items()]
    soft = max(ss, key=ss.get)
    L += [f"chosen (t0, t1) = {soft}", ""]

    # B. regressors: choose size / penalty on the validation configs
    Xtr, ytr, wtr = rows(tr, 300000)
    L += [f"== B. Regressors fitted on {len(Xtr)} training pixels from 40 configs; validation PSNR dB (10 configs)", "model                  val psnr"]
    cands = {}
    for lam in [1.0, 100.0]:
        cands[f"ridge lam={lam:g}"] = Ridge(lam).fit(Xtr, ytr, wtr)
    for h in [8, 24, 64]:
        cands[f"mlp hidden={h}"] = MLP(hidden=h, epochs=40).fit(Xtr, ytr, wtr)
    vs = {k: mean_psnr(va, "model", model=m) for k, m in cands.items()}
    L += [f"{k:20}  {v:8.2f}" for k, v in vs.items()]
    best_ridge = max((k for k in vs if k.startswith("ridge")), key=vs.get)
    best_mlp = max((k for k in vs if k.startswith("mlp")), key=vs.get)
    ridge, mlp = cands[best_ridge], cands[best_mlp]
    L += [f"chosen: {best_ridge}, {best_mlp}", ""]

    # C/D. test and stress
    cols = ["fill", "hard", "soft", "ridge", "mlp", "lstsq", "oracle", "near"]

    def table(title, recs):
        res = {}
        for k in cols:
            res[k] = np.array([score(r, {"ridge": "model", "mlp": "model"}.get(k, k), {"hard": (tau, 0), "soft": soft}.get(k),
                                     {"ridge": ridge, "mlp": mlp}.get(k)) for r in recs])
        L.extend([title, "  ".join(f"{k:>7}" for k in cols), "  ".join(f"{res[k].mean():7.2f}" for k in cols)])
        for a, b in (("mlp", "soft"), ("mlp", "hard"), ("ridge", "soft"), ("soft", "hard")):
            d = res[a] - res[b]
            L.append(f"{a} minus {b}: mean {d.mean():+.2f} dB, standard error {d.std(ddof=1) / np.sqrt(len(d)):.2f}, ahead in {int((d > 0).sum())} of {len(d)} configs")
        gap_lstsq = res["lstsq"].mean() - res["hard"].mean()
        L.append(f"share of the hard-gate-to-lstsq headroom ({gap_lstsq:.2f} dB) recovered: soft {(res['soft'].mean() - res['hard'].mean()) / gap_lstsq:.2f}, "
                 f"ridge {(res['ridge'].mean() - res['hard'].mean()) / gap_lstsq:.2f}, mlp {(res['mlp'].mean() - res['hard'].mean()) / gap_lstsq:.2f}")
        L.append("")
        return res

    L.append("")
    rt = table("== C. Test: 40 new configs, new ground textures, same ranges; mean PSNR dB", te)
    table("== D. Stress: 25 configs outside the training ranges (gap 36 to 46 deg, 3 bystanders, noise 0.06 to 0.09)", st)

    # E. by condition on test
    L += ["== E. Test split by number of bystanders (mean PSNR dB)", "bystanders  n   hard   soft   mlp"]
    for n in range(3):
        sub = [i for i, r in enumerate(te) if r["c"]["nby"] == n]
        L.append(f"{n:10d} {len(sub):3d}  " + "  ".join(f"{rt[k][sub].mean():5.2f}" for k in ("hard", "soft", "mlp")))
    L.append("")

    # F. ablation: refit the MLP without a feature group, test PSNR
    groups = {"all features": [], "no matching cost": ["cost", "cost_max3"], "no texture / depth edge": ["texture", "depth_edge", "depth_gap"],
              "no spatial context": ["disagree_max3", "disagree_mean5", "cost_max3", "near_hole"], "disagreement only": [f for f in FEATURES if not f.startswith("disagree") and f != "gap"]}
    L += ["== F. Ablation: MLP refitted with a feature group removed (feature zeroed); test PSNR dB", "features                    test psnr"]
    h = int(best_mlp.split("=")[1])
    for name, drop in groups.items():
        keep = np.array([f not in drop for f in FEATURES], float)
        m = MLP(hidden=h, epochs=40).fit(Xtr * keep, ytr, wtr)

        class Masked:
            def predict(self, X, m=m, keep=keep):
                return m.predict(X * keep)
        L.append(f"{name:26}  {mean_psnr(te, 'model', model=Masked()):8.2f}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
