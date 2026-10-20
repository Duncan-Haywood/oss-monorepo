"""Write experiments/null_rate.svg: false-rejection rate of three C2ST significance rules on the exact twin.

    python3 experiments/figure.py

Parsed from the committed results.txt (the raw+resid null block), never retyped.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
RULES = ["cv_naive", "cv_fold_t", "holdout"]
COLS = ["#c0392b", "#1f6fb2", "#2e8b57"]


def parse():
    rows, on = {}, False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== "):
            on = l.startswith("== exact twin (null), raw+resid")
        elif on and re.match(r"\s+\d+ ", l):
            rows[int(l.split()[0])] = [float(x) for x in re.findall(r"(\d\.\d{3}) \[", l)]
    assert sorted(rows) == [100, 200, 400] and all(len(v) == 3 for v in rows.values()), "results.txt not as expected"
    return rows


def main():
    rows = parse()
    W, H, L, R, T, B = 640, 360, 56, 16, 64, 50
    top = 0.16
    py = lambda v: T + (1 - v / top) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="False-rejection rate of three significance rules for a classifier two-sample test on an exact twin, nominal 0.05">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="14">False rejections on the exact twin (nominal 0.05, 200 replicates)</text>']
    for v in (0, 0.05, 0.10, 0.15):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="{"#555" if v == 0.05 else "#ddd"}"/><text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:.2f}</text>')
    gw = (W - L - R) / 3
    for g, (n, vals) in enumerate(sorted(rows.items())):
        for k, v in enumerate(vals):
            x = L + g * gw + 24 + k * 56
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="48" height="{py(0)-py(v):.1f}" fill="{COLS[k]}"/><text x="{x+24:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="11">{v:.3f}</text>')
        o.append(f'<text x="{L + g*gw + gw/2:.1f}" y="{H-B+18}" text-anchor="middle" font-family="sans-serif" font-size="12">n = {n} per class</text>')
    for k, r in enumerate(RULES):
        x0 = L + 150 * k
        o.append(f'<rect x="{x0}" y="34" width="14" height="10" fill="{COLS[k]}"/><text x="{x0+20}" y="43" font-family="sans-serif" font-size="11">{r}</text>')
    o.append("</svg>")
    (HERE / "null_rate.svg").write_text("\n".join(o) + "\n")
    print("wrote null_rate.svg")


if __name__ == "__main__":
    main()
