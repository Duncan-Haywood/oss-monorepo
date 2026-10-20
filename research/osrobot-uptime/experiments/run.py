"""Prices spares for a dedicated and a shared fleet; prints the tables in results.txt. Deterministic (seeded)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_uptime import uptime as U

TRIALS = 200
HEAD = (f"{'J':>3} {'scatter':>7} {'phi':>5} {'A':>6} {'target':>6} | {'ded_bare':>8} {'ded_job':>7} {'ded_all':>7} | "
        f"{'sh/ded bare':>11} {'job':>6} {'all':>6}")


def row(r):
    w, n, m = r["ded_wins"], r["trials"], r["med_ratio"]
    f = lambda x: f"{x:.2f}" if x is not None else "-"
    return (f"{r['J']:3d} {r['scatter']:7.2f} {r['phi']:5.2f} {r['A']:6.3f} {r['target']:6.3f} | "
            f"{w['bare']/n:8.2f} {w['per_job']/n:7.2f} {w['all_jobs']/n:7.2f} | "
            f"{f(m['bare']):>11} {f(m['per_job']):>6} {f(m['all_jobs']):>6}")


def block(title, Js, scatters, phis, As, targets, chg=600):
    print(f"\n{title}")
    print(HEAD)
    for J in Js:
        for sc in scatters:
            for phi in phis:
                for A in As:
                    for t in targets:
                        print(row(U.survey(J, sc, phi, chg, A, t, TRIALS, 7)))


print(f"Share of {TRIALS} random job mixes in which a robot per job is the cheapest fleet (ded_*), with no spares (bare) and\n"
      "with spares bought until the service target is met per job (job) or for every job at once (all); and the median cost of\n"
      "the cheapest shared fleet relative to dedicated (sh/ded). A = unit availability MTBF/(MTBF+MTTR). Changeover 600 s,\n"
      "trays 0.1 to 0.4 m, tolerance 1, 2 or 5 mm. Seed 7.")
block("1. Availability and target: 4 jobs, scatter 0.4 m, demand 0.2", (4,), (0.4,), (0.2,), (0.90, 0.95, 0.99), (0.99, 0.999))
block("2. Job count: scatter 0.4 m, demand 0.2, A = 0.95, target 0.99", (2, 4, 8), (0.4,), (0.2,), (0.95,), (0.99,))
block("3. Demand (shared load vs one machine): 4 jobs, scatter 0.4 m, A = 0.95, target 0.99", (4,), (0.4,), (0.1, 0.2, 0.3), (0.95,), (0.99,))
