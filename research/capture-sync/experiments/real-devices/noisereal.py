"""Step 3j: does the envelope-normalised estimator of step 3h carry from simulated rooms to real phones?

    python experiments/real-devices/noisereal.py collect <LibriWASN root> <MS-SNSD root> <windows_j.npz> [--procs 4]
    python experiments/real-devices/noisereal.py score <windows_j.npz>

Steps 3c-3i measured everything on MS-SNSD speech played through *statistical* rooms with a simulated delay.
Step 3h found that dividing each device's audio by its own 32 ms RMS envelope before GCC (`fn`) removes
impulsive-noise failures (Typing 78% a frame off to 0.1%) at a cost on steady noise, and step 3i made `fn`
the default. This step asks whether that holds where delay, clock drift, reverberation and the phones'
own microphones and recorded noise are real: the five LibriWASN smartphones of step 1 (CC BY 4.0, Zenodo
doi:10.5281/zenodo.10952434), with the same nine MS-SNSD noise types (MIT; Reddy et al. 2019) and white
noise added independently per phone.

Replay. For every pair and trial the loop consumes step 1's random stream exactly (`run.py`: window time,
prior error, then for each noise level and window length the white-noise draws, with step 1's skips), so
the 2 s windows, their prior errors and their white noise are step 1's, bit for bit; only gamma 0.25 at
L = 2 s is computed. Step 1's three conditions (as recorded, white 0 dB, white -10 dB) are therefore a
replay check against `summary.json`. The nine real noise types at 0 and -10 dB window SNR are added to the
same as-recorded 2 s pair from a second generator seeded by (room seed, pair, trial), each phone drawing
from its own half of the type's files (`noisetype.noises`, so the two phones never hear one recording),
scaled as step 1 scales white noise (device a to its window's power; device b to the power of its search
stretch's centre n samples).

Per window: plain gamma 0.25 (error, PSR) and `fn` (error, PSR) on the same pair, and `snr_hat`
(`gate.blind_snr_db`, smaller of the two phones, b's centre stretch: blind). Failure: more than a 30 fps
frame (33.3 ms) from step 1's reference line. Gates (LTT alpha 1%, delta 0.1, step 3's PSR grid, Mondrian on
snr_hat), calibrate on sessions 0-4 of a room, test on sessions 5-9 of that room:
  T4  calibrate on as-recorded plus all ten types at both levels, test each type at -10 dB.
The simulated twin of each cell is step 3h's (`experiments/gate/noiseimpulse_summary.json`): RT60 0.2 s
for the 200 ms room, 0.8 s for the 800 ms room, same type and level.
"""
import importlib.util
import itertools
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gate"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
_spec = importlib.util.spec_from_file_location("step1_run", os.path.join(HERE, "run.py"))  # experiments/gate has a run.py too
S1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S1)
import noisetype as NT  # noqa: E402  step 3c (noise files and their per-device split)
from capture_sync.sync import FS, gcc, coarse_offset, reference_line, line_at, envelope_normalise  # noqa: E402
from capture_sync.gate import blind_snr_db, mondrian_ltt, mondrian_accept  # noqa: E402

FRAME, PRIOR, SEARCH = S1.FRAME, S1.PRIOR, S1.SEARCH
ALPHA, DELTA, GRID = NT.ALPHA, NT.DELTA, NT.GRID
L, G = 2.0, 0.25
TYPES = NT.TYPES  # "white" first, then the nine MS-SNSD types
LEVELS = [0.0, -10.0]
NONE = 99.0
IMPULSIVE = ["Munching", "Neighbor", "ShuttingDoor", "Typing"]
STEADY = ["AirConditioner", "VacuumCleaner"]
ROOM_RT = {"200": 0.2, "800": 0.8}


def both(wa, wb):
    d, p = gcc(wa, wb, gamma=G, max_lag_s=SEARCH, centre_s=SEARCH)
    dn, pn = gcc(envelope_normalise(wa), envelope_normalise(wb), gamma=G, max_lag_s=SEARCH, centre_s=SEARCH)
    return d, p, dn, pn


