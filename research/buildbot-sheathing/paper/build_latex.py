"""Build the Elsevier (elsarticle) manuscript from paper/draft.md.

    python3 paper/build_latex.py          # writes paper/latex/manuscript.tex
    python3 paper/build_latex.py --pdf    # and compiles it (pdflatex + bibtex)

draft.md stays the one source. This script turns its author-year citations into natbib
commands keyed to references.bib, moves the highlights, abstract and keywords into the
elsarticle front matter, lets LaTeX number the sections, tables and figures (after checking
the draft numbers them in order, so its cross-references stay true), maps every non-ASCII
character it meets to a LaTeX command and fails on one it does not know, and converts the body
with pandoc. It fails if a citation is left unconverted, a key is missing from the .bib file or
a .bib entry is cited nowhere. Needs pandoc; --pdf also needs pdflatex, bibtex and elsarticle
(texlive-publishers).
"""
import pathlib
import re
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
DRAFT = HERE / "draft.md"
BIB = HERE / "references.bib"
OUT = HERE / "latex"

# In-text name and year as the draft writes them -> references.bib key.
CITES = [
    ("Sandy et al.", "2016", "sandy2016repositioning"),
    ("Giftthaler et al.", "2017", "giftthaler2017insitu"),
    ("Lachmayer et al.", "2022", "lachmayer2022"),
    ("Willmann et al.", "2016", "willmann2016timber"),
    ("Adel et al.", "2024, data", "adel2024data"),
    ("Adel et al.", "2024", "adel2024feedback"),
    ("Kumagai et al.", "2019", "kumagai2019plasterboard"),
    ("Cote et al.", "2024", "cr2024woodframes"),
    ("Chase and Parkinson", "1991", "chase1991survey"),
    ("Todorov et al.", "2012", "todorov2012mujoco"),
    ("Castro et al.", "2023", "castro2023sap"),
    ("Castro et al.", "2020", "castro2020tamsi"),
    ("Zakka et al.", "2025", "zakka2025playground"),
    ("Tobin et al.", "2017", "tobin2017domain"),
    ("Källsner and Girhammar", "2009", "kallsner2009plastic"),
    ("Shameli Derakshan et al.", "2019", "shameli2019loading"),
    ("Weiss", "2017", "weiss2017decay"),
    ("Krawinkler et al.", "2001", "krawinkler2001curee"),
    ("Folz and Filiatrault", "2001", "folz2001cyclic"),
    ("Judd and Fonseca", "2005", "judd2005oriented"),
    ("Anderson et al.", "2007", "anderson2007fyb"),
    ("Rahnama and Krawinkler", "1993", "rahnama1993soft"),
    ("Ibarra et al.", "2005", "ibarra2005hysteretic"),
    ("Ghazinader", "2024", "ghazinader2024"),
    ("Buchalter et al.", "2002", "buchalter2002nailgun"),
    ("Lowe et al.", "2014", "lowe2014nailgun"),
]
# Standards the draft names without an author-year citation; listed in the references.
NOCITE = ["awc_nds", "awc_sdpws", "apa_buildertips", "ps2"]

UNICODE = {
    "–": "--", "—": "---", "°": r"\ensuremath{^\circ}", "−": r"\ensuremath{-}",
    "μ": r"\ensuremath{\mu}", "σ": r"\ensuremath{\sigma}", "×": r"\ensuremath{\times}",
    "θ": r"\ensuremath{\theta}", "γ": r"\ensuremath{\gamma}", "±": r"\ensuremath{\pm}",
    "·": r"\ensuremath{\cdot}", "²": r"\ensuremath{^2}", "³": r"\ensuremath{^3}",
    "∞": r"\ensuremath{\infty}", "₀": r"\ensuremath{_0}", "⁻": r"\ensuremath{^-}",
    "¹": r"\ensuremath{^1}", "ᵀ": r"\ensuremath{^\mathsf{T}}", "⁴": r"\ensuremath{^4}",
    "⁵": r"\ensuremath{^5}", "⁷": r"\ensuremath{^7}", "ä": r"\"a", "ö": r"\"o",
    "é": r"\'e", "λ": r"\ensuremath{\lambda}", "Δ": r"\ensuremath{\Delta}",
    "≤": r"\ensuremath{\leq}", "∂": r"\ensuremath{\partial}", "≥": r"\ensuremath{\geq}", "≈": r"\ensuremath{\approx}",
    "→": r"\ensuremath{\rightarrow}", "’": "'", "‘": "`", "“": "``", "”": "''",
    "α": r"\ensuremath{\alpha}", "δ": r"\ensuremath{\delta}", "β": r"\ensuremath{\beta}", "Σ": r"\ensuremath{\Sigma}",
    "√": r"\ensuremath{\surd}", "…": r"\ldots{}", "\u00a0": "~",
}

