"""Trip length and recording hours swept together with the kit. Writes sweep.txt.

    PYTHONPATH=src python experiments/sweep.py

The recording floor of the kit search doubles as the hours filmed per day, as in run.py.
"""
from pathlib import Path
from capture_kitstore import all_kits, storage, total_grams, variety, hours, legal, kit_grams

HERE = Path(__file__).resolve().parent
HOURS = (2.0, 4.0, 6.0, 8.0)
DAYS = (3, 7, 14, 28)
BUDGET = 4000


def cell(kits, h, d):
    """(lightest total for all 18 shots, best shots at BUDGET, storage g of the lightest 18-shot kit)."""
    full, best = None, 0
    for k in kits:
        if not legal(k) or hours(k) < h:
            continue
        st = storage(k, h, days=d)
        if st is None:
            continue
        g = total_grams(k, st)
        v = variety(k)
        if g <= BUDGET:
            best = max(best, v)
        if v == 18 and (full is None or g < full[0]):
            full = (g, st.grams)
    return full, best


def main():
    kits = list(all_kits())
    res = {(h, d): cell(kits, h, d) for h in HOURS for d in DAYS}
    out = [f"kits: {len(kits)}; 2 SSD copies, offload within 1 h, UHS-I ceiling; hours/day is also the kit's recording floor"]
    out.append("A. lightest total carried weight (g) reaching all 18 shots ('-' = none within 8 readers / the catalogue)")
    out.append("hours_per_day  " + "  ".join(f"{d}d".ljust(6) for d in DAYS))
    for h in HOURS:
        out.append(f"{h:<14g} " + "  ".join((f"{res[h, d][0][0]:.0f}" if res[h, d][0] else "-").ljust(6) for d in DAYS))
    out.append("B. storage share (g) of that lightest 18-shot kit")
    out.append("hours_per_day  " + "  ".join(f"{d}d".ljust(6) for d in DAYS))
    for h in HOURS:
        out.append(f"{h:<14g} " + "  ".join((f"{res[h, d][0][1]:.0f}" if res[h, d][0] else "-").ljust(6) for d in DAYS))
    out.append(f"C. most shots within {BUDGET} g total")
    out.append("hours_per_day  " + "  ".join(f"{d}d".ljust(6) for d in DAYS))
    for h in HOURS:
        out.append(f"{h:<14g} " + "  ".join(str(res[h, d][1]).ljust(6) for d in DAYS))
    (HERE / "sweep.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