def run_session(args):
    """Rows: room, session index, pair index, trial, type index (-1 none), snr, snr_hat, err, psr, fn_err, fn_psr."""
    room, k, paths, n_trials, seed, ms_root = args
    rng = np.random.default_rng(seed)
    nz = NT.noises(ms_root)
    x = {p: S1.load(paths[p]) for p in S1.PHONES}
    refs = {}
    for i, j in itertools.combinations(range(len(S1.PHONES)), 2):
        a, b = S1.PHONES[i], S1.PHONES[j]
        d0, _ = coarse_offset(x[a], x[b])
        r1 = reference_line(x[a], x[b], d0, gamma=1.0)
        refs[(a, b)] = (r1, float(np.mean(np.abs(r1["resid"]) < 0.005)))
    rows = []
    n, g_ = int(round(L * FS)), int(round(SEARCH * FS))
    for pi, ((a, b), (ref, inl)) in enumerate(refs.items()):
        dur = min(len(x[a]), len(x[b])) / FS
        for tr in range(n_trials):
            t = float(rng.uniform(2.0, dur - 8.0 - abs(ref["d"])))
            u = float(rng.uniform(-PRIOR, PRIOR))
            for snr in S1.SNRS:  # step 1's loop, consuming its random stream exactly
                for Lw in S1.WINS:
                    truth = line_at(ref, t + Lw / 2)
                    i0 = int(round(t * FS))
                    nw = int(round(Lw * FS))
                    j0 = int(round((t + truth + u) * FS)) - g_
                    if j0 < 0 or j0 + nw + 2 * g_ > len(x[b]):
                        continue
                    wa = x[a][i0:i0 + nw].copy()
                    wb = x[b][j0:j0 + nw + 2 * g_].copy()
                    sa, sb = np.mean(wa ** 2), np.mean(wb[g_:g_ + nw] ** 2)
                    if snr is not None:
                        wa += rng.standard_normal(len(wa)) * np.sqrt(sa / 10 ** (snr / 10))
                        wb += rng.standard_normal(len(wb)) * np.sqrt(sb / 10 ** (snr / 10))
                    if Lw != L:
                        continue
                    conds = [(-1 if snr is None else 0, NONE if snr is None else snr, wa, wb)]
                    if snr is None:  # the nine real types on this as-recorded pair, from a second stream
                        r2 = np.random.default_rng([seed, pi, tr])
                        for ti in range(1, len(TYPES)):
                            for lv in LEVELS:
                                ca, cb = wa.copy(), wb.copy()
                                for dev, (w, s) in enumerate(((ca, sa), (cb, sb))):
                                    src = nz[TYPES[ti]][dev]
                                    jj = int(r2.integers(0, len(src) - len(w)))
                                    z = src[jj:jj + len(w)]
                                    w += z * np.sqrt(s / 10 ** (lv / 10) / (np.mean(z ** 2) + 1e-20))
                                conds.append((ti, lv, ca, cb))
                    for ti, lv, ca, cb in conds:
                        d, p, dn, pn = both(ca, cb)
                        sh = min(blind_snr_db(ca), blind_snr_db(cb[g_:g_ + n]))
                        rows.append([int(room), k, pi, tr, ti, lv, sh, u + d - SEARCH, p, u + dn - SEARCH, pn,
                                     inl])
    return rows


def collect(lw_root, ms_root, out, procs, n_trials=40):
    jobs = []
    for room in S1.ROOMS:
        for k, (s, paths) in enumerate(S1.sessions(lw_root, room)):
            jobs.append((room, k, paths, n_trials, 1000 * int(room) + k, ms_root))  # step 1's seeds
    with ProcessPoolExecutor(procs) as ex:
        rows = [r for rr in ex.map(run_session, jobs) for r in rr]
    np.savez_compressed(out, rows=np.array(rows, float))
    print(f"{len(rows)} windows -> {out}")


def loadrows(path):
    r = np.load(path)["rows"]
    d = {"room": r[:, 0].astype(int).astype(str), "sess": r[:, 1].astype(int), "pair": r[:, 2].astype(int),
         "trial": r[:, 3].astype(int), "type": r[:, 4].astype(int), "snr": r[:, 5], "snr_hat": r[:, 6],
         "ok": r[:, 11] >= 0.5}
    for name, c in (("plain", 7), ("fn", 9)):
        d[name] = {"err": r[:, c], "psr": r[:, c + 1], "bad": np.abs(r[:, c]) > FRAME}
    return d


