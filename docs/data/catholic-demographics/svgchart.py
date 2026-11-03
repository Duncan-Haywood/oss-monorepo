"""Tiny dependency-free SVG charts for the Catholic demographics posts.

Static images (embedded in posts with ![alt](file.svg)), so: a light surface,
text in ink colours, categorical hues in fixed order (blue, orange, aqua),
direct value labels, and every chart has a table beside it in the post.
"""

from html import escape

SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK2 = "#52514e"
GRID = "#e4e3df"
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
FONT = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif"


def _fmt(v, unit):
    if v is None:
        return "n/a"
    if unit == "%":
        return f"{v:.0f}%"
    if abs(v) >= 1000:
        return f"{v:,.0f}"
    return f"{v:g}"


def nice(v):
    """Round an axis maximum up so its quarter ticks are round numbers."""
    import math
    mag = 10 ** math.floor(math.log10(v))
    for m in (1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10):
        if m * mag >= v:
            return m * mag
    return 10 * mag


def _frame(w, h, title, subtitle, source, body):
    t = escape(title)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'role="img" aria-label="{t}" style="{FONT}">'
        f"<title>{t}</title>"
        f'<rect width="{w}" height="{h}" fill="{SURFACE}"/>'
        f'<text x="20" y="30" font-size="17" font-weight="600" fill="{INK}">{t}</text>'
        f'<text x="20" y="50" font-size="12.5" fill="{INK2}">{escape(subtitle)}</text>'
        + body
        + f'<text x="20" y="{h - 12}" font-size="11" fill="{INK2}">{escape(source)}</text></svg>\n'
    )


def hbar(path, title, subtitle, source, labels, series, unit="%", vmax=None, label_w=190, w=760):
    """Horizontal grouped bars. series: [(name, [values...]), ...] in fixed colour order."""
    n_s = len(series)
    bar_h, gap = 13, 2
    group_h = n_s * bar_h + (n_s - 1) * gap + 14
    top = 70 + (22 if n_s > 1 else 0)
    h = top + group_h * len(labels) + 52
    plot_w = w - label_w - 70
    vals = [v for _, vs in series for v in vs if v is not None]
    vmax = vmax or nice(max(vals) * 1.05)
    x0 = label_w
    body = []
    if n_s > 1:  # legend, one row above the plot
        lx = 20
        for i, (name, _) in enumerate(series):
            body.append(f'<rect x="{lx}" y="62" width="11" height="11" rx="2" fill="{SERIES[i]}"/>'
                        f'<text x="{lx + 16}" y="72" font-size="12" fill="{INK}">{escape(name)}</text>')
            lx += 30 + 6.6 * len(name)
    for k in range(5):  # recessive grid
        gx = x0 + plot_w * k / 4
        body.append(f'<line x1="{gx:.1f}" y1="{top - 4}" x2="{gx:.1f}" y2="{h - 48}" stroke="{GRID}"/>'
                    f'<text x="{gx:.1f}" y="{h - 36}" font-size="10.5" fill="{INK2}" text-anchor="middle">{_fmt(vmax * k / 4, unit)}</text>')
    for gi, lab in enumerate(labels):
        gy = top + gi * group_h
        body.append(f'<text x="{x0 - 8}" y="{gy + (n_s * (bar_h + gap)) / 2 + 3}" font-size="12" fill="{INK}" text-anchor="end">{escape(lab)}</text>')
        for si, (_, vs) in enumerate(series):
            v = vs[gi]
            y = gy + si * (bar_h + gap)
            if v is None:
                body.append(f'<text x="{x0 + 4}" y="{y + 10}" font-size="10.5" fill="{INK2}">n/a</text>')
                continue
            bw = max(1.5, plot_w * v / vmax)
            body.append(f'<rect x="{x0}" y="{y}" width="{bw:.1f}" height="{bar_h}" rx="3" fill="{SERIES[si]}"/>'
                        f'<text x="{x0 + bw + 5:.1f}" y="{y + 10.5}" font-size="10.5" fill="{INK}">{_fmt(v, unit)}</text>')
    open(path, "w").write(_frame(w, h, title, subtitle, source, "".join(body)))


def line(path, title, subtitle, source, series, unit="", ymax=None, w=760, h=380, notes=()):
    """Line chart. series: [(name, [(x, y), ...]), ...]. notes: [(x, text)] vertical markers."""
    left, right, top, bottom = 64, 150, 70, 46
    xs = [x for _, pts in series for x, _ in pts]
    ys = [y for _, pts in series for _, y in pts]
    xmin, xmax = min(xs), max(xs)
    ymax = ymax or nice(max(ys) * 1.05)
    pw, ph = w - left - right, h - top - bottom
    X = lambda x: left + pw * (x - xmin) / ((xmax - xmin) or 1)
    Y = lambda y: top + ph * (1 - y / ymax)
    body = []
    for k in range(5):
        yv = ymax * k / 4
        body.append(f'<line x1="{left}" y1="{Y(yv):.1f}" x2="{left + pw}" y2="{Y(yv):.1f}" stroke="{GRID}"/>'
                    f'<text x="{left - 6}" y="{Y(yv) + 4:.1f}" font-size="10.5" fill="{INK2}" text-anchor="end">{_fmt(yv, unit)}</text>')
    span = xmax - xmin
    step = 1 if span <= 10 else 2 if span <= 20 else 5
    for x in range(int(xmin), int(xmax) + 1):
        if (x - int(xmin)) % step == 0 or x == xmax:
            body.append(f'<text x="{X(x):.1f}" y="{h - bottom + 16}" font-size="10.5" fill="{INK2}" text-anchor="middle">{x}</text>')
    for nx, text in notes:
        body.append(f'<line x1="{X(nx):.1f}" y1="{top}" x2="{X(nx):.1f}" y2="{top + ph}" stroke="{INK2}" stroke-dasharray="3 3"/>'
                    f'<text x="{X(nx) + 4:.1f}" y="{top + 10}" font-size="10.5" fill="{INK2}">{escape(text)}</text>')
    for si, (name, pts) in enumerate(series):
        c = SERIES[si]
        d = " ".join(f"{'M' if i == 0 else 'L'}{X(x):.1f},{Y(y):.1f}" for i, (x, y) in enumerate(pts))
        body.append(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="2" stroke-linejoin="round"/>')
        for x, y in pts:
            body.append(f'<circle cx="{X(x):.1f}" cy="{Y(y):.1f}" r="4" fill="{c}" stroke="{SURFACE}" stroke-width="2"/>')
        lx, ly = pts[-1]
        body.append(f'<text x="{X(lx) + 9:.1f}" y="{Y(ly) + 4:.1f}" font-size="12" fill="{INK}">{escape(name)} {_fmt(ly, unit)}</text>')
    open(path, "w").write(_frame(w, h, title, subtitle, source, "".join(body)))
