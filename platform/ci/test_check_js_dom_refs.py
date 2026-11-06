import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import check_js_dom_refs as c


def run(html, extra=None):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "p.html"
        p.write_text(html)
        for name, body in (extra or {}).items():
            (Path(d) / name).write_text(body)
        return c.page_problems(p)


def test_flags_missing_ids():
    html = ('<div id="out"></div><script>getElementById("out");getElementById(\'gone\');'
            "document.querySelector('#nope')</script>")
    assert run(html) == ["gone", "nope"]


def test_script_built_ids_and_comments_are_not_flagged():
    html = ('<script>const e=document.createElement("p");e.id="made";'
            'document.getElementById("made");// getElementById("old")\n</script>')
    assert run(html) == []


def test_sibling_script_file_is_read():
    html = '<p id="a"></p><script src="app.js"></script>'
    assert run(html, {"app.js": 'getElementById("a");getElementById("b")'}) == ["b"]
