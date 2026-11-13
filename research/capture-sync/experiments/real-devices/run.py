"""Step 1: audio sync of five free-running smartphones, measured on LibriWASN (real rooms, real clocks).

    python experiments/real-devices/run.py <LibriWASN root> [--trials 40] [--procs 4]

<LibriWASN root> holds LibriWASN/{200,800}/0S/<session>/record/<phone>_*.wav (CC BY 4.0, Zenodo
doi:10.5281/zenodo.10952434; `fetch.py` beside this file downloads just the phone channels by HTTP range
requests). Writes results.txt and summary.json beside this file.

Per room (200 = ~200 ms reverberation, 800 = ~800 ms), per session (10 each), per phone pair (10):
  1. coarse offset from the whole files; 2. a long-window reference line (20 s windows every 10 s,
  Theil-Sen), checked by its residuals, by a second reference with a different weighting, and by triple
  closure; 3. short windows (0.5, 1, 2, 4 s) at random times, the matching stretch of the other phone cut
  around the reference delay plus a prior error uniform in +-1 s and searched +-1.5 s, scored for five
  weightings gamma (1 = PHAT ... 0 = plain correlation). An estimate fails if it is more than one 30 fps
  frame (33.3 ms) from the reference.
"""
import itertools
import json
import os
import sys
import wave
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from capture_sync import (FS, gcc, coarse_offset, reference_line, line_at, closure, auroc,  # noqa: E402
                          pick_threshold)

PHONES = ["Nexus", "Pixel6a", "Pixel6b", "Pixel7", "Xiaomi"]
ROOMS = ["200", "800"]
WINS = [0.5, 1.0, 2.0, 4.0]
GAMMAS = [1.0, 0.75, 0.5, 0.25, 0.0]
SNRS = [None, 0.0, -10.0]  # None: the recording as is; else independent white noise added per phone
FRAME = 1 / 30
PRIOR = 1.0
SEARCH = 1.5


def load(path):
    w = wave.open(path)
    assert w.getframerate() == FS and w.getnchannels() == 1 and w.getsampwidth() == 2, path
    x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768.0
    return x


def sessions(root, room):
    base = os.path.join(root, "LibriWASN", room, "0S")
    out = []
    for s in sorted(os.listdir(base)):
        rec = os.path.join(base, s, "record")
        files = {p: [f for f in os.listdir(rec) if f.startswith(p + "_") and f.endswith(".wav")] for p in PHONES}
        if all(len(v) == 1 for v in files.values()):
            out.append((s, {p: os.path.join(rec, v[0]) for p, v in files.items()}))
    return out


def run_session(args):
    room, sess, paths, n_trials, seed = args
    rng = np.random.default_rng(seed)
    x = {p: load(paths[p]) for p in PHONES}
    refs, pairs = {}, []
    for i, j in itertools.combinations(range(len(PHONES)), 2):
        a, b = PHONES[i], PHONES[j]
        d0, cpsr = coarse_offset(x[a], x[b])
        r1 = reference_line(x[a], x[b], d0, gamma=1.0)
        r2 = reference_line(x[a], x[b], d0, gamma=0.25)
        dur = min(len(x[a]), len(x[b])) / FS
        tt = np.linspace(0, dur, 50)
        refs[(a, b)] = r1
        pairs.append({
            "room": room, "session": sess, "a": a, "b": b, "coarse_s": d0, "coarse_psr": cpsr,
            "d_s": r1["d"], "ppm": r1["s"] * 1e6, "n_ref": int(len(r1["t"])),
            "ref_inlier": float(np.mean(np.abs(r1["resid"]) < 0.005)),
            "ref_mad_ms": float(np.median(np.abs(r1["resid"])) * 1e3),
            "ref_gamma_diff_ms": float(np.max(np.abs(line_at(r1, tt) - line_at(r2, tt))) * 1e3),
            "dur_s": dur,
        })
    clos = []
    for i, j, k in itertools.combinations(range(len(PHONES)), 3):
        a, b, c = PHONES[i], PHONES[j], PHONES[k]
        for t in np.linspace(20, 500, 25):
            clos.append(float(closure(refs[(a, b)], refs[(b, c)], refs[(a, c)], t)))
    trials = []
    for (a, b), ref in refs.items():
        dur = min(len(x[a]), len(x[b])) / FS
        for _ in range(n_trials):
            t = float(rng.uniform(2.0, dur - 8.0 - abs(ref["d"])))
            u = float(rng.uniform(-PRIOR, PRIOR))
            for snr in SNRS:
                for L in WINS:
                    truth = line_at(ref, t + L / 2)
                    i0 = int(round(t * FS))
                    n = int(round(L * FS))
                    g_ = int(round(SEARCH * FS))
                    j0 = int(round((t + truth + u) * FS)) - g_
                    if j0 < 0 or j0 + n + 2 * g_ > len(x[b]):
                        continue
                    wa = x[a][i0:i0 + n].copy()
                    wb = x[b][j0:j0 + n + 2 * g_].copy()
                    level = 10 * np.log10(np.mean(wa ** 2) + 1e-20)
                    if snr is not None:
                        wa += rng.standard_normal(len(wa)) * np.sqrt(np.mean(wa ** 2) / 10 ** (snr / 10))
                        pb = np.mean(wb[g_:g_ + n] ** 2)
                        wb += rng.standard_normal(len(wb)) * np.sqrt(pb / 10 ** (snr / 10))
                    for g in GAMMAS:
                        d, p = gcc(wa, wb, gamma=g, max_lag_s=SEARCH, centre_s=SEARCH)
                        est = truth + u + d - SEARCH
                        trials.append((room, sess, a, b, L, g, est - truth, p, level,
                                       99.0 if snr is None else snr))
    return pairs, clos, trials


