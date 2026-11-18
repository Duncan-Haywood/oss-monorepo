"""Shared helpers for experiments/figure.py: parse a results.txt block and draw a line plot or a bar chart as SVG.

A project's figure.py is then a few lines (see research/workcell-twin/experiments/figure.py):

    import sys; from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_shared"))
    from linefig import table, write_lines

For categories (methods, causes, label types) use `table(..., xtext=True)` to keep the
first column as text and `write_bars` for horizontal bars with optional intervals.

Numbers come from the committed results.txt, never retyped. Stdlib only.
"""
import math
import re
from pathlib import Path

# The first four are the original palette (figures with up to four series draw as
# before); four more so a fifth series no longer repeats the first colour (friction
# 2026-11-18: society-lanes m6g_figure.py recoloured its fifth line by string patching).
COLS = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad", "#222222", "#d68910", "#17a2b8", "#7f5539"]

LEGEND_PITCH = 170  # px per entry while every label fits its slot (the original layout)
CHAR_W = 6.2  # px, a generous width for one 11 px sans-serif character


def legend_slots(names, left, right, pitch=LEGEND_PITCH):
    """[(x, row)] for each legend entry: the original fixed `pitch` while every entry fits
    its slot and the row fits before `right`; otherwise entries packed by their label width,
    wrapping to further rows. A five-series figure ran its fixed 170 px pitch past the 640 px
    width (friction 2026-11-18); long labels at four series overlapped the next entry."""
    widths = [20 + CHAR_W * len(str(n)) + 14 for n in names]
    fixed = all(w <= pitch for w in widths) and (
        not names or left + pitch * (len(names) - 1) + widths[-1] - 14 <= right)
    if fixed:
        return [(left + pitch * j, 0) for j in range(len(names))]
    out, x, row = [], left, 0
    for w in widths:
        if x > left and x + w - 14 > right:
            x, row = left, row + 1
        out.append((x, row))
        x += w
    return out


# "0.3818(0.0020)" and "0.38±0.02" / "0.38+-0.02": a value with its standard error
# or interval, as many results.txt files print it. table() reads the value; before
# this, such a row parsed as no number and was skipped (friction 2026-11-13: a figure
# had to read the JSON and call write_lines by hand).
_WITH_ERR = re.compile(r"^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(?:\([^()]*\)|(?:±|\+-|\+/-)\S*)$")


def num(tok):
    """float(tok), or the leading value of a value(se) / value±err token; None if neither."""
    try:
        return float(tok)
    except ValueError:
        m = _WITH_ERR.match(tok)
        return float(m.group(1)) if m else None


def table(text, section, xcol, ycols, maxrows=None, sep=None, xtext=False):
    """Numeric rows of the results.txt block that starts with `section`; skips rows whose x is not a number.

    `text` is a list of lines or one string. `section` is a prefix of the heading line ("== C." matches a line
    "== C. ..."); runs of "=" and spaces are ignored, so "C." matches too.
    The block ends at the next line starting "==" or like "1. " / "E3".
    Cells split on whitespace; pass sep="|" for markdown-style tables (cells are stripped, empty edge cells dropped).
    xtext=True keeps the x cell as text (a category label for svg_bars) instead of requiring a number;
    rows are still kept only when every y cell is numeric, so header and rule lines drop out. With
    whitespace splitting a label is one token: use sep="|" for labels with spaces.
    """
    if isinstance(text, str):
        text = text.splitlines()
    xs, ys, on = [], [[] for _ in ycols], False
    flat = lambda t: re.sub(r"[=\s]+", " ", t).strip()
    for l in text:
        if l.startswith(section) or (flat(section) and flat(l).startswith(flat(section))):
            on = True
            continue
        if on and (l.startswith("==") or (re.match(r"(\d\. |E\d)", l) and not flat(l).startswith(flat(section)))):
            break
        p = l.split()
        if sep:
            p = [c.strip() for c in l.split(sep)]
            if p and not p[0]:
                p = p[1:]
        if on and len(p) > max([xcol] + ycols) and (xtext or num(p[xcol]) is not None) and all(num(p[c]) is not None for c in ycols):
            xs.append(p[xcol] if xtext else num(p[xcol]))
            for k, c in enumerate(ycols):
                ys[k].append(num(p[c]))
            if maxrows and len(xs) == maxrows:
                break
    if not xs:
        heads = [l.rstrip() for l in text if l.startswith("==")][:8]
        raise SystemExit("no rows parsed for section %r; headings starting '==' are: %s" % (section, heads))
    return xs, ys


