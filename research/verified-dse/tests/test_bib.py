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
