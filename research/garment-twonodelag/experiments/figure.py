"""Write experiments/band_cost.svg: held-out (outside) cost of tuned band, default band and never-switch at penalty 0.01 for each lag, "ours" choice set, parsed from results.txt.

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#1f6fb2", "#c0392b", "#2e8b57", "#8e44ad"]


def bars_svg(title, alt, ylabel, cats, series, ref=None):
    """Grouped bars. series = [(name, values per category)]; ref = optional horizontal reference value."""
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 70
    hi = max(max(v) for _, v in series + ([("", [ref])] if ref else [])) * 1.1
    py = lambda y: T + (1 - y / hi) * (H - T - B)
    gw = (W - L - R) / len(cats)
    bw = gw * 0.8 / len(series)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">{title}</text>']
    step = 10 ** (len(str(int(hi))) - 1)
    step *= min((0.2, 0.5, 1, 2), key=lambda m: abs(hi / (m * step) - 5))
    v = 0.0
    while v <= hi:
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:g}</text>')
        v += step
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    for i, c in enumerate(cats):
        cx = L + (i + 0.5) * gw
        o.append(f'<text x="{cx:.1f}" y="{H-B+14}" text-anchor="end" font-family="sans-serif" font-size="10" transform="rotate(-30 {cx:.1f} {H-B+14})">{c}</text>')
        for j, (_, vals) in enumerate(series):
            x = L + i * gw + gw * 0.1 + j * bw
            o.append(f'<rect x="{x:.1f}" y="{py(vals[i]):.1f}" width="{bw-1:.1f}" height="{py(0)-py(vals[i]):.1f}" fill="{COLS[j % 4]}"/>')
    if ref:
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(ref):.1f}" y2="{py(ref):.1f}" stroke="#000" stroke-dasharray="4 3"/>')
    for j, (name, _) in enumerate(series):
        ly = T + 10 + 15 * j
        o.append(f'<rect x="{L+10}" y="{ly-8}" width="12" height="10" fill="{COLS[j % 4]}"/>'
                 f'<text x="{L+28}" y="{ly+1}" font-family="sans-serif" font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"



def main():
    cats, t, d, f = [], [], [], []
    on = False
    for l in (HERE / "results.txt").read_text().splitlines():
        if l.startswith("== choice set"):
            on = "ours" in l
        elif on:
            m = re.match(r"\s*(\d+)\s+0\.01\s+\S+\s+\|\s+[\d.]+/[\d.]+/([\d.]+) \|\s+[\d.]+/[\d.]+/([\d.]+) \|\s+[\d.]+/[\d.]+/([\d.]+) \|", l)
            if m:
                cats.append(f"lag {m.group(1)} min"); t.append(float(m.group(2))); d.append(float(m.group(3))); f.append(float(m.group(4)))
    assert len(cats) == 4, cats
    (HERE / "band_cost.svg").write_text(bars_svg(
        "Held-out outside-range cost, switch penalty 0.01 (lower is better)",
        "Cost of tuned band, default band and never switching on held-out outside rooms for four sensor lags",
        "cost", cats, [("tuned band", t), ("default band", d), ("never switch", f)]))
    print("wrote", HERE / "band_cost.svg")


if __name__ == "__main__":
    main()
