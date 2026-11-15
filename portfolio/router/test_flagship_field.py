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


LANDED_NEXT = (
    "History: README (latest: Y). Open: X stamp check landed (README): a real note; "
    "Brazil NF-e landed (README); Mexico CFDI landed: open: the SAT matrix, a PAC rejection; "
    "warm start landed (README 2026-11-14), next a warm-sized gate; "
    "A landed (README): open: x, y, B landed (README): open: z; a plain open item.")


def test_landed_clauses_keep_the_open_part():
    found = dict(ff.landed_clauses(LANDED_NEXT))
    assert found["Brazil NF-e landed (README);"] == ""
    assert found["Mexico CFDI landed: open: the SAT matrix, a PAC rejection;"] == \
        "open: the SAT matrix, a PAC rejection;"
    assert found["warm start landed (README 2026-11-14), next a warm-sized gate;"] == \
        "next a warm-sized gate;"
    assert found["Open: X stamp check landed (README): a real note;"] == "a real note;"
    # Interleaved landed and open items have no safe split.
    assert found["A landed (README): open: x, y, B landed (README): open: z;"] is None
    assert "a plain open item." not in found
    assert not any(c.startswith("History") for c in found)


def test_cap_refusal_names_the_landed_clauses():
    value = LANDED_NEXT + " pad" * 470
    with pytest.raises(ValueError) as e:
        ff.set_value(DOC, "b", "next", value)
    msg = str(e.value)
    assert "of 2000" in msg and "Brazil NF-e landed" in msg and "keep: next a warm-sized gate;" in msg
    assert "needed" in msg


def test_cli_landed(tmp_path, capsys):
    p = tmp_path / "f.yaml"
    p.write_text(DOC.replace("Only b.", LANDED_NEXT))
    assert ff.main(["b", "--file", str(p), "--landed"]) == 0
    out, err = capsys.readouterr()
    assert "keep: (nothing; cut the clause)" in out and "landed clause(s)" in err
    assert p.read_text() == DOC.replace("Only b.", LANDED_NEXT)  # read-only


def test_replace_not_found_names_the_field_it_is_in(tmp_path, capsys):
    f = tmp_path / "flagships.yaml"
    f.write_text(DOC)
    assert ff.main(["a", "--replace", "Something here", "x", "--file", str(f)]) == 1
    err = capsys.readouterr().err
    assert "found in a.buildable" in err
    assert "flagship_field.py a --field buildable --replace" in err
    assert f.read_text() == DOC


def test_replace_not_found_points_at_other_flagships(tmp_path, capsys):
    f = tmp_path / "flagships.yaml"
    f.write_text(DOC)
    assert ff.main(["a", "--replace", "Only b", "x", "--file", str(f)]) == 1
    err = capsys.readouterr().err
    assert "found in b.next" in err and "flagship_field.py b --field next" in err


def test_replace_not_found_spacing_hint(capsys):
    hint = ff.not_found_hint(DOC, "a", "next", "a  long\ntail", "then a long tail of")
    assert "different spacing" in hint


def test_replace_not_found_plain_when_nowhere():
    assert ff.not_found_hint(DOC, "a", "next", "zzz", "First") == "not found in a.next: 'zzz'"


def test_remove_items_tidies_separators():
    v = "History: README. Next: (a) one thing; (b) two thing; (c) three."
    assert ff.remove_items(v, ["(b) two thing"]) == "History: README. Next: (a) one thing; (c) three."
    assert ff.remove_items(v, ["(a) one thing;"]) == "History: README. Next: (b) two thing; (c) three."
    assert ff.remove_items(v, ["(c) three."]) == "History: README. Next: (a) one thing; (b) two thing."
    with pytest.raises(ValueError, match="not found"):
        ff.remove_items(v, ["(d) absent"])


def test_park_text_creates_then_appends():
    first = ff.park_text(None, "a", ["(b) two thing;"], "2026-11-15")
    assert first.startswith("# a: open items beyond flagships.yaml")
    assert first.endswith(f"{ff.PARK_HEADING}\n\n- (2026-11-15) (b) two thing\n")
    again = ff.park_text(first, "a", ["(c) three"], "2026-11-16")
    assert again.count(ff.PARK_HEADING) == 1
    assert again.endswith("- (2026-11-15) (b) two thing\n- (2026-11-16) (c) three\n")
    kept = ff.park_text("# Existing notes\n\nKeep me.\n", "a", ["x"], "2026-11-15")
    assert kept.startswith("# Existing notes\n\nKeep me.\n\n" + ff.PARK_HEADING)


def test_park_cli_moves_item_and_adds_pointer(tmp_path):
    f = tmp_path / "flagships.yaml"
    f.write_text(DOC)
    (tmp_path / "ventures" / "a").mkdir(parents=True)
    rc = ff.main(["a", "--park", "then a long tail of words that wraps.", "--file", str(f),
                  "--ventures-dir", str(tmp_path / "ventures")])
    assert rc == 0
    got = ff.read_value(f.read_text(), "a", "next")
    assert "long tail" not in got and got.endswith(ff.PARK_POINTER)
    assert ff.read_value(f.read_text(), "a", "buildable") == "Something here."
    parked = (tmp_path / "ventures" / "a" / "NEXT.md").read_text()
    assert "then a long tail of words that wraps." in parked


def test_cap_refusal_names_park():
    with pytest.raises(ValueError, match="--park"):
        ff.set_value(DOC, "b", "next", "x " * 1001)
