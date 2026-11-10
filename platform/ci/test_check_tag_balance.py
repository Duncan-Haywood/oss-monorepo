import sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import check_tag_balance as c


def run(html):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "a.html"
        p.write_text(html)
        return c.check(p)


def test_clean():
    assert run("<html><head></head><body><main><p>x<br></main></body></html>") == []


def test_unclosed_main():
    assert run("<body><main><p>x</body>")


def test_stray_close():
    assert run("<head></head></head>")


def test_unescaped_placeholder_in_pre():
    assert run("<pre>cmd <path></pre>")
