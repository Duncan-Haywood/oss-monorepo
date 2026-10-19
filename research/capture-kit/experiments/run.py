"""Exact kit search vs greedy across weight budgets. Writes results.txt.

    PYTHONPATH=src python experiments/run.py
"""
from pathlib import Path
from capture_kit import (all_kits, exact, greedy, grams, variety, hours, describe, legal,
                         BANDS, VIEWPOINTS, PACKS)

HERE = Path(__file__).resolve().parent
BUDGETS = (500, 1000, 1500, 2000, 3000, 4000, 5000, 7000)


def main():
    kits = list(all_kits())
    MINH = 4.0
    out = [f"kits enumerated: {len(kits)}; legal: {sum(legal(k) for k in kits)}; max variety {len(BANDS) * len(VIEWPOINTS)}",
           "A. exact vs greedy (variety = distinct band x viewpoint shots; hours = Wh / draw of cameras running at once)",
           "budget_g  exact_var exact_h exact_g  greedy_var greedy_h greedy_g   (exact: variety first, no hours floor)"]
    detail = []
    for b in BUDGETS:
        e, g = exact(b, kits), greedy(b)
        out.append(f"{b:<9d} {variety(e):<9d} {hours(e):<7.2f} {grams(e):<8d} {variety(g):<10d} {hours(g):<8.2f} {grams(g)}")
        detail.append(f"{b} g exact: {describe(e)} | greedy: {describe(g)}")
    out.append(f"B. same search with a floor of {MINH:.0f} h of recording")
    out.append("budget_g  exact_var exact_h exact_g  greedy_var greedy_h greedy_g  greedy_meets_floor")
    detail = []
    for b in BUDGETS:
        e, g = exact(b, kits, MINH), greedy(b)
        if e is None:
            out.append(f"{b:<9d} none fits")
            continue
        out.append(f"{b:<9d} {variety(e):<9d} {hours(e):<7.2f} {grams(e):<8d} {variety(g):<10d} {hours(g):<8.2f} {grams(g):<9d} {hours(g) >= MINH}")
        detail.append(f"{b} g exact: {describe(e)} | greedy: {describe(g)}")
    out.append("C. kits chosen under the floor")
    out += detail
    over = [p.name for p in PACKS if p.wh > 100]
    picked = any(p.wh > 100 for b in BUDGETS for p in (exact(b, kits) or exact(7000, kits)).packs)
    out.append(f"D. packs over 100 Wh in catalogue: {over}; any chosen by exact search: {picked}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
