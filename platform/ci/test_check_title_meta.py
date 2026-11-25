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


def test_counts_entities_as_one_character():
    # 69 visible characters, 79 with the entities spelled out.
    t = "a" * 60 + "&quot;b&quot;" + "c" * 6
    assert c.problems(f'<title>{t}</title><meta name="description" content="x">') == []


def test_noindex_page_needs_no_description():
    # A noindex page never shows a search snippet, so no description is fine.
    assert c.problems('<title>Sample</title><meta name="robots" content="noindex">') == []
    assert c.problems("<title>Sample</title><meta name='robots' content='noindex, nofollow'>") == []
    assert c.problems('<title>Page</title><meta name="robots" content="index">') == ["no-description"]
