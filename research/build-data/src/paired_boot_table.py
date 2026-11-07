"""Bootstrap p versus normal-approximation p for the 2024 paired cells (session 47).
Usage: python3 src/paired_boot_table.py [results_dir] > results/paired_boot_p_2024.txt
Needs results/paired_*_2024.json written with p_boot (src/paired_neural_boosted.py)."""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import paired_multiplicity as pm

d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "results")
rows = []
for f in sorted(glob.glob(os.path.join(d, "paired_*_2024.json"))):
    j = json.load(open(f))
    for t, c in sorted(j["cells"].items()):
        rows.append((j["city"], j["target"], t, 100 * c["rel"], pm.pval(c["diff"], c["lo"], c["hi"]), c["p_boot"], c["significant"]))
hb, bb = pm.holm([r[5] for r in rows]), pm.bh([r[5] for r in rows])
print("Two-sided week-block bootstrap p (2000 draws, floor 1/2001 x 2 = 0.001) vs normal-approximation p, 2024.")
for r, h, b in zip(rows, hb, bb):
    print(f"{r[0]:8s}{r[1]} q{r[2]}: {r[3]:+.2f}%  p_normal~{r[4]:.2g}  p_boot {r[5]:.4f}  uncorrected {'*' if r[6] else ' '}  Holm(boot) {'*' if h else ' '}  BH(boot) {'*' if b else ' '}")
print(f"uncorrected {sum(r[6] for r in rows)}, Holm(boot) {sum(hb)}, BH(boot) {sum(bb)} of {len(rows)}")
