"""Bootstrap p versus normal-approximation p for the 2024 paired cells (session 47).
Usage: python3 src/paired_boot_table.py [results_dir] [year|all] > results/paired_boot_p_<year>.txt
(default 2024; "all" pools 2022 to 2024 into one family of 45 cells, session 48).
Needs results/paired_*_<year>.json written with p_boot (src/paired_neural_boosted.py)."""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import paired_multiplicity as pm

d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "results")
year = sys.argv[2] if len(sys.argv) > 2 else "2024"
rows = []
pat = "paired_*_20??.json" if year == "all" else f"paired_*_{year}.json"
for f in sorted(glob.glob(os.path.join(d, pat))):
    j = json.load(open(f))
    yr = os.path.basename(f)[-9:-5]
    for t, c in sorted(j["cells"].items()):
        rows.append((j["city"] + (" " + yr if year == "all" else ""), j["target"], t, 100 * c["rel"], pm.pval(c["diff"], c["lo"], c["hi"]), c["p_boot"], c["significant"]))
hb, bb = pm.holm([r[5] for r in rows]), pm.bh([r[5] for r in rows])
print(f"Two-sided week-block bootstrap p (2000 draws, floor 1/2001 x 2 = 0.001) vs normal-approximation p, {year}.")
for r, h, b in zip(rows, hb, bb):
    print(f"{r[0]:{13 if year == 'all' else 8}s}{r[1]} q{r[2]}: {r[3]:+.2f}%  p_normal~{r[4]:.2g}  p_boot {r[5]:.4f}  uncorrected {'*' if r[6] else ' '}  Holm(boot) {'*' if h else ' '}  BH(boot) {'*' if b else ' '}")
print(f"uncorrected {sum(r[6] for r in rows)}, Holm(boot) {sum(hb)}, BH(boot) {sum(bb)} of {len(rows)}")
