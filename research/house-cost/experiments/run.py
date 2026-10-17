"""Sensitivity of the price index to each lever. Writes results.txt (deterministic).

    PYTHONPATH=src python experiments/run.py > experiments/results.txt
"""
from house_cost.model import REFERENCE, STAGE_SHARES, PRICE_SHARES, price, per_sqft_index, vary

LEVERS = [  # name, kwargs low, kwargs high (a plausible range around the reference, an assumption)
    ("size 1,600 to 2,400 sq ft", dict(area=1600), dict(area=2400)),
    ("storeys 1 to 3 (same area)", dict(storeys=1), dict(storeys=3)),
    ("shape: aspect 1.0 to 3.0", dict(aspect=1.0), dict(aspect=3.0)),
    ("finish level x0.8 to x1.3", dict(finish=0.8), dict(finish=1.3)),
    ("foundation x0.7 (slab) to x1.6 (basement)", dict(foundation=0.7), dict(foundation=1.6)),
    ("lot price x0.7 to x1.3", dict(lot=0.7), dict(lot=1.3)),
    ("overhead and fees x0.8 to x1.2", dict(fees=0.8), dict(fees=1.2)),
    ("build time x0.7 to x1.3 (financing)", dict(months=0.7), dict(months=1.3)),
    ("framing labour x0.9 to x1.2", dict(framing_labour=0.9), dict(framing_labour=1.2)),
    ("framing materials x0.85 to x1.15", dict(framing_materials=0.85), dict(framing_materials=1.15)),
]


def main():
    ref = price(REFERENCE)
    print("A. Reference house (2,000 sq ft, 2 storeys, aspect 1.5): price index 100; parts reproduce NAHB 2024 shares")
    for k in ("construction", "lot", "profit", "overhead", "commission", "financing", "marketing"):
        print(f"  {k:13s}{ref[k]:6.2f}   (NAHB {100 * PRICE_SHARES[k]:.1f})")
    print("  construction stages (index points):",
          ", ".join(f"{k} {v:.1f}" for k, v in ref["stages"].items()))
    print()
    print("B. Lever ranges: price index at low and high end (reference = 100), sorted by swing")
    rows = []
    for name, lo, hi in LEVERS:
        a, b = price(vary(**lo))["price"], price(vary(**hi))["price"]
        rows.append((abs(b - a), name, a, b))
    for sw, name, a, b in sorted(rows, reverse=True):
        print(f"  {name:44s}{a:7.1f}{b:7.1f}   swing {sw:5.1f}")
    print()
    print("C. Size: total price index and price per sq ft index (reference = 100)")
    for area in (800, 1200, 1600, 2000, 2400, 3000, 4000):
        h = vary(area=area)
        print(f"  {area:5d} sq ft{price(h)['price']:8.1f}{per_sqft_index(h):8.1f}")
    print()
    print("D. Shape at 2,000 sq ft: price index by storeys and aspect")
    print("  storeys " + "".join(f"{a:>8.1f}" for a in (1.0, 1.5, 2.0, 3.0)))
    for s in (1, 2, 3):
        print(f"  {s:7d} " + "".join(f"{price(vary(storeys=s, aspect=a))['price']:8.1f}" for a in (1.0, 1.5, 2.0, 3.0)))
    print()
    print("E. What a lumber saving is worth (framing materials only; labour unchanged)")
    print("   house-plan: the default plan uses 5.59 bf/sq ft; the exhaustive best 896 sq ft plan 4.83 (ratio 0.864)")
    for r in (0.95, 0.864, 0.75):
        p = price(vary(framing_materials=r))["price"]
        print(f"  materials x{r:.3f}  price index {p:6.2f}  ({p - 100:+.2f}% of price)")
    both = price(vary(framing_materials=0.864, framing_labour=0.8))["price"]
    print(f"   the same lumber saving plus 20% less framing labour (fewer, simpler pieces): {both - 100:+.2f}% of price")
    print()
    print("F. Framing is 16.6% of construction = {:.1f}% of price; foundations {:.1f}%; the whole non-construction\n"
          "   side (lot, overhead, financing, marketing, commission, profit) is {:.1f}% of price.".format(
              100 * PRICE_SHARES["construction"] * STAGE_SHARES["framing"],
              100 * PRICE_SHARES["construction"] * STAGE_SHARES["foundations"],
              100 * (1 - PRICE_SHARES["construction"])))


if __name__ == "__main__":
    main()
