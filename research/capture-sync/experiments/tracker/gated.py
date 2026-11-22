"""Step 6b (milestone 6): once the coarse step searches clock rate as well as lag (6a), what should the session
tracker do with its re-estimates? (plan in LOG.md, written before the run)

    python experiments/tracker/gated.py time <MS-SNSD root>
    python experiments/tracker/gated.py collect <MS-SNSD root> <rows_6b.json> [--procs 4]
    python experiments/tracker/gated.py score <rows_6b.json>

Sessions are step 4d's and 6a's exactly (`tracker.jobs`, same seeds; the rng is consumed in the same order, so
the same speech, rooms, offsets, signs of drift and noise): 2 rooms x 3 |SRO| x 2 reps x 10 speech blocks, 11
conditions. Every tracker starts from 6a's rl1 coarse step (`sync.rate_lag_search`, 1 s sub-windows, first 20 s).

  track_rl  step 6a's tracker (4d's rule started on rl1's line; must reproduce 6a's rows).
  hold      rl1's line, never updated (`track.track(mode="hold")`).
  kr        4d's PSR-median rule, keeping rl1's rate until the history fits a line (`mode="kr"`).
  gated     windows accepted only within one 30 fps frame of the current line (`mode="gated"`). Primary.
Scored every second from 20 s to the end, as 4d: the share of seconds more than one frame off.
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "baselines"))
import tracker as T  # noqa: E402
from capture_sync.sync import rate_lag_search  # noqa: E402
from capture_sync.track import track  # noqa: E402

FS, FRAME = T.FS, T.FRAME
N = int(T.COARSE_S * FS)
METHODS = ["track_rl", "hold", "kr", "gated"]


def run_session(args):
    root, rt, eps_abs, sess, rep, seed = args
    rng = np.random.default_rng(seed)
    blocks, nz = T.NT.speech_blocks(root), T.NT.noises(root)
    d0c, d1c, A, B, eps = T.session(blocks[sess], rt, eps_abs, rng)
    t_eval = np.arange(T.T0, len(d0c) / FS - 3.0, 1.0)
    tau = T.truth(t_eval, A, B, eps)
    tc = T.truth(T.COARSE_S / 2, A, B, eps)
    rows = []
    for ti, snr in T.CONDS:
        x0 = T.add_noise(d0c, ti, snr, nz, 0, rng)
        x1 = T.add_noise(d1c, ti, snr, nz, 1, rng)
        e0, e1 = T.envelope_normalise(x0), T.envelope_normalise(x1)
        d, s, _ = rate_lag_search(e0[:N], e1[:N], sub_s=1.0)
        base = dict(room=rt, sro=eps_abs, sess=sess, rep=rep, ti=ti, snr=snr, eps=eps,
                    coarse_err=float(d - tc), rate_err=float(s - eps))
        preds = {"track_rl": T.run_track(e0, e1, d, t_eval, init_slope=s * 1e-6)}
        for m in ("hold", "kr", "gated"):
            preds[m] = track(e0, e1, d, s * 1e-6, t_eval, mode=m, t0=T.COARSE_S / 2, start=T.T0)
        for m in METHODS:
            pr, sl = preds[m]
            bad = np.abs(pr - tau) > FRAME
            rows.append(dict(base, method=m, oos=float(bad.mean()), n=int(len(bad)),
                             slope_err=float(sl * 1e6 - eps) if np.isfinite(sl) else None,
                             end_err=float(pr[-1] - tau[-1])))
    return rows


def time_one(root):
    import time
    t = time.time()
    rows = run_session(T.jobs(root, 2)[0])
    print(f"one session, {len(T.CONDS)} conditions: {time.time() - t:.1f} s, {len(rows)} rows (not read)")


def collect(root, path, procs):
    js = T.jobs(root, 2)
    rows = []
    with ProcessPoolExecutor(procs) as ex:
        for i, rr in enumerate(ex.map(run_session, js)):
            rows += rr
            print(f"session {i + 1}/{len(js)}", flush=True)
    json.dump(rows, open(path, "w"))


def score(path):
    rows = json.load(open(path))
    lines, summ = [], {}
    P = lines.append

    def sel(**kw):
        return [r for r in rows if all(r[k] == v for k, v in kw.items())]

    def paired(rt, eps, ma, mb, cond=lambda r: r["ti"] >= 0):
        idx = {(r["sess"], r["rep"], r["ti"]): r for r in sel(room=rt, sro=eps, method=mb)}
        by = {}
        for r in sel(room=rt, sro=eps, method=ma):
            if cond(r):
                by.setdefault(r["sess"], []).append(r["oos"] - idx[(r["sess"], r["rep"], r["ti"])]["oos"])
        mean = np.mean([v for vs in by.values() for v in vs])
        lo, hi = T.boot(by)
        return float(mean), float(lo), float(hi)

    fail = lambda r: abs(r["coarse_err"]) > FRAME  # noqa: E731
    P("Step 6b: what a session tracker should do with its re-estimates, started from 6a's joint lag-and-rate search")
    P("(step 4d's drifting twin sessions; out of sync = more than one 30 fps frame off, share of scored seconds)")
    for rt in T.ROOMS:
        for eps in T.SROS:
            P(f"\n== room {int(rt * 1000)} ms, |SRO| {eps:g} ppm ==")
            P(f"{'condition':22s}{'rl1 fail':>9s}" + "".join(f"{m:>10s}" for m in METHODS))
            for ti, snr in T.CONDS:
                name = "none" if ti < 0 else f"{T.TYPES[ti]} {snr:g}"
                c = 100 * np.mean([fail(r) for r in sel(room=rt, sro=eps, ti=ti, method="hold")])
                k = [100 * np.mean([r["oos"] for r in sel(room=rt, sro=eps, ti=ti, method=m)]) for m in METHODS]
                P(f"{name:22s}{c:8.1f}%" + "".join(f"{v:9.1f}%" for v in k))
            neg = [r for r in sel(room=rt, sro=eps, method="hold") if r["ti"] >= 0]
            c = 100 * np.mean([fail(r) for r in neg])
            k = [100 * np.mean([r["oos"] for r in sel(room=rt, sro=eps, method=m) if r["ti"] >= 0]) for m in METHODS]
            P(f"{'mean, ten types -10 dB':22s}{c:8.1f}%" + "".join(f"{v:9.1f}%" for v in k))
            summ[f"{rt}|{eps}|rl1_fail"] = c
            for m, v in zip(METHODS, k):
                summ[f"{rt}|{eps}|{m}"] = v
            h5 = [100 * np.mean([r["oos"] <= 0.01 for r in sel(room=rt, sro=eps, method=m) if r["ti"] >= 0])
                  for m in METHODS]
            P("  sessions >= 99% in sync at -10 dB: " + ", ".join(f"{m} {v:.1f}%" for m, v in zip(METHODS, h5)))
            summ[f"{rt}|{eps}|h5"] = dict(zip(METHODS, h5))
            for m in METHODS:
                ok = [r for r in sel(room=rt, sro=eps, method=m) if r["ti"] >= 0 and not fail(r)]
                oo = 100 * np.mean([r["oos"] for r in ok]) if ok else float("nan")
                se = [abs(r["slope_err"]) for r in ok if r["slope_err"] is not None]
                P(f"  {m:9s} where rl1 is right ({len(ok)} sessions): out of sync {oo:.2f}%, "
                  f"median |final slope error| {np.median(se) if se else float('nan'):.2f} ppm")
                summ[f"{rt}|{eps}|{m}|right"] = [oo, float(np.median(se)) if se else None]
            for ma, mb in (("gated", "track_rl"), ("gated", "hold"), ("kr", "track_rl"), ("hold", "track_rl")):
                mean, lo, hi = paired(rt, eps, ma, mb)
                summ[f"{rt}|{eps}|{ma}-{mb}"] = [mean, lo, hi]
                P(f"  out of sync {ma} minus {mb}: {100 * mean:+.1f} points (95% session bootstrap "
                  f"{100 * lo:+.1f} to {100 * hi:+.1f})")
    txt = "\n".join(lines)
    print(txt)
    open(os.path.join(HERE, "gated_results.txt"), "w").write(txt + "\n")
    json.dump(summ, open(os.path.join(HERE, "gated_summary.json"), "w"), indent=1)


if __name__ == "__main__":
    if sys.argv[1] == "time":
        time_one(sys.argv[2])
    elif sys.argv[1] == "collect":
        procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4
        collect(sys.argv[2], sys.argv[3], procs)
    elif sys.argv[1] == "score":
        score(sys.argv[2])
