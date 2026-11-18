"""Milestone 4p, step 3: the 7 + 6 update test with the old and new view sets from different pools.

    python3 experiments/m4p_fresh/analyse.py            # ~5 min, after run.py
    python3 experiments/m4p_fresh/analyse.py --figure   # redraw fresh.png from summary.json

Pools: A = milestone 4j's 13 views per TUM unit (fr1, fr3; milestone 4n's k1 + k2 solves), B = this
milestone's 13 fresh views (fr1b, fr3b; run.py's k1 + k2 solves). Each pool gets its own k1 + k2 twin
(milestone 4i's twin via milestone 4n's private copy with NK = 2) and 10,000 resid-model draws
(seed 20261114; A's are the draws milestone 4n used, B's a separate stream). On milestone 4g's 1,716
split index pairs of the 7 + 6 design, the test is scored within each pool (A must reproduce milestone
4n) and across pools in both directions, against milestone 4i's per-split twin threshold built from
the two pools' twins (its `references`, as in the swap scenario). Scores H92-H95 (LOG.md, 2026-11-16,
milestone 4p planned) and writes summary.json and fresh.png.
"""
import gzip, importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import fresh  # noqa: E402

tu = fresh.tu
_spec = importlib.util.spec_from_file_location("m4n_for_m4p", os.path.join(ROOT, "experiments", "m4n_k2", "analyse.py"))
m4n = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4n)

RESULTS = {"A": os.path.join(ROOT, "experiments", "m4n_k2", "results.json.gz"), "B": os.path.join(HERE, "results.json.gz")}
UNITS = tu.UNITS                       # fr1, fr3
POOL = {("A", u): u for u in UNITS} | {("B", u): u + "b" for u in UNITS}
DES = (7, 6)
S_LIST = (0.96, 0.98, 0.99, 1.0, 1.01, 1.02, 1.04)
PM2 = (0.98, 1.02)
M4N = dict(S0={"fr1": 0.0059, "fr3": 0.0012}, pm2=0.148)    # milestone 4n, k1 + k2, 7 + 6 (LOG.md)


def load_sols(m4g):
    out = {}
    for key, path in RESULTS.items():
        with gzip.open(path, "rt") as fh:
            res = json.load(fh)
        for r in res["solutions"]:
            out.setdefault(r["cam"], {})[tuple(r["views"])] = r["sol"]
        for cam, c in res["cams"].items():
            out.setdefault("_f0", {})[cam] = c["f0"]
    return out


def decide(m4g, To, Tn, om, nm, s):
    """milestone 4g's decisions() for one (old pool, new pool, scale): the same keep rule, d, z^2."""
    keep = To["usable"][om] & Tn["usable"][nm]
    o, n = om[keep], nm[keep]
    d = s * Tn["f"][n] - To["f"][o]
    row = dict(old=o, new=n, d=d)
    for est in ("J", "R"):
        var = To[est][o] + s * s * Tn[est][n]
        with np.errstate(divide="ignore", invalid="ignore"):
            row["z2_" + est] = np.where(var > 0, d * d / var, np.inf)
    return row


