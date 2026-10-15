"""Write experiments/utility.svg: Cap selection by IPS vs doubly-robust validation (uninformed prior).

    python experiments/figure.py

Parsed from the committed results.txt (never retyped). Shows the uninformed-prior rows of the
first results block (the hour-100 fits where the file has several); bars are mean held-out utility
per hour over 20 seeds, whiskers are the std over seeds.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e6bbf"]
F = 'font-family="sans-serif"'


def lines_text():
    return (HERE / "results.txt").read_text().splitlines()


def chart(title, xlabels, series, ylabel, kind="line", errs=None, logx=False):
    """series: {name: [y per x]}; kind line or bar; errs: {name: [std]} optional whiskers."""
    W, H, L, R, T, B = 640, 400, 70, 16, 40, 100
    lo = min(0.0, min(v - (errs[n][i] if errs else 0) for n, s in series.items() for i, v in enumerate(s)))
    allv = [v + (errs[n][i] if errs else 0) for n, s in series.items() for i, v in enumerate(s)]
    hi = max(allv) * 1.12 if max(allv) > 0 else 1.0
    py = lambda v: T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{title}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {F} font-size="14">{title}</text>',
         f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {F} font-size="11" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>']
    for k in range(5):
        v = lo + (hi - lo) * k / 4
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" {F} font-size="11">{v:.3g}</text>')
    n, names = len(xlabels), list(series)
    gw = (W - L - R) / n
    for i, xl in enumerate(xlabels):
        o.append(f'<text x="{L+(i+0.5)*gw:.1f}" y="{H-B+16}" text-anchor="end" {F} font-size="10" transform="rotate(-35 {L+(i+0.5)*gw:.1f} {H-B+16})">{xl}</text>')
    for j, name in enumerate(names):
        c = COLS[j % 4]
        if kind == "bar":
            bw = gw * 0.8 / len(names)
            for i, v in enumerate(series[name]):
                x = L + i * gw + gw * 0.1 + bw * j
                y0, y1 = sorted((py(0), py(v)))
                o.append(f'<rect x="{x:.1f}" y="{y0:.1f}" width="{bw*0.92:.1f}" height="{y1-y0:.1f}" fill="{c}"/>')
                if errs:
                    e = errs[name][i]
                    xm = x + bw * 0.46
                    o.append(f'<line x1="{xm:.1f}" x2="{xm:.1f}" y1="{py(v-e):.1f}" y2="{py(v+e):.1f}" stroke="#222"/>')
        else:
            pts = " ".join(f"{L+(i+0.5)*gw:.1f},{py(v):.1f}" for i, v in enumerate(series[name]))
            o.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-width="2"/>')
            for i, v in enumerate(series[name]):
                o.append(f'<circle cx="{L+(i+0.5)*gw:.1f}" cy="{py(v):.1f}" r="3" fill="{c}"/>')
        lx = L + 10 + 150 * j
        o.append(f'<rect x="{lx}" y="{H-18}" width="10" height="10" fill="{c}"/>'
                 f'<text x="{lx+15}" y="{H-9}" {F} font-size="11">{name}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def main():
    rows, fits = {}, []
    for line in lines_text():
        if rows and line.startswith("== "):
            break
        m = re.match(r"uninformed\s+([\d.]+)\s+(\S+)\s+(-?[\d.]+) \+-\s+([\d.]+)", line)
        if m:
            if m[2] not in fits:
                fits.append(m[2])
            rows.setdefault(m[1], {})[m[2]] = (float(m[3]), float(m[4]))
    eps = sorted(rows)
    series = {"eps " + e: [rows[e][f][0] for f in fits] for e in eps}
    errs = {"eps " + e: [rows[e][f][1] for f in fits] for e in eps}
    (HERE / "utility.svg").write_text(chart("Cap selection by IPS vs doubly-robust validation (uninformed prior)", fits, series, "held-out utility/h", "bar", errs))


if __name__ == "__main__":
    main()
