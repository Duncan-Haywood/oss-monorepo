"""Write experiments/rates.svg: rejection rates of three C2ST rules (null n=100, n=200; Coulomb -10% n=200).

    python3 experiments/figure.py

Parsed from the committed results.txt, never retyped.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
RULES = ["cv_naive", "cv_perm", "holdout"]
COLS = ["#c0392b", "#1f6fb2", "#2e8b57"]


def parse():
    groups, label = [], None
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== "):
            label = l[3:].split("  (")[0]
        elif label and re.match(r"\s+\d+ ", l):
            groups.append((f"{label.replace('exact twin (null), raw', 'null')}, n={l.split()[0]}",
                           [float(x) for x in re.findall(r"(\d\.\d{3}) \[", l)]))
    assert len(groups) == 3 and all(len(v) == 3 for _, v in groups), "results.txt not as expected"
    return groups


def main():
    groups = parse()
    W, H, L, R, T, B = 700, 380, 56, 16, 64, 56
    py = lambda v: T + (1 - v) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Rejection rate of three significance rules for a classifier two-sample test: nominal 0.05 under the null, power under a 10 percent Coulomb error">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="14">Rejection rate at alpha = 0.05 (null should be 0.05)</text>']
    for v in (0, 0.05, 0.25, 0.5, 0.75, 1.0):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="{"#555" if v == 0.05 else "#ddd"}"/><text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:.2f}</text>')
    gw = (W - L - R) / len(groups)
    for g, (name, vals) in enumerate(groups):
        for k, v in enumerate(vals):
            x = L + g * gw + 30 + k * 62
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="54" height="{py(0)-py(v):.1f}" fill="{COLS[k]}"/><text x="{x+27:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="11">{v:.3f}</text>')
        o.append(f'<text x="{L + g*gw + gw/2:.1f}" y="{H-B+20}" text-anchor="middle" font-family="sans-serif" font-size="12">{name}</text>')
    for k, r in enumerate(RULES):
        x0 = L + 150 * k
        o.append(f'<rect x="{x0}" y="34" width="14" height="10" fill="{COLS[k]}"/><text x="{x0+20}" y="43" font-family="sans-serif" font-size="11">{r}</text>')
    o.append("</svg>")
    (HERE / "rates.svg").write_text("\n".join(o) + "\n")
    print("wrote rates.svg")


if __name__ == "__main__":
    main()
