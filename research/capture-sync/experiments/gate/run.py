"""Step 3: a conformal (Learn-then-Test) confidence gate, and where its guarantee breaks.

    python experiments/gate/run.py collect <LibriWASN root> <windows.npz> [--procs 4]
    python experiments/gate/run.py score <windows.npz>

`collect` replays step 1 exactly (experiments/real-devices/run.py's run_session, same seeds, same
windows) and keeps every window's error and PSR for the five weightings (step 1 kept only aggregates).
The npz holds numbers derived from LibriWASN (CC BY 4.0, doi:10.5281/zenodo.10952434) and is not
committed; `score` writes results.txt and summary.json beside this file.

Gate: accept a window when its score >= lam, lam chosen on calibration windows by Learn then Test
(src/capture_sync/gate.py) at alpha = 1% failure among accepted, delta = 0.1, on a grid fixed here
before any data were seen. Scores: the window's PSR for the chosen weighting; and "agree", which is the
PSR when the PHAT and gamma 0.25 estimates agree within one frame and 0 otherwise (a window whose two
weightings disagree is refused).

Shifts (calibrate -> test):
  S1 exchangeable: sessions of one room split at random 5/5, 50 splits per room (windows are still
     clustered by session, so this is the closest to i.i.d. the data allow);
  S2 room: all of room A -> all of room B, both directions;
  S3 phone: the 6 pairs without phone P -> the 4 pairs with it, both rooms pooled, for each P;
  S4 noise: as recorded and 0 dB -> -10 dB added white noise, each room.
The calibration pools noise levels unless the shift is the noise level itself (a deployed gate does
not know a window's SNR).
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "real-devices"))
from capture_sync.gate import ltt_threshold, naive_threshold, apply_gate  # noqa: E402

FRAME = 1 / 30
ALPHA, DELTA = 0.01, 0.1
GRID = np.geomspace(2.0, 400.0, 241)  # fixed before the run; PSR is a z-score of the peak
GAMMAS = [1.0, 0.75, 0.5, 0.25, 0.0]
PHONES = ["Nexus", "Pixel6a", "Pixel6b", "Pixel7", "Xiaomi"]
WINS = [0.5, 1.0, 2.0, 4.0]


def collect(root, out, procs):
    import run as step1  # experiments/real-devices/run.py
    jobs = []
    for room in step1.ROOMS:
        for k, (s, paths) in enumerate(step1.sessions(root, room)):
            jobs.append((room, s, paths, 40, 1000 * int(room) + k))
    with ProcessPoolExecutor(procs) as ex:
        res = list(ex.map(step1.run_session, jobs))
    rows = []
    sess_names = sorted({j[0] + "/" + j[1] for j in jobs})
    usable = {(p["room"], p["session"], p["a"], p["b"]): p["ref_inlier"] >= 0.5 for r in res for p in r[0]}
    for r in res:
        tr = r[2]
        assert len(tr) % len(GAMMAS) == 0
        for i in range(0, len(tr), len(GAMMAS)):
            grp = tr[i:i + len(GAMMAS)]
            room, sess, a, b, L = grp[0][:5]
            assert [t[5] for t in grp] == GAMMAS and all(t[:5] == grp[0][:5] for t in grp)
            rows.append([int(room), sess_names.index(room + "/" + sess), PHONES.index(a), PHONES.index(b), L,
                         grp[0][9], float(usable[(room, sess, a, b)])]
                        + [t[6] for t in grp] + [t[7] for t in grp])
    np.savez_compressed(out, rows=np.array(rows, float), sessions=np.array(sess_names))
    print(f"{len(rows)} windows -> {out}")


def load(path):
    z = np.load(path)
    r = z["rows"]
    d = {"room": r[:, 0].astype(int), "sess": r[:, 1].astype(int), "a": r[:, 2].astype(int),
         "b": r[:, 3].astype(int), "L": r[:, 4], "snr": r[:, 5], "ok": r[:, 6] > 0.5,
         "err": r[:, 7:12], "psr": r[:, 12:17]}
    return d


def scores(d, gate):
    """(score, bad) for a gate name: 'psr:<gamma>' or 'agree' (estimate of gamma 0.25)."""
    if gate == "agree":
        g1, g2 = GAMMAS.index(1.0), GAMMAS.index(0.25)
        same = np.abs(d["err"][:, g1] - d["err"][:, g2]) <= FRAME
        return np.where(same, d["psr"][:, g2], 0.0), np.abs(d["err"][:, g2]) > FRAME
    g = GAMMAS.index(float(gate.split(":")[1]))
    return d["psr"][:, g], np.abs(d["err"][:, g]) > FRAME


GATES = ["psr:1.0", "psr:0.25", "agree"]


def evaluate(s, bad, cal, test):
    lam = ltt_threshold(s[cal], bad[cal], GRID, ALPHA, DELTA)
    lam_n = naive_threshold(s[cal], bad[cal], GRID, ALPHA)
    kept, fk, n = apply_gate(s[test], bad[test], lam)
    kept_n, fk_n, _ = apply_gate(s[test], bad[test], lam_n)
    return {"lam": lam, "kept": kept, "fail_kept": fk, "n_kept": n, "fail_all": float(bad[test].mean()),
            "n_test": int(test.sum()), "naive_lam": lam_n, "naive_kept": kept_n, "naive_fail_kept": fk_n}


def fmt(e):
    fk = "  -  " if e["n_kept"] == 0 else f"{e['fail_kept']:.4f}"
    fkn = "  -  " if np.isnan(e["naive_fail_kept"]) else f"{e['naive_fail_kept']:.4f}"
    return (f"lam {e['lam']:6.1f} kept {e['kept']:.2f} fail|kept {fk} (all {e['fail_all']:.3f}) | "
            f"naive kept {e['naive_kept']:.2f} fail|kept {fkn}")


def score(path):
    d = load(path)
    ok = d["ok"]
    out, summ = [], {"S1": {}, "S2": {}, "S3": {}, "S4": {}, "replay": {}}
    P = out.append
    P("capture-sync step 3: Learn-then-Test PSR gate on LibriWASN phones (alpha 1% failure among accepted, "
      "delta 0.1)")
    P(f"windows: {int(ok.sum())} usable of {len(ok)} (each scored for 5 weightings); grid {len(GRID)} "
      f"thresholds, PSR {GRID[0]:.0f} to {GRID[-1]:.0f}, geometric")
    P("")
    P("== Replay check: raw failure shares (all noise levels) vs step 1's results.txt cells ==")
    for room in (200, 800):
        for snr in (99.0, 0.0, -10.0):
            for L in WINS:
                m = ok & (d["room"] == room) & (d["snr"] == snr) & (d["L"] == L)
                f = [float((np.abs(d["err"][m, k]) > FRAME).mean()) for k in range(5)]
                summ["replay"][f"{room}|{snr}|{L}"] = f
    P("  (per-cell shares in summary.json 'replay'; compare with real-devices/summary.json 'fail')")
    P("")

    P("== S1 exchangeable: random 5/5 session split within a room, 50 splits; share of splits with test "
      "failure|kept > alpha (LTT bound: <= delta = 0.10 if windows were i.i.d.) ==")
    rng = np.random.default_rng(3)
    for room in (200, 800):
        sessions = np.unique(d["sess"][d["room"] == room])
        splits = [rng.permutation(sessions)[:5] for _ in range(50)]
        for L in WINS:
            for gate in GATES:
                s, bad = scores(d, gate)
                ev = []
                for cs in splits:
                    base = ok & (d["room"] == room) & (d["L"] == L)
                    cal = base & np.isin(d["sess"], cs)
                    test = base & ~np.isin(d["sess"], cs)
                    ev.append(evaluate(s, bad, cal, test))
                fk = np.array([e["fail_kept"] if e["n_kept"] else 0.0 for e in ev])
                fkn = np.array([0.0 if np.isnan(e["naive_fail_kept"]) else e["naive_fail_kept"] for e in ev])
                r = {"viol": float(np.mean(fk > ALPHA)), "viol2": float(np.mean(fk > 2 * ALPHA)),
                     "kept": float(np.mean([e["kept"] for e in ev])), "fail_kept_mean": float(fk.mean()),
                     "naive_viol": float(np.mean(fkn > ALPHA)),
                     "naive_kept": float(np.mean([e["naive_kept"] for e in ev]))}
                summ["S1"][f"{room}|{L}|{gate}"] = r
                P(f"  room {room} {L:3.1f} s {gate:8s}: viol {r['viol']:.2f} (>2a {r['viol2']:.2f}), mean kept "
                  f"{r['kept']:.2f}, mean fail|kept {r['fail_kept_mean']:.4f} | naive viol {r['naive_viol']:.2f}"
                  f" kept {r['naive_kept']:.2f}")
    P("")

    P("== S2 room shift: calibrate on all of one room (noise pooled), test on the other, by test noise ==")
    for src, dst in ((200, 800), (800, 200)):
        for L in WINS:
            for gate in GATES:
                s, bad = scores(d, gate)
                cal = ok & (d["room"] == src) & (d["L"] == L)
                for snr in (None, 99.0, 0.0, -10.0):
                    test = ok & (d["room"] == dst) & (d["L"] == L)
                    if snr is not None:
                        test &= d["snr"] == snr
                    e = evaluate(s, bad, cal, test)
                    summ["S2"][f"{src}->{dst}|{L}|{gate}|{snr}"] = e
                    nm = "pooled" if snr is None else ("as rec." if snr == 99 else f"{snr:+.0f} dB")
                    P(f"  {src}->{dst} {L:3.1f} s {gate:8s} {nm:8s}: {fmt(e)}")
    P("")

    P("== S3 phone shift: calibrate on the 6 pairs without phone P (both rooms, noise pooled), test on its 4 ==")
    for L in WINS:
        for gate in GATES:
            s, bad = scores(d, gate)
            for k, ph in enumerate(PHONES):
                has = (d["a"] == k) | (d["b"] == k)
                base = ok & (d["L"] == L)
                e = evaluate(s, bad, base & ~has, base & has)
                summ["S3"][f"{ph}|{L}|{gate}"] = e
                P(f"  {L:3.1f} s {gate:8s} {ph:8s}: {fmt(e)}")
    P("")

    P("== S4 noise shift: calibrate on as recorded + 0 dB, test on -10 dB, same room ==")
    for room in (200, 800):
        for L in WINS:
            for gate in GATES:
                s, bad = scores(d, gate)
                base = ok & (d["room"] == room) & (d["L"] == L)
                e = evaluate(s, bad, base & (d["snr"] != -10.0), base & (d["snr"] == -10.0))
                summ["S4"][f"{room}|{L}|{gate}"] = e
                P(f"  room {room} {L:3.1f} s {gate:8s}: {fmt(e)}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "summary.json"), "w"), indent=1)
    print("\n".join(out))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4
        collect(sys.argv[2], sys.argv[3], procs)
    else:
        score(sys.argv[2])
