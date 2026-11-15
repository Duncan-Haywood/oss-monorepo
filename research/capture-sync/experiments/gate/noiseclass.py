"""Step 3d: does a gate that sees *what kind* of noise a window holds keep its failure bound on real noise?

    python experiments/gate/noiseclass.py collect <MS-SNSD root> <windows_d.npz> [--procs 4]
    python experiments/gate/noiseclass.py score <windows_d.npz>

Step 3c found that step 3b's gate (Mondrian bins on a blind SNR estimate) fails on real noise: the
frame-energy SNR estimate measures how steady the noise is, not how loud, and impulsive noise (typing,
munching) gives confident wrong peaks. Calibrated on a library of nine types and tested on the tenth
(leave one type out), it mostly refused and still let impulsive noise through. This step adds two blind
features that name the kind of noise and asks whether a gate built on them does better:

  kurt   log10 kurtosis of the 32 ms frame energies (gate.frame_kurtosis), the larger of the two devices';
  flat   spectral flatness of the window in the GCC band, dB (gate.spectral_flatness_db), the mean of the two;
  snr_hat step 3b's blind SNR estimate, the smaller of the two (as before).

Windows: step 3c's 2 s windows replayed exactly (same MS-SNSD speech blocks, statistical rooms, seeds,
trials, prior errors and noise draws; `run_chunk` below is noisetype.run_chunk with the two feature
columns appended, and draws nothing extra from the generator), 2 rooms x 1000 trials x 31 noise
conditions = 62,000 windows. Only 2 s windows: step 3c's predictions were stated at 2 s.

Gates, all LTT at alpha 1% failure among accepted, delta 0.1, on step 3's PSR grid:
  mondrian  step 3b/3c (4 snr_hat quartile bins, refuse below the 1st pct): the replay and the baseline;
  class     8 bins: snr_hat quartile x kurt above/below its calibration median; a window is refused when
            conformal novelty refusal (gate.Novelty: 5-NN distance in median/IQR-scaled (snr_hat, kurt, flat),
            reference = even trials of calibration, threshold = 99th pct of the odd trials) says it lies
            outside the calibration's features. One gamma (1 or 0.25) throughout;
  select    class's bins and refusal, but per bin the weighting is chosen on calibration: LTT for both gammas
            at delta/2 each (union bound keeps the pair at delta), keep the gamma that accepts more
            calibration windows; the test window is accepted with that gamma's PSR and judged by its error.
Shifts (calibrate on sessions 0-4, test on 5-9):
  T0  white -> white (the in-distribution check);
  T1  white (none, +10, 0, -10 dB) -> each real type (step 3b's rule, an unseen kind of noise);
  T2  leave one type out: none + the other nine types at all levels -> the held-out type;
  T3  site calibration: none + the same type at all levels -> that type (the rig calibrated on its own
      room's noise, step 3c's recommendation, never measured there).
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import noisetype as NT  # noqa: E402
from capture_sync.sync import FS, gcc  # noqa: E402
from capture_sync.gate import (ltt_threshold, blind_snr_db, mondrian_ltt, mondrian_accept,  # noqa: E402
                               frame_kurtosis, spectral_flatness_db, Novelty, binned_ltt)

FRAME, PRIOR, SEARCH = NT.FRAME, NT.PRIOR, NT.SEARCH
ALPHA, DELTA, GRID = NT.ALPHA, NT.DELTA, NT.GRID
GAMMAS, ROOMS, TYPES, LEVELS, CONDS, NONE = NT.GAMMAS, NT.ROOMS, NT.TYPES, NT.LEVELS, NT.CONDS, NT.NONE
L = 2.0
LI = NT.WINS.index(L)
N_SNR, N_KURT = 4, 2
GATES = ["mondrian", "class", "select"]


def run_chunk(args):
    """noisetype.run_chunk, unchanged in every draw, plus kurt_a, kurt_b, flat_a, flat_b."""
    root, rt, L_, trials, seed = args
    rng = np.random.default_rng(seed)
    blocks, nz = NT.speech_blocks(root), NT.noises(root)
    n, G = int(L_ * FS), int(SEARCH * FS)
    pad = int(rt * FS) + 1
    need = n + 2 * G + 2 * int(PRIOR * FS) + 2 * pad + 2
    rows = []
    for t in trials:
        sess = t % NT.N_SESS
        sp = blocks[sess]
        i = int(rng.integers(0, len(sp) - need))
        seg = sp[i:i + need]
        xa = fftconvolve(seg, NT.rir(rt, rng))[:need]
        xb = fftconvolve(seg, NT.rir(rt, rng))[:need]
        p0 = pad + int(PRIOR * FS) + G
        us = int(round(rng.uniform(-PRIOR, PRIOR) * FS))
        a0 = xa[p0:p0 + n]
        b0 = xb[p0 + us - G:p0 + us - G + n + 2 * G]
        k_true = G - us
        sa = np.mean(a0 ** 2) + 1e-20
        sb = np.mean(b0[k_true:k_true + n] ** 2) + 1e-20
        for ti, snr in CONDS:
            a, b = a0.copy(), b0.copy()
            if ti >= 0:
                for dev, (w, s) in enumerate(((a, sa), (b, sb))):
                    if TYPES[ti] == "white":
                        z = rng.standard_normal(len(w))
                    else:
                        src = nz[TYPES[ti]][dev]
                        j = int(rng.integers(0, len(src) - len(w)))
                        z = src[j:j + len(w)].copy()
                    w += z * np.sqrt(s / 10 ** (snr / 10) / (np.mean(z ** 2) + 1e-20))
            bc = b[G:G + n]
            sh = min(blind_snr_db(a), blind_snr_db(bc))
            row = [rt, L_, t, sess, ti, snr, sh]
            for g in GAMMAS:
                d, p = gcc(a, b, gamma=g, max_lag_s=SEARCH, centre_s=SEARCH)
                row += [d - k_true / FS, p]
            row += [frame_kurtosis(a), frame_kurtosis(bc), spectral_flatness_db(a), spectral_flatness_db(bc)]
            rows.append(row)
    return rows


def collect(root, out, procs, n_trials=1000):
    jobs = []
    for ri, rt in enumerate(ROOMS):
        for c in range(8):  # noisetype.collect's chunks and seeds for L = 2 s
            jobs.append((root, rt, L, list(range(c, n_trials, 8)), 31000 + 1000 * ri + 100 * LI + c))
    with ProcessPoolExecutor(procs) as ex:
        rows = [r for rr in ex.map(run_chunk, jobs) for r in rr]
    np.savez_compressed(out, rows=np.array(rows, float))
    print(f"{len(rows)} windows -> {out}")


def loadrows(path):
    r = np.load(path)["rows"]
    d = {"rt": r[:, 0], "L": r[:, 1], "trial": r[:, 2].astype(int), "sess": r[:, 3].astype(int),
         "type": r[:, 4].astype(int), "snr": r[:, 5], "snr_hat": r[:, 6]}
    for k, g in enumerate(GAMMAS):
        d[g] = {"err": r[:, 7 + 2 * k], "psr": r[:, 8 + 2 * k], "bad": np.abs(r[:, 7 + 2 * k]) > FRAME}
    d["kurt"] = np.maximum(r[:, 11], r[:, 12])
    d["flat"] = 0.5 * (r[:, 13] + r[:, 14])
    d["feats"] = np.column_stack([d["snr_hat"], d["kurt"], d["flat"]])
    return d


def class_bins(sh, ku, snr_edges, kurt_edge):
    return np.digitize(sh, snr_edges) * N_KURT + (ku > kurt_edge).astype(int)


def fit(d, cal):
    """Everything the gates learn from calibration windows (features, errors), for both gammas."""
    sh, ku = d["snr_hat"][cal], d["kurt"][cal]
    snr_edges = np.quantile(sh, np.arange(1, N_SNR) / N_SNR)
    kurt_edge = float(np.median(ku))
    nov = Novelty(d["feats"][cal], d["trial"][cal] % 2 == 0)
    bins = class_bins(sh, ku, snr_edges, kurt_edge)
    nb = N_SNR * N_KURT
    m = {"snr_edges": snr_edges, "kurt_edge": kurt_edge, "nov": nov, "class": {}, "half": {}, "mondrian": {}}
    for g in GAMMAS:
        w = d[g]
        m["mondrian"][g] = mondrian_ltt(w["psr"][cal], w["bad"][cal], sh, GRID, ALPHA, DELTA)
        m["class"][g] = binned_ltt(w["psr"][cal], w["bad"][cal], bins, nb, GRID, ALPHA, DELTA)
        m["half"][g] = binned_ltt(w["psr"][cal], w["bad"][cal], bins, nb, GRID, ALPHA, DELTA / 2)
    # select: per bin, the gamma whose delta/2 threshold keeps more calibration windows
    choice = []
    for k in range(nb):
        inb = bins == k
        keep = [np.sum(d[g]["psr"][cal][inb] >= m["half"][g][k]) for g in GAMMAS]
        choice.append(int(np.argmax(keep)))  # ties -> gamma 1 (first), fixed in advance
    m["choice"] = choice
    return m


def accept(d, m, test, gname, g=None):
    """(accepted mask, bad mask) over the test windows for one gate."""
    sh, ku, fe = d["snr_hat"][test], d["kurt"][test], d["feats"][test]
    if gname == "mondrian":
        floor, inner, lams = m["mondrian"][g]
        return mondrian_accept(d[g]["psr"][test], sh, floor, inner, lams), d[g]["bad"][test]
    bins = class_bins(sh, ku, m["snr_edges"], m["kurt_edge"])
    inside = m["nov"].inside(fe)
    if gname == "class":
        lam = np.asarray(m["class"][g])[bins]
        return inside & (d[g]["psr"][test] >= lam), d[g]["bad"][test]
    gi = np.asarray(m["choice"])[bins]
    psr = np.where(gi == 0, d[GAMMAS[0]]["psr"][test], d[GAMMAS[1]]["psr"][test])
    bad = np.where(gi == 0, d[GAMMAS[0]]["bad"][test], d[GAMMAS[1]]["bad"][test])
    lam = np.array([m["half"][GAMMAS[c]][k] for k, c in enumerate(m["choice"])])[bins]
    return inside & (psr >= lam), bad


def evaluate(d, m, test):
    out = {"n_test": int(test.sum()), "inside": float(m["nov"].inside(d["feats"][test]).mean())}
    for gname in GATES:
        for g in (GAMMAS if gname != "select" else [None]):
            acc, bad = accept(d, m, test, gname, g)
            n = int(acc.sum())
            out[gname if g is None else f"{gname}|{g}"] = [n / max(int(test.sum()), 1),
                                                         float(bad[acc].mean()) if n else float("nan"), n]
    return out


def fmt(e, keys):
    s = []
    for k in keys:
        kept, fk, n = e[k]
        s.append(f"{k} {kept:.2f} {'  -   ' if n == 0 else f'{fk:.4f}'}")
    return f"(n {e['n_test']}, inside {e['inside']:.2f}) " + " | ".join(s)


KEYS = ["mondrian|0.25", "class|0.25", "class|1.0", "select"]


def score(path):
    d = loadrows(path)
    cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
    white = d["type"] == 0
    out, summ = [], {"fail": {}, "kurt": {}, "flat": {}, "choice": {}, "T0": {}, "T1": {}, "T2": {}, "T3": {}}
    P = out.append
    P("capture-sync step 3d: a noise-class gate (snr_hat x frame-energy kurtosis bins, conformal novelty refusal,")
    P("per-bin weighting) under real noise; MS-SNSD speech and noise, statistical rooms, 2 s windows;")
    P("LTT alpha 1% failure among accepted, delta 0.1; calibrate on sessions 0-4, test on sessions 5-9")
    P(f"windows: {len(d['L'])}. Cells: kept share, wrong among accepted ('-' = nothing accepted)")
    P("")
    P("== Replay: raw failure share by room, type and level, gamma 1 / gamma 0.25 ==")
    for rt in ROOMS:
        base = d["rt"] == rt
        m0 = base & (d["type"] == -1)
        summ["fail"][f"{rt}|{L}|none"] = [float(d[g]["bad"][m0].mean()) for g in GAMMAS]
        for ti, tn in enumerate(TYPES):
            for s in LEVELS:
                mm = base & (d["type"] == ti) & (d["snr"] == s)
                summ["fail"][f"{rt}|{L}|{tn}|{s}"] = [float(d[g]["bad"][mm].mean()) for g in GAMMAS]
    ref = json.load(open(os.path.join(HERE, "noisetype_summary.json")))["fail"]
    same = sum(1 for k, v in summ["fail"].items() if np.allclose(v, ref[k], rtol=0, atol=1e-12))
    P(f"  {same} of {len(summ['fail'])} cells equal step 3c's noisetype_summary.json")
    summ["replay_equal"] = [same, len(summ["fail"])]
    P("")
    P("== Blind features by type, -10 dB, both rooms (median [5th, 95th pct]): kurt (log10), flat (dB) ==")
    for tn in ["none"] + TYPES:
        s = NONE if tn == "none" else -10.0
        mm = (d["type"] == (TYPES.index(tn) if tn != "none" else -1)) & (d["snr"] == s)
        for f in ("kurt", "flat"):
            summ[f][tn] = [float(x) for x in np.percentile(d[f][mm], [5, 50, 95])]
        k, fl = summ["kurt"][tn], summ["flat"][tn]
        P(f"  {tn:21s} kurt {k[1]:5.2f} [{k[0]:5.2f},{k[2]:5.2f}]   flat {fl[1]:6.1f} [{fl[0]:6.1f},{fl[2]:6.1f}]")
    P("")
    for rt in ROOMS:
        base = d["rt"] == rt
        # T0 and T1 share the white calibration
        mw = fit(d, base & cal_s & ((d["type"] == -1) | white))
        summ["choice"][f"T1|{rt}"] = mw["choice"]
        summ["T0"][f"{rt}"] = evaluate(d, mw, base & test_s & ((d["type"] == -1) | white))
        for ti, tn in enumerate(TYPES[1:], start=1):
            for s in LEVELS:
                summ["T1"][f"{rt}|{tn}|{s}"] = evaluate(d, mw, base & test_s & (d["type"] == ti) & (d["snr"] == s))
        for ti, tn in enumerate(TYPES):
            m2 = fit(d, base & cal_s & (d["type"] != ti))
            m3 = fit(d, base & cal_s & ((d["type"] == -1) | (d["type"] == ti)))
            summ["choice"][f"T2|{rt}|{tn}"] = m2["choice"]
            summ["choice"][f"T3|{rt}|{tn}"] = m3["choice"]
            summ["T2"][f"{rt}|{tn}|all"] = evaluate(d, m2, base & test_s & (d["type"] == ti))
            summ["T3"][f"{rt}|{tn}|all"] = evaluate(d, m3, base & test_s & (d["type"] == ti))
            for s in LEVELS:
                t = base & test_s & (d["type"] == ti) & (d["snr"] == s)
                summ["T2"][f"{rt}|{tn}|{s}"] = evaluate(d, m2, t)
                summ["T3"][f"{rt}|{tn}|{s}"] = evaluate(d, m3, t)
    P("== T0 in distribution: white (none, +10, 0, -10 dB) -> white, held-out sessions ==")
    for k, e in summ["T0"].items():
        P(f"  RT60 {k}: {fmt(e, KEYS + ['mondrian|1.0'])}")
    for sh in ("T1", "T2", "T3"):
        P("")
        P({"T1": "== T1 white -> real type: calibrate none + white at all levels ==",
           "T2": "== T2 leave one type out: calibrate none + the other nine types at all levels ==",
           "T3": "== T3 site calibration: calibrate none + the same type at all levels ==" }[sh])
        for k, e in summ[sh].items():
            rt, tn, s = k.split("|")
            P(f"  RT60 {rt} {tn:21s} {s:>5s}: {fmt(e, KEYS)}")
    P("")
    P("== Weighting chosen per bin by select (0 = PHAT, 1 = gamma 0.25; bins snr quartile x kurt low/high) ==")
    for k, v in summ["choice"].items():
        P(f"  {k:30s} {v}")
    open(os.path.join(HERE, "noiseclass_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "noiseclass_summary.json"), "w"), indent=1)
    print("\n".join(out[:40]))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        a = sys.argv
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 1000  # fewer only for a smoke run
        collect(a[2], a[3], pr, nt)
    else:
        score(sys.argv[2])
