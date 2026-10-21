"""Exact vs greedy on the sourced catalogue, and a sweep of the unsourced figures. Writes results.txt.

    PYTHONPATH=src python experiments/run.py
"""
import random
from dataclasses import replace
from pathlib import Path
import capture_realkit.model as M
from capture_realkit import (all_kits, exact, greedy, grams, variety, hours, describe, legal, BANDS, VIEWPOINTS,
                             PACKS, SOURCES, ASSUMED_SPREAD)

HERE = Path(__file__).resolve().parent
BUDGETS = (500, 1000, 1500, 2000, 3000, 4000, 5000, 7000)
MINH = 4.0
# results.txt of capture-kit (assumed figures), section B, for the comparison column.
OLD_EXACT_VAR = {500: 4, 1000: 8, 1500: 8, 2000: 10, 3000: 12, 4000: 15, 5000: 18, 7000: 18}
DRAWS = 100


def perturbed(rng):
    f = lambda x: x * (1 + rng.uniform(-ASSUMED_SPREAD, ASSUMED_SPREAD))
    cams = tuple(replace(c, watts=f(c.watts)) if c.name.startswith("iPhone") else c for c in M.CAMERAS)
    mounts = tuple(replace(m, grams=round(f(m.grams))) if m.name in ("selfie pole", "mini tripod", "telescoping mast") else m
                   for m in M.MOUNTS)
    packs = tuple(replace(p, grams=round(f(p.grams))) if p.wh > 100 else p for p in M.PACKS)
    return cams, mounts, packs


def main():
    kits = list(all_kits())
    out = [f"kits enumerated: {len(kits)}; legal: {sum(legal(k) for k in kits)}; max variety {len(BANDS) * len(VIEWPOINTS)}",
           "A. exact vs greedy on the sourced catalogue, floor of 4 h (variety = distinct band x viewpoint shots)",
           "budget_g  exact_var exact_h exact_g  greedy_var greedy_h greedy_g  greedy_meets_floor  old_exact_var(assumed catalogue)"]
    detail = []
    for b in BUDGETS:
        e, g = exact(b, kits, MINH), greedy(b)
        if e is None:
            out.append(f"{b:<9d} none fits  old={OLD_EXACT_VAR[b]}")
            continue
        out.append(f"{b:<9d} {variety(e):<9d} {hours(e):<7.2f} {grams(e):<8d} {variety(g):<10d} {hours(g):<8.2f} {grams(g):<9d} {hours(g) >= MINH!s:<19} {OLD_EXACT_VAR[b]}")
        detail.append(f"{b} g exact: {describe(e)} | greedy: {describe(g)}")
    out.append("B. kits chosen")
    out += detail
    over = [p.name for p in PACKS if p.wh > 100]
    picked = any(p.wh > 100 for b in BUDGETS for p in (exact(b, kits) or exact(7000, kits)).packs)
    out.append(f"C. packs over 100 Wh in catalogue: {over}; any chosen by exact search: {picked}")
    out.append(f"D. sweep: {DRAWS} draws of the unsourced figures within +-{ASSUMED_SPREAD:.0%} (seed 0); exact variety with the 4 h floor")
    out.append("budget_g  base  min  max  share_equal_base  greedy_below_exact_share")
    rng = random.Random(0)
    saved = (M.CAMERAS, M.MOUNTS, M.PACKS)
    res = {b: [] for b in BUDGETS}
    gap = {b: 0 for b in BUDGETS}
    try:
        for _ in range(DRAWS):
            M.CAMERAS, M.MOUNTS, M.PACKS = perturbed(rng)
            ks = list(M.all_kits())
            for b in BUDGETS:
                e = M.exact(b, ks, MINH)
                v = M.variety(e) if e else 0
                res[b].append(v)
                g = M.greedy(b)
                gap[b] += (M.variety(g) if M.hours(g) >= MINH else 0) < v
    finally:
        M.CAMERAS, M.MOUNTS, M.PACKS = saved
    for b in BUDGETS:
        e = exact(b, kits, MINH)
        base = variety(e) if e else 0
        r = res[b]
        out.append(f"{b:<9d} {base:<5d} {min(r):<4d} {max(r):<4d} {sum(x == base for x in r) / DRAWS:<17.2f} {gap[b] / DRAWS:.2f}")
    out.append("E. sources")
    out += [f"{k}: {v}" for k, v in SOURCES.items()]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
