"""Step 3c: does the noise-aware gate of step 3b keep its failure bound when the *kind* of noise changes?

    python experiments/gate/noisetype.py collect <MS-SNSD root> <windows_c.npz> [--trials 1000] [--procs 4]
    python experiments/gate/noisetype.py score <windows_c.npz>

Step 3b's rule (calibrate on noise added down to the lowest SNR expected, one Learn-then-Test threshold per
bin of a blind SNR estimate, refuse below the calibration's support) was found with white noise added to
the LibriWASN phones. A deployed rig meets air conditioners, crowds, doors and typing. This step asks
whether the rule, calibrated on white noise, holds on nine kinds of real recorded noise, and whether a
gate calibrated on a library of real noise types holds on a type it never saw (leave one type out).

Data, read from a sparse checkout of github.com/microsoft/MS-SNSD (MIT; Reddy et al. 2019), nothing
copied into this repository:
  * speech: clean_test/clnsp*.wav (190 files, 37 min of read speech), split into 10 contiguous blocks of
    19 files; block k is "session" k, the unit for calibration/test splits (so calibration and test never
    share speech);
  * noise: noise_test/<Type>_*.wav for the nine types AirConditioner, AirportAnnouncements, Babble,
    CopyMachine, Munching, Neighbor, ShuttingDoor, Typing, VacuumCleaner (35 s to 7 min each), plus
    white Gaussian noise. Each type's files are split between the two devices (`split_files`, keeping files
    that duplicate each other on one side; one-file VacuumCleaner by halves), so the two devices never hear
    the same noise recording. v1 drew both devices' noise from the whole corpus and v2 from its two halves;
    both let the devices share noise and are kept as noisetype_v1/_v2_results.txt (LOG.md, step 3c).
Per trial (room, window L): a stretch of the session's speech is played in a statistical room (a fresh
impulse response per device, RT60 0.2 or 0.8 s, DRR 0 dB, step 2a's `rir`), the second device's
stretch is cut around the true lag plus a prior error uniform in +-1 s and searched +-1.5 s, exactly as
steps 1 and 2a. The same clean pair is then scored under 31 noise conditions: none, and each of the 10
noise types at +10, 0 and -10 dB window SNR (independent stretches per device, scaled to each device's
own speech power). Per window: error and PSR for gamma 1 (PHAT) and 0.25, and `snr_hat` (gate.blind_snr_db,
the smaller of the two devices', the second device's window taken at the centre of its search stretch,
i.e. blind).

Gates, all LTT at alpha 1% failure among accepted, delta 0.1, on step 3's PSR grid:
  pooled    one PSR threshold;
  mondrian  step 3b: one PSR threshold per calibration quartile of snr_hat, refuse below its 1st pct;
  agree     step 3: gamma 0.25's PSR when PHAT and gamma 0.25 land within a frame, else refused
            (scored for gamma 0.25 only).
Shifts (calibration on sessions 0-4, test on sessions 5-9, so no speech is shared):
  T0  white -> white (in distribution, the check);
  T1  white (none, +10, 0, -10 dB) -> each real type at each level (step 3b's rule, unseen noise kind);
  T2  leave one type out: none + the other 9 types (white included) at all levels -> the held-out type.
"""
import glob
import json
import os
import sys
import wave
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from capture_sync.sync import FS, gcc  # noqa: E402
from capture_sync.gate import (ltt_threshold, apply_gate, blind_snr_db, mondrian_ltt,  # noqa: E402
                               mondrian_accept)

FRAME = 1 / 30
PRIOR, SEARCH = 1.0, 1.5
ALPHA, DELTA = 0.01, 0.1
GRID = np.geomspace(2.0, 400.0, 241)  # step 3's PSR grid
GAMMAS = [1.0, 0.25]
WINS = [1.0, 2.0, 4.0]
ROOMS = [0.2, 0.8]
TYPES = ["white", "AirConditioner", "AirportAnnouncements", "Babble", "CopyMachine", "Munching", "Neighbor",
         "ShuttingDoor", "Typing", "VacuumCleaner"]
