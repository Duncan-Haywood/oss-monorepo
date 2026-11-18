"""Step 3f: what happens when both devices hear the *same* noise source, as in a real room?

    python experiments/gate/noiseshared.py collect <MS-SNSD root> <windows_f.npz> [--procs 4]
    python experiments/gate/noiseshared.py score <windows_f.npz>

Steps 3c to 3e gave each device its own noise recording, so noise was always something that hid the
speech. In a room both devices hear one air conditioner, one crowd, one door. A noise source heard by both
is itself a common sound: the correlation can lock onto it, at the noise's own lag. Is that lag wrong?

Not by more than the devices' separation. For devices A and B a distance D apart and any source X, the
difference of its arrival times obeys |(|XB| - |XA|)| / c <= D / c (triangle inequality). The quantity a
camera rig needs is the clock offset, and every common sound, speech or noise, lands within D / c of it.
So at 30 fps (a frame is 33.3 ms, 11.4 m of sound travel) a peak on any shared source is within a frame
whenever D < 11.4 m; at 60 fps whenever D < 5.7 m. Beyond that, a lock on the noise can be a frame or more
off, and a confidence built from the peak's sharpness sees nothing wrong with it. The geometry is exact; how
often the correlation locks onto noise rather than speech, and what the gate does with it, is the
experiment.

Windows: step 3c's 2 s windows replayed exactly (same MS-SNSD speech blocks, rooms, seeds, trials, prior
errors and independent-noise draws; 62,000 windows, which must equal step 3c's), plus shared-noise windows
on the same clean pairs. Everything new is drawn from a second generator seeded by (seed, trial, 3), so
step 3c's random stream is untouched:
  * geometry: devices at (-D/2, 0) and (D/2, 0); the talker and the noise source each uniform in the
    square [-D, D]^2 (unit positions drawn once per trial and scaled by D, so the three separations
    D = 3, 10 and 30 m share one layout: a desk or small room, a hall or stage, a sports field);
  * one noise stretch per type (white: Gaussian; a real type: a random stretch of all its test files),
    played through a fresh statistical impulse response per device (step 2a's `rir`, the room's RT60), and
    reaching device b (tb - ta) - (sb - sa) later than device a relative to the speech, where s and t are
    the talker's and the noise source's travel times (whole samples);
  * scaled to each device's own speech power at +10, 0 and -10 dB, as the independent noise.
The speech itself is laid down as in step 3c (arrivals aligned), so its lag is the speech truth k_true; the
clock truth differs from it by the talker's own path difference, err_clock = err_speech + (sb - sa)
(checked by tests/test_noiseshared.py). Errors are scored against the clock truth at a 30 fps frame
(and 60 fps, secondary). The independent-noise windows are scored against the same clock truth, using the
same trial's talker position, so shared and independent are compared on equal terms.

Gate (LTT at alpha 1% failure among accepted, delta 0.1, step 3's PSR grid; step 3b's Mondrian bins on
snr_hat), calibrate on sessions 0-4, test on sessions 5-9, labels against the clock truth at the D tested:
  T3   site calibration as steps 3d/3e: none + the same type, independent noise, all levels -> shared noise
       of that type (a rig calibrated with noise that is not shared, then deployed in a room that shares it);
  T3s  the same with shared-noise calibration at the same D (a rig calibrated in its own room, with a
       clapper or timecode reference for the labels).
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
from capture_sync.gate import blind_snr_db, mondrian_ltt, mondrian_accept  # noqa: E402

FRAME, FRAME60, PRIOR, SEARCH = NT.FRAME, 1 / 60, NT.PRIOR, NT.SEARCH
ALPHA, DELTA, GRID = NT.ALPHA, NT.DELTA, NT.GRID
GAMMAS, ROOMS, TYPES, LEVELS, CONDS, NONE = NT.GAMMAS, NT.ROOMS, NT.TYPES, NT.LEVELS, NT.CONDS, NT.NONE
L = 2.0
LI = NT.WINS.index(L)
C_SOUND = 343.0  # m/s, air at about 20 C
SEPS = [3.0, 10.0, 30.0]
MARGIN = int(2 * max(SEPS) / C_SOUND * FS) + 16  # samples; the largest relative noise lag is 2 D / c


def geometry(rng3):
    """Unit positions of the talker and the noise source, uniform in [-1, 1]^2 (scaled by D later)."""
    return rng3.uniform(-1, 1, 2), rng3.uniform(-1, 1, 2)


def path_diff_s(u, D):
    """Arrival at device b minus arrival at device a (s) for a source at unit position u, devices at (+-D/2, 0)."""
    p = np.asarray(u, float) * D
    ra = np.hypot(p[0] + D / 2, p[1])
    rb = np.hypot(p[0] - D / 2, p[1])
    return (rb - ra) / C_SOUND


def shared_tracks(z, ha, hb, lag, need):
    """Noise as heard on each device's speech-aligned timeline (length `need`): device b's copy is `lag`
    samples later than device a's. `z` must be at least need + 2 * MARGIN + len(h) long."""
    na = fftconvolve(z, ha)[MARGIN:MARGIN + need]
    nb = fftconvolve(z, hb)[MARGIN - lag:MARGIN - lag + need]
    return na, nb