def cluster_ci(vals_by_cluster, rng, n_boot=2000):
    """95% bootstrap interval of the pooled mean, resampling sessions."""
    keys = list(vals_by_cluster)
    sums = np.array([np.sum(vals_by_cluster[k]) for k in keys])
    cnts = np.array([len(vals_by_cluster[k]) for k in keys])
    idx = rng.integers(0, len(keys), size=(n_boot, len(keys)))
    m = sums[idx].sum(1) / cnts[idx].sum(1)
    return float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def snr_name(s):
    return "as recorded" if s == 99.0 else f"{s:+.0f} dB white"


def main():
    root = sys.argv[1]
    n_trials = int(sys.argv[sys.argv.index("--trials") + 1]) if "--trials" in sys.argv else 40
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4
    jobs = []
    for room in ROOMS:
        for k, (s, paths) in enumerate(sessions(root, room)):
            jobs.append((room, s, paths, n_trials, 1000 * int(room) + k))
    with ProcessPoolExecutor(procs) as ex:
        res = list(ex.map(run_session, jobs))
    pairs = [p for r in res for p in r[0]]
    clos = {room: [c for j, r in zip(jobs, res) if j[0] == room for c in r[1]] for room in ROOMS}
    tr = np.array([t[4:] for r in res for t in r[2]], float)  # L, gamma, err, psr, level, snr
    meta = [t[:4] for r in res for t in r[2]]
    room_a = np.array([m[0] for m in meta])
    sess_a = np.array([m[0] + "/" + m[1] for m in meta])
    pair_ok = {(p["room"], p["session"], p["a"], p["b"]): p["ref_inlier"] >= 0.5 for p in pairs}
    ok = np.array([pair_ok[m] for m in meta])
    L_a, g_a, err, psr, snr_a = tr[:, 0], tr[:, 1], tr[:, 2], tr[:, 3], tr[:, 5]
    bad = np.abs(err) > FRAME
    rng = np.random.default_rng(0)
    snrs = [99.0 if s is None else s for s in SNRS]

    lines, summ = [], {"pairs": pairs, "fail": {}, "auroc": {}, "transfer": {}, "closure_ms": {}}
    P = lines.append
    P("capture-sync step 1: real-device audio sync on LibriWASN (5 smartphones, 2 rooms, sessions 0S)")
    P(f"sessions: {len(jobs)}; phone pairs: {len(pairs)}; pairs with a usable reference (>=50% of 20 s "
      f"windows within 5 ms of the line): {sum(pair_ok.values())}")
    P(f"short-window estimates scored: {int(ok.sum())} ({n_trials} times x {len(SNRS)} noise levels x "
      f"{len(WINS)} windows x {len(GAMMAS)} weightings per pair)")
    P("")
    P("== Reference lines ==")
    for room in ROOMS:
        pr = [p for p in pairs if p["room"] == room]
        c = np.abs(np.array(clos[room])) * 1e3
        summ["closure_ms"][room] = {"median": float(np.median(c)), "p95": float(np.percentile(c, 95)),
                                    "max": float(c.max())}
        P(f"room {room}: ref inlier share median {np.median([p['ref_inlier'] for p in pr]):.2f} "
          f"(min {min(p['ref_inlier'] for p in pr):.2f}); residual MAD median "
          f"{np.median([p['ref_mad_ms'] for p in pr]):.2f} ms; PHAT vs gamma 0.25 reference lines differ by "
          f"at most {max(p['ref_gamma_diff_ms'] for p in pr):.2f} ms (median "
          f"{np.median([p['ref_gamma_diff_ms'] for p in pr]):.2f})")
        P(f"  triple closure |tau_ab + tau_bc - tau_ac|: median {np.median(c):.2f} ms, 95th pct "
          f"{np.percentile(c, 95):.2f} ms, max {c.max():.2f} ms (10 triples x 25 times x sessions)")
        P(f"  offsets between the files as published: |d| median {np.median([abs(p['d_s']) for p in pr]) * 1e3:.1f}"
          f" ms, max {max(abs(p['d_s']) for p in pr) * 1e3:.1f} ms")
    P("")
    P("== Clock rate differences (ppm, b relative to a; mean and sd over sessions) ==")
    for room in ROOMS:
        for a, b in itertools.combinations(PHONES, 2):
            v = [p["ppm"] for p in pairs if p["room"] == room and p["a"] == a and p["b"] == b]
            P(f"room {room} {a:8s}-{b:8s} {np.mean(v):8.2f} +- {np.std(v):5.2f}  (n={len(v)})")
    allppm = np.abs([p["ppm"] for p in pairs])
    P(f"|SRO| over all pairs and sessions: median {np.median(allppm):.1f} ppm, max {allppm.max():.1f} ppm")
    P("")
    P("== Share of windows more than one frame (33.3 ms) off, [95% CI resampling sessions] ==")
    for s in snrs:
        for room in ROOMS:
            P(f"room {room}, {snr_name(s)}")
            P("  window  " + "".join(f"gamma={g:<4}          " for g in GAMMAS))
            for L in WINS:
                row = []
                for g in GAMMAS:
                    m = ok & (room_a == room) & (L_a == L) & (g_a == g) & (snr_a == s)
                    by = {}
                    for s_, b_ in zip(sess_a[m], bad[m]):
                        by.setdefault(s_, []).append(b_)
                    lo, hi = cluster_ci(by, rng)
                    f = float(bad[m].mean())
                    summ["fail"][f"{room}|{s}|{L}|{g}"] = {"fail": f, "lo": lo, "hi": hi, "n": int(m.sum())}
                    row.append(f"{f:.3f} [{lo:.3f},{hi:.3f}]")
                P(f"  {L:4.1f} s  " + " ".join(row))
    P("")
    P("== Is the peak-to-sidelobe ratio a usable confidence? AUROC (good windows score higher; nan = no failures) ==")
    for s in snrs:
        for room in ROOMS:
            P(f"room {room}, {snr_name(s)}")
            for L in WINS:
                row = []
                for g in GAMMAS:
                    m = ok & (room_a == room) & (L_a == L) & (g_a == g) & (snr_a == s)
                    v = auroc(psr[m & bad], psr[m & ~bad])
                    summ["auroc"][f"{room}|{s}|{L}|{g}"] = v
                    row.append(f"{v:.3f}")
                P(f"  {L:4.1f} s  " + "  ".join(row))
    P("")
    P("== PSR gate chosen in one room (accepted windows fail <= 1%, all noise levels pooled), applied in the other ==")
    P("  noise, window, gamma | from->to: threshold, share kept, failure among kept (failure without gate)")
    ths = {}
    for L in WINS:
        for g in GAMMAS:
            for src in ROOMS:
                ms = ok & (room_a == src) & (L_a == L) & (g_a == g)
                ths[(src, L, g)] = pick_threshold(psr[ms], bad[ms], 0.01)
    for s in snrs:
        for L in WINS:
            for g in GAMMAS:
                parts = []
                for src, dst in [("200", "800"), ("800", "200")]:
                    md = ok & (room_a == dst) & (L_a == L) & (g_a == g) & (snr_a == s)
                    th = ths[(src, L, g)]
                    keep = md & (psr >= th)
                    kept = float(keep.sum() / md.sum())
                    fk = float(bad[keep].mean()) if keep.any() else float("nan")
                    summ["transfer"][f"{src}->{dst}|{s}|{L}|{g}"] = {
                        "th": th, "kept": kept, "fail_kept": fk, "fail_all": float(bad[md].mean())}
                    parts.append(f"{src}->{dst}: {th:6.2f} {kept:.2f} {fk:.3f} ({bad[md].mean():.3f})")
                P(f"  {snr_name(s):12s} {L:4.1f} s {g:4}  | " + " | ".join(parts))
    P("")
    P("== Error size where the window is found (|err| <= 1 frame), 2 s windows ==")
    for s in snrs:
        for room in ROOMS:
            for g in [1.0, 0.25]:
                m = ok & (room_a == room) & (L_a == 2.0) & (g_a == g) & ~bad & (snr_a == s)
                e = np.abs(err[m]) * 1e3
                P(f"room {room} {snr_name(s):12s} gamma {g}: median {np.median(e):.2f} ms, 95th pct "
                  f"{np.percentile(e, 95):.2f} ms")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(summ, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
