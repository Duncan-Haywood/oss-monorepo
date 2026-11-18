import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import check_duplicate_meta as c


def page(d, q='"'):
    return f"<html><meta name=\"description\" content={q}{d}{q}>"


def test_apostrophe_inside_double_quotes_is_not_truncated():
    assert c.description(page("A spreadsheet can't say which")) == "a spreadsheet can't say which"


def test_finds_repeat_case_and_entity_insensitive():
    got = c.duplicates({"a": page("Same words here, long enough"), "b": page("SAME words here,&#32;long enough"), "c": page("Different words, long enough")})
    assert got == {"same words here, long enough": ["a", "b"]}


def test_short_and_missing_ignored():
    assert c.duplicates({"a": page("hi"), "b": page("hi"), "c": "<html>"}) == {}