def run_chunk(args):
    """noisetype.run_chunk for L = 2 s, every draw from `rng` unchanged (the 31 independent conditions, D = 0),
    then 10 types x 3 levels x 3 separations of shared noise (D > 0). Columns: rt, L, trial, sess, type, snr,
    D, snr_hat, err/psr for gamma 1 and 0.25, ds(3 m), ds(10 m), ds(30 m), dn (the noise's own path
    difference at D, 0 for independent rows)."""
    root, rt, L_, trials, seed = args
    rng = np.random.default_rng(seed)
    blocks, nz = NT.speech_blocks(root), NT.noises(root)
    pool = {t: np.concatenate(nz[t]) for t in TYPES[1:]}
    n, G = int(L_ * FS), int(SEARCH * FS)
    pad = int(rt * FS) + 1
    need = n + 2 * G + 2 * int(PRIOR * FS) + 2 * pad + 2
    rows = []
    for t in trials:
        rng3 = np.random.default_rng([seed, t, 3])  # shared-noise draws only; never touches rng
        us_pos, un_pos = geometry(rng3)
        ds = [path_diff_s(us_pos, D) for D in SEPS]
        dn = [path_diff_s(un_pos, D) for D in SEPS]
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

        def score_pair(a, b, ti, snr, D, dn_d):
            sh = min(blind_snr_db(a), blind_snr_db(b[G:G + n]))
            row = [rt, L_, t, sess, ti, snr, D, sh]
            for g in GAMMAS:
                d, p = gcc(a, b, gamma=g, max_lag_s=SEARCH, centre_s=SEARCH)
                row += [d - k_true / FS, p]
            return row + ds + [dn_d]

        for ti, snr in CONDS:  # step 3c's conditions, exactly
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
            rows.append(score_pair(a, b, ti, snr, 0.0, 0.0))
        nlen = need + 2 * MARGIN
        for ti, tn in enumerate(TYPES):
            if tn == "white":
                z = rng3.standard_normal(nlen)
            else:
                src = pool[tn]
                j = int(rng3.integers(0, len(src) - nlen))
                z = src[j:j + nlen].copy()
            ha, hb = NT.rir(rt, rng3), NT.rir(rt, rng3)
            for di, D in enumerate(SEPS):
                lag = int(round((dn[di] - ds[di]) * FS))
                na, nb = shared_tracks(z, ha, hb, lag, need)
                za = na[p0:p0 + n]
                zb = nb[p0 + us - G:p0 + us - G + n + 2 * G]
                for snr in LEVELS:
                    a = a0 + za * np.sqrt(sa / 10 ** (snr / 10) / (np.mean(za ** 2) + 1e-20))
                    b = b0 + zb * np.sqrt(sb / 10 ** (snr / 10) / (np.mean(zb ** 2) + 1e-20))
                    rows.append(score_pair(a, b, ti, snr, D, dn[di]))
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
         "type": r[:, 4].astype(int), "snr": r[:, 5], "D": r[:, 6], "snr_hat": r[:, 7],
         "ds": {D: r[:, 12 + k] for k, D in enumerate(SEPS)}, "dn": r[:, 15]}
    for k, g in enumerate(GAMMAS):
        d[g] = {"err": r[:, 8 + 2 * k], "psr": r[:, 9 + 2 * k]}
    return d


def bad_at(d, g, D, frame=FRAME):
    """Failure against the clock truth for a separation D (talker path difference added back)."""
    return np.abs(d[g]["err"] + d["ds"][D]) > frame


