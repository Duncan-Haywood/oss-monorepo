"""Write experiments/lol_diversity.svg: loss of life by heat-pump control case, log scale, median and range over 20
ten-home groups, from section B of diversity.txt (loading 0.5, no EV).   python experiments/figure_diversity.py"""
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = ["coincident", "VS", "SS", "SS setback stagger4h", "SS setback sync", "SS setback sync nostrip", "VS setback sync"]
LABEL = {"coincident": "coincident (hourly model)", "VS": "variable-speed", "SS": "single-stage",
         "SS setback stagger4h": "SS, setback, staggered 4 h", "SS setback sync": "SS, setback, synchronized",
         "SS setback sync nostrip": "SS, setback, strip locked out", "VS setback sync": "VS, setback, synchronized"}


def parse():
    rows, clim, sec = {}, None, None
    for ln in (HERE / "diversity.txt").read_text().splitlines():
        if ln.startswith("== "):
            clim = ln[3:].strip()
        elif ln[:2] in ("A.", "B.", "C.", "D."):
            sec = ln[0]
        elif sec == "B" and ln.startswith("0.5 none "):
            rest = ln[len("0.5 none "):]
            for c in sorted(CASES, key=len, reverse=True):
                if rest.startswith(c + " "):
                    v = rest[len(c) + 1:].replace("[", " ").replace("]", " ").replace("-", " ").split()
                    # LOL_1min median, min, max are fields 3, 4, 5 of: hourly med min max, 1min med min max, pu ...
                    rows[(clim, c)] = tuple(float(x.replace(">", "")) for x in v[3:6])
                    break
    return rows


def main():
    rows = parse()
    W, H, L, R, T, B = 720, 420, 210, 20, 50, 60
    lo, hi = -2.0, 2.0                       # 0.01 to 100 %/yr
    X = lambda v: L + (math.log10(max(v, 10 ** lo)) - lo) / (hi - lo) * (W - L - R)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Bar chart, log scale: annual '
         'transformer insulation loss of life for 10 homes all with heat pumps under seven heat-pump control cases, Greensboro and '
         'Sand Point, median and range over 20 groups; synchronized night setback with strip heat ages the transformer most">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">Transformer loss of life by heat-pump control '
         '(100 % heat pumps, loading 0.5)</text>']
    for e in range(int(lo), int(hi) + 1):
        x = X(10 ** e)
        o.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{T}" y2="{H-B}" stroke="#ddd"/><text x="{x:.1f}" y="{H-B+16}" text-anchor="middle" '
                 f'font-family="sans-serif" font-size="11">{10.0**e:g}</text>')
    x = X(8760 / 180000 * 100)
    o.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{T}" y2="{H-B}" stroke="#c00" stroke-dasharray="4 3"/><text x="{x+3:.1f}" y="{T+10}" '
             'font-family="sans-serif" font-size="10" fill="#c00">rated-life rate</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-B+36}" text-anchor="middle" font-family="sans-serif" font-size="12">loss of life, %/yr '
             '(log scale; bar = median, line = min to max over 20 ten-home groups)</text>')
    band = (H - T - B) / len(CASES)
    colors = {"greensboro": "#2b6cb0", "sandpoint": "#dd6b20"}
    for i, c in enumerate(CASES):
        y0 = T + i * band
        o.append(f'<text x="{L-6}" y="{y0+band/2+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{LABEL[c]}</text>')
        for j, clim in enumerate(("greensboro", "sandpoint")):
            if (clim, c) not in rows:
                continue
            med, mn, mx = rows[(clim, c)]
            y = y0 + 6 + j * (band - 12) / 2
            h = (band - 12) / 2 - 2
            o.append(f'<rect x="{L}" y="{y:.1f}" width="{X(med)-L:.1f}" height="{h:.1f}" fill="{colors[clim]}" opacity="0.8"/>')
            o.append(f'<line x1="{X(mn):.1f}" x2="{X(mx):.1f}" y1="{y+h/2:.1f}" y2="{y+h/2:.1f}" stroke="#222"/>')
    for j, clim in enumerate(("greensboro", "sandpoint")):
        o.append(f'<rect x="{L+10+j*150}" y="{T-18}" width="10" height="10" fill="{colors[clim]}"/><text x="{L+24+j*150}" y="{T-9}" '
                 f'font-family="sans-serif" font-size="11">{"Greensboro, NC" if j == 0 else "Sand Point, AK"}</text>')
    o.append("</svg>")
    (HERE / "lol_diversity.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