def twin_pool(m4j, obs, size, f0, f13, stream):
    m4i, twin = m4j.m4i, m4j.twin
    tw = twin.fit_all(obs, size, f0)
    assert abs(tw["intr"][0] / f13 - 1) < 1e-8, (tw["intr"][0], f13)
    G, idx = twin.gain_matrix(tw, sizes=range(5, 8))
    rng = np.random.default_rng([m4i.SEED, m4i.MODELS.index("resid"), stream])
    parts = [m4n.twin_sets(m4j.m4g, G, idx, twin.noise(rng, "resid", m4i.CHUNK, tw)) for _ in range(m4i.N_DRAWS // m4i.CHUNK)]
    TW = tuple(np.concatenate([p[j] for p in parts], axis=1) for j in range(3))
    # the twin's sd of the 13-view f per unit pixel noise (resid model scaled to the fit's rms)
    g13 = twin.gain(tw, list(range(13)))
    return tw, TW, idx, float(np.linalg.norm(g13))


def zhang(obs, size):
    import cv2
    obj = [tu.sc.board_points().astype(np.float32)] * len(obs)
    img = [c.astype(np.float32).reshape(-1, 1, 2) for c in obs]
    K0 = np.array([[size[0], 0, size[0] / 2], [0, size[0], size[1] / 2], [0, 0, 1.0]])
    out = {}
    for name, extra in (("k1", cv2.CALIB_FIX_K2 | cv2.CALIB_FIX_K3), ("k1k2", cv2.CALIB_FIX_K3), ("k1k2k3", 0)):
        rms, K, d, *_ = cv2.calibrateCamera(obj, img, size, K0.copy(), np.zeros(5),
                                            flags=cv2.CALIB_USE_INTRINSIC_GUESS | cv2.CALIB_FIX_ASPECT_RATIO
                                            | cv2.CALIB_ZERO_TANGENT_DIST | extra)
        out[name] = dict(f=float(K[0, 0]), rms=float(rms))
    return out


def unit_arm(m4j, sols, unit):
    m4g, m4i = m4j.m4g, m4j.m4i
    om, nm = m4g.splits(*DES)
    T, TW, IDX, tw, g13, anchors = {}, {}, {}, {}, {}, {}
    for p in ("A", "B"):
        cam = POOL[(p, unit)]
        T[p] = m4g.per_set(sols[cam])
        obs, size, _ = fresh.load(cam)
        stream = UNITS.index(unit) + (0 if p == "A" else 2)      # A: milestone 4n's stream
        tw[p], TW[p], IDX[p], g13[p] = twin_pool(m4j, obs, size, sols["_f0"][cam], T[p]["f13"], stream)
        c = tu.TUM_CALIB[unit]
        anchors[p] = dict(pool=cam, f13=float(T[p]["f13"]), rel_tum=float(T[p]["f13"] / ((c[0] + c[1]) / 2) - 1),
                          rms13=tw[p]["rms"], intr=[float(x) for x in tw[p]["intr"]],
                          twin_sd_f13=g13[p] * tw[p]["rms"], zhang=zhang(obs, size),
                          sizes={n: m4n.spread(sols[cam], m4g.ok, n) for n in (5, 6, 7)})
    out, qmed = {}, {}
    for po, pn in (("A", "A"), ("B", "B"), ("A", "B"), ("B", "A")):
        row0 = decide(m4g, T[po], T[pn], om, nm, 1.0)
        qR, qJ, _, _ = m4i.references(TW[po], TW[pn], IDX[po], IDX[pn], row0["old"], row0["new"])
        qmed[po + pn] = float(np.median(qR))
        for s in S_LIST:
            row = decide(m4g, T[po], T[pn], om, nm, s)
            assert np.array_equal(row["old"], row0["old"]) and np.array_equal(row["new"], row0["new"])
            out[(po + pn, s)] = dict(R_geom=row["z2_R"] > qR, J_geom=row["z2_J"] > qJ,
                                     R_chi2=row["z2_R"] > m4g.CHI2_1_99, n=int(len(qR)))
    del TW
    return dict(fired=out, anchors=anchors, qR_median=qmed)


def rate(arms, dirs, units=UNITS, s_set=(1.0,), test="R_geom"):
    n = det = 0
    for u in units:
        for d in dirs:
            for s in s_set:
                f = arms[u]["fired"][(d, s)][test]
                n, det = n + len(f), det + int(f.sum())
    return det / n if n else float("nan")


def main():
    m4j = m4n.m4j_module(2)
    sols = load_sols(m4j.m4g)
    arms = {u: unit_arm(m4j, sols, u) for u in UNITS}
    X = ("AB", "BA")
    # the A arm must reproduce milestone 4n's k1 + k2 7 + 6 figures
    check = dict(S0={u: rate(arms, ("AA",), (u,)) for u in UNITS}, pm2=rate(arms, ("AA",), s_set=PM2))
    assert all(abs(check["S0"][u] - M4N["S0"][u]) < 5e-5 for u in UNITS), check
    assert abs(check["pm2"] - M4N["pm2"]) < 5e-4, check
    H = {}
    h = {u: rate(arms, X, (u,)) for u in UNITS}
    h["holds"] = bool(all(h[u] <= 0.025 for u in UNITS)); H["H92"] = h
    h = dict(pooled=rate(arms, X)); h["holds"] = bool(h["pooled"] <= 0.01); H["H93"] = h
    h = dict(fresh=rate(arms, X, s_set=PM2), in_sample=check["pm2"]); h["ratio"] = h["fresh"] / h["in_sample"]
    h["holds"] = bool(h["ratio"] >= 0.7); H["H94"] = h
    h = {u: arms[u]["anchors"]["B"]["f13"] / arms[u]["anchors"]["A"]["f13"] - 1 for u in UNITS}
    h["holds"] = bool(all(abs(h[u]) <= 0.005 for u in UNITS)); H["H95"] = h
    table = []
    for u in UNITS:
        for d in ("AA", "BB", "AB", "BA"):
            for s in S_LIST:
                table.append(dict(unit=u, dir=d, s=s, n=arms[u]["fired"][(d, s)]["n"],
                                  **{t: rate(arms, (d,), (u,), (s,), t) for t in ("R_geom", "J_geom", "R_chi2")}))
    for u in UNITS:   # how far apart the two pools' 13-view f are, in the twins' own sd
        a = arms[u]["anchors"]
        a["gap_in_twin_sd"] = (a["B"]["f13"] - a["A"]["f13"]) / float(np.hypot(a["A"]["twin_sd_f13"], a["B"]["twin_sd_f13"]))
    out = dict(check=check, hypotheses=H, anchors={u: arms[u]["anchors"] for u in UNITS},
               qR_median={u: arms[u]["qR_median"] for u in UNITS}, table=table,
               pooled={d: {str(s): rate(arms, (d,) if d != "X" else X, s_set=(s,)) for s in S_LIST} for d in ("AA", "BB", "X")},
               pm2={d: {u: rate(arms, (d,), (u,), PM2) for u in UNITS} for d in ("AA", "BB", "AB", "BA")})
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != "table"}, indent=1))
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    figure(out, os.path.join(HERE, "fresh.png"))


