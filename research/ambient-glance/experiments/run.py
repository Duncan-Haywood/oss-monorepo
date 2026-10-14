"""Experiments for ambient-glance. Deterministic apart from the Monte Carlo check (seeded)."""
import itertools
import numpy as np
from ambient_glance.sim import (Params, MODES, best_mode, utilities, simulate_utility, regret,
                                with_, p_look)

P = Params()
WORDS = [3, 5, 8, 12, 16, 24, 40]
NOISE = [0.0, 0.5, 1.0]


def grid(p, others, busy):
    print(f"  others={others} eyes_busy={busy}: rows=noise, cols=words {WORDS}")
    for n in NOISE:
        print(f"    noise {n:.1f}: " + " ".join(f"{best_mode(p, w, n, others, busy)[0].upper()}" for w in WORDS))


def main():
    print("== 1. Best mode by context (N none, S speech, G glance), default parameters")
    for others, busy in itertools.product((0, 1), (False, True)):
        grid(P, others, busy)
    print(f"  P(look within deadline): eyes free {p_look(P, False):.3f}, eyes busy {p_look(P, True):.3f}")

    print("== 2. Monte Carlo check of the closed form (200000 draws)")
    rng = np.random.default_rng(0)
    worst = 0.0
    for mode in ("speech", "glance"):
        for w, n, o, b in [(5, 0.2, 0, False), (12, 0.8, 1, True), (24, 0.0, 1, False)]:
            c = utilities(P, w, n, o, b)[mode]
            m = simulate_utility(P, mode, w, n, o, b, 200000, rng)
            worst = max(worst, abs(c - m))
    print(f"  max |closed form - Monte Carlo| over 6 cases: {worst:.4f}")

    ctxs = [(w, n, o, b) for w in WORDS for n in NOISE for o in (0, 1) for b in (False, True)]
    print(f"== 3. Share of the {len(ctxs)} contexts won by each mode")
    for pname, p in [("default", P)]:
        c = {m: 0 for m in MODES}
        for x in ctxs:
            c[best_mode(p, *x)] += 1
        print("  " + "  ".join(f"{m}={c[m]/len(ctxs):.2f}" for m in MODES))

    print("== 4. One-at-a-time sensitivity: share of contexts whose best mode changes (parameter x0.5 / x2)")
    base = [best_mode(P, *x) for x in ctxs]
    for f in ("look_rate", "mask_per_noise", "c_speech_per_s", "c_glance", "max_words", "speech_rate", "read_rate", "deadline", "others_mult", "eyes_busy_factor"):
        row = []
        for k in (0.5, 2.0):
            v = getattr(P, f) * k
            v = int(round(v)) if f == "max_words" else v
            q = with_(P, **{f: v})
            row.append(np.mean([best_mode(q, *x) != b for x, b in zip(ctxs, base)]))
        print(f"  {f:18s} x0.5: {row[0]:.2f}   x2: {row[1]:.2f}")

    print("== 5. Twin gap: modes chosen assuming look_rate=0.10, real look rate differs")
    for lr in (0.02, 0.05, 0.10, 0.20, 0.40):
        real = with_(P, look_rate=lr)
        print(f"  real look_rate {lr:.2f}: regret {regret(real, P, ctxs):.4f} per message"
              f"")
    print("== 6. Twin gap: assumed noise masking vs real")
    for mk in (0.2, 0.4, 0.6, 0.8, 1.0):
        real = with_(P, mask_per_noise=mk)
        print(f"  real mask_per_noise {mk:.1f}: regret {regret(real, P, ctxs):.4f}")
    print("== 7. Break-even look rate: smallest look_rate at which glance becomes the best mode (6 words, noise 0.5, others 1, eyes free)")
    for r in np.arange(0.005, 0.2, 0.005):
        if best_mode(with_(P, look_rate=float(r)), 6, 0.5, 1, False) == "glance":
            print(f"  look_rate >= {r:.3f} per s (one glance every {1/r:.0f} s)")
            break


if __name__ == "__main__":
    main()