LEVELS = [10.0, 0.0, -10.0]
NONE = 99.0
CONDS = [(-1, NONE)] + [(k, s) for k in range(len(TYPES)) for s in LEVELS]  # (type index, SNR dB)
N_SESS = 10
GATES = ["pooled", "mondrian", "agree"]


def load(path):
    w = wave.open(path)
    assert w.getframerate() == FS and w.getnchannels() == 1 and w.getsampwidth() == 2, path
    return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768.0


def speech_blocks(root):
    files = sorted(glob.glob(os.path.join(root, "clean_test", "clnsp*.wav")),
                   key=lambda p: int(os.path.basename(p)[5:-4]))
    assert len(files) == 190, len(files)
    per = len(files) // N_SESS
    return [np.concatenate([load(p) for p in files[k * per:(k + 1) * per]]) for k in range(N_SESS)]


# Files whose audio recurs in another file of the same type (normalised cross-correlation of 1 s chunks 0.62 to
# 1.0, found after v2 of this run; LOG.md 3c). Each group goes to one device only. Many files are also loops
# of a shorter recording (a chunk recurs within the file), which is harmless once no file feeds both devices.
DUP_GROUPS = {"Neighbor": [["Neighbor_1", "Neighbor_7"]],
              "Munching": [["Munching_2", "Munching_3", "Munching_4", "Munching_7"]]}


def split_files(durations, groups=()):
    """Assign files to device a (0) or b (1) so no group is split: groups (and the remaining single files)
    largest first, each to the side with less audio so far. Returns {name: side}."""
    grouped = {f for g in groups for f in g}
    units = [list(g) for g in groups] + [[f] for f in durations if f not in grouped]
    units.sort(key=lambda u: (-sum(durations[f] for f in u), u))
    side, tot = {}, [0.0, 0.0]
    for u in units:
        k = 0 if tot[0] <= tot[1] else 1
        for f in u:
            side[f] = k
        tot[k] += sum(durations[f] for f in u)
    return side


