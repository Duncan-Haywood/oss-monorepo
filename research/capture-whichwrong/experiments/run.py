"""Does telling the model WHICH source is wrong close more of the headroom left by capture-learngate?

    python experiments/run.py            # writes experiments/results.txt (a few minutes)

Same scenes and splits as capture-learngate (configs drawn from stated ranges):
  train 0-39 (fits everything)   val 40-49 (picks the network size)   test 100-139 (new ground textures)   stress 200-224
Systems, all scored by PSNR against the ray-traced midpoint view:
  hard, soft   hand-set gates (swept on train)
  mlp_old      capture-learngate's 12 features -> w                  (reproduced here, the reference)
  mlp_new      + z_order and cross-check features -> w
  mlp_src      mlp_new, then a second network predicting a per-pixel source weight s, then w refitted on the mixed base
  lstsq        best w given the truth;   lstsq_s  best s then best w (both use the truth: bounds, not methods)
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from capture_whichwrong.scene import render, stereo_pair  # noqa: E402
from capture_whichwrong.stereo import match  # noqa: E402
from capture_whichwrong.synth import psnr  # noqa: E402
from capture_whichwrong.hybrid import warped, plain, weight  # noqa: E402
from capture_whichwrong.learn import ideal_weight, MLP, FEATURES as OLD  # noqa: E402
from capture_whichwrong import which  # noqa: E402

TRAIN, VAL, TEST, STRESS = range(0, 40), range(40, 50), range(100, 140), range(200, 225)
NOLD = len(OLD)


def config(i, stress=False):
    rng = np.random.default_rng(1000 + i)
    c = dict(gap=rng.uniform(6, 32), base=rng.uniform(-10, 50), b=float(rng.choice([0.1, 0.2, 0.3])),
             noise=rng.uniform(0, 0.04), nby=int(rng.integers(0, 3)), tex=int(rng.integers(1, 5)))
    if i >= 100:
        c["tex"] = int(rng.integers(5, 9))
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
    xe = which.cross_errors(srcs, t)
    X = which.features(ws, have, c["gap"], xe)
    wstar, den = ideal_weight(base, near, truth)
    sstar, sden = which.ideal_source_weight(ws[0][0], ws[1][0], truth)
    both = ws[0][1] & ws[1][1]
    return dict(c=c, ws=ws, base=base, have=have, near=near, truth=truth, X=X, wstar=wstar, den=den,
                sstar=sstar, sden=sden, both=both)


def sub(X, y, w, n, seed=0):
    if n and len(X) > n:
        idx = np.random.default_rng(seed).choice(len(X), n, replace=False)
        return X[idx], y[idx], w[idx]
    return X, y, w


def rows_w(recs, cols, n=None, bases=None):
    """Training rows for the nearest-camera weight; `bases` optionally replaces each record's base (the mixed one)."""
    Xs, ys, ws_ = [], [], []
    for k, r in enumerate(recs):
        b = r["base"] if bases is None else bases[k]
        wstar, den = ideal_weight(b, r["near"], r["truth"])
        m = r["have"]
        Xs.append(r["X"][m][:, cols]); ys.append(wstar[m]); ws_.append(den[m] + 1e-3)
    return sub(np.concatenate(Xs), np.concatenate(ys), np.concatenate(ws_), n)


def rows_s(recs, cols, n=None):
    m = [r["both"] for r in recs]
    X = np.concatenate([r["X"][k][:, cols] for r, k in zip(recs, m)])
    y = np.concatenate([r["sstar"][k] for r, k in zip(recs, m)])
    w = np.concatenate([r["sden"][k] for r, k in zip(recs, m)]) + 1e-3
    return sub(X, y, w, n)


def predict_map(model, r, cols):
    return model.predict(r["X"].reshape(-1, r["X"].shape[-1])[:, cols]).reshape(r["have"].shape)


def out_from(r, base, w):
    w = np.where(r["have"], w, 1.0)[..., None]
    return w * r["near"] + (1 - w) * base


