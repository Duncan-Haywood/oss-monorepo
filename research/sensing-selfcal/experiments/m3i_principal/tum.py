"""Milestone 3i, part A: condition each TUM natural-feature window's focal length on the principal
point a robot already knows from its last board calibration (first order; the TUM host still refuses
the proxy, so no re-solve).

Reads milestone 3b's stored 5x5 intrinsics covariances (lowest-cost start = milestone 3c's solve,
asserted, as in milestone 3g), milestone 3c's scored windows and errors, and the TUM board corners of
milestone 4j. The board reference is milestone 4n's Zhang k1 + k2 fit, re-run here to read its
principal point (milestone 4n kept only f and d; the re-run's f and d must match its summary).
Conditioned estimates (milestone 3g's formula, f_c = f + S_fk S_kk^-1 (ref - k)):
  ec_c   pinning (c_x, c_y)            at the board's principal point,
  ec_ck  pinning (c_x, c_y, k1, k2)    at the board's principal point and distortion,
  ec_tum pinning (c_x, c_y)            at TUM's published principal point (unscored).
Writes tum_summary.json and principal.png (with the board part's results if present).
H154-H157 were written in ../../LOG.md before this script first ran.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(EXP, "m3d_pool"))
sys.path.insert(0, os.path.join(EXP, "m4j_tum"))
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("m3g_analyse", os.path.join(EXP, "m3g_condk12", "analyse.py"))
g3 = importlib.util.module_from_spec(_spec)   # milestone 3g: condition, best_start (by path: our analyse.py differs)
_spec.loader.exec_module(g3)
import pool  # noqa: E402
import tumunit as tu  # noqa: E402

SEQS = g3.SEQS


def board_ref(unit):
    """Zhang k1 + k2 on the unit's 13 board views, milestone 4n's flags; returns f, cx, cy, k1, k2."""
    import cv2
    obs, size, _ = tu.load(unit)
    obj = [tu.sc.board_points().astype(np.float32)] * len(obs)
    img = [c.astype(np.float32).reshape(-1, 1, 2) for c in obs]
    K0 = np.array([[size[0], 0, size[0] / 2], [0, size[0], size[1] / 2], [0, 0, 1.0]])
    rms, K, d, *_ = cv2.calibrateCamera(obj, img, size, K0.copy(), np.zeros(5),
                                        flags=cv2.CALIB_USE_INTRINSIC_GUESS | cv2.CALIB_FIX_ASPECT_RATIO
                                        | cv2.CALIB_ZERO_TANGENT_DIST | cv2.CALIB_FIX_K3)
    return {"f": float(K[0, 0]), "cx": float(K[0, 2]), "cy": float(K[1, 2]),
            "k1": float(d.ravel()[0]), "k2": float(d.ravel()[1]), "rms": float(rms)}


def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def load():
    m4n = json.load(open(os.path.join(EXP, "m4n_k2", "summary.json")))["zhang"]
    refs = {}
    for u in ("fr1", "fr3"):
        r = board_ref(u)
        z = m4n[u]["k1k2"]
        assert abs(r["f"] - z["f"]) < 1e-6 * z["f"] and np.allclose([r["k1"], r["k2"]], z["d"][:2], atol=1e-8), (u, r, z)
        refs[u] = r
    m3b = {(w["seq"], w["window"]): w for w in
           json.load(open(os.path.join(EXP, "m3b_natural", "results.json")))["windows"]}
    m3c = {(w["seq"], w["window"]): w for w in
           json.load(open(os.path.join(EXP, "m3c_jackknife", "results.json")))["windows"]}
    m3g = {(w["seq"], w["window"]): w for w in
           json.load(open(os.path.join(EXP, "m3g_condk12", "summary.json")))["windows"]}
    rows = []
    for w in json.load(open(os.path.join(EXP, "m3c_jackknife", "summary.json")))["windows"]:
        if w["why"] != "ok":
            continue
        key = (w["seq"], w["window"])
        b, c = g3.best_start(m3b[key]), m3c[key]
        intr, cov = np.array(b["intr"]), np.array(b["cov"])
        assert np.allclose(intr, c["intr"], rtol=1e-9, atol=1e-12), key
        R = refs[w["unit"]]
        fc2, _ = g3.condition(intr, cov, ("k1", "k2"), (R["k1"], R["k2"]))
        assert abs(fc2 - m3g[key]["fc2"]) < 1e-6 * fc2, key          # reproduces milestone 3g
        fcc, rc = g3.condition(intr, cov, ("cx", "cy"), (R["cx"], R["cy"]))
        fcck, rck = g3.condition(intr, cov, ("cx", "cy", "k1", "k2"), (R["cx"], R["cy"], R["k1"], R["k2"]))
        T = tu.TUM_CALIB[w["unit"]]
        fct, _ = g3.condition(intr, cov, ("cx", "cy"), (T[2], T[3]))
        sd = np.sqrt(np.diag(cov))
        ref = w["ref"]
        rows.append({"seq": w["seq"], "unit": w["unit"], "window": w["window"], "ref": ref, "f": intr[0],
                     "cx": intr[1], "cy": intr[2], "dcx": intr[1] - R["cx"], "dcy": intr[2] - R["cy"],
                     "fcc": fcc, "fcck": fcck, "fct": fct,
                     "e": (intr[0] - ref) / ref, "ec_c": (fcc - ref) / ref, "ec_ck": (fcck - ref) / ref,
                     "ec_tum": (fct - ref) / ref, "ec2": m3g[key]["ec2"],
                     "step_c": (fcc - intr[0]) / intr[0], "step_ck": abs(fcck - intr[0]) / intr[0],
                     "corr_f_cx": float(cov[0, 1] / (sd[0] * sd[1])), "corr_f_cy": float(cov[0, 2] / (sd[0] * sd[2])),
                     "sd_ratio_c": rc, "sd_ratio_ck": rck, "sd_jk": w["sd_jk"]})
    rows.sort(key=lambda r: (r["seq"], r["window"]))
    return rows, refs


def main():
    rows, refs = load()
    A = lambda k, rs=rows: np.array([r[k] for r in rs])  # noqa: E731
    med = lambda x: float(np.median(x))  # noqa: E731
    per = {}
    for s in SEQS:
        rs = [r for r in rows if r["seq"] == s]
        per[s] = {"n": len(rs),
                  **{f"median_{k}": med(A(k, rs)) for k in ("e", "ec_c", "ec_ck", "ec_tum", "ec2", "step_c", "step_ck",
                                                           "dcx", "dcy", "corr_f_cx", "corr_f_cy",
                                                           "sd_ratio_c", "sd_ratio_ck")},
                  **{f"median_abs_{k}": med(abs(A(k, rs))) for k in ("e", "ec_c", "ec_ck", "ec_tum", "ec2", "step_c")}}
    h = {}
    m_e, m_c = med(abs(A("e"))), med(abs(A("ec_c")))
    h["H154"] = {"median_abs_e": m_e, "median_abs_ec_c": m_c, "ratio": m_c / m_e, "held": m_c <= 0.8 * m_e}
    m_ck = med(abs(A("ec_ck")))
    h["H155"] = {"median_abs_ec_ck": m_ck, "median_abs_e": m_e, "median_abs_ec2_m3g": med(abs(A("ec2"))),
                 "held": m_ck <= m_e}
    rho = spearman(A("step_c"), A("e"))
    h["H156"] = {"spearman_step_vs_e": rho, "held": rho <= -0.4}
    st = med(abs(A("step_c")))
    h["H157"] = {"median_abs_step_c": st, "median_step_ck": med(A("step_ck")), "held": st <= 0.10}
    un = {"pool_k5": {}}
    for name, fk, sk in (("raw", "f", None), ("conditioned_c", "fcc", "sd_ratio_c")):
        bl = []
        for s in SEQS:
            rs = [{"window": r["window"], "ref": r["ref"], "f": r[fk],
                   "sd_jk": r["sd_jk"] * (r[sk] if sk else 1.0)} for r in rows if r["seq"] == s]
            b = pool.blocks(rs, 5)
            un["pool_k5"].setdefault(name, {})[s] = pool.score(b)
            bl += b
        un["pool_k5"][name]["all"] = pool.score(bl)
    out = {"n_scored": len(rows), "board_reference": refs,
           "tum_published_c": {u: tu.TUM_CALIB[u][2:4] for u in ("fr1", "fr3")},
           "hypotheses": h, "per_sequence": per, "unscored": un, "windows": rows}
    json.dump(out, open(os.path.join(HERE, "tum_summary.json"), "w"), indent=1)
    print("board refs", json.dumps(refs))
    for k, v in h.items():
        print(k, json.dumps(v))
    for s, v in per.items():
        print(s, json.dumps({k: round(x, 4) if isinstance(x, float) else x for k, x in v.items()}))
    for name in un["pool_k5"]:
        p = un["pool_k5"][name]
        print("pool", name, {s: (round(p[s]["re"]["rms_z"], 2), round(100 * p[s]["re"]["median_abs_rel"], 2))
                             for s in (*SEQS, "all")})


if __name__ == "__main__":
    main()
