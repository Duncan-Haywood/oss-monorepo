"""Score step 2b's pre-registered predictions (LOG.md, 2026-11-14) from libriwasn_summary.json.

    python experiments/threshold/libriwasn_score.py

(a) replay check against step 1's summary.json, (b) H4: smooth-weight GCC against the cells model,
(c) median predicted/observed, (d) agreement by room, (e) raw-bin against smooth-weight PHAT at -10 dB.
Writes libriwasn_score.txt beside this file. Stdlib only.
"""
import json
import os
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, "libriwasn_summary.json")))
STEP1 = json.load(open(os.path.join(HERE, "..", "real-devices", "summary.json")))["fail"]
MIN_FAIL = 10


def agrees(pred, obs):
    return obs > 0 and 0.5 <= pred / obs <= 2


def noise(s):
    return "as recorded" if s == 99.0 else f"{s:+.0f} dB white"


def main():
    out = []
    P = out.append
    P("capture-sync step 2b: scoring the pre-registered predictions (LOG.md, 2026-11-14)")
    P(f"cells: {len(C)} (room x noise x window x gamma); scored = at least {MIN_FAIL} observed failures")

    # (a) replay
    diffs = []
    for c in C:
        k = f"{c['room']}|{c['snr']:.1f}|{c['L']}|{c['gamma']}"
        if k in STEP1:
            diffs.append((abs(c["raw"] - STEP1[k]["fail"]), c["n"] == STEP1[k]["n"], k))
    exact = sum(d < 1e-12 and same_n for d, same_n, _ in diffs)
    P("")
    P(f"(a) replay: raw-bin GCC failure share equals step 1 in {exact}/{len(diffs)} cells "
      f"(max |difference| {max(d for d, _, _ in diffs):.4f})")

    # (b), (c), (d)
    P("")
    for est in ("fixed", "raw"):
        for model in ("pred", "rice"):
            cs = [c for c in C if c["n_" + est] >= MIN_FAIL]
            ok = sum(agrees(c[model], c[est]) for c in cs)
            ratio = st.median(c[model] / c[est] for c in cs)
            P(f"{'smooth-weight' if est == 'fixed' else 'raw-bin':13s} GCC vs {'cells' if model == 'pred' else 'Rice '} "
              f"model: {ok}/{len(cs)} scored cells within x2 ({100 * ok / max(len(cs), 1):.0f}%), "
              f"median predicted/observed {ratio:.2f}")
    cs = [c for c in C if c["n_fixed"] >= MIN_FAIL]
    P("")
    P("smooth-weight GCC vs cells model, broken down:")
    for name, key in (("room", "room"), ("noise", "snr"), ("window", "L"), ("gamma", "gamma")):
        for v in sorted({c[key] for c in cs}):
            sub = [c for c in cs if c[key] == v]
            ok = sum(agrees(c["pred"], c["fixed"]) for c in sub)
            under = sum(c["pred"] < 0.5 * c["fixed"] for c in sub)
            over = sum(c["pred"] > 2 * c["fixed"] for c in sub)
            lab = noise(v) if key == "snr" else v
            P(f"  {name:6s} {str(lab):12s} {ok:3d}/{len(sub):<3d} agree; {under:3d} under x0.5, {over:3d} over x2; "
              f"median pred/obs {st.median(c['pred'] / c['fixed'] for c in sub):.2f}")

    # (e)
    P("")
    P("(e) PHAT at -10 dB: raw-bin vs smooth-weight failure share")
    for room in sorted({c["room"] for c in C}):
        wins = 0
        for c in sorted((c for c in C if c["room"] == room and c["snr"] == -10.0 and c["gamma"] == 1.0),
                        key=lambda c: c["L"]):
            wins += c["raw"] > c["fixed"]
            P(f"  room {room} L {c['L']:.1f} s: raw {c['raw']:.3f}, smooth {c['fixed']:.3f}, cells model {c['pred']:.3f}")
        P(f"  room {room}: raw-bin worse in {wins}/4 window lengths")

    P("")
    P("per cell (smooth-weight GCC = fixed; * = scored and outside x2)")
    for c in sorted(C, key=lambda c: (c["room"], c["snr"], c["L"], -c["gamma"])):
        flag = "*" if c["n_fixed"] >= MIN_FAIL and not agrees(c["pred"], c["fixed"]) else " "
        P(f"{flag} room {c['room']} {noise(c['snr']):12s} L {c['L']:.1f} gamma {c['gamma']:<4} raw {c['raw']:.3f} "
          f"fixed {c['fixed']:.3f} cells {c['pred']:.3f} rice {c['rice']:.3f} (n={c['n']})")
    open(os.path.join(HERE, "libriwasn_score.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