def noises(root):
    """{type: (device a's noise, device b's noise)}, never sharing a file (v3). A type with one file (here only
    VacuumCleaner, checked not to be a loop) is split into halves."""
    out = {}
    for t in TYPES[1:]:
        fs = sorted(glob.glob(os.path.join(root, "noise_test", t + "_*.wav")))
        x = {os.path.basename(p)[:-4]: load(p) for p in fs}
        if len(x) == 1:
            (v,) = x.values()
            out[t] = (v[:len(v) // 2], v[len(v) // 2:])
            continue
        side = split_files({k: len(v) for k, v in x.items()}, DUP_GROUPS.get(t, ()))
        out[t] = tuple(np.concatenate([x[k] for k in sorted(x) if side[k] == d]) for d in (0, 1))
    return out


def rir(rt60, rng, drr_db=0.0, onset=0.005):
    """step 2a's statistical impulse response (experiments/threshold/run.py), copied so this file stands alone."""
    n = int(rt60 * FS)
    t = np.arange(n) / FS
    tail = rng.standard_normal(n) * np.exp(-6.908 * t / rt60) * (t >= onset)
    tail *= np.sqrt(10 ** (-drr_db / 10) / np.sum(tail ** 2))
    tail[0] = 1.0
    return tail


def run_chunk(args):
    root, rt, L, trials, seed = args
    rng = np.random.default_rng(seed)
    blocks, nz = speech_blocks(root), noises(root)
    n, G = int(L * FS), int(SEARCH * FS)
    pad = int(rt * FS) + 1
    need = n + 2 * G + 2 * int(PRIOR * FS) + 2 * pad + 2
    rows = []
    for t in trials:
        sess = t % N_SESS
        sp = blocks[sess]
        i = int(rng.integers(0, len(sp) - need))
        seg = sp[i:i + need]
        xa = fftconvolve(seg, rir(rt, rng))[:need]
        xb = fftconvolve(seg, rir(rt, rng))[:need]
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
                        # each device draws from its own files (v1 drew both from the whole corpus, v2 from
                        # halves of it, which still shared duplicated recordings; see LOG.md 3c)
                        src = nz[TYPES[ti]][dev]
                        j = int(rng.integers(0, len(src) - len(w)))
                        z = src[j:j + len(w)].copy()
                    w += z * np.sqrt(s / 10 ** (snr / 10) / (np.mean(z ** 2) + 1e-20))
            sh = min(blind_snr_db(a), blind_snr_db(b[G:G + n]))
            row = [rt, L, t, sess, ti, snr, sh]
            for g in GAMMAS:
                d, p = gcc(a, b, gamma=g, max_lag_s=SEARCH, centre_s=SEARCH)
                row += [d - k_true / FS, p]
            rows.append(row)
    return rows


def collect(root, out, n_trials, procs):
    jobs = []
    for ri, rt in enumerate(ROOMS):
        for li, L in enumerate(WINS):
            for c in range(8):  # 8 chunks per (room, L), fixed seeds
                jobs.append((root, rt, L, list(range(c, n_trials, 8)), 31000 + 1000 * ri + 100 * li + c))
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
    return d


def evaluate(d, g, cal, test):
    w, sh = d[g], d["snr_hat"]
    out = {"n_test": int(test.sum()), "fail_all": float(w["bad"][test].mean()), "n_cal": int(cal.sum()),
           "fail_cal": float(w["bad"][cal].mean())}
    lam = ltt_threshold(w["psr"][cal], w["bad"][cal], GRID, ALPHA, DELTA)
    out["pooled"] = list(apply_gate(w["psr"][test], w["bad"][test], lam)) + [lam]
    floor, inner, lams = mondrian_ltt(w["psr"][cal], w["bad"][cal], sh[cal], GRID, ALPHA, DELTA)
    acc = mondrian_accept(w["psr"][test], sh[test], floor, inner, lams)
    n = int(acc.sum())
    out["mondrian"] = [n / max(int(test.sum()), 1), float(w["bad"][test][acc].mean()) if n else float("nan"), n,
                       [floor] + list(inner) + list(lams)]
    out["support"] = float(np.mean(sh[test] >= floor))
    if g == 0.25:
        agree = np.abs(d[1.0]["err"] - d[0.25]["err"]) <= FRAME  # the two estimates, not the truth
        s = np.where(agree, w["psr"], -np.inf)
        lam = ltt_threshold(s[cal], w["bad"][cal], GRID, ALPHA, DELTA)
        out["agree"] = list(apply_gate(s[test], w["bad"][test], lam)) + [lam]
    return out


def fmt(e):
    s = []
    for gname in GATES:
        if gname not in e:
            continue
        kept, fk, n = e[gname][:3]
        s.append(f"{gname} kept {kept:.2f} fail|kept {'  -   ' if n == 0 else f'{fk:.4f}'}")
    return f"(all {e['fail_all']:.3f}, n {e['n_test']}, in support {e['support']:.2f}) " + " | ".join(s)


def score(path):
    d = loadrows(path)
    cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
    out, summ = [], {"snr_hat": {}, "fail": {}, "T0": {}, "T1": {}, "T2": {}}
    P = out.append
    P("capture-sync step 3c: gates under unseen kinds of real noise (MS-SNSD speech and noise, statistical rooms;")
    P("LTT alpha 1% failure among accepted, delta 0.1; calibrate on sessions 0-4, test on sessions 5-9)")
    P(f"windows: {len(d['L'])}; types: {', '.join(TYPES)}; levels: none, {LEVELS} dB")
    P("")
    P("== Raw failure share by type and level (both sessions halves), gamma 1 / gamma 0.25 ==")
    for rt in ROOMS:
        for L in WINS:
            base = (d["rt"] == rt) & (d["L"] == L)
            m0 = base & (d["type"] == -1)
            summ["fail"][f"{rt}|{L}|none"] = [float(d[g]["bad"][m0].mean()) for g in GAMMAS]
            row = [f"none {summ['fail'][f'{rt}|{L}|none'][0]:.3f}/{summ['fail'][f'{rt}|{L}|none'][1]:.3f}"]
            for ti, tn in enumerate(TYPES):
                for s in LEVELS:
                    m = base & (d["type"] == ti) & (d["snr"] == s)
                    summ["fail"][f"{rt}|{L}|{tn}|{s}"] = [float(d[g]["bad"][m].mean()) for g in GAMMAS]
            P(f"  RT60 {rt} s, {L:.0f} s windows: " + row[0])
            for tn in TYPES:
                P(f"    {tn:21s} " + "  ".join(
                    f"{s:+3.0f} dB {summ['fail'][f'{rt}|{L}|{tn}|{s}'][0]:.3f}/{summ['fail'][f'{rt}|{L}|{tn}|{s}'][1]:.3f}"
                    for s in LEVELS))
    P("")
    P("== Blind SNR estimate by type and level, 2 s windows, both rooms (median [5th, 95th pct], dB) ==")
    for tn in ["none"] + TYPES:
        cells = []
        for s in ([NONE] if tn == "none" else LEVELS):
            m = (d["L"] == 2.0) & (d["type"] == (TYPES.index(tn) if tn != "none" else -1)) & (d["snr"] == s)
            q = [float(x) for x in np.percentile(d["snr_hat"][m], [5, 50, 95])]
            summ["snr_hat"][f"{tn}|{s}"] = q
            cells.append(f"{'' if tn == 'none' else f'{s:+3.0f} dB '}{q[1]:5.1f} [{q[0]:5.1f},{q[2]:5.1f}]")
        P(f"  {tn:21s} " + "   ".join(cells))
    P("")
    white = d["type"] == 0
    for rt in ROOMS:
        for L in WINS:
            for g in GAMMAS:
                base = (d["rt"] == rt) & (d["L"] == L)
                cal = base & cal_s & ((d["type"] == -1) | white)
                e = evaluate(d, g, cal, base & test_s & ((d["type"] == -1) | white))
                summ["T0"][f"{rt}|{L}|{g}"] = e
    P("== T0 in distribution: white (none, +10, 0, -10 dB) -> white, held-out sessions ==")
    for k, e in summ["T0"].items():
        P(f"  {k:14s}: {fmt(e)}")
    P("")
    P("== T1 white -> real type (step 3b's rule): calibrate none + white at all levels; test type x level ==")
    for rt in ROOMS:
        for L in WINS:
            for g in GAMMAS:
                base = (d["rt"] == rt) & (d["L"] == L)
                cal = base & cal_s & ((d["type"] == -1) | white)
                for ti, tn in enumerate(TYPES[1:], start=1):
                    for s in LEVELS:
                        e = evaluate(d, g, cal, base & test_s & (d["type"] == ti) & (d["snr"] == s))
                        summ["T1"][f"{rt}|{L}|{g}|{tn}|{s}"] = e
                        P(f"  RT60 {rt} {L:.0f} s g {g:4} {tn:21s} {s:+3.0f} dB: {fmt(e)}")
    P("")
    P("== T2 leave one type out: calibrate none + the other 9 types at all levels; test held-out type x level ==")
    for rt in ROOMS:
        for L in WINS:
            for g in GAMMAS:
                base = (d["rt"] == rt) & (d["L"] == L)
                for ti, tn in enumerate(TYPES):
                    cal = base & cal_s & (d["type"] != ti)
                    for s in LEVELS:
                        e = evaluate(d, g, cal, base & test_s & (d["type"] == ti) & (d["snr"] == s))
                        summ["T2"][f"{rt}|{L}|{g}|{tn}|{s}"] = e
                        P(f"  RT60 {rt} {L:.0f} s g {g:4} {tn:21s} {s:+3.0f} dB: {fmt(e)}")
    open(os.path.join(HERE, "noisetype_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "noisetype_summary.json"), "w"), indent=1)
    print("\n".join(out[:80]))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        a = sys.argv
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 1000
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        collect(a[2], a[3], nt, pr)
    else:
        score(sys.argv[2])