def spearman(x, y):
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def score(path):
    d = loadrows(path)
    out, summ = [], {"replay": {}, "fail": {}, "gate": {}, "tally": {}, "twin": {}}
    P = out.append
    P("capture-sync step 3j: envelope-normalised GCC (fn) against plain gamma 0.25 on LibriWASN's real phones")
    P("(5 phones, 10 pairs, 10 sessions per room, 40 window times per pair, 2 s windows, prior +-1 s, search")
    P("+-1.5 s; step 1's windows replayed), real MS-SNSD noise and white noise added independently per phone;")
    P("failure = more than a 30 fps frame from step 1's reference line")
    P(f"windows: {len(d['sess'])}; with a usable reference: {int(d['ok'].sum())}")
    P("")
    s1 = json.load(open(os.path.join(HERE, "summary.json")))["fail"]
    same, nrep, rep = 0, 0, []
    for room in S1.ROOMS:
        for ti, s in ((-1, NONE), (0, 0.0), (0, -10.0)):
            m = d["ok"] & (d["room"] == room) & (d["type"] == ti) & (d["snr"] == s)
            f = float(d["plain"]["bad"][m].mean())
            ref = s1[f"{room}|{s}|{L}|{G}"]
            nrep += 1
            same += (f == ref["fail"]) and (int(m.sum()) == ref["n"])
            rep.append(f"room {room} {'as recorded' if ti < 0 else f'white {s:+.0f} dB'}: {f:.4f} (n {int(m.sum())})"
                       f" against step 1's {ref['fail']:.4f} (n {ref['n']})")
    summ["replay"] = [same, nrep]
    P(f"== Replay: {same} of {nrep} step 1 cells (gamma 0.25, 2 s) equal ==")
    for x in rep:
        P("  " + x)
    P("")

    def cmask(room, ti, s):
        m = d["ok"] & (d["room"] == room) & (d["type"] == ti)
        return m if ti < 0 else m & (d["snr"] == s)

    P("== Raw failure share, plain / fn (all sessions) ==")
    for room in S1.ROOMS:
        m = cmask(room, -1, NONE)
        v = [float(d["plain"]["bad"][m].mean()), float(d["fn"]["bad"][m].mean())]
        summ["fail"][f"{room}|none"] = v
        P(f"  room {room}: as recorded {v[0]:.3f}/{v[1]:.3f} (n {int(m.sum())})")
        for ti, tn in enumerate(TYPES):
            cells = []
            for s in LEVELS:
                m = cmask(room, ti, s)
                v = [float(d["plain"]["bad"][m].mean()), float(d["fn"]["bad"][m].mean())]
                summ["fail"][f"{room}|{tn}|{s}"] = v
                cells.append(f"{s:+3.0f} dB {v[0]:.3f}/{v[1]:.3f}")
            P(f"    {tn:21s} " + "  ".join(cells))
    P("")

    sim = json.load(open(os.path.join(HERE, "..", "gate", "noiseimpulse_summary.json")))["fail"]
    P("== Twin check, -10 dB: real phones against step 3h's simulated room (plain / fn) ==")
    for room in S1.ROOMS:
        rt = ROOM_RT[room]
        real = {e: [summ["fail"][f"{room}|{tn}|-10.0"][i] for tn in TYPES] for i, e in enumerate(("plain", "fn"))}
        simv = {e: [sim[f"{rt}|{tn}|-10.0"][i] for tn in TYPES] for i, e in enumerate(("plain", "fn"))}
        tw = {}
        for e in ("plain", "fn"):
            tw[e] = {"spearman": spearman(real[e], simv[e]),
                     "mean_real": float(np.mean(real[e])), "mean_sim": float(np.mean(simv[e])),
                     "max_abs_gap": float(np.max(np.abs(np.array(real[e]) - np.array(simv[e]))))}
        # does the simulation get the *sign* of fn's effect right per type (beyond 2 points either way)?
        def sign(v):
            return 0 if abs(v) <= 0.02 else int(np.sign(v))
        agree = [sign(real["fn"][i] - real["plain"][i]) == sign(simv["fn"][i] - simv["plain"][i])
                 for i in range(len(TYPES))]
        tw["effect_sign_agree"] = int(sum(agree))
        summ["twin"][room] = tw
        P(f"  room {room} (sim RT60 {rt} s): Spearman over the 10 types plain {tw['plain']['spearman']:.2f}, fn "
          f"{tw['fn']['spearman']:.2f}; mean real/sim plain {tw['plain']['mean_real']:.3f}/{tw['plain']['mean_sim']:.3f},"
          f" fn {tw['fn']['mean_real']:.3f}/{tw['fn']['mean_sim']:.3f}; fn's effect has the same sign (2-point dead"
          f" band) for {tw['effect_sign_agree']} of 10 types")
        for i, tn in enumerate(TYPES):
            P(f"    {tn:21s} real {real['plain'][i]:.3f}/{real['fn'][i]:.3f}   sim {simv['plain'][i]:.3f}/{simv['fn'][i]:.3f}"
              f"   {'same' if agree[i] else 'DIFFERENT'}")
    P("")

    cal_s, test_s = d["sess"] < 5, d["sess"] >= 5
    P("== T4: calibrate on sessions 0-4 (as recorded + all types, both levels), test each type at -10 dB on"
      " sessions 5-9: kept, wrong among accepted, plain | fn ==")
    for room in S1.ROOMS:
        base = d["ok"] & (d["room"] == room)
        res = {}
        for e in ("plain", "fn"):
            w = d[e]
            cal = base & cal_s
            floor, inner, lams = mondrian_ltt(w["psr"][cal], w["bad"][cal], d["snr_hat"][cal], GRID, ALPHA, DELTA)
            for ti, tn in enumerate(TYPES):
                te = base & test_s & (d["type"] == ti) & (d["snr"] == -10.0)
                acc = mondrian_accept(w["psr"][te], d["snr_hat"][te], floor, inner, lams)
                na = int(acc.sum())
                c = [na / max(int(te.sum()), 1), float(w["bad"][te][acc].mean()) if na else float("nan"), na]
                summ["gate"][f"{room}|{e}|{tn}"] = c
                res[(e, tn)] = c
        for tn in TYPES:
            P(f"  room {room} {tn:21s} " + " | ".join(
                f"{res[(e, tn)][0]:.2f} {'  -   ' if res[(e, tn)][2] == 0 else f'{res[(e, tn)][1]:.4f}'}"
                for e in ("plain", "fn")))
        for e in ("plain", "fn"):
            cells = [res[(e, tn)] for tn in TYPES]
            summ["tally"][f"{room}|{e}"] = {"ok": sum(1 for c in cells if c[2] == 0 or c[1] <= 0.02),
                                           "kept": float(np.mean([c[0] for c in cells]))}
        P(f"  room {room} tally: " + "  ".join(
            f"{e} {summ['tally'][f'{room}|{e}']['ok']}/10 at or under 2%, mean kept {summ['tally'][f'{room}|{e}']['kept']:.2f}"
            for e in ("plain", "fn")))
    P("")
    P("== Prediction tallies ==")
    for room in S1.ROOMS:
        f = summ["fail"]
        imp = sum(f[f"{room}|{tn}|-10.0"][1] <= 0.5 * f[f"{room}|{tn}|-10.0"][0] for tn in IMPULSIVE)
        st = [round(100 * (f[f"{room}|{tn}|-10.0"][1] - f[f"{room}|{tn}|-10.0"][0]), 1) for tn in STEADY]
        sums = [sum(f[f"{room}|{tn}|-10.0"][i] for tn in TYPES) for i in (0, 1)]
        easy = max([abs(f[f"{room}|none"][1] - f[f"{room}|none"][0])]
                   + [abs(f[f"{room}|{tn}|0.0"][1] - f[f"{room}|{tn}|0.0"][0]) for tn in TYPES])
        summ["tally"][f"{room}|pred"] = {"impulsive_halved": int(imp), "steady_cost_points": st,
                                         "sum_m10": sums, "easy_max_gap": float(easy)}
        P(f"  room {room}: fn halves plain for {imp} of 4 impulsive types; steady cost (points) "
          f"{dict(zip(STEADY, st))}; summed -10 dB failure plain {sums[0]:.2f}, fn {sums[1]:.2f}; largest |fn - plain| "
          f"as recorded or at 0 dB {100 * easy:.2f} points")
    open(os.path.join(HERE, "noisereal_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "noisereal_summary.json"), "w"), indent=1, default=lambda o: o.item())
    print("\n".join(out))


if __name__ == "__main__":
    a = sys.argv
    if a[1] == "collect":
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 40
        collect(a[2], a[3], a[4], pr, nt)
    else:
        score(a[2])
