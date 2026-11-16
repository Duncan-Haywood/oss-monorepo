"""Step 3e: can a level estimate drawn from the seconds *before* a window make the gate's bound hold at the hard
noise level, not only pooled over levels?

    python experiments/gate/noiselevel.py collect <MS-SNSD root> <windows_e.npz> [--procs 4]
    python experiments/gate/noiselevel.py score <windows_e.npz>

Step 3d found that site calibration (calibrate on the rig's own kind of noise) keeps failure among accepted
windows at or under 2% pooled over noise levels, but not at -10 dB alone: each Mondrian bin of the window's
own blind SNR estimate (`snr_hat`, the spread of its 32 ms frame energies) mixes levels, because under real
noise that spread measures how steady the noise is, not how loud. A deployed rig has more than the window:
it has heard the seconds before it. This step gives the gate a level estimate from that context and asks
whether a level-conditional bound follows.

  ms      gate.min_stats_snr_db: the noise floor tracked by minimum statistics (a simplified form of Martin
          2001) over the 4 s before the window and the window itself, SNR of the window against it; the
          smaller of the two devices'. Device a's context is the 4 s before its window; device b's is the
          4 s before its search stretch, and its window is the stretch's centre (blind, as `snr_hat`).
  ctx     gate.blind_snr_db (step 3b's frame-energy spread) over the same 6 s, the smaller of the two:
          the cheap alternative, more pauses in view;
  snr_hat step 3b's window-only estimate (the baseline, as recorded in step 3c);
  oracle  the true added level (none, +10, 0, -10 dB) as the bin: not deployable, the ceiling of what any
          level estimate could do.

Windows: step 3c's 2 s windows replayed exactly (same MS-SNSD speech blocks, rooms, seeds, trials, prior
errors and noise draws). The context is built without touching step 3c's random stream: the speech before
the window is the same session block's preceding audio (wrapped at the block start), convolved with the
same impulse responses; a real type's context noise is the 4 s of the same recording that precede the
window's noise draw (wrapped within the device's audio); white context noise comes from a second
generator seeded by (seed, trial); both scaled by the window's own noise gain, so the level is continuous
across the context and the window. 2 rooms x 1000 trials x 31 conditions = 62,000 windows.

Gates, all LTT at alpha 1% failure among accepted, delta 0.1, on step 3's PSR grid, one gamma at a time:
  mondrian-<feature>  4 calibration-quartile bins of the feature, refuse below its 1st percentile
                      (step 3b's gate with the feature swapped), for snr_hat, ctx and ms;
  oracle              one LTT threshold per true level.
Shifts (calibrate on sessions 0-4, test on 5-9): T0 white -> white; T1 white -> each real type;
T2 leave one type out; T3 site calibration (none + the same type, all levels -> that type).
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
from capture_sync.gate import (blind_snr_db, mondrian_ltt, mondrian_accept, binned_ltt,  # noqa: E402
                               min_stats_snr_db)

FRAME, PRIOR, SEARCH = NT.FRAME, NT.PRIOR, NT.SEARCH
ALPHA, DELTA, GRID = NT.ALPHA, NT.DELTA, NT.GRID
GAMMAS, ROOMS, TYPES, LEVELS, CONDS, NONE = NT.GAMMAS, NT.ROOMS, NT.TYPES, NT.LEVELS, NT.CONDS, NT.NONE
L = 2.0
LI = NT.WINS.index(L)
CTX = 4.0
FEATS = ["snr_hat", "ctx", "ms"]
LEVEL_BIN = {NONE: 0, 10.0: 1, 0.0: 2, -10.0: 3}


def run_chunk(args):
    """noisetype.run_chunk for L = 2 s, every draw from `rng` unchanged, plus the context features
    ctx_a, ctx_b, ms_a, ms_b (columns 11 to 14)."""
    root, rt, L_, trials, seed = args
    rng = np.random.default_rng(seed)
    blocks, nz = NT.speech_blocks(root), NT.noises(root)
    n, G = int(L_ * FS), int(SEARCH * FS)
    pad = int(rt * FS) + 1
    need = n + 2 * G + 2 * int(PRIOR * FS) + 2 * pad + 2
    C = int(CTX * FS)
    ext = C + G + int(PRIOR * FS) + 2  # enough preceding audio for both devices' context
    rows = []
    for t in trials:
        rng2 = np.random.default_rng([seed, t])  # context-only draws; never touches rng
        sess = t % NT.N_SESS
        sp = blocks[sess]
        i = int(rng.integers(0, len(sp) - need))
        seg = sp[i:i + need]
        ra, rb = NT.rir(rt, rng), NT.rir(rt, rng)
        xa = fftconvolve(seg, ra)[:need]
        xb = fftconvolve(seg, rb)[:need]
        sx = np.take(sp, np.arange(i - ext, i + need), mode="wrap")  # same block, preceding speech
        fa = fftconvolve(sx, ra)[:ext + need]
        fb = fftconvolve(sx, rb)[:ext + need]
        p0 = pad + int(PRIOR * FS) + G
        us = int(round(rng.uniform(-PRIOR, PRIOR) * FS))
        a0 = xa[p0:p0 + n]
        b0 = xb[p0 + us - G:p0 + us - G + n + 2 * G]
        ca0 = fa[ext + p0 - C:ext + p0]
        cb0 = fb[ext + p0 + us - G - C:ext + p0 + us - G]
        k_true = G - us
        sa = np.mean(a0 ** 2) + 1e-20
        sb = np.mean(b0[k_true:k_true + n] ** 2) + 1e-20
        for ti, snr in CONDS:
            a, b = a0.copy(), b0.copy()
            ca, cb = ca0.copy(), cb0.copy()
            if ti >= 0:
                for dev, (w, cw, s) in enumerate(((a, ca, sa), (b, cb, sb))):
                    if TYPES[ti] == "white":
                        z = rng.standard_normal(len(w))
                        zc = rng2.standard_normal(C)
                    else:
                        src = nz[TYPES[ti]][dev]
                        j = int(rng.integers(0, len(src) - len(w)))
                        z = src[j:j + len(w)].copy()
                        zc = np.take(src, np.arange(j - C, j), mode="wrap")
                    gain = np.sqrt(s / 10 ** (snr / 10) / (np.mean(z ** 2) + 1e-20))
                    w += z * gain
                    cw += zc * gain
            bc = b[G:G + n]
            sh = min(blind_snr_db(a), blind_snr_db(bc))
            row = [rt, L_, t, sess, ti, snr, sh]
            for g in GAMMAS:
                d, p = gcc(a, b, gamma=g, max_lag_s=SEARCH, centre_s=SEARCH)
                row += [d - k_true / FS, p]
            xa_c = np.concatenate([ca, a])
            xb_c = np.concatenate([cb, b[:G + n]])  # b's context, then its stretch up to the centre window's end
            row += [blind_snr_db(xa_c), blind_snr_db(xb_c), min_stats_snr_db(xa_c, n), min_stats_snr_db(xb_c, n)]
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
    d["ctx"] = np.minimum(r[:, 11], r[:, 12])
    d["ms"] = np.minimum(r[:, 13], r[:, 14])
    d["level"] = np.array([LEVEL_BIN[s] for s in r[:, 5]])
    return d


def auroc(lo, hi):
    """P(a -10 dB window's feature < a 0 dB window's), ties half: how well the feature orders the two levels."""
    x = np.concatenate([lo, hi])
    rk = np.argsort(np.argsort(x, kind="mergesort"), kind="mergesort").astype(float) + 1
    # average ranks over ties
    _, inv, cnt = np.unique(x, return_inverse=True, return_counts=True)
    s = np.bincount(inv, rk) / cnt
    rk = s[inv]
    r_hi = rk[len(lo):].sum()
    n1, n0 = len(hi), len(lo)
    return float((r_hi - n1 * (n1 + 1) / 2) / (n0 * n1))


def fit(d, cal):
    m = {}
    for g in GAMMAS:
        w = d[g]
        for f in FEATS:
            m[(f, g)] = mondrian_ltt(w["psr"][cal], w["bad"][cal], d[f][cal], GRID, ALPHA, DELTA)
        m[("oracle", g)] = binned_ltt(w["psr"][cal], w["bad"][cal], d["level"][cal], 4, GRID, ALPHA, DELTA)
    return m


def evaluate(d, m, test):
    out = {"n_test": int(test.sum())}
    for g in GAMMAS:
        psr, bad = d[g]["psr"][test], d[g]["bad"][test]
        for f in FEATS + ["oracle"]:
            if f == "oracle":
                acc = psr >= np.asarray(m[(f, g)])[d["level"][test]]
            else:
                floor, inner, lams = m[(f, g)]
                acc = mondrian_accept(psr, d[f][test], floor, inner, lams)
            n = int(acc.sum())
            out[f"{f}|{g}"] = [n / max(int(test.sum()), 1), float(bad[acc].mean()) if n else float("nan"), n]
    return out


KEYS = [f"{f}|0.25" for f in FEATS + ["oracle"]] + [f"{f}|1.0" for f in FEATS + ["oracle"]]


def fmt(e, keys=KEYS):
    s = []
    for k in keys:
        kept, fk, n = e[k]
        s.append(f"{k} {kept:.2f} {'  -   ' if n == 0 else f'{fk:.4f}'}")
    return f"(n {e['n_test']}) " + " | ".join(s)


def score(path):
    d = loadrows(path)
    cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
    white = d["type"] == 0
    out, summ = [], {"fail": {}, "feat": {}, "auroc": {}, "T0": {}, "T1": {}, "T2": {}, "T3": {}}
    P = out.append
    P("capture-sync step 3e: a level estimate from the 4 s before the window (minimum statistics, Martin 2001,")
    P("simplified) as the Mondrian bin; MS-SNSD speech and noise, statistical rooms, 2 s windows;")
    P("LTT alpha 1% failure among accepted, delta 0.1; calibrate on sessions 0-4, test on sessions 5-9")
    P(f"windows: {len(d['L'])}. Gate cells: kept share, wrong among accepted ('-' = nothing accepted)")
    P("")
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
    summ["replay_equal"] = [same, len(summ["fail"])]
    P(f"== Replay: {same} of {len(summ['fail'])} raw failure cells equal step 3c's noisetype_summary.json ==")
    sh_ref = json.load(open(os.path.join(HERE, "noisetype_summary.json")))["snr_hat"]
    sh_same = 0
    for tn in ["none"] + TYPES:
        for s in ([NONE] if tn == "none" else LEVELS):
            mm = (d["type"] == (TYPES.index(tn) if tn != "none" else -1)) & (d["snr"] == s)
            q = [float(x) for x in np.percentile(d["snr_hat"][mm], [5, 50, 95])]
            sh_same += int(np.allclose(q, sh_ref[f"{tn}|{s}"], rtol=0, atol=1e-9))
    summ["snr_hat_equal"] = sh_same
    P(f"   snr_hat percentiles equal step 3c's in {sh_same} of 31 type x level cells")
    P("")
    P("== Level features by type and level, both rooms (median [5th, 95th pct], dB) ==")
    for tn in ["none"] + TYPES:
        for s in ([NONE] if tn == "none" else LEVELS):
            mm = (d["type"] == (TYPES.index(tn) if tn != "none" else -1)) & (d["snr"] == s)
            cells = []
            for f in FEATS:
                q = [float(x) for x in np.percentile(d[f][mm], [5, 50, 95])]
                summ["feat"][f"{f}|{tn}|{s}"] = q
                cells.append(f"{f} {q[1]:5.1f} [{q[0]:5.1f},{q[2]:5.1f}]")
            P(f"  {tn:21s} {'' if tn == 'none' else f'{s:+3.0f} dB'}  " + "  ".join(cells))
    P("")
    P("== AUROC, -10 dB against 0 dB windows of the same type (both rooms): does the feature order levels? ==")
    for tn in TYPES:
        ti = TYPES.index(tn)
        lo, hi = (d["type"] == ti) & (d["snr"] == -10.0), (d["type"] == ti) & (d["snr"] == 0.0)
        summ["auroc"][tn] = {f: auroc(d[f][lo], d[f][hi]) for f in FEATS}
        P(f"  {tn:21s} " + "  ".join(f"{f} {summ['auroc'][tn][f]:.3f}" for f in FEATS))
    P("")
    for rt in ROOMS:
        base = d["rt"] == rt
        mw = fit(d, base & cal_s & ((d["type"] == -1) | white))
        summ["T0"][f"{rt}"] = evaluate(d, mw, base & test_s & ((d["type"] == -1) | white))
        summ["T0"][f"{rt}|-10.0"] = evaluate(d, mw, base & test_s & white & (d["snr"] == -10.0))
        for ti, tn in enumerate(TYPES[1:], start=1):
            for s in LEVELS:
                summ["T1"][f"{rt}|{tn}|{s}"] = evaluate(d, mw, base & test_s & (d["type"] == ti) & (d["snr"] == s))
        for ti, tn in enumerate(TYPES):
            m2 = fit(d, base & cal_s & (d["type"] != ti))
            m3 = fit(d, base & cal_s & ((d["type"] == -1) | (d["type"] == ti)))
            summ["T2"][f"{rt}|{tn}|all"] = evaluate(d, m2, base & test_s & (d["type"] == ti))
            summ["T3"][f"{rt}|{tn}|all"] = evaluate(d, m3, base & test_s & (d["type"] == ti))
            for s in LEVELS:
                t = base & test_s & (d["type"] == ti) & (d["snr"] == s)
                summ["T2"][f"{rt}|{tn}|{s}"] = evaluate(d, m2, t)
                summ["T3"][f"{rt}|{tn}|{s}"] = evaluate(d, m3, t)
    P("== T0 in distribution: white (none, +10, 0, -10 dB) -> white, held-out sessions ==")
    for k, e in summ["T0"].items():
        P(f"  RT60 {k}: {fmt(e)}")
    for sh in ("T1", "T2", "T3"):
        P("")
        P({"T1": "== T1 white -> real type: calibrate none + white at all levels ==",
           "T2": "== T2 leave one type out: calibrate none + the other nine types at all levels ==",
           "T3": "== T3 site calibration: calibrate none + the same type at all levels =="}[sh])
        for k, e in summ[sh].items():
            rt, tn, s = k.split("|")
            P(f"  RT60 {rt} {tn:21s} {s:>5s}: {fmt(e)}")
    P("")
    P("== Tallies at -10 dB, gamma 0.25: types at or under 2% wrong among accepted (nothing accepted counts), "
      "mean kept ==")
    summ["tally"] = {}
    for sh, names in (("T1", TYPES[1:]), ("T2", TYPES), ("T3", TYPES)):
        for rt in ROOMS:
            for f in FEATS + ["oracle"]:
                cells = [summ[sh][f"{rt}|{tn}|-10.0"][f"{f}|0.25"] for tn in names]
                ok = sum(1 for c in cells if c[2] == 0 or c[1] <= 0.02)
                kept = float(np.mean([c[0] for c in cells]))
                summ["tally"][f"{sh}|{rt}|{f}"] = [ok, len(cells), kept]
                P(f"  {sh} RT60 {rt} {f:8s}: {ok} of {len(cells)} at or under 2%, mean kept {kept:.2f}")
    open(os.path.join(HERE, "noiselevel_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "noiselevel_summary.json"), "w"), indent=1)
    print("\n".join(out[:60]))
    print("\n".join(out[-25:]))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        a = sys.argv
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 1000  # fewer only for a smoke run
        collect(a[2], a[3], pr, nt)
    else:
        score(sys.argv[2])
