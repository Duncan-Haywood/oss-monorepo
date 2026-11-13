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


def test_template_ids_are_never_flagged_even_with_no_other_lookup():
    # The lookup-first short-circuit must still drop `${...}` ids, not report them.
    html = '<script>document.getElementById("row-${i}")</script>'
    assert run(html) == []


def test_main_over_a_pool_matches_page_by_page(tmp_path, capsys):
    # 70 pages (over page_pool.MIN_POOL), every third missing its id: the pooled
    # main prints exactly what calling page_problems in order would.
    for i in range(70):
        own = f'<p id="k{i}"></p>' if i % 3 else ""
        (tmp_path / f"p{i:02d}.html").write_text(own + f'<script>getElementById("k{i}")</script>')
    assert c.main(["--root", str(tmp_path)]) == 1
    printed = capsys.readouterr().out.splitlines()
    expected = [f"p{i:02d}.html: no element with id k{i}" for i in range(70) if i % 3 == 0]
    assert printed[:-1] == expected
    assert printed[-1] == f"70 pages checked, {len(expected)} with a script lookup of a missing id"
