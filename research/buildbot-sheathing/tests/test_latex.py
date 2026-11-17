"""paper/build_latex.py: citations, numbering and highlights checks (pandoc only for the last test)."""
import importlib.util
import pathlib
import shutil

import pytest

HERE = pathlib.Path(__file__).resolve().parent.parent


def _load():
    spec = importlib.util.spec_from_file_location("build_latex", HERE / "paper" / "build_latex.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_citation_forms_become_natbib():
    b = _load()
    text = ("[Sandy et al. 2016; Giftthaler et al. 2017; Lachmayer et al.\n2022] and Cote et al. [2024]; "
            "Källsner and Girhammar's (2009) model; Weiss (2017) racked; (Anderson et al. 2007); "
            "[Adel et al. 2024, data]")
    out = b.convert_citations(text)
    assert r"\citep{sandy2016repositioning,giftthaler2017insitu,lachmayer2022}" in out
    assert r"\citet{cr2024woodframes}" in out
    assert r"\citeauthor{kallsner2009plastic}'s (\citeyear{kallsner2009plastic})" in out
    assert r"\citet{weiss2017decay}" in out
    assert r"(\citealp{anderson2007fyb})" in out
    assert r"\citep{adel2024data}" in out
    assert b.leftover_citations(out) == []


def test_unknown_citation_is_reported():
    b = _load()
    out = b.convert_citations("as Nobody et al. [2031] showed")
    assert b.leftover_citations(out)


def test_numbering_out_of_order_is_caught():
    b = _load()
    body = "## 1. A\n### 1.1 x\n### 1.3 y\n## 2. B\n*Table 2. t*\n"
    problems = b.check_numbering(body)
    assert any("1.3" in p for p in problems)
    assert any("Table" in p for p in problems)


def test_draft_numbering_highlights_and_keys():
    b = _load()
    _, highlights, abstract, _, body, _ = b.split_draft(b.DRAFT.read_text(encoding="utf-8"))
    assert b.check_numbering(body) == []
    assert b.check_highlights(highlights) == []
    assert b.check_abstract(abstract) == []
    converted = b.convert_citations(b.prepare_body(body)) + b.convert_citations(abstract)
    assert b.leftover_citations(converted) == []
    assert set(b.cited_keys(converted)) <= set(b.bib_keys())
    assert set(b.NOCITE) <= set(b.bib_keys())


def test_single_author_citation_left_as_text_is_caught():
    b = _load()
    assert b.leftover_citations("as tabulated by Nobody (2031)")
    assert b.leftover_citations(b.convert_citations("as tabulated by Ghazinader (2024)")) == []


def test_long_abstract_is_caught():
    b = _load()
    assert b.check_abstract("word " * 151)
    assert b.check_abstract("word " * 150) == []


def test_long_highlight_is_caught():
    b = _load()
    assert b.check_highlights(["x" * 86, "a", "b"])
    assert b.check_highlights(["a", "b"])


@pytest.mark.skipif(shutil.which("pandoc") is None, reason="pandoc not installed")
def test_build_writes_elsarticle_source():
    b = _load()
    tex, cited, _ = b.build()
    assert r"\documentclass[preprint,12pt,authoryear]{elsarticle}" in tex
    assert r"\begin{highlights}" in tex and r"\bibliography{references}" in tex
    assert tex.count(r"\caption{") == 6  # three tables, three figures
    assert len(cited) >= 20
    assert all(ord(c) < 128 for c in tex)
