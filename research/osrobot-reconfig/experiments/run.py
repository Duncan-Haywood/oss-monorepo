"""Sweeps job count, tray scatter, demand and changeover; prints the tables in results.txt. Deterministic (seeded)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_reconfig import fleet as F

TRIALS = 200
HEAD = (f"{'J':>3} {'scatter':>7} {'phi':>5} {'chg(s)':>6} {'ded':>6} {'sgan':>6} {'sarm':>6} "
        f"{'arm_ok':>8} {'gan/ded':>8} {'arm/ded':>8}")


def row(r):
    w, n = r["wins"], r["trials"]
    g = f"{r['med_gantry']:.2f}" if r["med_gantry"] is not None else "-"
    a = f"{r['med_arm']:.2f}" if r["med_arm"] is not None else "-"
    return (f"{r['J']:3d} {r['scatter']:7.2f} {r['phi']:5.2f} {r['changeover_s']:6.0f} "
            f"{w['dedicated']/n:6.2f} {w['shared_gantry']/n:6.2f} {w['shared_arm']/n:6.2f} "
            f"{r['arm_feasible']/n:8.2f} {g:>8} {a:>8}")


def block(title, Js, scatters, phis, chg, **job_kw):
    print(f"\n{title}")
    print(HEAD)
    for J in Js:
        for sc in scatters:
            for phi in phis:
                print(row(F.survey(J, sc, phi, chg, TRIALS, 7, **job_kw)))


print(f"Share of {TRIALS} random job mixes in which each option is cheapest (ded = a robot per job, sgan = one shared gantry,\n"
      "sarm = one shared arm), the share of mixes the shared arm can do at all (arm_ok), and the median capital cost\n"
      "relative to dedicated (gan/ded, arm/ded; over the mixes where the option is feasible). Seed 7.\n"
      "Default jobs: tray side 0.1 to 0.4 m, tolerance 1, 2 or 5 mm.")
block("1. Demand 0.2 of a dedicated gantry per job, changeover 600 s: job count and scatter", (1, 2, 4, 8), (0.0, 0.2, 0.4, 0.6), (0.2,), 600)
block("2. Demand: 4 jobs, scatter 0.4 m, changeover 600 s", (4,), (0.4,), (0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1.0), 600)
block("3. Changeover 0 s: 4 jobs, scatter 0.4 m, demand 0.2", (4,), (0.4,), (0.2,), 0)
block("3b. Changeover 1800 s: 4 jobs, scatter 0.4 m, demand 0.2", (4,), (0.4,), (0.2,), 1800)
block("4. Loose tolerances only (5 and 10 mm), trays 0.1 to 0.25 m, demand 0.2, changeover 600 s", (2, 4, 8), (0.0, 0.2, 0.4, 0.6), (0.2,), 600,
      sides=(0.1, 0.25), tols=(0.005, 0.01))
