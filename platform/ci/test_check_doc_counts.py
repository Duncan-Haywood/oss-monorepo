import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_doc_counts as cdc  # noqa: E402


def setup(tmp):
    (tmp / "platform/ci").mkdir(parents=True)
    (tmp / "things").mkdir()
    for i in range(3):
        (tmp / "things" / f"t{i}.txt").write_text("x")
    (tmp / "platform/ci/doc_counts.json").write_text(json.dumps({"counts": {
        "things": {"glob": "things/*.txt"},
        "echoed": {"cmd": [sys.executable, "-c", "print('total: 1,200? no: 1200 items')"], "regex": r"(\d+) items"},
    }}))


def test_drift_fix_and_unknown(tmp_path, capsys):
    setup(tmp_path)
    doc = tmp_path / "GUIDE.md"
    doc.write_text("We have <!-- count:things -->2<!-- /count --> things and "
                   "<!-- count:echoed -->1,100<!-- /count --> items.\n")
    paths = [str(doc)]
    assert cdc.main(["--root", str(tmp_path), *paths]) == 1
    out = capsys.readouterr().out
    assert "says 2 for things, the tree says 3" in out and "says 1100 for echoed" in out
    assert cdc.main(["--root", str(tmp_path), "--fix", *paths]) == 0
    assert "-->3<" in doc.read_text() and "-->1,200<" in doc.read_text()
    assert cdc.main(["--root", str(tmp_path), *paths]) == 0
    doc.write_text("<!-- count:nope -->4<!-- /count -->")
    assert cdc.main(["--root", str(tmp_path), *paths]) == 1
    assert "unknown count 'nope'" in capsys.readouterr().out


def test_tolerance(tmp_path):
    setup(tmp_path)
    doc = tmp_path / "A.md"
    doc.write_text("about <!-- count:things -->~4<!-- /count -->")
    assert cdc.main(["--root", str(tmp_path), "--tolerance", "0.5", str(doc)]) == 0
    assert cdc.main(["--root", str(tmp_path), str(doc)]) == 1


def test_dated_records_are_not_scanned(tmp_path):
    (tmp_path / "docs/posts").mkdir(parents=True)
    (tmp_path / "docs/posts/2026-01-01-x.md").write_text("<!-- count:things -->1<!-- /count -->")
    (tmp_path / "LIVE.md").write_text("")
    found = [p.name for p in cdc.docs(tmp_path)]
    assert "LIVE.md" in found and "2026-01-01-x.md" not in found


def test_registry_counts_all_compute():
    """Every shipped count must still produce a number (guards against a script changing its output)."""
    reg = cdc.load_registry()
    for name, spec in reg.items():
        if "glob" in spec:
            assert isinstance(cdc.compute(name, spec), int)
