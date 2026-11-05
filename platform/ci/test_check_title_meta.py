import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import check_title_meta as c


def test_clean_page():
    assert c.problems('<title>Tool</title><meta name="description" content="x">') == []


def test_flags_missing_and_long():
    assert c.problems("<p>x</p>") == ["no-title", "no-description"]
    long = "<title>" + "a" * 71 + '</title><meta name="description" content="x">'
    assert c.problems(long) == ["long-title"]
    assert c.problems(long, title_max=80) == []