class Sys:
    """A scorable system: optional source model, then a weight model on the base it produces."""
    def __init__(self, cols, wmodel, smodel=None):
        self.cols, self.wm, self.sm = cols, wmodel, smodel

    def base(self, r):
        return r["base"] if self.sm is None else which.mix(r["ws"], r["have"], predict_map(self.sm, r, self.cols))

    def out(self, r):
        b = self.base(r)
        return out_from(r, b, predict_map(self.wm, r, self.cols))


def score_name(r, name, params=None, system=None):
    if name == "near":
        return psnr(r["near"], r["truth"])
    if name == "lstsq":
        return psnr(out_from(r, r["base"], r["wstar"]), r["truth"])
    if name == "lstsq_s":
        b = which.mix(r["ws"], r["have"], r["sstar"])
        w, _ = ideal_weight(b, r["near"], r["truth"])
        return psnr(out_from(r, b, w), r["truth"])
    if name == "s_only":
        return psnr(which.mix(r["ws"], r["have"], r["sstar"]), r["truth"])
    if name in ("hard", "soft"):
        return psnr(out_from(r, r["base"], weight(name, r["ws"], r["have"], params[0], params[1], 0.4, 1, 1)), r["truth"])
    return psnr(system.out(r), r["truth"])


def mean(recs, name, params=None, system=None):
    return float(np.mean([score_name(r, name, params, system) for r in recs]))