def score(path):
    d = loadrows(path)
    cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
    ind = d["D"] == 0
    out = []
    summ = {"fail": {}, "raw": {}, "noise_lock": {}, "far_share": {}, "T3": {}, "T3s": {}}
    P = out.append
    P("capture-sync step 3f: noise heard by both devices (one source, geometric path difference) against")
    P("independent noise per device (step 3c); MS-SNSD speech and noise, statistical rooms, 2 s windows;")
    P("errors against the clock truth for devices D apart (talker and noise source uniform in [-D, D]^2);")
    P("LTT alpha 1% failure among accepted, delta 0.1, Mondrian on snr_hat; calibrate sessions 0-4, test 5-9")
    P(f"windows: {len(d['D'])}")
    P("")
    # replay of step 3c, against the speech truth
    for rt in ROOMS:
        base = (d["rt"] == rt) & ind
        m0 = base & (d["type"] == -1)
        summ["fail"][f"{rt}|{L}|none"] = [float((np.abs(d[g]["err"][m0]) > FRAME).mean()) for g in GAMMAS]
        for ti, tn in enumerate(TYPES):
            for s in LEVELS:
                mm = base & (d["type"] == ti) & (d["snr"] == s)
                summ["fail"][f"{rt}|{L}|{tn}|{s}"] = [float((np.abs(d[g]["err"][mm]) > FRAME).mean())
                                                      for g in GAMMAS]
    ref = json.load(open(os.path.join(HERE, "noisetype_summary.json")))["fail"]
    same = sum(1 for k, v in summ["fail"].items() if np.allclose(v, ref[k], rtol=0, atol=1e-12))
    summ["replay_equal"] = [same, len(summ["fail"])]
    P(f"== Replay: {same} of {len(summ['fail'])} independent-noise failure cells (speech truth) equal step 3c's ==")
    P("")
    # geometry: share of draws whose noise path difference is beyond a frame
    for D in SEPS:
        tr = ind & (d["type"] == -1)
        dn = d["dn"][(d["D"] == D) & (d["type"] == 0) & (d["snr"] == -10.0)]
        dsv = d["ds"][D][tr]
        summ["far_share"][f"{D}"] = {"talker_30": float(np.mean(np.abs(dsv) > FRAME)),
                                     "noise_30": float(np.mean(np.abs(dn) > FRAME)),
                                     "noise_60": float(np.mean(np.abs(dn) > FRAME60)),
                                     "max_abs_ms": float(1000 * max(np.abs(dn).max(), np.abs(dsv).max()))}
        f = summ["far_share"][f"{D}"]
        P(f"geometry D {D:4.0f} m: |path diff| > 33.3 ms for talker {f['talker_30']:.3f}, noise {f['noise_30']:.3f}; "
          f"> 16.7 ms for noise {f['noise_60']:.3f}; max {f['max_abs_ms']:.1f} ms (bound D/c {1000 * D / C_SOUND:.1f})")
    P("")
    P("== Raw failure share against the clock truth (30 fps), +10 / 0 / -10 dB: independent|shared, by D ==")
    P("   (gamma 0.25 and PHAT; 'lock' = share of shared -10 dB windows whose estimate is within 2 ms of the")
    P("    noise's own lag rather than the talker's)")
    for rt in ROOMS:
        for g in GAMMAS:
            for ti, tn in enumerate(TYPES):
                cells = []
                for D in SEPS:
                    for fr, fn in ((FRAME, "30"), (FRAME60, "60")):
                        for s in LEVELS:
                            mi = (d["rt"] == rt) & ind & (d["type"] == ti) & (d["snr"] == s)
                            msh = (d["rt"] == rt) & (d["D"] == D) & (d["type"] == ti) & (d["snr"] == s)
                            fi = float(bad_at(d, g, D, fr)[mi].mean())
                            fs_ = float(bad_at(d, g, D, fr)[msh].mean())
                            summ["raw"][f"{rt}|{g}|{tn}|{D}|{fn}|{s}"] = [fi, fs_]
                    msh = (d["rt"] == rt) & (d["D"] == D) & (d["type"] == ti) & (d["snr"] == -10.0)
                    ec = d[g]["err"][msh] + d["ds"][D][msh]
                    lock_n = float(np.mean(np.abs(ec - d["dn"][msh]) < 0.002))
                    lock_s = float(np.mean(np.abs(ec - d["ds"][D][msh]) < 0.002))
                    summ["noise_lock"][f"{rt}|{g}|{tn}|{D}"] = [lock_n, lock_s]
                    r = summ["raw"]
                    cells.append(f"D{D:.0f} " + " ".join(
                        f"{r[f'{rt}|{g}|{tn}|{D}|30|{s}'][0]:.3f}|{r[f'{rt}|{g}|{tn}|{D}|30|{s}'][1]:.3f}"
                        for s in LEVELS) + f" lock {lock_n:.2f}")
                P(f"  RT60 {rt} g{g:<4} {tn:21s} " + "  ".join(cells))
    P("")
    # gates
    for rt in ROOMS:
        base = d["rt"] == rt
        for ti, tn in enumerate(TYPES):
            for D in SEPS:
                for g in GAMMAS:
                    bad = bad_at(d, g, D)
                    psr = d[g]["psr"]
                    c3 = base & cal_s & ind & ((d["type"] == -1) | (d["type"] == ti))
                    c3s = base & cal_s & (((d["type"] == -1) & ind) | ((d["type"] == ti) & (d["D"] == D)))
                    for name, cal in (("T3", c3), ("T3s", c3s)):
                        floor, inner, lams = mondrian_ltt(psr[cal], bad[cal], d["snr_hat"][cal], GRID, ALPHA, DELTA)
                        for s in LEVELS + ["all"]:
                            te = base & test_s & (d["type"] == ti) & (d["D"] == D)
                            if s != "all":
                                te &= d["snr"] == s
                            acc = mondrian_accept(psr[te], d["snr_hat"][te], floor, inner, lams)
                            nacc = int(acc.sum())
                            summ[name][f"{rt}|{tn}|{D}|{g}|{s}"] = [
                                nacc / max(int(te.sum()), 1), float(bad[te][acc].mean()) if nacc else float("nan"), nacc]
                        # the same gate on independent-noise test windows (the comparison)
                        te = base & test_s & ind & (d["type"] == ti) & (d["snr"] == -10.0)
                        acc = mondrian_accept(psr[te], d["snr_hat"][te], floor, inner, lams)
                        nacc = int(acc.sum())
                        summ[name][f"{rt}|{tn}|{D}|{g}|ind-10"] = [
                            nacc / max(int(te.sum()), 1), float(bad[te][acc].mean()) if nacc else float("nan"), nacc]
    for name, title in (("T3", "T3: calibrate on independent noise of the same type (all levels), test shared"),
                        ("T3s", "T3s: calibrate on shared noise of the same type at the same D, test shared")):
        P(f"== {title}; -10 dB: kept, wrong among accepted ('-' none); ind = same gate on independent -10 dB ==")
        for rt in ROOMS:
            for g in GAMMAS:
                for tn in TYPES:
                    cells = []
                    for D in SEPS:
                        k, f, nacc = summ[name][f"{rt}|{tn}|{D}|{g}|-10.0"]
                        ki, fi, ni = summ[name][f"{rt}|{tn}|{D}|{g}|ind-10"]
                        cells.append(f"D{D:.0f} {k:.2f} {'  -   ' if nacc == 0 else f'{f:.4f}'} "
                                     f"(ind {ki:.2f} {'  -   ' if ni == 0 else f'{fi:.4f}'})")
                    P(f"  RT60 {rt} g{g:<4} {tn:21s} " + "  ".join(cells))
        P("")
    P("== Tallies, gamma 0.25, -10 dB (types of 10) ==")
    summ["tally"] = {}
    for rt in ROOMS:
        for D in SEPS:
            raw = [summ["raw"][f"{rt}|0.25|{tn}|{D}|30|-10.0"] for tn in TYPES]
            lower = sum(1 for fi, fs_ in raw if fs_ < fi)
            under2 = sum(1 for fi, fs_ in raw if fs_ <= 0.02)
            higher = sum(1 for fi, fs_ in raw if fs_ > fi)
            raw60 = [summ["raw"][f"{rt}|0.25|{tn}|{D}|60|-10.0"] for tn in TYPES]
            higher60 = sum(1 for fi, fs_ in raw60 if fs_ > fi)
            t = {"shared_lower": lower, "shared_under2": under2, "shared_higher": higher,
                 "shared_higher_60fps": higher60}
            for name in ("T3", "T3s"):
                cells = [summ[name][f"{rt}|{tn}|{D}|0.25|-10.0"] for tn in TYPES]
                icells = [summ[name][f"{rt}|{tn}|{D}|0.25|ind-10"] for tn in TYPES]
                t[f"{name}_ok"] = sum(1 for c in cells if c[2] == 0 or c[1] <= 0.02)
                t[f"{name}_over"] = sum(1 for c in cells if c[2] > 0 and c[1] > 0.02)
                t[f"{name}_kept"] = float(np.mean([c[0] for c in cells]))
                t[f"{name}_kept_ind"] = float(np.mean([c[0] for c in icells]))
            summ["tally"][f"{rt}|{D}"] = t
            P(f"  RT60 {rt} D {D:4.0f} m: raw shared < independent {lower}, shared <= 2% {under2}, "
              f"shared > independent {higher} (60 fps: {higher60}); T3 <= 2% {t['T3_ok']} (kept {t['T3_kept']:.2f}, "
              f"independent {t['T3_kept_ind']:.2f}); T3s <= 2% {t['T3s_ok']} (kept {t['T3s_kept']:.2f})")
    open(os.path.join(HERE, "noiseshared_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "noiseshared_summary.json"), "w"), indent=1)
    print("\n".join(out[:16]))
    print("\n".join(out[-8:]))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        a = sys.argv
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 1000  # fewer only for a smoke run
        collect(a[2], a[3], pr, nt)
    else:
        score(sys.argv[2])