PREAMBLE = r"""\documentclass[preprint,12pt,authoryear]{elsarticle}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{longtable,booktabs,array,calc}
\usepackage[hidelinks]{hyperref}
\usepackage{xurl}
\providecommand{\tightlist}{\setlength{\itemsep}{0pt}\setlength{\parskip}{0pt}}
\providecommand{\pandocbounded}[1]{#1}
\makeatletter
\def\maxwidth{\ifdim\Gin@nat@width>\linewidth\linewidth\else\Gin@nat@width\fi}
\makeatother
\setkeys{Gin}{width=\maxwidth,keepaspectratio}
%(unicode)s
\journal{Automation in Construction}

\begin{document}
\begin{frontmatter}
\title{%(title)s}
%% Authorship, affiliations and the corresponding author are for the owner to fill in.
\author{[Authors to be added]}
\affiliation{organization={[Affiliation to be added]}}

\begin{abstract}
%(abstract)s
\end{abstract}

\begin{highlights}
%(highlights)s
\end{highlights}

\begin{keyword}
%(keywords)s
\end{keyword}
\end{frontmatter}

%(body)s

\section*{Data and code availability}
%(data)s

\section*{Declaration of generative AI use}
%(ai)s

\nocite{%(nocite)s}
\bibliographystyle{elsarticle-harv}
\bibliography{references}
\end{document}
"""


def _phrase(name, year):
    """Regex for a name and year whose spaces may be line breaks in the draft."""
    return r"\s+".join(re.escape(w) for w in name.split()), r"\s+".join(re.escape(w) for w in year.split())


def convert_citations(text):
    """Author-year citations -> natbib commands. Returns the new text."""
    # 1. Bracketed groups made only of citations: [A 2016; B 2017] -> \citep{a,b}.
    def group(m):
        keys = []
        for item in m.group(1).split(";"):
            item = " ".join(item.split())
            for name, year, key in CITES:
                if item == f"{name} {year}":
                    keys.append(key)
                    break
            else:
                return m.group(0)
        return r"\citep{" + ",".join(keys) + "}"
    text = re.sub(r"\[([^\[\]]+)\]", group, text)
    for name, year, key in CITES:
        n, y = _phrase(name, year)
        # 2. Name [2016] -> \citet; Name's (2009) -> possessive; Name (2017) -> \citet.
        text = re.sub(n + r"\s+\[" + y + r"\]", lambda m, k=key: r"\citet{%s}" % k, text)
        text = re.sub(n + r"'s\s+\(" + y + r"\)",
                      lambda m, k=key: r"\citeauthor{%s}'s (\citeyear{%s})" % (k, k), text)
        text = re.sub(n + r"\s+\(" + y + r"\)", lambda m, k=key: r"\citet{%s}" % k, text)
        # 3. A bare "Name 2016" inside running parentheses -> \citealp.
        text = re.sub(n + r"\s+" + y + r"(?![\d,]\d)", lambda m, k=key: r"\citealp{%s}" % k, text)
    return text


def leftover_citations(text):
    """Author-year phrases the conversion missed (they would print as plain text)."""
    pat = r"(et al\.|\band [A-Z][\w\-]+|\b[A-Z][a-z]+)'?s?\s+[\[(]?(19|20)\d\d\b"
    return [m.group(0) for m in re.finditer(pat, text)]