def figure(summary, path):
    """Two panels (one per unit): firing rate against the focal change, within A, within B, across pools."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    lab = {"fr1": "fr1 (Kinect)", "fr3": "fr3 (Xtion)"}
    lines = ((("AA",), "--", "o", "#1b2f6b", "within A (milestone 4j's views)"),
             (("BB",), ":", "^", "#7f8c8d", "within B (fresh views)"),
             (("AB", "BA"), "-", "s", "#c0392b", "old from one pool, new from the other"))
    fig, axes = plt.subplots(1, 2, figsize=(8.4, 3.8), sharey=True)
    for ax, u in zip(axes, UNITS):
        for dirs, ls, mk, c, name in lines:
            rows = [r for r in summary["table"] if r["unit"] == u and r["dir"] in dirs]
            ys = [sum(r["R_geom"] * r["n"] for r in rows if r["s"] == s) / sum(r["n"] for r in rows if r["s"] == s)
                  for s in S_LIST]
            ax.plot([100 * (s - 1) for s in S_LIST], ys, ls, marker=mk, ms=3.5, color=c, label=name)
        ax.axhline(0.01, color="grey", lw=0.8, ls=":")
        ax.axhline(0.025, color="grey", lw=0.6, ls="-.")
        ax.set_title(lab[u], fontsize=9)
        ax.set_xlabel("focal change applied to the new views (%)")
    axes[0].set_ylabel("share of 7 + 6 splits where the test fires")
    axes[0].set_ylim(-0.02, 0.62); axes[0].legend(fontsize=7.5, frameon=False, loc="upper center")
    fig.suptitle("Milestone 4p: the update test on views it has never seen (TUM RGB-D, k1 + k2)", fontsize=9.5)
    fig.tight_layout()
    fig.savefig(path, dpi=130)


def redraw():
    with open(os.path.join(HERE, "summary.json")) as fh:
        figure(json.load(fh), os.path.join(HERE, "fresh.png"))


if __name__ == "__main__":
    redraw() if sys.argv[1:] == ["--figure"] else main()
