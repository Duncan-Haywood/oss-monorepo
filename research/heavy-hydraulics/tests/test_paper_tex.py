"""The venue-format build of the paper (paper/build_tex.py) stays valid as draft.md changes."""
import importlib.util
from pathlib import Path

PAPER = Path(__file__).resolve().parents[1] / "paper"
spec = importlib.util.spec_from_file_location("build_tex", PAPER / "build_tex.py")
build_tex = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_tex)


def test_draft_converts_with_every_reference_in_refs_bib():
    md = (PAPER / "draft.md").read_text()
    tex, figures = build_tex.convert(md)
    assert build_tex.check(tex, md) == []
    assert r"\begin{abstract}" in tex and r"\bibliography{refs}" in tex
    for f in figures:
        assert Path(f).exists(), f


def test_inline_markup():
    s = build_tex.inline("**3.1 Bold** and *italic `a_b`* with 5&minus;2, 10% and a cite (*Energies* 10(5), 687, 2017, doi:10.3390/en10050687)")
    assert r"\textbf{3.1 Bold}" in s
    assert r"\emph{italic \texttt{a\_\allowbreak{}b}}" in s
    assert r"5\textminus{}2" in s and r"10\%" in s
    assert s.endswith(r"cite~\cite{vukovic2017}")