def bib_keys():
    return re.findall(r"^@\w+\{([^,]+),", BIB.read_text(encoding="utf-8"), flags=re.M)


def cited_keys(text):
    keys = []
    for m in re.finditer(r"\\cite(?:t|p|alp|author|year)\{([^}]+)\}", text):
        keys += m.group(1).split(",")
    return keys


def split_draft(md):
    """The draft's title, highlights, abstract, keywords, body and end sections."""
    title = re.match(r"# (.+)\n", md).group(1).strip()
    parts = re.split(r"^## ", md, flags=re.M)
    sec = {p.split("\n", 1)[0].strip(): p.split("\n", 1)[1] for p in parts[1:]}
    highlights = [l[2:].strip() for l in sec["Highlights"].splitlines() if l.startswith("- ")]
    abstract, kw = sec["Abstract"].split("**Keywords:**")
    keywords = [k.strip() for k in " ".join(kw.split()).split(";") if k.strip()]
    body_names = [k for k in sec if re.match(r"\d+\. ", k)]
    body = "".join("## " + k + "\n" + sec[k] for k in body_names)
    return title, highlights, abstract.strip(), keywords, body, sec


def check_numbering(body):
    """The draft's section, table and figure numbers run in order, as LaTeX will number them."""
    problems = []
    major = minor = 0
    for line in body.splitlines():
        m = re.match(r"^(#{2,3}) (\d+)\.(\d+)?\.? ?", line)
        if not m:
            continue
        if m.group(1) == "##":
            major += 1
            minor = 0
            if int(m.group(2)) != major:
                problems.append(f"section {m.group(2)} where LaTeX would number {major}")
        else:
            minor += 1
            if (int(m.group(2)), int(m.group(3) or 0)) != (major, minor):
                problems.append(f"subsection {m.group(2)}.{m.group(3)} where LaTeX would number {major}.{minor}")
    for kind, pat in (("Table", r"^\*Table (\d+)\."), ("Figure", r"!\[Figure (\d+)\.")):
        nums = [int(n) for n in re.findall(pat, body, flags=re.M)]
        if nums != list(range(1, len(nums) + 1)):
            problems.append(f"{kind} numbers {nums} are not 1..{len(nums)} in order")
    return problems


def check_highlights(highlights):
    """Elsevier's highlights: 3 to 5 bullets of at most 85 characters, spaces included."""
    problems = []
    if not 3 <= len(highlights) <= 5:
        problems.append(f"{len(highlights)} highlights; Elsevier asks for 3 to 5")
    for h in highlights:
        if len(h) > 85:
            problems.append(f"highlight of {len(h)} characters (limit 85): {h}")
    return problems


# Automation in Construction's guide for authors: "The abstract ... must not exceed 150 words"
# (as excerpted by a web search on 2026-11-15; the guide page itself is refused by this session's proxy).
ABSTRACT_WORDS = 150


def check_abstract(abstract):
    """The journal's abstract limit, counted as whitespace-separated words (keywords excluded)."""
    n = len(abstract.split())
    return [] if n <= ABSTRACT_WORDS else [f"abstract of {n} words (limit {ABSTRACT_WORDS})"]


def prepare_body(body):
    """Strip the numbers LaTeX will add and turn table and figure captions into pandoc's."""
    body = re.sub(r"^(#{2,3}) \d+\.(\d+)?\.? ?", r"\1 ", body, flags=re.M)
    # "*Table N. caption*" before a pipe table -> pandoc's "Table: caption" after it.
    def table(m):
        caption = " ".join(m.group(1).split())
        return m.group(2).rstrip("\n") + "\n\nTable: " + caption + "\n"
    body = re.sub(r"^\*Table \d+\. (.+?)\*\n\n((?:\|[^\n]*\n)+)", table, body, flags=re.M | re.S)
    body = re.sub(r"!\[Figure \d+\. ", "![", body)
    # Figures sit next to paper/latex/, one level further from experiments/.
    body = body.replace("](../experiments/", "](../../experiments/")
    return body


