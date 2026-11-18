import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import check_page_anchors as c


def test_flags_dead_anchor():
    assert c.missing('<a href="#faq">x</a><h2 id="pricing">') == ["faq"]


def test_ok_cases():
    html = '<a href="#a">1</a><a href="#">2</a><a href="#top">3</a><a href="#n">4</a><div id=\'a\'></div><a name="n"></a>'
    assert c.missing(html) == []


def test_template_skipped():
    assert c.missing('<a href="#${id}">x</a>') == []


def test_main_exit_codes(tmp_path):
    (tmp_path / "a.html").write_text('<a href="#x">x</a>')
    assert c.main(["--root", str(tmp_path)]) == 1
    (tmp_path / "a.html").write_text('<a href="#x">x</a><p id="x"></p>')
    assert c.main(["--root", str(tmp_path)]) == 0
