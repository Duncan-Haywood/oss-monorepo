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


def test_every_figure_has_its_own_numbered_caption():
    md = (PAPER / "draft.md").read_text()
    tex, figures = build_tex.convert(md)
    labels = [int(n) for n in __import__("re").findall(r"\\label\{fig:(\d+)\}", tex)]
    assert labels == list(range(1, len(figures) + 1))


def test_out_of_order_figure_number_is_refused():
    md = "# T\n\n![a](x.svg)\n\n*Figure 2 (src): text.*\n"
    try:
        build_tex.convert(md)
    except ValueError as e:
        assert "number them in order" in str(e)
    else:
        raise AssertionError("expected ValueError")


def test_manuscript_converts_with_numbered_figures_and_a_captioned_table():
    md = (PAPER / "manuscript.md").read_text()
    tex, figures = build_tex.convert(md)
    assert build_tex.check(tex, md) == []
    labels = [int(n) for n in __import__("re").findall(r"\\label\{fig:(\d+)\}", tex)]
    assert labels == list(range(1, len(figures) + 1))
    assert r"\label{tab:1}" in tex
    for f in figures:
        assert Path(f).exists(), f


def test_manuscript_numbers_trace_to_draft_or_results():
    import subprocess, sys
    r = subprocess.run([sys.executable, str(PAPER / "check_numbers.py"), "--paper", "manuscript.md"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout
    assert "0 missing; 0 orphan numbers" in r.stdout


def test_orphan_audit_flags_a_number_absent_from_the_pool():
    import importlib.util as iu
    s = iu.spec_from_file_location("check_numbers", PAPER / "check_numbers.py")
    m = iu.module_from_spec(s)
    s.loader.exec_module(m)
    assert m.orphans("0.9130 and 3.17 and 12.345", "x 0.9130 y 3.175") == ["12.345", "3.17"]


def test_supplement_converts_and_is_checked_with_the_manuscript():
    # milestone 7v: sections 3.6 to 3.10 moved verbatim to supplement.md; it must build and
    # its numbers are audited by check_numbers.py --paper manuscript.md (test above).
    md = (PAPER / "supplement.md").read_text()
    tex, figures = build_tex.convert(md)
    assert build_tex.check(tex, md) == []
    assert "supplement.md" in (PAPER / "check_numbers.py").read_text()


def test_manuscript_stays_near_journal_length():
    # milestone 7v cut it from 9,479 to about 7,000 words; growth past 7,500 means detail
    # that belongs in supplement.md is creeping back.
    words = len((PAPER / "manuscript.md").read_text().split())
    assert words <= 7500, words


def test_subsection_numbers_are_not_printed_twice():
    # LaTeX numbers \subsection itself; the markdown's "3.6 " prefix used to print as "3.6 3.6".
    tex, _ = build_tex.convert("# T\n\n## 3. Results\n\n### 3.6 Drag as a second number\n\ntext\n")
    assert r"\subsection{Drag as a second number}" in tex
