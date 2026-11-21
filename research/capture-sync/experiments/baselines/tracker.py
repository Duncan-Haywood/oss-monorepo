"""Step 4d: does paderwasn's online tracker (coarse sync plus online WACD; Gburrek et al. 2022) keep a drifting
pair of recorders in sync better than a windowed GCC tracker? (milestone 4, the last baseline; a first look at
milestone 6's session tracker and H5)

    python experiments/baselines/tracker.py time <MS-SNSD root>
    python experiments/baselines/tracker.py collect <MS-SNSD root> <rows_4d.json> [--procs 4] [--reps 2]
    python experiments/baselines/tracker.py score <rows_4d.json>

Session (one per speech block, rep and room): a whole MS-SNSD speech block (3.2-3.6 min after trimming) played to two
devices, each through its own statistical impulse response (step 2a's `rir`, RT60 0.2 or 0.8 s). Device 1's
clock runs eps slow (`wacd.sim_sro`, paderwasn's resampler), eps one of 17 ppm (step 1's measured Nexus to
Pixel 6a rate on LibriWASN), 100 ppm and 300 ppm (sweep values, no source: they stand for consumer cameras whose
audio clocks we could not find measured), with a random sign; it started d0 uniform in +-8 s before or after
device 0. Truth: tau(t) = ((A + t fs)(1 + eps) - B) / fs - t, device 1's delay behind device 0 at device-0 time
t (`truth`). Noise independent per device (noisetype's file split, tiled from a random start), scaled to the
SNR over each device's whole session; 11 conditions: none and the ten types at -10 dB.

Trackers, all starting from the first 20 s and scored at every second from 20 s to the end:
  pw        paderwasn as published: coarse_sync over the first 320,000 samples (argmax |plain correlation|),
            then online WACD with its defaults; the delay is the integer offset plus the estimator's own
            running SRO-induced shift (causal).
  pw_set    the same with paderwasn's experiment-script settling (first 39 estimates replaced by the 40th).
  fnc       envelope-normalised GCC (gamma 0.25) of the first 20 s, searched +-15 s; held, no drift model.
  fnc_wacd  fnc's offset (rounded) as the coarse step, then online WACD as in pw.
  track     fnc's offset, then a 2 s window every 5 s (envelope-normalised GCC, gamma 0.25, searched +-1.5 s
            around the current prediction); of the windows in the last 120 s, those with PSR at or above the
            history's median PSR; a Theil-Sen line through them when at least 3 span 20 s, else their median,
            else fnc. Fixed before any session was run; no threshold is fitted to the data.

Score per session: the share of scored seconds more than a 30 fps frame off (out of sync); the SRO error at the
end (ppm; pw: median of the last 60 s of estimates; track: its line's slope); whether the session stays in sync
for at least 99% of its scored time (H5's criterion).
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gate"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import noisetype as NT  # noqa: E402
from capture_sync.sync import gcc, envelope_normalise, theil_sen  # noqa: E402
from capture_sync import wacd as W  # noqa: E402

FS, FRAME = NT.FS, NT.FRAME
ROOMS, TYPES = NT.ROOMS, NT.TYPES
SROS = [17.0, 100.0, 300.0]
CONDS = [(-1, NT.NONE)] + [(k, -10.0) for k in range(len(TYPES))]
METHODS = ["pw", "pw_set", "fnc", "fnc_wacd", "track"]
A_S, D0_MAX, COARSE_S, T0 = 10.0, 8.0, 20.0, 20.0
WIN, HOP, SEARCH, HIST, MIN_SPAN = 2.0, 5.0, 1.5, 120.0, 20.0


def truth(t, A, B, eps):
    return ((A + t * FS) * (1 + eps * 1e-6) - B) / FS - t


def session(sp, rt, eps, rng):
    """(dev0, dev1, A, B, eps signed): the two recordings of one speech block."""
    x0 = fftconvolve(sp, NT.rir(rt, rng))[:len(sp)]
    x1 = fftconvolve(sp, NT.rir(rt, rng))[:len(sp)]
    eps = eps * (1 if rng.random() < 0.5 else -1)
    y1 = W.sim_sro(x1, eps)
    A = int(A_S * FS)
    d0 = rng.uniform(-D0_MAX, D0_MAX)
    B = int(round(A * (1 + eps * 1e-6) - d0 * FS))
    N = min(len(sp), len(y1)) - 2 * A
    return x0[A:A + N].copy(), y1[B:B + N].copy(), A, B, eps


def add_noise(x, ti, snr, nz, dev, rng):
    if ti < 0:
        return x.copy()
    if TYPES[ti] == "white":
        z = rng.standard_normal(len(x))
    else:
        src = nz[TYPES[ti]][dev]
        j = int(rng.integers(0, len(src)))
        z = np.resize(np.roll(src, -j), len(x))
    return x + z * np.sqrt(np.mean(x ** 2) / 10 ** (snr / 10) / (np.mean(z ** 2) + 1e-20))


def wacd_delay(dev1, dev0, off, settle=False, run=None):
    """Delay (s) of dev1 behind dev0 at every device-0 sample index function, from an integer coarse offset and
    online WACD on the trimmed pair (paderwasn's pipeline). Returns (f(t_seconds) -> delay, sro estimates)."""
    if run is None:
        s, r = W.trim(dev1, dev0, off)
        run = W.online_wacd(s, r)
    est, tau, c = run
    if settle and len(est) >= W.SETTLING:
        est = est.copy()
        est[:W.SETTLING - 1] = est[W.SETTLING - 1]
        tau = np.empty_like(est)
        tau[0] = (W.SEG_LEN / 2 + W.TEMP_DIST) * est[0] * 1e-6
        tau[1:] = tau[0] + np.cumsum(W.SEG_SHIFT * est[1:] * 1e-6)
    lead = max(0, -off)
    cc = np.concatenate(([0.0], c))
    tt = np.concatenate(([0.0], tau))

    def f(t):
        n = t * FS - lead
        last = est[-1] * 1e-6
        v = np.interp(n, cc, tt) + np.where(n > cc[-1], (n - cc[-1]) * last, 0.0)
        return (off + v) / FS

    return f, est, run


def fn_coarse(e0, e1):
    n = int(COARSE_S * FS)
    d, _ = gcc(e0[:n], e1[:n], gamma=0.25, max_lag_s=15.0, centre_s=0.0)
    return d


def run_track(e0, e1, d_coarse, t_eval):
    """Prediction at each time in t_eval (s), causal, and the final slope (s/s)."""
    ts, ds, ps = [], [], []
    n, g = int(WIN * FS), int(SEARCH * FS)
    pred = np.empty(len(t_eval))
    cur, slope = d_coarse, np.nan
    line = None
    k = 0
    t = T0 - WIN
    end = len(e0) / FS
    while k < len(t_eval):
        t_done = t + WIN  # this window's result is usable from t_done
        while k < len(t_eval) and t_eval[k] < t_done:
            pred[k] = line(t_eval[k]) if line else cur
            k += 1
        if t + WIN > end:
            t += HOP
            continue
        c = (line(t + WIN / 2) if line else cur)
        i0 = int(round(t * FS))
        j0 = int(round((t + c) * FS)) - g
        if 0 <= j0 and j0 + n + 2 * g <= len(e1) and i0 + n <= len(e0):
            d, p = gcc(e0[i0:i0 + n], e1[j0:j0 + n + 2 * g], gamma=0.25, max_lag_s=SEARCH, centre_s=SEARCH)
            ts.append(t + WIN / 2)
            ds.append(c + d - SEARCH)
            ps.append(p)
        T, D, P = np.array(ts), np.array(ds), np.array(ps)
        h = T > t_done - HIST
        if h.any():
            keep = h & (P >= np.median(P[h]))
            if keep.sum() >= 3 and np.ptp(T[keep]) >= MIN_SPAN:
                icpt, slope = theil_sen(T[keep], D[keep])
                line = (lambda a, b: (lambda x: a + b * x))(icpt, slope)
            else:
                med = float(np.median(D[keep]))
                line = (lambda m: (lambda x: m))(med)
        t += HOP
    return pred, slope


def run_session(args):
    root, rt, eps_abs, sess, rep, seed = args
    rng = np.random.default_rng(seed)
    blocks, nz = NT.speech_blocks(root), NT.noises(root)
    d0c, d1c, A, B, eps = session(blocks[sess], rt, eps_abs, rng)
    t_eval = np.arange(T0, len(d0c) / FS - 3.0, 1.0)
    tau = truth(t_eval, A, B, eps)
    rows = []
    for ti, snr in CONDS:
        x0 = add_noise(d0c, ti, snr, nz, 0, rng)
        x1 = add_noise(d1c, ti, snr, nz, 1, rng)
        e0, e1 = envelope_normalise(x0), envelope_normalise(x1)
        off = W.coarse_sync_offset(x1, x0)
        dfn = fn_coarse(e0, e1)
        out = {}
        f, est, run = wacd_delay(x1, x0, off)
        out["pw"] = (f(t_eval), np.median(est[-int(60 * FS / W.SEG_SHIFT):]), off / FS)
        f, est_s, _ = wacd_delay(x1, x0, off, settle=True, run=run)
        out["pw_set"] = (f(t_eval), np.median(est_s[-int(60 * FS / W.SEG_SHIFT):]), off / FS)
        out["fnc"] = (np.full(len(t_eval), dfn), np.nan, dfn)
        offn = int(round(dfn * FS))
        if offn == off:
            out["fnc_wacd"] = out["pw"]
        else:
            f, est, _ = wacd_delay(x1, x0, offn)
            out["fnc_wacd"] = (f(t_eval), np.median(est[-int(60 * FS / W.SEG_SHIFT):]), offn / FS)
        pr, sl = run_track(e0, e1, dfn, t_eval)
        out["track"] = (pr, sl * 1e6, dfn)
        for m in METHODS:
            p, sro_hat, coarse = out[m]
            bad = np.abs(p - tau) > FRAME
            rows.append(dict(room=rt, sro=eps_abs, sess=sess, rep=rep, ti=ti, snr=snr, method=m,
                             oos=float(bad.mean()), n=int(len(bad)),
                             sro_err=float(sro_hat - eps) if np.isfinite(sro_hat) else None,
                             coarse_err=float(coarse - truth(COARSE_S / 2, A, B, eps)),
                             max_err=float(np.max(np.abs(p - tau)))))
    return rows


def jobs(root, reps):
    out = []
    for r, rt in enumerate(ROOMS):
        for e, eps in enumerate(SROS):
            for rep in range(reps):
                for sess in range(NT.N_SESS):
                    out.append((root, rt, eps, sess, rep, 47000 + 1000 * r + 100 * e + 10 * rep + sess))
    return out


def collect(root, path, procs, reps):
    js = jobs(root, reps)
    rows = []
    with ProcessPoolExecutor(procs) as ex:
        for i, rr in enumerate(ex.map(run_session, js)):
            rows += rr
            print(f"session {i + 1}/{len(js)}", flush=True)
    with open(path, "w") as f:
        json.dump(rows, f)


def time_one(root):
    import time
    t = time.time()
    rows = run_session((root, 0.8, 100.0, 0, 0, 1))
    print(f"one session, {len(CONDS)} conditions: {time.time() - t:.1f} s, {len(rows)} rows (not read)")


def boot(vals_by_sess, n=2000, seed=0):
    rng = np.random.default_rng(seed)
    keys = sorted(vals_by_sess)
    arr = [np.asarray(vals_by_sess[k]) for k in keys]
    out = []
    for _ in range(n):
        pick = rng.integers(0, len(keys), len(keys))
        out.append(np.mean(np.concatenate([arr[i] for i in pick])))
    return np.percentile(out, [2.5, 97.5])


def score(path):
    rows = json.load(open(path))
    lines = []
    P = lines.append
    summ = {}

    def sel(**kw):
        return [r for r in rows if all(r[k] == v for k, v in kw.items())]

    P("Step 4d: paderwasn's online tracker against windowed GCC on drifting twin sessions")
    P("(MS-SNSD speech, statistical rooms, independent noise per device; share of scored seconds > 1 frame off)")
    for rt in ROOMS:
        for eps in SROS:
            P(f"\n== room {int(rt * 1000)} ms, |SRO| {eps:g} ppm ==")
            P(f"{'condition':22s}" + "".join(f"{m:>10s}" for m in METHODS))
            for ti, snr in CONDS:
                name = "none" if ti < 0 else f"{TYPES[ti]} {snr:g}"
                vals = []
                for m in METHODS:
                    v = np.mean([r["oos"] for r in sel(room=rt, sro=eps, ti=ti, method=m)])
                    summ[f"{rt}|{eps}|{ti}|{m}"] = v
                    vals.append(v)
                P(f"{name:22s}" + "".join(f"{100 * v:9.1f}%" for v in vals))
            P("mean of ten types at -10 dB" + "".join(
                f"{100 * np.mean([summ[f'{rt}|{eps}|{k}|{m}'] for k in range(len(TYPES))]):9.1f}%" for m in METHODS))
            P("sessions >= 99% in sync, -10 dB" + "".join(
                f"{100 * np.mean([r['oos'] <= 0.01 for r in sel(room=rt, sro=eps, method=m) if r['ti'] >= 0]):8.1f}%"
                for m in METHODS))
            for m in ("pw", "track"):
                e = [abs(r["sro_err"]) for r in sel(room=rt, sro=eps, method=m) if r["ti"] >= 0 and r["sro_err"] is not None]
                e0 = [abs(r["sro_err"]) for r in sel(room=rt, sro=eps, method=m, ti=-1) if r["sro_err"] is not None]
                P(f"  |SRO error| {m:6s} median {np.median(e0):.2f} ppm (no noise), {np.median(e):.2f} ppm (-10 dB)")
            for m in ("pw", "fnc"):
                c = [abs(r["coarse_err"]) > FRAME for r in sel(room=rt, sro=eps, method=m) if r["ti"] >= 0]
                P(f"  coarse step off by > 1 frame, {m:4s}: {100 * np.mean(c):.1f}% of -10 dB sessions")
            # primary contrasts: pw minus track, pw minus fnc_wacd, mean over ten types at -10 dB, session bootstrap
            for a, b in (("pw", "track"), ("pw", "fnc_wacd"), ("fnc_wacd", "track")):
                by = {}
                for r in sel(room=rt, sro=eps, method=a):
                    if r["ti"] < 0:
                        continue
                    o = [q for q in sel(room=rt, sro=eps, method=b, sess=r["sess"], rep=r["rep"], ti=r["ti"])][0]
                    by.setdefault(r["sess"], []).append(r["oos"] - o["oos"])
                mean = np.mean([v for vs in by.values() for v in vs])
                lo, hi = boot(by)
                summ[f"{rt}|{eps}|{a}-{b}"] = [mean, lo, hi]
                P(f"  {a} minus {b}: {100 * mean:+.1f} points (95% session bootstrap {100 * lo:+.1f} to {100 * hi:+.1f})")
    txt = "\n".join(lines)
    print(txt)
    base = os.path.join(HERE, "tracker")
    open(base + "_results.txt", "w").write(txt + "\n")
    json.dump(summ, open(base + "_summary.json", "w"), indent=1)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "time":
        time_one(sys.argv[2])
    elif cmd == "collect":
        procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4
        reps = int(sys.argv[sys.argv.index("--reps") + 1]) if "--reps" in sys.argv else 2
        collect(sys.argv[2], sys.argv[3], procs, reps)
    elif cmd == "score":
        score(sys.argv[2])
