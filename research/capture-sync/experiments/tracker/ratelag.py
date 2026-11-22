"""Step 6a (milestone 6, first step): does a coarse step that searches clock rate as well as lag keep a drifting
pair in sync where step 4d's 20 s GCC smeared? (plan in LOG.md, written before the run)

    python experiments/tracker/ratelag.py collect <MS-SNSD root> <rows_6a.json> [--procs 4]
    python experiments/tracker/ratelag.py score <rows_6a.json>

Sessions are step 4d's exactly (`tracker.jobs`, same seeds, so the same speech, rooms, start offsets, signs of
drift and noise draws): 2 rooms x 3 |SRO| (17, 100, 300 ppm) x 2 reps x 10 speech blocks, 11 conditions (none
and ten noise types at -10 dB). All coarse steps see the first 20 s of both envelope-normalised recordings and
search +-15 s.

Coarse steps (truth: the delay at the window centre, 10 s):
  fnc      step 4d's envelope-normalised GCC (gamma 0.25) of the whole 20 s (must reproduce 4d).
  inc1     1 s sub-windows of device 0, each correlated against device 1's 20 s, curves summed at rate 0
           (ablation: incoherent summing without a rate search).
  rl1      the same curves summed along every rate on -400..400 ppm in 5 ppm steps; (lag, rate) of the
           largest sum (`sync.rate_lag_search`, sub_s 1). Primary.
  rl2      rl1 with 2 s sub-windows.
Session trackers, scored every second as in 4d (share of seconds > one 30 fps frame off):
  track    step 4d's tracker from fnc (must reproduce 4d's track rows).
  track_rl step 4d's tracker from rl1's offset, with rl1's rate as the line until the window history gives one.
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

FS, FRAME = T.FS, T.FRAME
N = int(T.COARSE_S * FS)
COARSE = ["fnc", "inc1", "rl1", "rl2"]
TRACKS = ["track", "track_rl"]


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
        a, b = e0[:N], e1[:N]
        est = {"fnc": (T.fn_coarse(e0, e1), np.nan)}
        d, s, _ = rate_lag_search(a, b, sub_s=1.0, rates_ppm=[0.0])
        est["inc1"] = (d, np.nan)
        d, s, _ = rate_lag_search(a, b, sub_s=1.0)
        est["rl1"] = (d, s)
        d, s, _ = rate_lag_search(a, b, sub_s=2.0)
        est["rl2"] = (d, s)
        base = dict(room=rt, sro=eps_abs, sess=sess, rep=rep, ti=ti, snr=snr, eps=eps)
        for m in COARSE:
            d, s = est[m]
            rows.append(dict(base, method=m, coarse_err=float(d - tc),
                             rate_err=None if np.isnan(s) else float(s - eps)))
        for m, (d, s) in (("track", (est["fnc"][0], None)), ("track_rl", (est["rl1"][0], est["rl1"][1] * 1e-6))):
            pr, _ = T.run_track(e0, e1, d, t_eval, init_slope=s)
            bad = np.abs(pr - tau) > FRAME
            rows.append(dict(base, method=m, oos=float(bad.mean()), n=int(len(bad))))
    return rows


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

    def paired(rt, eps, ma, mb, key):
        by = {}
        for r in sel(room=rt, sro=eps, method=ma):
            if r["ti"] < 0:
                continue
            o = sel(room=rt, sro=eps, method=mb, sess=r["sess"], rep=r["rep"], ti=r["ti"])[0]
            by.setdefault(r["sess"], []).append(key(r) - key(o))
        mean = np.mean([v for vs in by.values() for v in vs])
        lo, hi = T.boot(by)
        return mean, lo, hi

    fail = lambda r: float(abs(r["coarse_err"]) > FRAME)  # noqa: E731
    P("Step 6a: a coarse step that searches clock rate as well as lag, on step 4d's drifting twin sessions")
    P("(MS-SNSD speech, statistical rooms, independent noise per device; first 20 s, search +-15 s; > 1 frame = fail)")
    for rt in T.ROOMS:
        for eps in T.SROS:
            P(f"\n== room {int(rt * 1000)} ms, |SRO| {eps:g} ppm ==")
            P(f"{'condition':22s}" + "".join(f"{m:>9s}" for m in COARSE) + "".join(f"{m:>10s}" for m in TRACKS))
            for ti, snr in T.CONDS:
                name = "none" if ti < 0 else f"{T.TYPES[ti]} {snr:g}"
                c = [100 * np.mean([fail(r) for r in sel(room=rt, sro=eps, ti=ti, method=m)]) for m in COARSE]
                k = [100 * np.mean([r["oos"] for r in sel(room=rt, sro=eps, ti=ti, method=m)]) for m in TRACKS]
                P(f"{name:22s}" + "".join(f"{v:8.1f}%" for v in c) + "".join(f"{v:9.1f}%" for v in k))
            c = [100 * np.mean([fail(r) for r in sel(room=rt, sro=eps, method=m) if r["ti"] >= 0]) for m in COARSE]
            k = [100 * np.mean([r["oos"] for r in sel(room=rt, sro=eps, method=m) if r["ti"] >= 0]) for m in TRACKS]
            P(f"{'mean, ten types -10 dB':22s}" + "".join(f"{v:8.1f}%" for v in c) + "".join(f"{v:9.1f}%" for v in k))
            for m, v in zip(COARSE + TRACKS, c + k):
                summ[f"{rt}|{eps}|{m}"] = v
            h5 = [100 * np.mean([r["oos"] <= 0.01 for r in sel(room=rt, sro=eps, method=m) if r["ti"] >= 0])
                  for m in TRACKS]
            P(f"  sessions >= 99% in sync at -10 dB: track {h5[0]:.1f}%, track_rl {h5[1]:.1f}%")
            summ[f"{rt}|{eps}|h5"] = h5
            for m in ("rl1", "rl2"):
                for lab, cond in (("no noise", lambda r: r["ti"] < 0), ("-10 dB", lambda r: r["ti"] >= 0)):
                    e = [abs(r["rate_err"]) for r in sel(room=rt, sro=eps, method=m) if cond(r)]
                    ok = [abs(r["rate_err"]) for r in sel(room=rt, sro=eps, method=m)
                          if cond(r) and not fail(r)]
                    P(f"  |rate error| {m}, {lab}: median {np.median(e):.1f} ppm "
                      f"({np.median(ok) if ok else float('nan'):.1f} ppm where the offset is right)")
                    summ[f"{rt}|{eps}|{m}|rate|{lab}"] = [float(np.median(e)), float(np.median(ok)) if ok else None]
            for ma, mb in (("rl1", "fnc"), ("rl1", "inc1"), ("rl2", "rl1")):
                mean, lo, hi = paired(rt, eps, ma, mb, fail)
                summ[f"{rt}|{eps}|{ma}-{mb}"] = [mean, lo, hi]
                P(f"  coarse failures {ma} minus {mb}: {100 * mean:+.1f} points (95% session bootstrap "
                  f"{100 * lo:+.1f} to {100 * hi:+.1f})")
            mean, lo, hi = paired(rt, eps, "track_rl", "track", lambda r: r["oos"])
            summ[f"{rt}|{eps}|track_rl-track"] = [mean, lo, hi]
            P(f"  out of sync track_rl minus track: {100 * mean:+.1f} points ({100 * lo:+.1f} to {100 * hi:+.1f})")
    txt = "\n".join(lines)
    print(txt)
    open(os.path.join(HERE, "ratelag_results.txt"), "w").write(txt + "\n")
    json.dump(summ, open(os.path.join(HERE, "ratelag_summary.json"), "w"), indent=1)


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4
        collect(sys.argv[2], sys.argv[3], procs)
    elif sys.argv[1] == "score":
        score(sys.argv[1 + 1])
