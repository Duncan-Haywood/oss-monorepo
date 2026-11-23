"""Build `tab_sectional.tex`, the section III-B table of the strip near field's sectional flow
against the 3D panel near field (milestones 7zz, 7zza, 7zzb), from the committed results files.

Stdlib only; no number is typed here. Every value is read from a row of
`../experiments/results_sectional_diffraction.txt` (7zz), `results_consistent_excitation.txt` (7zza)
or `results_dx_fixed_point.txt` (7zzb). Band areas are recomputed from the rows (trapezoid on
lambda/L 0.5, 0.7, 1.0, 1.4, 2.0, as each run did) and `check_against_summaries` compares them with
the `over 3D:` / `nf:` summary lines the runs printed, so a misparse fails loudly rather than
publishing a wrong cell.

Run from anywhere: `python3 research/marine-hull/paper/make_table_sectional.py` (prints ok).
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
OUT = os.path.join(HERE, "tab_sectional.tex")
BAND = (0.5, 0.7, 1.0, 1.4, 2.0)

F_7ZZ = "results_sectional_diffraction.txt"
F_7ZZA = "results_consistent_excitation.txt"
F_7ZZB = "results_dx_fixed_point.txt"

# (label, restrained source (file, model) or None, free source (file, model))
ROWS = [
    ("Relative velocity (strip default)", (F_7ZZ, "def"), (F_7ZZ, "def")),
    ("+ depth decay $e^{kz}$", (F_7ZZ, "sd"), (F_7ZZ, "sd")),
    ("+ incident surge on $n_x$, default motions", (F_7ZZ, "sdx"), (F_7ZZ, "sdx")),
    ("+ incident surge on $n_x$, own exciting force", None, (F_7ZZA, "sdx-e")),
    ("+ disturbance $\\partial_x\\phi_D$, fixed point", (F_7ZZB, "dxc"), (F_7ZZB, "dxc")),
]


def parse(path):
    """Rows of every ` lam/L  model ...` table: {(hull, mode, model, lam): {column: value}}.

    hull is 'T' or 'M' (from the `== T` / `== M` headers); mode is 'restrained' or 'free'
    (from `-- restrained --` / `-- free --`; a file with no such marker is all 'free')."""
    out, hull, mode, cols = {}, None, "free", None
    with open(path) as f:
        for line in f:
            if line.startswith("== "):
                m = re.match(r"== ([TM]) ", line)
                hull, mode, cols = (m.group(1) if m else None), "free", None
                continue
            if line.startswith("-- restrained"):
                mode, cols = "restrained", None
                continue
            if line.startswith("-- free"):
                mode, cols = "free", None
                continue
            s = line.split()
            if s[:2] == ["lam/L", "model"]:
                cols = s[2:]
                continue
            if cols is None or hull is None or len(s) < 2:
                continue
            try:
                lam = float(s[0])
            except ValueError:
                cols = None
                continue
            vals = {}
            for c, v in zip(cols, s[2:]):
                try:
                    vals[c] = float(v)
                except ValueError:
                    break
            out[(hull, mode, s[1], lam)] = vals
    return out


def trapezoid(ys, xs=BAND):
    return sum(0.5 * (ys[i] + ys[i + 1]) * (xs[i + 1] - xs[i]) for i in range(len(xs) - 1))


def band_ratio(data, hull, mode, model, ref="3D"):
    a = trapezoid([data[(hull, mode, model, x)]["NF"] for x in BAND])
    b = trapezoid([data[(hull, mode, ref, x)]["NF"] for x in BAND])
    return a / b


def load():
    return {name: parse(os.path.join(EXP, name)) for name in (F_7ZZ, F_7ZZA, F_7ZZB)}


def cells(files):
    """{hull: {'ref': [...], rows: [(label, [r_area, r_WL1, r_ID1, f_area, f_NF4, f_NF8])]}}."""
    table = {}
    for hull in ("T", "M"):
        d = files[F_7ZZ]
        ref = [None,
               d[(hull, "restrained", "3D", 1.0)]["WL"],
               d[(hull, "restrained", "3D", 1.0)]["ID"],
               None,
               d[(hull, "free", "3D", 4.0)]["NF"],
               d[(hull, "free", "3D", 8.0)]["NF"]]
        rows = []
        for label, rsrc, fsrc in ROWS:
            if rsrc is None:
                r = [None, None, None]
            else:
                rd = files[rsrc[0]]
                r = [band_ratio(rd, hull, "restrained", rsrc[1]),
                     rd[(hull, "restrained", rsrc[1], 1.0)]["WL"],
                     rd[(hull, "restrained", rsrc[1], 1.0)]["ID"]]
            fd = files[fsrc[0]]
            f = [band_ratio(fd, hull, "free", fsrc[1]),
                 fd[(hull, "free", fsrc[1], 4.0)]["NF"],
                 fd[(hull, "free", fsrc[1], 8.0)]["NF"]]
            rows.append((label, r + f))
        table[hull] = {"ref": ref, "rows": rows}
    return table


def check_against_summaries(files, table):
    """Recomputed band-area ratios against the summary lines each run printed (3 decimals)."""
    bad = []
    printed = {}
    for name in (F_7ZZ, F_7ZZB):
        with open(os.path.join(EXP, name)) as f:
            hull, mode = None, "free"
            for line in f:
                m = re.match(r"== ([TM]) ", line)
                if m:
                    hull, mode = m.group(1), "free"
                if line.startswith("-- restrained"):
                    mode = "restrained"
                if line.startswith("-- free"):
                    mode = "free"
                if line.startswith("band areas") and "over 3D:" in line and hull:
                    for k, v in re.findall(r"(\S+) ([-\d.]+)(?:,|$)", line.split("over 3D:")[1].strip()):
                        printed[(name, hull, mode, k)] = float(v)
    with open(os.path.join(EXP, F_7ZZA)) as f:
        hull = None
        for line in f:
            m = re.match(r"== ([TM]) ", line)
            if m:
                hull = m.group(1)
            if line.startswith("band area over 3D/panel, nf:") and hull:
                for k, v in re.findall(r"(\S+) ([-\d.]+)(?:,|$)", line.split("nf:")[1].strip()):
                    printed[(F_7ZZA, hull, "free", k)] = float(v)
    n = 0
    for hull in ("T", "M"):
        for (label, rsrc, fsrc), (_, vals) in zip(ROWS, table[hull]["rows"]):
            for src, mode, val in ((rsrc, "restrained", vals[0]), (fsrc, "free", vals[3])):
                if src is None:
                    continue
                key = (src[0], hull, mode, src[1])
                if key not in printed:
                    bad.append(f"no printed summary for {key}")
                    continue
                n += 1
                if abs(round(val, 3) - printed[key]) > 0.0015:
                    bad.append(f"{key}: recomputed {val:.4f}, printed {printed[key]:.3f}")
    return bad, n


def fmt(v, nd=3):
    if v is None:
        return "--"
    s = f"{v:.{nd}f}"
    if s.startswith("-"):
        s = "$-$" + s[1:]
    if s in ("0." + "0" * nd, "$-$0." + "0" * nd):
        s = "0"
    return s


def render(table):
    hulls = {"T": "Tank hull (modified Wigley, $L/B$ 6.67)", "M": "Monohull (Wigley, $L/B$ 10)"}
    lines = [
        "% generated by make_table_sectional.py from results_sectional_diffraction.txt,",
        "% results_consistent_excitation.txt and results_dx_fixed_point.txt; do not edit by hand",
        "\\begin{tabular}{@{}lrrrrrr@{}}",
        "\\toprule",
        " & \\multicolumn{3}{c}{Restrained} & \\multicolumn{3}{c}{Free} \\\\",
        "\\cmidrule(lr){2-4}\\cmidrule(l){5-7}",
        "Sectional body condition & Area & WL$_1$ & ID$_1$ & Area & NF$_4$ & NF$_8$ \\\\",
    ]
    for hull in ("T", "M"):
        t = table[hull]
        lines.append("\\midrule")
        lines.append(f"\\multicolumn{{7}}{{@{{}}l}}{{\\emph{{{hulls[hull]}}}}} \\\\")
        ref = t["ref"]
        lines.append("3D panel (reference) & 1 & " + " & ".join(
            [fmt(ref[1]), fmt(ref[2]), "1", fmt(ref[4], 4), fmt(ref[5], 4)]) + " \\\\")
        for label, v in t["rows"]:
            lines.append(label + " & " + " & ".join(
                [fmt(v[0]), fmt(v[1]), fmt(v[2]), fmt(v[3]), fmt(v[4], 4), fmt(v[5], 4)]) + " \\\\")
    lines += ["\\bottomrule", "\\end{tabular}", ""]
    return "\n".join(lines)


def main():
    files = load()
    table = cells(files)
    bad, n = check_against_summaries(files, table)
    for b in bad:
        print("MISMATCH", b)
    if bad:
        return 1
    with open(OUT, "w") as f:
        f.write(render(table))
    print(f"wrote {os.path.relpath(OUT)}; {n} band areas match the printed summaries; ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
