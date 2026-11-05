import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import check_fragment_links as c


def test_missing_target():
    assert c.missing('<a href="#a">x</a><div id="b"></div>') == ["a"]


def test_present_by_id_or_name():
    assert c.missing('<a href="#a">x</a><a href="#b">y</a><p id="a"></p><a name="b"></a>') == []


def test_ignores_scripts_comments_templates_and_bare_hash():
    html = '<a href="#">x</a><a href="#!">y</a><a href="#{{id}}">z</a><!-- <a href="#c"> --><script>"<a href=\'#d\'>"</script>'
    assert c.missing(html) == []
