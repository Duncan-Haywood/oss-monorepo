"""How much fixed mission energy does Iridium messaging add, against 7e's flip thresholds?

    python3 experiments/run_iridium_overhead.py > experiments/results_iridium_overhead.txt

Sourced input (search-result excerpt of the Spray glider description page,
https://spray.ucsd.edu/pub/rel/info/spray_description.php; the page itself could not be opened
from this session, spray.ucsd.edu does not resolve): Iridium link energy about 40 J for the first
kilobyte and 30 J for each additional kilobyte. A Spray glider, not a Slocum; surface GPS and
hotel energy while at the surface are NOT included. Swept, unsourced: surfacings per mission N
and message size per surfacing. Thresholds are 7e's (results_h5_glider.txt): a glider-only fixed
energy of 100 / 250 / 500 / 1000 Wh swaps the glider/AUV order in 0.7 / 2.3 / 6.0 / 20 % of cases.
"""
J_PER_WH = 3600.0


def iridium_wh(n_surfacings, kb):
    return n_surfacings * (40.0 + 30.0 * (kb - 1.0)) / J_PER_WH


if __name__ == "__main__":
    print("Iridium energy per mission (Wh), Spray figure: 40 J first kB, 30 J each further kB")
    print("surfacings   1 kB    5 kB   20 kB  100 kB")
    for n in (10, 100, 1000, 10000):
        print(f"{n:>9}" + "".join(f"{iridium_wh(n, kb):8.2f}" for kb in (1, 5, 20, 100)))
    worst = iridium_wh(10000, 100)
    print(f"\nlargest cell {worst:.0f} Wh; surfacings needed to reach 100 Wh at 5 kB: "
          f"{100 * J_PER_WH / (40 + 30 * 4):.0f}")
