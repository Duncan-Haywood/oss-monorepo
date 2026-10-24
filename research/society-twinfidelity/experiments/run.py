"""Run every experiment and write experiments/results.txt.

    PYTHONPATH=src python3 experiments/run.py

Deterministic (seeded). About 10 minutes on 4 cores.
"""
import math
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_twinfidelity import run  # noqa: E402

N, SECONDS, SEEDS = 60, 300.0, 10
RHOS = [0.0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5]
VARIANTS = {
    "plaza": {},
    "hetero": {"v_spread": 0.25, "chi_sd": 0.3},
    "delay": {"delay": 0.4},
    "stubborn": {"stubborn": 0.3},
    "humanlike": {"v_spread": 0.25, "chi_sd": 0.3, "delay": 0.4, "stubborn": 0.3},
}
KEYS = ("tipped_late", "speed", "lane", "intrude")
out = []


def say(s=""):
    print(s, flush=True)
    out.append(s)


def one(args):
    kw, seed = args
    r = run(n=N, seconds=SECONDS, seed=seed, **kw)
    return {k: r[k] for k in KEYS}


def cell(pool, **kw):
    rs = pool.map(one, [(kw, s) for s in range(SEEDS)])
    mean = {k: sum(r[k] for r in rs) / len(rs) for k in KEYS}
    se = {k: math.sqrt(sum((r[k] - mean[k]) ** 2 for r in rs) / (len(rs) - 1) / len(rs)) for k in KEYS}
    return mean, se


def main():
    with Pool(4) as pool:
        say(f"society-twinfidelity results. society-plaza's corridor ({N} agents, 30 m x 6 m periodic, {SECONDS:.0f} s, "
            f"second half measured, {SEEDS} seeds per cell, people memory M=9) with four crowds of simulated people: "
            "plaza (the society-plaza people), hetero (speed spread +-25% instead of +-8%, sideways-push weight "
            "N(0.6, 0.3)), delay (people react to others' positions 0.4 s old), stubborn (30% of people never change "
            "side), humanlike (all three).")
        say()
        res = {}
        for v, kw in VARIANTS.items():
            for rho in RHOS:
                res[(v, "left", rho)] = cell(pool, rho=rho, policy="left", **kw)
        for v, kw in VARIANTS.items():
            for rho in (0.2, 0.5):
                res[(v, "adaptive", rho)] = cell(pool, rho=rho, policy="adaptive", **kw)
        names = list(VARIANTS)
        for tag, key, title in (("A", "tipped_late", "people preferring the robots' side (last quarter), committed left robots"),
                                ("B", "speed", "people's speed / desired speed, committed left robots"),
                                ("C", "lane", "lane separation (m), committed left robots"),
                                ("D", "intrude", "personal-space time (share of agent time), committed left robots")):
            say(f"== {tag}. {title}")
            say("rho   " + "  ".join(f"{n:<9}" for n in names))
            for rho in RHOS:
                say(f"{rho:<5} " + "  ".join(f"{res[(n, 'left', rho)][0][key]:<9.3f}" for n in names))
            say()
        say("== E. adaptive robots: speed / desired (and people preferring left)")
        say("rho   " + "  ".join(f"{n:<15}" for n in names))
        for rho in (0.2, 0.5):
            say(f"{rho:<5} " + "  ".join(
                f"{res[(n, 'adaptive', rho)][0]['speed']:.3f} ({res[(n, 'adaptive', rho)][0]['tipped_late']:.2f})".ljust(15)
                for n in names))
        say()
        say("== F. standard errors over seeds (speed, tipped_late), committed robots")
        say("rho   " + "  ".join(f"{n:<15}" for n in names))
        for rho in RHOS:
            say(f"{rho:<5} " + "  ".join(
                f"{res[(n, 'left', rho)][1]['speed']:.3f},{res[(n, 'left', rho)][1]['tipped_late']:.3f}".ljust(15) for n in names))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