def main():
    L = []
    print("rendering ...", flush=True)
    tr = [record(i) for i in TRAIN]; va = [record(i) for i in VAL]
    te = [record(i) for i in TEST]; st = [record(i, True) for i in STRESS]
    old = list(range(NOLD)); new = list(range(len(which.FEATURES)))

    L += ["== A. Hand-set gates, swept on the 40 training configs; mean PSNR dB", "hard tau   psnr"]
    hs = {t: mean(tr, "hard", (t, 0)) for t in [0.1, 0.2, 0.3, 0.5, 0.8]}
    L += [f"{t:8.2f}  {v:6.2f}" for t, v in hs.items()]
    tau = max(hs, key=hs.get)
    ss = {p: mean(tr, "soft", p) for p in [(0.05, 0.3), (0.1, 0.5), (0.15, 0.5), (0.1, 1.0), (0.2, 1.0), (0.3, 1.2)]}
    L += ["soft (t0, t1)   psnr"] + [f"{str(p):>13}  {v:6.2f}" for p, v in ss.items()]
    soft = max(ss, key=ss.get)
    L += [f"chosen tau = {tau}, (t0, t1) = {soft}", ""]

    # B. fit; hidden size picked on validation
    def fit_w(cols, h, bases=None):
        X, y, w = rows_w(tr, cols, 300000, bases)
        return MLP(hidden=h, epochs=40).fit(X, y, w)

    def fit_s(cols, h):
        X, y, w = rows_s(tr, cols, 300000)
        return MLP(hidden=h, epochs=40).fit(X, y, w)

    L += ["== B. Network size picked on the 10 validation configs (mlp_new), validation PSNR dB", "hidden  val psnr"]
    vv = {}
    for h in (24, 64):
        vv[h] = mean(va, "model", system=Sys(new, fit_w(new, h)))
        L.append(f"{h:6d}  {vv[h]:7.2f}")
    h = max(vv, key=vv.get)
    L += [f"chosen hidden = {h}", ""]
    sys_old = Sys(old, fit_w(old, h))
    sys_new = Sys(new, fit_w(new, h))
    sm = fit_s(new, h)
    mixed_tr = [which.mix(r["ws"], r["have"], predict_map(sm, r, new)) for r in tr]
    sys_src = Sys(new, fit_w(new, h, mixed_tr), sm)
    systems = {"mlp_old": sys_old, "mlp_new": sys_new, "mlp_src": sys_src}

    cols = ["hard", "soft", "mlp_old", "mlp_new", "mlp_src", "s_only", "lstsq", "lstsq_s", "near"]

    def table(title, recs):
        res = {k: np.array([score_name(r, k if k in systems or k in ("hard", "soft") or k in ("near", "lstsq", "lstsq_s", "s_only") else k,
                                       {"hard": (tau, 0), "soft": soft}.get(k), systems.get(k)) for r in recs]) for k in cols}
        L.extend([title, "  ".join(f"{k:>8}" for k in cols), "  ".join(f"{res[k].mean():8.2f}" for k in cols)])
        for a, b in (("mlp_old", "soft"), ("mlp_new", "mlp_old"), ("mlp_src", "mlp_new"), ("mlp_src", "mlp_old")):
            d = res[a] - res[b]
            L.append(f"{a} minus {b}: mean {d.mean():+.2f} dB, standard error {d.std(ddof=1) / np.sqrt(len(d)):.2f}, ahead in {int((d > 0).sum())} of {len(d)} configs")
        head = res["lstsq"].mean() - res["hard"].mean()
        L.append(f"share of the hard-to-lstsq headroom ({head:.2f} dB) recovered: soft {(res['soft'].mean() - res['hard'].mean()) / head:.2f}, "
                 + ", ".join(f"{k} {(res[k].mean() - res['hard'].mean()) / head:.2f}" for k in ("mlp_old", "mlp_new", "mlp_src")))
        L.append("")
        return res

    rt = table("== C. Test: 40 configs, new ground textures; mean PSNR dB", te)
    table("== D. Stress: 25 configs outside the training ranges; mean PSNR dB", st)

    L += ["== E. Test split by number of bystanders (mean PSNR dB)", "bystanders  n   soft  mlp_old  mlp_new  mlp_src"]
    for n in range(3):
        idx = [i for i, r in enumerate(te) if r["c"]["nby"] == n]
        L.append(f"{n:10d} {len(idx):3d}  " + "  ".join(f"{rt[k][idx].mean():6.2f}" for k in ("soft", "mlp_old", "mlp_new", "mlp_src")))
    L.append("")

    # F. which new feature matters (mlp_new refitted without a group, test)
    L += ["== F. Ablation of the new features (network refitted on the remaining columns; test PSNR dB)", "features                      test psnr"]
    names = which.FEATURES
    groups = {"all 16": new, "no z_order": [i for i in new if names[i] != "z_order"],
              "no cross-check (xerr0/1, xdiff)": [i for i in new if names[i] not in ("xerr0", "xerr1", "xdiff")],
              "old 12 only": old}
    for g, cs in groups.items():
        L.append(f"{g:30}  {mean(te, 'model', system=Sys(cs, fit_w(cs, h))):8.2f}")
    L.append("")

    # H. is the source-weight gain from the new features or from having a source weight at all?
    sm_old = fit_s(old, h)
    mt_old = [which.mix(r["ws"], r["have"], predict_map(sm_old, r, old)) for r in tr]
    sys_src_old = Sys(old, fit_w(old, h, mt_old), sm_old)
    L += ["== H. Source weight with only the 12 old features (both networks), test PSNR dB",
          f"mlp_src with old 12 features: {mean(te, 'model', system=sys_src_old):.2f}   with all 16: {rt['mlp_src'].mean():.2f}   (mlp_old, no source weight: {rt['mlp_old'].mean():.2f})", ""]

    # G. how well does the source weight itself do on pixels where both warps are valid
    L += ["== G. Source weight on test pixels where both warps are valid: PSNR of the mixed synthesis (before any raw-camera blend)",
          f"source 0 only (nearest warp first, as before): {np.mean([psnr(r['base'], r['truth']) for r in te]):.2f}"
          f"   learned s: {np.mean([psnr(which.mix(r['ws'], r['have'], predict_map(sm, r, new)), r['truth']) for r in te]):.2f}"
          f"   best s (truth): {np.mean([score_name(r, 's_only') for r in te]):.2f}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
