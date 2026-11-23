"""Step 6c (milestone 6): when device 1's clock rate wanders as it warms up, does holding the coarse line (6b's
best tracker on a constant-rate twin) still keep a 30-minute session in sync, and what does a gated tracker
buy? (plan in LOG.md, written before the run)

    python experiments/tracker/wander.py time <MS-SNSD root>
    python experiments/tracker/wander.py collect <MS-SNSD root> <rows_6c.json> [--procs 4]
    python experiments/tracker/wander.py score <rows_6c.json>

Session: the ten MS-SNSD speech blocks concatenated in rotated order (block k first; 37.5 min in all) and cut
to 30 min plus margins, played to two devices in the 200 ms room (step 2a's statistical impulse responses).
Device 1 is switched on at the start of the raw recording, 10 s before the scored session; its rate is
eps(t) = eps_s + w (1 - exp(-t / 120 s)) (`clock.warmup_ppm`): eps_s is 17 ppm (step 1's Nexus to Pixel 6a
rate on LibriWASN) with a random sign, w one of 0, 5, 15, 30, 60 ppm with its own random sign (Gburrek et al.
2022: a few ppm within a few minutes of power-on; 15-60 ppm are sweep values with no source). Start offset
uniform in +-8 s. Noise and conditions as steps 4d-6b: none, and the ten types at -10 dB, independent per
device. Truth: tau(t) = (phi(A + t fs) - B) / fs - t (`clock.phi`).

Every tracker starts from 6a's rl1 coarse step (`sync.rate_lag_search`, 1 s sub-windows, first 20 s):
  hold     rl1's line, never updated.
  gated    6b's gated tracker (one-frame gate, Theil-Sen over accepted windows of the last 120 s once 3 span 20 s).
  gated60  the same, but the accepted windows must span 60 s before their line replaces rl1's rate.
Scored every second from 20 s to the end: the share of seconds more than one 30 fps frame off, the time of the
first such second, and the session's largest error.
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "baselines"))
import tracker as T  # noqa: E402
from capture_sync import clock as C  # noqa: E402
from capture_sync.sync import rate_lag_search  # noqa: E402
from capture_sync.track import track  # noqa: E402

FS, FRAME = T.FS, T.FRAME
N = int(T.COARSE_S * FS)
ROOM, EPS_S, TAU = 0.2, 17.0, 120.0
WS = [0.0, 5.0, 15.0, 30.0, 60.0]
SESSION_S = 1800.0
REPS = 2
METHODS = ["hold", "gated", "gated60"]


def env_norm(x, win_s=0.032, floor_rel=1e-3):
    """sync.envelope_normalise with the moving mean done by cumulative sums (same result, linear time; a
    30-minute signal through np.convolve takes minutes). Checked against it in tests/test_clock.py."""
    w = max(1, int(round(win_s * FS)))
    q = np.concatenate([[0.0], np.cumsum(x * x)])
    n = np.arange(len(x))  # np.convolve(..., mode="same") output n sums x[n + (w-1)//2 - w + 1 .. n + (w-1)//2]
    a = np.clip(n + (w - 1) // 2 - w + 1, 0, len(x))
    b = np.clip(n + (w - 1) // 2 + 1, 0, len(x))
    p = (q[b] - q[a]) / w
    env = np.sqrt(np.maximum(p, 0.0))
    floor = floor_rel * np.sqrt(np.mean(x * x)) + 1e-20
    return x / np.maximum(env, floor)


def session(blocks, k, rng, w):
    """(dev0, dev1, A, B, phi, eps_s, w signed) for rotation k and warm-up amplitude w."""
    sp = np.concatenate(blocks[k:] + blocks[:k])
    A = int(T.A_S * FS)
    sp = sp[:int((SESSION_S + 2 * T.A_S + 2 * T.D0_MAX + 2) * FS)]
    x0 = fftconvolve(sp, T.NT.rir(ROOM, rng))[:len(sp)]
    x1 = fftconvolve(sp, T.NT.rir(ROOM, rng))[:len(sp)]
    eps = EPS_S * (1 if rng.random() < 0.5 else -1)
    ws = w * (1 if rng.random() < 0.5 else -1)
    y1, ph = C.record(x1, C.warmup_ppm(np.arange(len(x1)) / FS, eps, ws, TAU))
    d0 = rng.uniform(-T.D0_MAX, T.D0_MAX)
    B = int(round(ph[A] - d0 * FS))
    n = int(SESSION_S * FS)
    return x0[A:A + n].copy(), y1[B:B + n].copy(), A, B, ph, eps, ws


def truth(t, A, B, ph):
    return (np.interp(A + t * FS, np.arange(len(ph), dtype=float), ph) - B) / FS - t


def jobs():
    return [(wi, k, rep, 61000 + 100 * wi + 10 * rep + k) for wi in range(len(WS)) for rep in range(REPS)
            for k in range(T.NT.N_SESS)]


def run_session(args, root=None):
    wi, k, rep, seed = args
    root = root or os.environ["MSSNSD"]
    rng = np.random.default_rng(seed)
    blocks, nz = T.NT.speech_blocks(root), T.NT.noises(root)
    d0c, d1c, A, B, ph, eps, ws = session(blocks, k, rng, WS[wi])
    t_eval = np.arange(T.T0, SESSION_S - 3.0, 1.0)
    tau = truth(t_eval, A, B, ph)
    tc = float(truth(np.array([T.COARSE_S / 2]), A, B, ph)[0])
    rate_c = float((truth(np.array([T.COARSE_S]), A, B, ph)[0] - truth(np.array([0.0]), A, B, ph)[0]) / T.COARSE_S)
    rows = []
    for ti, snr in T.CONDS:
        x0 = T.add_noise(d0c, ti, snr, nz, 0, rng)
        x1 = T.add_noise(d1c, ti, snr, nz, 1, rng)
        e0, e1 = env_norm(x0), env_norm(x1)
        del x0, x1
        d, s, _ = rate_lag_search(e0[:N], e1[:N], sub_s=1.0)
        base = dict(w=WS[wi], sess=k, rep=rep, ti=ti, snr=snr, eps=eps, ws=ws, coarse_err=float(d - tc),
                    rate_err=float(s - rate_c * 1e6))
        preds = {"hold": track(e0, e1, d, s * 1e-6, t_eval, mode="hold", t0=T.COARSE_S / 2, start=T.T0),
                 "gated": track(e0, e1, d, s * 1e-6, t_eval, mode="gated", t0=T.COARSE_S / 2, start=T.T0),
                 "gated60": track(e0, e1, d, s * 1e-6, t_eval, mode="gated", t0=T.COARSE_S / 2, start=T.T0,
                                  min_span=60.0)}
        for m in METHODS:
            pr, sl = preds[m]
            err = pr - tau
            bad = np.abs(err) > FRAME
            rows.append(dict(base, method=m, oos=float(bad.mean()), n=int(len(bad)),
                             first_oos=float(t_eval[np.argmax(bad)]) if bad.any() else None,
                             max_err=float(np.max(np.abs(err))), end_err=float(err[-1]),
                             err_min=[float(v) for v in err[::60]]))
    return rows


def _run(args):
    return run_session(args)


def time_one(root):
    import time
    os.environ["MSSNSD"] = root
    t = time.time()
    rows = run_session(jobs()[-1])
    print(f"one session, {len(T.CONDS)} conditions: {time.time() - t:.1f} s, {len(rows)} rows (not read)")


def collect(root, path, procs):
    os.environ["MSSNSD"] = root
    js = jobs()
    rows = []
    with ProcessPoolExecutor(procs) as ex:
        for i, rr in enumerate(ex.map(_run, js)):
            rows += rr
            print(f"session {i + 1}/{len(js)}", flush=True)
            json.dump(rows, open(path, "w"))


def score(path):
    rows = json.load(open(path))
    lines, summ = [], {}
    P = lines.append

    def sel(**kw):
        return [r for r in rows if all(r[k] == v for k, v in kw.items())]

    def paired(w, ma, mb):
        idx = {(r["sess"], r["rep"], r["ti"]): r for r in sel(w=w, method=mb)}
        by = {}
        for r in sel(w=w, method=ma):
            if r["ti"] >= 0:
                by.setdefault(r["sess"], []).append(r["oos"] - idx[(r["sess"], r["rep"], r["ti"])]["oos"])
        mean = np.mean([v for vs in by.values() for v in vs])
        lo, hi = T.boot(by)
        return float(mean), float(lo), float(hi)

    fail = lambda r: abs(r["coarse_err"]) > FRAME  # noqa: E731
    P("Step 6c: trackers on 30-minute sessions whose clock rate wanders as device 1 warms up")
    P("(200 ms room, |static rate| 17 ppm, warm-up w (1 - exp(-t / 120 s)); out of sync = more than one 30 fps")
    P(" frame off, share of scored seconds; mean over the ten noise types at -10 dB unless 'none')")
    for w in WS:
        P(f"\n== warm-up |w| {w:g} ppm ==")
        P(f"{'condition':22s}{'rl1 fail':>9s}" + "".join(f"{m:>10s}" for m in METHODS))
        for ti, snr in T.CONDS:
            name = "none" if ti < 0 else f"{T.TYPES[ti]} {snr:g}"
            c = 100 * np.mean([fail(r) for r in sel(w=w, ti=ti, method="hold")])
            k = [100 * np.mean([r["oos"] for r in sel(w=w, ti=ti, method=m)]) for m in METHODS]
            P(f"{name:22s}{c:8.1f}%" + "".join(f"{v:9.1f}%" for v in k))
        neg = [r for r in sel(w=w, method="hold") if r["ti"] >= 0]
        c = 100 * np.mean([fail(r) for r in neg])
        k = [100 * np.mean([r["oos"] for r in sel(w=w, method=m) if r["ti"] >= 0]) for m in METHODS]
        P(f"{'mean, ten types -10 dB':22s}{c:8.1f}%" + "".join(f"{v:9.1f}%" for v in k))
        summ[f"{w}|rl1_fail"] = c
        for m, v in zip(METHODS, k):
            summ[f"{w}|{m}"] = v
        for m in METHODS:
            none = sel(w=w, ti=-1, method=m)
            summ[f"{w}|{m}|none"] = 100 * float(np.mean([r["oos"] for r in none]))
        h5 = [100 * np.mean([r["oos"] <= 0.01 for r in sel(w=w, method=m) if r["ti"] >= 0]) for m in METHODS]
        P("  sessions >= 99% in sync at -10 dB: " + ", ".join(f"{m} {v:.1f}%" for m, v in zip(METHODS, h5)))
        summ[f"{w}|h5"] = dict(zip(METHODS, h5))
        for m in METHODS:
            ok = [r for r in sel(w=w, method=m) if not fail(r)]
            oo = 100 * np.mean([r["oos"] for r in ok]) if ok else float("nan")
            me = np.median([r["max_err"] for r in ok]) * 1e3 if ok else float("nan")
            fo = [r["first_oos"] for r in ok if r["first_oos"] is not None]
            P(f"  {m:8s} where rl1 is right ({len(ok)} of {len(sel(w=w, method=m))}, all 11 conditions): out of "
              f"sync {oo:.2f}%, median largest error {me:.1f} ms, {len(fo)} sessions ever a frame off"
              + (f" (median first at {np.median(fo):.0f} s)" if fo else ""))
            summ[f"{w}|{m}|right"] = [oo, float(me), len(fo), len(ok)]
        re = [abs(r["rate_err"]) for r in sel(w=w, method="hold") if not fail(r)]
        P(f"  rl1 |rate error| against the true mean rate over 0-20 s, where right: median {np.median(re):.2f} ppm")
        for ma, mb in (("gated", "hold"), ("gated60", "hold"), ("gated60", "gated")):
            mean, lo, hi = paired(w, ma, mb)
            summ[f"{w}|{ma}-{mb}"] = [mean, lo, hi]
            P(f"  out of sync {ma} minus {mb}: {100 * mean:+.1f} points (95% session bootstrap "
              f"{100 * lo:+.1f} to {100 * hi:+.1f})")
    txt = "\n".join(lines)
    print(txt)
    open(os.path.join(HERE, "wander_results.txt"), "w").write(txt + "\n")
    json.dump(summ, open(os.path.join(HERE, "wander_summary.json"), "w"), indent=1)


if __name__ == "__main__":
    if sys.argv[1] == "time":
        time_one(sys.argv[2])
    elif sys.argv[1] == "collect":
        procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4
        collect(sys.argv[2], sys.argv[3], procs)
    elif sys.argv[1] == "score":
        score(sys.argv[2])
