"""Print the tables quoted in the README from results.txt.   python experiments/analyse.py"""
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parent


def load():
    rows = []
    for line in (HERE / "results.txt").read_text().splitlines()[1:]:
        a, b, c, e, eq, ks = (x.strip() for x in line.split("|"))
        m, s = map(int, a.split())
        op, csd, mcm = list(map(int, b.split())), list(map(int, c.split())), list(map(int, e.split()))
        rows.append({"m": m, "set": s, "op": tuple(op), "csd": tuple(csd[:2]), "csd_add": csd[2],
                     "mcm": tuple(mcm[:2]), "mcm_add": mcm[2], "eq": int(eq), "ks": ks})
    return rows


def main():
    R = load()
    print(f"banks {len(R)}, all proved equivalent: {sum(r['eq'] for r in R)}")
    print("M | op cells | csd cells | mcm cells | mcm vs csd | mcm vs op | op depth | csd depth | mcm depth | adders csd/mcm | mcm<csd | mcm>csd")
    for m in sorted({r["m"] for r in R}):
        S = [r for r in R if r["m"] == m]
        oc, cc, mc = (mean(r[f][0] for r in S) for f in ("op", "csd", "mcm"))
        print(f"{m} | {oc:.0f} | {cc:.0f} | {mc:.0f} | {100*(mc/cc-1):+.1f}% | {100*(mc/oc-1):+.1f}% | "
              f"{mean(r['op'][1] for r in S):.1f} | {mean(r['csd'][1] for r in S):.1f} | {mean(r['mcm'][1] for r in S):.1f} | "
              f"{mean(r['csd_add'] for r in S):.1f}/{mean(r['mcm_add'] for r in S):.1f} | "
              f"{sum(r['mcm'][0] < r['csd'][0] for r in S)} | {sum(r['mcm'][0] > r['csd'][0] for r in S)}")
    saved_add = [(r["csd_add"] - r["mcm_add"]) for r in R]
    saved_cells = [(r["csd"][0] - r["mcm"][0]) for r in R]
    n = len(R)
    mx, my = mean(saved_add), mean(saved_cells)
    cov = sum((a - mx) * (b - my) for a, b in zip(saved_add, saved_cells))
    va = sum((a - mx) ** 2 for a in saved_add) ** .5
    vb = sum((b - my) ** 2 for b in saved_cells) ** .5
    print(f"Pearson(adders saved, cells saved vs csd) = {cov/(va*vb):.3f} over {n} banks")
    print(f"mean cells saved per adder removed = {sum(saved_cells)/max(1,sum(saved_add)):.1f}")
    print(f"worst mcm vs csd: {max(R, key=lambda r: r['mcm'][0]-r['csd'][0])['ks']} "
          f"{max(r['mcm'][0]-r['csd'][0] for r in R)} cells")


if __name__ == "__main__":
    main()