def latexify_unicode(tex):
    tex = re.sub(r"(\w)\u0304", r"\\ensuremath{\\bar{\1}}", tex)
    unknown = sorted({c for c in tex if ord(c) > 127 and c not in UNICODE})
    if unknown:
        raise SystemExit("no LaTeX mapping for: " + " ".join(f"{c} U+{ord(c):04X}" for c in unknown))
    return "".join(UNICODE.get(c, c) for c in tex)


def pandoc(md):
    out = subprocess.run(
        ["pandoc", "-f", "markdown-tex_math_dollars-citations-smart", "-t", "latex", "--wrap=preserve",
         "--top-level-division=section", "--shift-heading-level-by=-1"],
        input=md, capture_output=True, text=True, check=True)
    return out.stdout


def build():
    md = DRAFT.read_text(encoding="utf-8")
    title, highlights, abstract, keywords, body, sec = split_draft(md)
    problems = check_numbering(body) + check_highlights(highlights) + check_abstract(abstract)
    body = convert_citations(prepare_body(body))
    abstract = convert_citations(abstract)
    left = leftover_citations(body) + leftover_citations(abstract)
    if left:
        problems.append("unconverted citations: " + "; ".join(left))
    cited = cited_keys(body + abstract)
    keys = bib_keys()
    missing = sorted(set(cited) - set(keys))
    unused = sorted(set(keys) - set(cited) - set(NOCITE))
    if missing:
        problems.append("cited but not in references.bib: " + ", ".join(missing))
    if unused:
        problems.append("in references.bib but cited nowhere in the draft: " + ", ".join(unused))
    if problems:
        raise SystemExit("\n".join(problems))
    fields = {
        "title": latexify_unicode(title),
        "abstract": latexify_unicode(pandoc(abstract)),
        "highlights": "\n".join(r"\item " + latexify_unicode(pandoc(h)).strip() for h in highlights),
        "keywords": r" \sep ".join(latexify_unicode(k) for k in keywords),
        "body": latexify_unicode(pandoc(body)),
        "data": latexify_unicode(pandoc(sec["Data and code availability"])),
        "ai": latexify_unicode(pandoc(sec["Declaration of generative AI use"])),
        "nocite": ",".join(NOCITE),
        "unicode": "",
    }
    # elsarticle's highlights environment opens its own itemize: the fields are bare \items.
    OUT.mkdir(exist_ok=True)
    tex = PREAMBLE % fields
    (OUT / "manuscript.tex").write_text(tex, encoding="utf-8")
    shutil.copy(BIB, OUT / "references.bib")
    return tex, sorted(set(cited)), unused


def compile_pdf():
    def run(cmd):
        r = subprocess.run(cmd, cwd=OUT, capture_output=True, text=True)
        if r.returncode:
            sys.stdout.write(r.stdout[-3000:])
            raise SystemExit(f"{' '.join(cmd)} failed")
        return r.stdout
    run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "manuscript.tex"])
    run(["bibtex", "manuscript"])
    run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "manuscript.tex"])
    log = run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "manuscript.tex"])
    undefined = re.findall(r"(?:Citation|Reference) `([^']+)' .*undefined", log)
    pages = re.search(r"Output written on manuscript.pdf \((\d+) pages", log)
    return sorted(set(undefined)), int(pages.group(1)) if pages else None


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    tex, cited, unused = build()
    words = len(split_draft(DRAFT.read_text(encoding="utf-8"))[2].split())
    print(f"wrote {OUT.relative_to(HERE.parent)}/manuscript.tex: {len(cited)} works cited, "
          f"{len(NOCITE)} standards listed, {tex.count(chr(92) + 'begin{longtable}')} tables, "
          f"{tex.count(chr(92) + 'includegraphics')} figures, abstract {words} words")
    if unused:
        print("in references.bib but cited nowhere in the draft: " + ", ".join(unused))
    if "--pdf" in argv:
        undefined, pages = compile_pdf()
        if undefined:
            raise SystemExit("undefined after three passes: " + ", ".join(undefined))
        print(f"compiled {OUT.relative_to(HERE.parent)}/manuscript.pdf: {pages} pages, no undefined citations or references")
    return 0


if __name__ == "__main__":
    sys.exit(main())