def svg_lines(title, alt, xlabel, ylabel, series, logx=False, logy=False, hline=None, vline=None, xticks=None):
    """A line plot as SVG text. `hline` draws a dashed reference line at that y; `vline`
    one at that x (a number, or a list of them), e.g. a break-even or design value
    (friction 2026-11-13: a decision curve could not mark its 1.48 L/h reference).
    A vline outside the data's x range widens the axis to show it. `xticks` overrides the x tick
    positions (default: the data's x values, thinned to 8), for series on uneven, dense x grids."""
    vlines = [] if vline is None else ([vline] if isinstance(vline, (int, float)) else list(vline))
    W, H, L, R, T, B = 640, 380, 64, 16, 56, 56
    slots = legend_slots([n for n, _, _ in series], L, W - R)
    extra = 14 * max((r for _, r in slots), default=0)  # each further legend row
    H, T = H + extra, T + extra
    fx = math.log10 if logx else (lambda v: v)
    fy = math.log10 if logy else (lambda v: v)
    xs_all = [fx(x) for _, xs, _ in series for x in xs] + [fx(v) for v in vlines if v > 0 or not logx]
    ys_all = [fy(y) for _, _, ys in series for y in ys if (y > 0 or not logy)] + ([fy(hline)] if hline is not None and (hline > 0 or not logy) else [])
    x0, x1 = min(xs_all), max(xs_all)
    y0, y1 = min(ys_all), max(ys_all)
    if not logy:
        y0 = min(y0, 0)
    pad = (y1 - y0) * 0.06 or 1
    y1 += pad
    if logy:
        y0 -= pad
    px = lambda x: L + (fx(x) - x0) / ((x1 - x0) or 1) * (W - L - R)
    py = lambda y: T + (1 - (fy(y) - y0) / (y1 - y0)) * (H - T - B)
    f = 'font-family="sans-serif"'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">{title}</text>']
    if logy:
        ticks = _log_ticks(y0, y1)
    else:
        step = 10 ** math.floor(math.log10((y1 - y0) / 4))
        step *= min((1, 2, 5, 10), key=lambda m: abs((y1 - y0) / (m * step) - 5))
        ticks = [k * step for k in range(math.ceil(y0 / step), math.floor(y1 / step) + 1)]
    for v in ticks:
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" {f} font-size="11">{v:g}</text>')
    xt = sorted({x for _, xs, _ in series for x in xs})
    if logx:
        dec = [10 ** k for k in range(math.ceil(x0), math.floor(x1) + 1)]
        xt = dec if len(dec) >= 3 else xt
    if len(xt) > 8:
        xt = xt[:: math.ceil(len(xt) / 8)]
    if xticks is not None:
        xt = list(xticks)
    for v in xt:
        o.append(f'<text x="{px(v):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{v:g}</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" {f} font-size="12">{xlabel}</text>')
    o.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">{ylabel}</text>')
    if hline is not None and (hline > 0 or not logy):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(hline):.1f}" y2="{py(hline):.1f}" stroke="#555" stroke-dasharray="4 3"/>')
    for v in vlines:
        if v > 0 or not logx:
            o.append(f'<line x1="{px(v):.1f}" x2="{px(v):.1f}" y1="{T}" y2="{H-B}" stroke="#555" stroke-dasharray="4 3"/>')
    for j, (n, xs, ys) in enumerate(series):
        c = COLS[j % len(COLS)]
        pts = [(px(x), py(y)) for x, y in zip(xs, ys) if y > 0 or not logy]
        o.append('<polyline points="' + " ".join(f"{a:.1f},{b:.1f}" for a, b in pts) + f'" fill="none" stroke="{c}" stroke-width="2"/>')
        o += [f'<circle cx="{a:.1f}" cy="{b:.1f}" r="3" fill="{c}"/>' for a, b in pts]
        lx, row = slots[j]
        ly = 32 + 14 * row
        o.append(f'<rect x="{lx:g}" y="{ly}" width="14" height="10" fill="{c}"/><text x="{lx+20:g}" y="{ly+9}" {f} font-size="11">{n}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def _esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _log_ticks(lo, hi):
    """Tick values for a log axis spanning 10**lo..10**hi: whole decades when there are
    at least three, else 1-2-5 steps, else plain linear steps inside the range
    (friction 2026-11-18: logy over 0.17 to 2.2 drew a single tick, at 1)."""
    dec = [10 ** k for k in range(math.ceil(lo - 1e-9), math.floor(hi + 1e-9) + 1)]
    if len(dec) >= 3:
        return dec
    sub = [m * 10 ** k for k in range(math.floor(lo) - 1, math.ceil(hi) + 1) for m in (1, 2, 5)]
    sub = [v for v in sub if lo - 1e-9 <= math.log10(v) <= hi + 1e-9]
    if len(sub) >= 3:
        return sub
    a, b = 10 ** lo, 10 ** hi
    return [v for v in _ticks(a, b) if v > 0 and a <= v <= b]


def _ticks(lo, hi, n=5):
    step = 10 ** math.floor(math.log10((hi - lo) / 4))
    step *= min((1, 2, 5, 10), key=lambda m: abs((hi - lo) / (m * step) - n))
    return [k * step for k in range(math.ceil(lo / step - 1e-9), math.floor(hi / step + 1e-9) + 1)]


def svg_bars(title, alt, xlabel, cats, series, errs=None, ref=None, fmt="{:g}"):
    """A horizontal bar chart as SVG text: one row per category, one bar per series in each row.

    `cats` are the row labels; `series` is [(name, values)] with one value per category (a
    single series draws without a legend). `errs`, if given, is one list per series of
    (lo, hi) intervals or None, drawn as whiskers. `ref` draws a dashed reference line at
    that value (a number or a list). Each bar is labelled with fmt.format(value).
    The value axis always includes 0, so negative effects draw left of it.
    (friction 2026-11-17/18: categorical effect-by-cause and label-count figures had to
    hand-write ~70-line bar SVGs; 133 figure scripts outside linefig draw bars or categories.)
    """
    cats = list(cats)
    for name, vals in series:
        if len(vals) != len(cats):
            raise ValueError("series %r has %d values for %d categories" % (name, len(vals), len(cats)))
    refs = [] if ref is None else ([ref] if isinstance(ref, (int, float)) else list(ref))
    errs = errs or [None] * len(series)
    ns = len(series)
    bh = 16 if ns > 1 else 22  # bar height
    rowh = ns * bh + 12
    W = 640
    L = int(min(260, max(60, 12 + 6.6 * max((len(str(c)) for c in cats), default=4))))
    legend = ns > 1
    slots = legend_slots([n for n, _ in series], L, W - 16) if legend else []
    T = 40 + ((14 * (max(r for _, r in slots) + 1) + 6) if legend else 0)
    B = 44
    H = T + rowh * len(cats) + B
    vals = [v for _, vs in series for v in vs]
    for e in errs:
        for iv in e or []:
            if iv is not None:
                vals += list(iv)
    lo, hi = min(vals + refs + [0]), max(vals + refs + [0])
    if hi == lo:
        hi = lo + 1
    # room for the value labels drawn past each bar's end, so a negative bar's label
    # never runs into the category labels and a positive one never leaves the frame
    labw = lambda sign: max([6 + 5.6 * len(fmt.format(v)) for _, vs in series for v in vs
                             if (v < 0) == (sign < 0)] or [0])
    PL, PR = L + labw(-1), W - max(16, labw(1))
    px = lambda v: PL + (v - lo) / ((hi - lo) or 1) * (PR - PL)
    f = 'font-family="sans-serif"'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{_esc(alt)}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">{_esc(title)}</text>']
    for v in _ticks(lo, hi):
        o.append(f'<line x1="{px(v):.1f}" x2="{px(v):.1f}" y1="{T}" y2="{H-B}" stroke="#ddd"/>'
                 f'<text x="{px(v):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{v:g}</text>')
    o.append(f'<line x1="{px(0):.1f}" x2="{px(0):.1f}" y1="{T}" y2="{H-B}" stroke="#555"/>')
    o.append(f'<text x="{(PL+PR)/2:.1f}" y="{H-10}" text-anchor="middle" {f} font-size="12">{_esc(xlabel)}</text>')
    for i, c in enumerate(cats):
        y0 = T + i * rowh + 6
        o.append(f'<text x="{L-8}" y="{y0 + ns*bh/2 + 4:.1f}" text-anchor="end" {f} font-size="12">{_esc(c)}</text>')
        for j, (name, vs) in enumerate(series):
            v, col, y = vs[i], COLS[j % len(COLS)], y0 + j * bh
            a, b = sorted((px(0), px(v)))
            o.append(f'<rect x="{a:.1f}" y="{y}" width="{b-a:.1f}" height="{bh-3}" fill="{col}"/>')
            iv = (errs[j] or [None] * len(cats))[i]
            end = b if v >= 0 else a
            if iv is not None:
                m = y + (bh - 3) / 2
                o.append(f'<line x1="{px(iv[0]):.1f}" x2="{px(iv[1]):.1f}" y1="{m:.1f}" y2="{m:.1f}" stroke="#222" stroke-width="1.5"/>')
                end = max(px(iv[1]), b) if v >= 0 else min(px(iv[0]), a)
            lab = fmt.format(v)
            if v >= 0:
                o.append(f'<text x="{end+4:.1f}" y="{y+bh-6}" {f} font-size="10">{_esc(lab)}</text>')
            else:
                o.append(f'<text x="{end-4:.1f}" y="{y+bh-6}" text-anchor="end" {f} font-size="10">{_esc(lab)}</text>')
    for v in refs:
        o.append(f'<line x1="{px(v):.1f}" x2="{px(v):.1f}" y1="{T}" y2="{H-B}" stroke="#555" stroke-dasharray="4 3"/>')
    for j, (name, _) in enumerate(series if legend else []):
        lx, row = slots[j]
        ly = 32 + 14 * row
        o.append(f'<rect x="{lx:g}" y="{ly}" width="14" height="10" fill="{COLS[j % len(COLS)]}"/><text x="{lx+20:g}" y="{ly+9}" {f} font-size="11">{_esc(name)}</text>')
    o.append("</svg>")
    return "\n".join(o) + "\n"


def write_bars(here, fname, *args, **kw):
    """Draw svg_bars(...) to here/fname and print the path."""
    path = Path(here) / fname
    path.write_text(svg_bars(*args, **kw))
    print("wrote", path)


def write_lines(here, fname, *args, **kw):
    """Draw svg_lines(...) to here/fname and print the path, as the per-project copies did."""
    path = Path(here) / fname
    path.write_text(svg_lines(*args, **kw))
    print("wrote", path)
