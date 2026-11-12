"""Build the venue-format LaTeX paper from draft.md.

draft.md stays the one source that runs edit and that check_numbers.py checks;
this script turns it into build/main.tex (a two-column article with numbered
BibTeX references from refs.bib) and, with --pdf, compiles build/main.pdf.

    python3 paper/build_tex.py          # writes paper/build/main.tex
    python3 paper/build_tex.py --pdf    # also converts the SVG figures and runs pdflatex + bibtex

Stdlib only. --pdf needs pdflatex, bibtex and rsvg-convert
(apt-get install texlive-latex-recommended texlive-fonts-recommended texlive-latex-extra librsvg2-bin).

The markdown it understands is what draft.md uses: '#', '##' headings, bold
run-in paragraph heads ('**3.6e Title.** text'), *italic*, **bold**, `code`,
<sub>/<sup>, &minus;, pipe tables, numbered lists, ![alt](figure.svg) and one
fenced code block. Citations: the patterns in CITES below become \\cite{key};
any other doi:/arXiv: token is kept as text and listed by --check, so a new
reference shows up as a missing BibTeX entry instead of silently.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE / "draft.md"
BIB = HERE / "refs.bib"
OUT = HERE / "build"

# (regex on the markdown, replacement markdown). Applied in order, before escaping.
# '\x00cite{k}\x00' is a placeholder that survives escaping and becomes \cite{k}.
def C(*keys: str) -> str:
    return "\x00cite{" + ",".join(keys) + "}\x00"

CITES: list[tuple[str, str]] = [
    (r"\s*\(\*Energies\* 10\(5\), 687, 2017, doi:10\.3390/en10050687\)", "\x02" + C("vukovic2017")),
    (r"\s*\(\*Proc\. IMechE Part I\* 225\(2\), 2011, doi:10\.1243/09596518JSCE1111\)", "\x02" + C("eriksson2011")),
    (r"Pearce, \*Science\* 337, 2012", "Pearce\x02" + C("pearce2012")),
    (r"Pearce \(doi:10\.1126/science\.1228183\)", "Pearce\x02" + C("pearce2012")),
    (r"HEAP \(arXiv:2106\.05059\)", "HEAP\x02" + C("jud2021heap")),
    (r"Khadim et al\., IEEE Access 10:62863, 2022, doi:10\.1109/ACCESS\.2022\.3179591",
     "Khadim et al.\x02" + C("khadim2022")),
    (r"Halim et al\., Int\. J\. Current Science Research and Review 8\(11\):5863, 2025, "
     r"doi:10\.47191/ijcsrr/V8-i11-43, Zenodo 10\.5281/zenodo\.17760471",
     "Halim et al.\x02" + C("halim2025", "halim2025data")),
    (r"Zenodo doi:10\.5281/zenodo\.10639199", C("linjama2024")),
    (r"Mendeley Data 10\.17632/rn5j42rpyr\.1", C("saeed2026")),
    (r"Arrinda et al\., Zenodo 18862594", "Arrinda et al.\x02" + C("arrinda2026")),
    (r"Zenodo 18862594", C("arrinda2026")),
    (r"(`fuxi-robot/excavator-motion` dataset on Hugging Face)", "\\1\x02" + C("fuxi_excavator_motion")),
    (r"Juza and Hermanek \(2023, doi:10\.17221/77/2021-RAE\)", "Juza and Hermanek (2023)\x02" + C("juza2023")),
    (r"Williamson \(Purdue PhD thesis, 2010\)", "Williamson (Purdue PhD thesis, 2010)\x02" + C("williamson2010")),
    (r"Briganti \(Politecnico di Torino MSc thesis, 2021/22\)", "Briganti (Politecnico di Torino MSc thesis, 2021/22)\x02" + C("briganti2022")),
    (r"Open Source Ecology\)", "Open Source Ecology\x02" + C("ose_gvcs") + ")"),
    (r"Reece's earthmoving equation", "Reece's earthmoving equation\x02" + C("reece1964")),
    (r"Salami VD8A sectional-valve catalogue \(", "Salami VD8A sectional-valve catalogue\x02" + C("salami_vd8a") + " ("),
    (r"Rexroth Canada's A10VO manual \(Module 3A, s\. 7\.2\)", "Rexroth Canada's A10VO manual (Module 3A, s. 7.2)\x02" + C("rexroth_a10vo")),
    (r"Danfoss's PVG 32 Technical Information \(BC152886483664, rev\. May 2021, p\. 16\)",
     "Danfoss's PVG 32 Technical Information (p. 16)\x02" + C("danfoss_pvg32_2021")),
    (r"the manual's July 2024 revision \(p\. 99,", "the manual's July 2024 revision\x02" + C("danfoss_pvg32_2024") + " (p. 99,"),
    (r"published cylinders of the XCMG XE80E \(", "published cylinders of the XCMG XE80E\x02" + C("xcmg_xe80e") + " ("),
    # generic fallbacks for the same records cited in another wording
    (r"doi:10\.3390/en10050687", C("vukovic2017")),
    (r"doi:10\.1243/09596518JSCE1111", C("eriksson2011")),
    (r"doi:10\.1126/science\.1228183", C("pearce2012")),
    (r"doi:10\.1109/ACCESS\.2022\.3179591", C("khadim2022")),
    (r"doi:10\.47191/ijcsrr/V8-i11-43", C("halim2025")),
    (r"doi:10\.5281/zenodo\.10639199", C("linjama2024")),
    (r"doi:10\.17221/77/2021-RAE", C("juza2023")),
]

TOKEN = re.compile(r"(?:doi:|arXiv:)\S+")
# '*Figure N (source): caption.*' on one line, right after its image
FIGCAP = re.compile(r"^\*Figure (\d+) \((.+?)\): (.+)\*$")


def escape(s: str) -> str:
    out = []
    for ch in s:
        out.append({
            "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#",
            "_": r"\_", "{": r"\{", "}": r"\}", "~": r"$\sim$", "^": r"\textasciicircum{}",
            "<": r"\textless{}", ">": r"\textgreater{}",
        }.get(ch, ch))
    return "".join(out)


def inline(md: str) -> str:
    """Markdown inline -> LaTeX. Citations first, then emphasis markers (which may
    span code spans), then code spans and escaping, then the markers become commands."""
    for pat, rep in CITES:
        md = re.sub(pat, rep, md)
    md = md.replace("&minus;", "\x01")
    codes: list[str] = []

    def hold(m: re.Match) -> str:
        codes.append(m.group(0))
        return f"\x06{len(codes) - 1}\x06"

    md = re.sub(r"`[^`]*`", hold, md)
    md = re.sub(r"\*\*(.+?)\*\*", "\x03\\1\x05", md)
    md = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", "\x04\\1\x05", md)
    md = re.sub(r"\x06(\d+)\x06", lambda m: codes[int(m.group(1))], md)
    parts = re.split(r"(`[^`]*`|\x00cite\{[^}]*\}\x00|<su[bp]>|</su[bp]>|\[[^\]]+\]\([^)]+\))", md)
    out = []
    for p in parts:
        if not p:
            continue
        if p.startswith("`") and p.endswith("`") and len(p) >= 2:
            out.append(r"\texttt{" + escape(p[1:-1]).replace("/", r"/\allowbreak{}").replace(r"\_", r"\_\allowbreak{}") + "}")
        elif p.startswith("\x00cite"):
            out.append("\\" + p.strip("\x00"))
        elif p in ("<sub>", "<sup>"):
            out.append(r"\textsubscript{" if p == "<sub>" else r"\textsuperscript{")
        elif p in ("</sub>", "</sup>"):
            out.append("}")
        elif p.startswith("["):
            m = re.match(r"\[([^\]]+)\]\(([^)]+)\)", p)
            text, url = m.group(1), m.group(2)
            if url.startswith("http"):
                out.append(escape(text) + r"\footnote{\url{" + url.replace("%", r"\%").replace("#", r"\#") + "}}")
            else:
                out.append(escape(text) + r" (\texttt{" + escape(url) + "})")
        else:
            out.append(escape(p))
    s = "".join(out)
    for k, v in {"\x01": r"\textminus{}", "\x02": "~", "\x03": r"\textbf{", "\x04": r"\emph{", "\x05": "}"}.items():
        s = s.replace(k, v)
    return s


def heading_text(line: str) -> str:
    return line.lstrip("#").strip()


def convert(md: str) -> tuple[str, list[str]]:
    lines = md.splitlines()
    title = heading_text(lines[0]) if lines and lines[0].startswith("# ") else "Draft"
    body: list[str] = []
    note = ""
    i = 1
    in_abstract = False
    figures = []
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            j = i + 1
            block = []
            while j < len(lines) and not lines[j].startswith("```"):
                block.append(lines[j])
                j += 1
            body.append(r"\begin{Verbatim}[breaklines,breakanywhere,fontsize=\scriptsize]" + "\n" + "\n".join(block) + "\n" + r"\end{Verbatim}")
            i = j + 1
            continue
        if line.startswith("## "):
            if in_abstract:
                body.append(r"\end{abstract}")
                in_abstract = False
            h = heading_text(line)
            if h.lower() == "abstract":
                body.append(r"\begin{abstract}")
                in_abstract = True
            else:
                h = re.sub(r"^\d+\.\s*", "", h)
                body.append(r"\section{" + inline(h) + "}")
            i += 1
            continue
        if line.startswith("### "):
            body.append(r"\subsection{" + inline(heading_text(line)) + "}")
            i += 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            n = len(rows[0])
            spec = r"p{0.36\linewidth}" + "r" * (n - 2) + r"p{0.22\linewidth}" if n > 2 else "l" * n
            t = [r"\begin{table*}[t]\centering\small", r"\begin{tabular}{" + spec + "}", r"\hline"]
            for k, r in enumerate(rows):
                t.append(" & ".join(inline(c) for c in r) + r" \\" + (r" \hline" if k == 0 else ""))
            t += [r"\hline", r"\end{tabular}", r"\end{table*}"]
            body.append("\n".join(t))
            continue
        m = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line)
        if m:
            src = (DRAFT.parent / m.group(2)).resolve()
            figures.append(src)
            caption, label = inline(m.group(1)), ""
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            fm = FIGCAP.match(lines[j]) if j < len(lines) else None
            if fm:
                # the draft's own caption replaces the alt text; its number must be the next one
                if int(fm.group(1)) != len(figures):
                    raise ValueError(f"draft figure {fm.group(1)} is image {len(figures)}: number them in order")
                text = fm.group(3)
                caption = inline(text[:1].upper() + text[1:]) + " Source: " + inline(fm.group(2)) + "."
                label = r"\label{fig:" + fm.group(1) + "}"
                i = j
            body.append("\n".join([
                r"\begin{figure}[t]\centering",
                r"\includegraphics[width=\linewidth]{fig/" + src.stem + "}",
                r"\caption{" + caption + "}" + label,
                r"\end{figure}",
            ]))
            i += 1
            continue
        if re.match(r"\d+\. ", line):
            items = []
            while i < len(lines) and re.match(r"\d+\. ", lines[i]):
                items.append(r"\item " + inline(re.sub(r"^\d+\.\s*", "", lines[i])))
                i += 1
            body.append("\\begin{enumerate}\n" + "\n".join(items) + "\n\\end{enumerate}")
            continue
        if not line.strip():
            i += 1
            continue
        # a paragraph: lines up to the next blank line
        para = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(("#", "|", "```", "![")):
            para.append(lines[i])
            i += 1
        text = " ".join(para)
        if not note and text.startswith("*Draft"):
            note = inline(text.strip("*"))
            continue
        rm = re.match(r"\*\*(\d+\.\d+[a-z]?) (.+?)\*\*\s*(.*)$", text)
        if rm:
            body.append(r"\paragraph{" + inline(rm.group(1) + " " + rm.group(2)) + "}\n" + inline(rm.group(3)))
        else:
            body.append(inline(text))
    if in_abstract:
        body.append(r"\end{abstract}")

    tex = "\n".join([
        r"% GENERATED by paper/build_tex.py from paper/draft.md; edit the markdown, not this file.",
        r"\documentclass[10pt,twocolumn]{article}",
        r"\usepackage[T1]{fontenc}",
        r"\usepackage{lmodern,microtype,graphicx,textcomp}",
        r"\usepackage[margin=2cm]{geometry}",
        r"\usepackage[hidelinks]{hyperref}",
        r"\usepackage{url,fvextra}",
        r"\setcounter{secnumdepth}{2}",
        r"\title{" + inline(title) + r"\thanks{" + note + "}}",
        r"\author{Draft for review; author list to be set by the owner before submission}",
        r"\date{}",
        r"\begin{document}",
        r"\maketitle",
        *body,
        r"\bibliographystyle{unsrt}",
        r"\bibliography{refs}",
        r"\end{document}",
        "",
    ])
    return tex, [str(f) for f in figures]


def bib_keys(bib: str) -> set[str]:
    return set(re.findall(r"@\w+\{([^,\s]+),", bib))


def check(tex: str, md: str) -> list[str]:
    """Problems a reviewer would see: unknown cite keys, unbalanced braces, uncited tokens."""
    problems = []
    keys = bib_keys(BIB.read_text())
    for group in re.findall(r"\\cite\{([^}]*)\}", tex):
        for k in group.split(","):
            if k not in keys:
                problems.append(f"\\cite{{{k}}} has no entry in refs.bib")
    depth = 0
    for ch in re.sub(r"\\[{}]", "", tex.split(r"\begin{document}")[1].replace(r"\begin{Verbatim}", "").split(r"\end{document}")[0]):
        depth += ch == "{"
        depth -= ch == "}"
        if depth < 0:
            break
    if depth != 0:
        problems.append(f"unbalanced braces (depth {depth})")
    body = tex.split(r"\begin{document}")[1]
    body = re.sub(r"\\begin\{Verbatim\}.*?\\end\{Verbatim\}", "", body, flags=re.S)
    for tok in sorted(set(re.findall(r"(?:doi:|arXiv:)[^\s,;)}]+", body.replace(r"\_", "_")))):
        problems.append(f"uncited reference token left as text: {tok} (add a refs.bib entry and a CITES pattern)")
    return problems


def build_pdf(figures: list[str]) -> None:
    (OUT / "fig").mkdir(parents=True, exist_ok=True)
    for f in figures:
        subprocess.run(["rsvg-convert", "-f", "pdf", "-o", str(OUT / "fig" / (Path(f).stem + ".pdf")), f], check=True)
    shutil.copy(BIB, OUT / "refs.bib")
    run = lambda *c: subprocess.run(c, cwd=OUT, check=True, stdout=subprocess.DEVNULL)
    run("pdflatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex")
    run("bibtex", "main")
    run("pdflatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex")
    run("pdflatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex")
    log = (OUT / "main.log").read_text(errors="replace")
    undefined = re.findall(r"Citation `([^']+)' .*undefined", log)
    pages = re.search(r"Output written on main\.pdf \((\d+) pages?", log)
    print(f"pdf: {OUT / 'main.pdf'} ({pages.group(1) if pages else '?'} pages); undefined citations: {len(undefined)}")
    if undefined:
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", action="store_true", help="also convert figures and compile the PDF")
    a = ap.parse_args()
    md = DRAFT.read_text()
    tex, figures = convert(md)
    OUT.mkdir(exist_ok=True)
    (OUT / "main.tex").write_text(tex)
    problems = check(tex, md)
    cites = len(set(k for g in re.findall(r"\\cite\{([^}]*)\}", tex) for k in g.split(",")))
    print(f"tex: {OUT / 'main.tex'}; {len(figures)} figures; {cites} distinct references cited; {len(problems)} problems")
    for p in problems:
        print("  " + p)
    if a.pdf:
        build_pdf(figures)
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
