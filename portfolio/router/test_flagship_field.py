"""Tests for flagship_field.py: one field rewritten, nothing else moved."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import flagship_field as ff  # noqa: E402

DOC = """# header comment
flagships:
  - venture: a
    why: >-
      Because.
    next: >-
      First item ventures/wall-framing-
      takeoff/README.md, then a long tail of
      words that wraps.
    buildable: >-
      Something here.
  - venture: b
    next: >-
      Only b.
# trailing comment
"""


def test_read_unfolds():
    assert ff.read_value(DOC, "b", "next") == "Only b."
    assert ff.read_value(DOC, "a", "missing") is None
    with pytest.raises(KeyError):
        ff.read_value(DOC, "zz", "next")


def test_check_finds_hyphen_fold():
    assert ff.hyphen_folds(DOC) == [7]


def test_replace_spanning_a_line_break_and_rewrap():
    old = ff.read_value(DOC, "a", "next")
    new = old.replace("wall-framing- takeoff", "wall-framing-takeoff").replace("long tail of words", "short tail")
    out = ff.set_value(DOC, "a", "next", new)
    assert ff.read_value(out, "a", "next") == "First item ventures/wall-framing-takeoff/README.md, then a short tail that wraps."
    assert ff.read_value(out, "a", "buildable") == "Something here."
    assert ff.read_value(out, "a", "why") == "Because."
    assert ff.read_value(out, "b", "next") == "Only b."
    assert out.startswith("# header comment\n") and out.endswith("# trailing comment\n")
    assert ff.hyphen_folds(out) == []


def test_long_value_never_breaks_at_hyphens():
    words = " ".join(f"part-{i}-of-a-hyphenated-path/file-{i}.md" for i in range(40))
    out = ff.set_value(DOC, "b", "next", words)
    assert ff.read_value(out, "b", "next") == words
    assert ff.hyphen_folds(out) == [7]  # only block a's seeded fold; b's rewrap adds none
    assert max(len(l) for l in out.splitlines()) <= ff.WIDTH + 40


def test_cap_refused():
    with pytest.raises(ValueError, match="of 2000"):
        ff.set_value(DOC, "b", "next", "x " * 1001)


def test_new_field_is_added_to_the_block():
    out = ff.set_value(DOC, "b", "buildable", "A thing a cloud session can do.")
    assert ff.read_value(out, "b", "buildable") == "A thing a cloud session can do."
    assert ff.read_value(out, "a", "next") == ff.read_value(DOC, "a", "next")


def test_cli_replace_on_a_copy(tmp_path, capsys):
    p = tmp_path / "f.yaml"
    p.write_text(DOC)
    assert ff.main(["b", "--file", str(p), "--replace", "Only", "Just"]) == 0
    assert ff.read_value(p.read_text(), "b", "next") == "Just b."
    assert ff.main(["b", "--file", str(p), "--replace", "absent", "x"]) == 1
    assert ff.main(["--check", "--file", str(p)]) == 1


def test_real_file_is_clean():
    assert ff.hyphen_folds(ff.FLAGSHIPS_PATH.read_text()) == []
