import tempfile
from pathlib import Path
import check_smooth_scroll as c


def test_fix_then_clean():
    with tempfile.TemporaryDirectory() as d:
        p = Path(d, "ventures/x"); p.mkdir(parents=True)
        f = p / "index.html"
        f.write_text("<script>a.scrollIntoView({ behavior: 'smooth', block: 'start' })</script>")
        assert c.main(["--root", d]) == 1
        assert c.main(["--root", d, "--fix"]) == 0
        assert "prefers-reduced-motion" in f.read_text()
        assert c.main(["--root", d]) == 0
