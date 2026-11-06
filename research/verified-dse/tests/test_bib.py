"""Every arXiv id and DOI cited in PAPER.md has an entry in paper/references.bib."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_paper_citations_in_bib():
    paper = (ROOT / "PAPER.md").read_text()
    bib = (ROOT / "paper" / "references.bib").read_text()
    ids = set(re.findall(r"arXiv:(\d{4}\.\d{4,5})", paper)) | set(
        re.findall(r"doi:(10\.[^\s,)]+?)(?=[\s,)]|$)", paper))
    assert ids
    missing = [i for i in ids if i not in bib]
    assert not missing, missing


def test_wirecite_replaces_ids_and_adds_bibliography():
    import importlib.util
    spec = importlib.util.spec_from_file_location("wirecite", ROOT / "paper" / "wirecite.py")
    w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
    km = w.keymap((ROOT / "paper" / "references.bib").read_text())
    paper = (ROOT / "PAPER.md").read_text()
    ids = set(re.findall(r"arXiv:(\d{4}\.\d{4,5})", paper)) | set(
        re.findall(r"doi:(10\.[^\s,)]+?)(?=[\s,)]|$)", paper))
    assert all(i in km for i in ids)
    out = w.wire("see (arXiv:1603.06288) and doi:10.1038/s41586-021-03544-w.\n\\end{document}", km)
    assert "\\cite{kandasamy2016mfgp}" in out and "\\cite{mirhoseini2021graph}" in out
    assert "arXiv:" not in out and "\\bibliography{references}" in out
