"""Write experiments/dr_fits.svg: held-out utility per hour of each fit at exploration rate 0.005, two priors, parsed from the committed results.txt.

    python experiments/figure.py

Numbers are parsed from results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#1f6fb2", "#c0392b", "#2e8b57", "#8e44ad"]
EPS = "0.005"
FITS = ["biased", "ips", "clip10", "selfnorm", "dr_biased", "dr_clip10", "dr_prior", "random_matched", "full"]
TITLE = "Held-out utility/h by fit (eps 0.005; whiskers = std over 20 seeds)"
ALT = "Grouped bars of held-out utility per hour for each fitting method, uninformed vs informed prior"


def signed_bars_svg(title, alt, ylabel, cats, series):
    """Grouped bars with +-std whiskers; series = [(name, [(mean, std)])]; axis spans negative values."""
    W, H, L, R, T, B = 700, 400, 64, 16, 40, 80
    lo = min(0, min(m - s for _, v in series for m, s in v)) * 1.05
    hi = max(0, max(m + s for _, v in series for m, s in v)) * 1.05
    py = lambda y: T + (hi - y) / (hi - lo) * (H - T - B)
    gw = (W - L - R) / len(cats)
    bw = gw * 0.8 / len(series)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">{title}</text>']
    step = max(1, round((hi - lo) / 6 / 10) * 10) if hi - lo > 30 else 5
    v = int(lo // step) * step
    while v <= hi:
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="{"#000" if v == 0 else "#ddd"}"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:g}</text>')
        v += step
    mid = (T + H - B) / 2
    o.append(f'<text x="14" y="{mid}" text-anchor="middle" font-family="sans-serif" font-size="12" transform="rotate(-90 14 {mid})">{ylabel}</text>')
    for i, c in enumerate(cats):
        cx = L + (i + 0.5) * gw
        o.append(f'<text x="{cx:.1f}" y="{H-B+14}" text-anchor="end" font-family="sans-serif" font-size="10" transform="rotate(-30 {cx:.1f} {H-B+14})">{c}</text>')
        for j, (_, vals) in enumerate(series):
            m, s = vals[i]
            x = L + i * gw + gw * 0.1 + j * bw
            y0, y1 = sorted((py(0), py(m)))
            o.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{bw-1:.1f}" height="{y1-y0:.1f}" fill="{COLS[j % 4]}"/>')
            xc = x + (bw - 1) / 2
            o.append(f'<line x1="{xc:.1f}" x2="{xc:.1f}" y1="{py(m-s):.1f}" y2="{py(m+s):.1f}" stroke="#000" stroke-width="1"/>')
    for j, (name, _) in enumerate(series):
        ly = T + 10 + 15 * j
        o.append(f'<rect x="{W-R-150}" y="{ly-8}" width="12" height="10" fill="{COLS[j % 4]}"/>'
                 f'<text x="{W-R-132}" y="{ly+1}" font-family="sans-serif" font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def main():
    rows = {}
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"(uninformed|informed)\s+0\.005\s+(\S+)\s+(-?[\d.]+)\s+\+-\s+([\d.]+)", l)
        if m:
            rows[(m.group(1), m.group(2))] = (float(m.group(3)), float(m.group(4)))
    series = [(p + " prior", [rows[(p, f)] for f in FITS]) for p in ("uninformed", "informed")]
    (HERE / "dr_fits.svg").write_text(signed_bars_svg(TITLE, ALT, "held-out utility per hour", FITS, series))
    print("wrote", HERE / "dr_fits.svg")


if __name__ == "__main__":
    main()
