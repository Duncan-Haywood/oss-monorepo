"""paper/venue_check.py: the mechanical venue-format checks (milestone 7w)."""
import importlib.util
from pathlib import Path

PAPER = Path(__file__).resolve().parents[1] / "paper"
spec = importlib.util.spec_from_file_location("venue_check", PAPER / "venue_check.py")
vc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vc)

MD = """# A short title

*header*

## Abstract

One two three <sub>four</sub> five.

**Keywords:** fluid power; gear pump

## 1. Introduction

text

## AI use

Written with AI assistance.
"""


def test_title_and_abstract_counts():
    assert vc.title(MD) == "A short title"
    assert vc.abstract_words(MD) == 5


def test_ijfp_checks_on_a_toy_paper():
    got = {name: ok for name, ok, _ in vc.checks(MD, "ijfp")}
    assert got["title length"] and got["abstract length"]
    assert got["keywords"] and got["AI-use statement"]
    assert not got["notation list"] and not got["figure and table caption list"]


def test_long_title_fails():
    md = "# " + "x" * 81 + MD.split("\n", 1)[1]
    got = {name: ok for name, ok, _ in vc.checks(md, "ijfp")}
    assert not got["title length"]


def test_register_says_ijfp_prohibits_ai_content():
    assert vc.policy("ijfp")["policy"] == "prohibits"


def test_manuscript_carries_an_ai_use_statement():
    md = (PAPER / "manuscript.md").read_text()
    got = {name: ok for name, ok, _ in vc.checks(md, "ijfp")}
    assert got["AI-use statement"] and got["keywords"]
