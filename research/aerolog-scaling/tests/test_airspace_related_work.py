"""The airspace paper's related-work section (1.1) cites only listed, status-marked references.

Guards the 2026-11-23 survey: every first author cited in Section 1.1 has an entry under "References"
and a BibTeX key, every reference says what was checked, and the corrected 25 ft attribution holds.
"""
import os
import re

PAPER = os.path.join(os.path.dirname(__file__), "..", "paper")
TEXT = open(os.path.join(PAPER, "airspace_layers.md")).read()
BIB = open(os.path.join(PAPER, "references.bib")).read()
SEC = TEXT.split("### 1.1 Related work and what is new", 1)[1].split("## 2. Model", 1)[0]
REFS = TEXT.split("\n## References\n", 1)[1].split("\n## ", 1)[0]

CITED = {  # first author in 1.1 -> bib key
    "Sunil": None, "Doole": "doole2021aerospace", "Hoekstra": "hoekstra2016bluesky", "Badea": "badea2021",
    "Ribeiro": "ribeiro2022", "Reich": "reich1966", "Kallinen": "kallinen2022", "Wang": "wang2023utm",
    "McFadyen": "mcfadyen2018", "Yan": "yan2026height",
}


def _entries():
    return [l for l in REFS.splitlines() if l.startswith("- ")]


def test_every_author_cited_in_related_work_is_listed_and_in_the_bib():
    for author, key in CITED.items():
        assert author in SEC, author
        assert any(l.startswith("- " + author) for l in _entries()), author
        if key:
            assert "{" + key + "," in BIB, key


def test_section_cites_no_first_author_without_a_reference():
    named = set(re.findall(r"(?<!, )\b([A-Z][a-z]+) (?:et al\.|and [A-Z][a-z]+)[^()]*\((?:DASC )?\d{4}", SEC))
    listed = {l[2:].split(",")[0] for l in _entries()}
    assert named <= listed, named - listed


def test_every_new_reference_says_what_was_checked():
    for l in _entries():
        if "2026-11-23" in l or any(l.startswith("- " + a) for a in CITED):
            assert re.search(r"not opened|checked|not checked", l), l


def test_25ft_attributed_to_the_aerospace_paper_not_dicuam():
    assert "25 ft layer spacing" in REFS and "aerospace8020038" in REFS
    dicuam = [l for l in _entries() if "DICUAM" in l][0]
    assert "25 ft" not in dicuam.split("(")[0]
