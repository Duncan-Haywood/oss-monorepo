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
    assert ff.stray_separators(ff.FLAGSHIPS_PATH.read_text()) == []


def test_stray_separators_found():
    assert ff.stray_separators(DOC) == []
    assert ff.stray_separators(DOC.replace("Only b.", "Only b;. More.")) == ["b.next"]
    assert ff.stray_separators(DOC.replace("Only b.", "x; ; y.")) == ["b.next"]
    assert ff.stray_separators(DOC.replace("Only b.", "v1.0, e.g. this.")) == []


NOTE_ROW = ("History: README. Next: (a) one long open item here; (b) another long open item, "
            "the last one. A run that lands a slice replaces its item here; keep this under "
            "2,000 characters.")


def test_park_candidates_leave_the_row_note():
    cands = [c for c, _ in ff.park_candidates(NOTE_ROW, 10**6)]
    assert cands[0] == "(b) another long open item, the last one"
    assert not any("A run that lands" in c or "keep this under" in c for c in cands)


def test_park_last_item_keeps_note_and_leaves_no_stray_separator():
    got = ff.remove_items(NOTE_ROW, ["(b) another long open item, the last one"])
    assert got == ("History: README. Next: (a) one long open item here. A run that lands a "
                   "slice replaces its item here; keep this under 2,000 characters.")
    tail = "Next: (a) one; (b) two items long enough. When a slice lands, replace its item here."
    cands = [c for c, _ in ff.park_candidates(tail, 10**6)]
    assert cands == ["(b) two items long enough"]
    assert ff.remove_items(tail, cands) == "Next: (a) one. When a slice lands, replace its item here."


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


def _full_row(n_items: int, size: int) -> str:
    items = [f"({i}) item {i} " + "w" * (size - 12) for i in range(n_items)]
    return "History: README and git. Next: " + "; ".join(items) + "."


def test_park_candidates_from_the_end_until_enough():
    v = _full_row(10, 190)
    cands = ff.park_candidates(v, 300)
    assert [c.split(")")[0] for c, _ in cands] == ["(9", "(8"]
    assert sum(g for _, g in cands) >= 300
    assert not any(c.startswith("History") for c, _ in cands)
    # the opening history pointer is never offered, however much room is asked
    assert all(not c.startswith("History") for c, _ in ff.park_candidates(v, 10**6))


def test_refusal_lists_ready_park_flags():
    v = _full_row(11, 190)
    assert len(v) > ff.FLAGSHIP_NEXT_MAX
    with pytest.raises(ValueError) as e:
        ff.set_value(DOC, "b", "next", v)
    msg = str(e.value)
    assert "over)" in msg and "--park '(10) item 10" in msg and "this same command" in msg


def test_replace_and_park_in_one_call(tmp_path):
    row = _full_row(10, 195)
    assert 1900 < len(row) <= ff.FLAGSHIP_NEXT_MAX
    doc = DOC.replace("    next: >-\n      Only b.\n", "".join(ff.wrap("next", row)))
    f = tmp_path / "flagships.yaml"
    f.write_text(doc)
    (tmp_path / "ventures" / "b").mkdir(parents=True)
    longer = "(3) item 3 landed (README); next a much longer follow-up " + "z" * 150
    old = "(3) item 3 " + "w" * 183
    base = ["b", "--file", str(f), "--ventures-dir", str(tmp_path / "ventures")]
    # with --no-make-room, the longer wording is refused and nothing is written
    assert ff.main(base + ["--replace", old, longer, "--no-make-room"]) == 1
    assert f.read_text() == doc
    item9 = "(9) item 9 " + "w" * 183
    assert ff.main(base + ["--replace", old, longer, "--park", item9]) == 0
    got = ff.read_value(f.read_text(), "b", "next")
    assert longer in got and item9 not in got and got.endswith(ff.PARK_POINTER)
    assert len(got) <= ff.FLAGSHIP_NEXT_MAX
    assert item9 in (tmp_path / "ventures" / "b" / "NEXT.md").read_text()
    assert ff.read_value(f.read_text(), "a", "buildable") == "Something here."


def test_park_candidates_skip_the_runs_own_new_text():
    v = _full_row(10, 190)
    mine = "(9) item 9 " + "w" * 178
    cands = ff.park_candidates(v, 100, keep=(mine,))
    assert cands and not cands[0][0].startswith("(9)")


def test_make_room_parks_from_the_end_until_value_and_pointer_fit():
    v = _full_row(11, 190)
    assert len(v) > ff.FLAGSHIP_NEXT_MAX
    got, parked = ff.make_room(v)
    assert parked and parked[0].startswith("(10)")
    assert len(got) + len(ff.PARK_POINTER) + 1 <= ff.FLAGSHIP_NEXT_MAX
    assert len(ff.with_pointer(got)) <= ff.FLAGSHIP_NEXT_MAX
    assert ff.with_pointer(got).endswith(ff.PARK_POINTER)
    assert got.startswith("History")
    # a value that already fits is left alone
    short = _full_row(3, 100)
    assert ff.make_room(short) == (short, [])


def test_make_room_never_parks_the_runs_own_text():
    v = _full_row(11, 190)
    mine = "(10) item 10 " + "w" * 177
    got, parked = ff.make_room(v, keep=(mine,))
    assert mine.split(" w")[0] in got and not any(p.startswith("(10)") for p in parked)


def test_make_room_refuses_when_nothing_left_to_park():
    with pytest.raises(ValueError, match="--make-room"):
        ff.make_room("History: README. " + "x" * 2100)


def test_cli_replace_with_make_room_lands_in_one_call(tmp_path, capsys):
    row = _full_row(10, 195)
    doc = DOC.replace("    next: >-\n      Only b.\n", "".join(ff.wrap("next", row)))
    f = tmp_path / "flagships.yaml"
    f.write_text(doc)
    (tmp_path / "ventures" / "b").mkdir(parents=True)
    old = "(3) item 3 " + "w" * 183
    longer = "(3) item 3 landed (README); next a much longer follow-up " + "z" * 150
    base = ["b", "--file", str(f), "--ventures-dir", str(tmp_path / "ventures")]
    assert ff.main(base + ["--replace", old, longer, "--make-room"]) == 0
    got = ff.read_value(f.read_text(), "b", "next")
    assert longer in got and got.endswith(ff.PARK_POINTER) and len(got) <= ff.FLAGSHIP_NEXT_MAX
    parked = (tmp_path / "ventures" / "b" / "NEXT.md").read_text()
    assert "(9) item 9" in parked and "--make-room parked" in capsys.readouterr().err
    # when the edit fits, --make-room is a plain edit: nothing parked, no pointer
    assert ff.main(base + ["--replace", longer, "(3) short", "--make-room"]) == 0
    assert "(9) item 9" in parked and ff.PARK_POINTER in ff.read_value(f.read_text(), "b", "next")
    assert parked == (tmp_path / "ventures" / "b" / "NEXT.md").read_text()


def test_refusal_offers_make_room():
    with pytest.raises(ValueError, match="--make-room"):
        ff.set_value(DOC, "b", "next", _full_row(11, 190))


def test_park_before_a_standalone_pointer_ends_the_sentence():
    v = f"History: README. Next: (a) one item; (b) a second open item; {ff.PARK_POINTER}"
    assert ff.remove_items(v, ["(b) a second open item"]) == f"History: README. Next: (a) one item. {ff.PARK_POINTER}"


def test_explicit_park_with_the_note_attached_moves_only_the_item(tmp_path):
    # einvoice-preflight's NEXT.md got "... A run that lands a slice replaces
    # its item here" (2026-11-16) because --park was given the item as copied.
    v = "History: README. Next: (a) one item; (b) refresh it. A run that lands a slice replaces its item here."
    item = "(b) refresh it. A run that lands a slice replaces its item here"
    assert ff.remove_items(v, [item]) == (
        "History: README. Next: (a) one item. A run that lands a slice replaces its item here.")
    assert ff.park_text(None, "a", [item], "2026-11-16").splitlines()[-1] == "- (2026-11-16) (b) refresh it."


def test_remove_items_keeps_extensions_and_ellipses():
    v = "a (x, y,...) b; nineteen sets; .eml and .mbox files; d item."
    assert ff.remove_items(v, ["d item"]) == "a (x, y,...) b; nineteen sets; .eml and .mbox files."


def test_real_next_md_holds_no_row_note():
    for p in (ff.REPO_ROOT / "ventures").glob("*/NEXT.md"):
        for line in p.read_text().splitlines():
            if line.startswith("- ("):
                assert not ff.ROW_NOTE.search(line), f"{p}: {line}"


def test_buildable_refusal_gives_overrun_and_the_longest_new_that_fits(tmp_path, capsys):
    f = tmp_path / "f.yaml"
    f.write_text(DOC)
    new = "x" * (ff.FLAGSHIP_BUILDABLE_MAX + 5)
    assert ff.main(["a", "--field", "buildable", "--replace", "Something here.", new,
                    "--file", str(f)]) == 1
    err = capsys.readouterr().err
    assert f"({len(new) - ff.FLAGSHIP_BUILDABLE_MAX} over; the row was 15" in err
    over = len(new) - ff.FLAGSHIP_BUILDABLE_MAX
    assert f"Your NEW text is {len(new)} characters; at most {len(new) - over} fits" in err
    assert f.read_text() == DOC


def test_buildable_refusal_lists_landed_clauses():
    value = ("Landed 2026-11-16: the drop fit on edge times, a long note about what it measured "
             "and where; " + "y" * ff.FLAGSHIP_BUILDABLE_MAX)
    with pytest.raises(ValueError) as e:
        ff.set_value(DOC, "a", "buildable", value)
    assert "report landed work" in str(e.value)


def test_new_budget_when_shortening_cannot_fit():
    assert ff.new_budget(("abc",), 10).startswith(". Your NEW text (3 chars) cannot fit")
    assert ff.new_budget(("a", "b"), 1) == ""
    assert ff.new_budget(("",), 1) == ""


def test_read_and_write_print_room_left(tmp_path, capsys):
    f = tmp_path / "f.yaml"
    f.write_text(DOC)
    assert ff.main(["a", "--field", "buildable", "--file", str(f)]) == 0
    assert f"-- 15 of {ff.FLAGSHIP_BUILDABLE_MAX} characters, {ff.FLAGSHIP_BUILDABLE_MAX - 15} left" \
        in capsys.readouterr().err
    assert ff.main(["b", "--replace", "Only", "Just", "--file", str(f)]) == 0
    assert f"of {ff.FLAGSHIP_NEXT_MAX} characters, {ff.FLAGSHIP_NEXT_MAX - 7} left" in capsys.readouterr().out


def test_buildable_cap_says_overrun_and_room():
    # "Something here." is 15 characters, so the row had MAX - 15 to spare.
    value = "y" * (ff.FLAGSHIP_BUILDABLE_MAX + 14)
    with pytest.raises(ValueError) as e:
        ff.set_value(DOC, "a", "buildable", value)
    msg = str(e.value)
    assert "(14 over; the row was 15" in msg
    assert f"had {ff.FLAGSHIP_BUILDABLE_MAX - 15} to spare" in msg


def test_buildable_read_shows_cap(tmp_path, capsys):
    f = tmp_path / "flagships.yaml"
    f.write_text(DOC)
    assert ff.main(["a", "--field", "buildable", "--file", str(f)]) == 0
    assert f"-- 15 of {ff.FLAGSHIP_BUILDABLE_MAX} characters" in capsys.readouterr().err


def test_cli_refused_write_says_not_written(tmp_path, capsys):
    doc = DOC.replace("    next: >-\n      Only b.\n", "".join(ff.wrap("next", _full_row(10, 195))))
    f = tmp_path / "flagships.yaml"
    f.write_text(doc)
    old = "(3) item 3 " + "w" * 183
    assert ff.main(["b", "--file", str(f), "--replace", old, old + " " + "z" * 300]) == 1
    assert "NOT WRITTEN" in capsys.readouterr().err and f.read_text() == doc
    # a read or a --check that fails is not a write attempt
    assert ff.main(["nosuch", "--file", str(f), "--field", "next"]) == 1
    assert "NOT WRITTEN" not in capsys.readouterr().err


def test_make_room_parks_down_to_the_target_not_just_the_cap():
    # Rows parked only to the cap were full again for the next run (18
    # sessions in 3 days, friction_rank.py 2026-11-17); a park leaves headroom.
    v = _full_row(11, 190)
    got, parked = ff.make_room(v)
    assert len(ff.with_pointer(got)) <= ff.FLAGSHIP_NEXT_TARGET
    # a row under the cap is left alone unless the trigger is the target
    row = _full_row(10, 185)
    assert ff.FLAGSHIP_NEXT_TARGET < len(row) <= ff.FLAGSHIP_NEXT_MAX
    assert ff.make_room(row) == (row, [])
    got, parked = ff.make_room(row, trigger=ff.FLAGSHIP_NEXT_TARGET)
    assert parked and len(ff.with_pointer(got)) <= ff.FLAGSHIP_NEXT_TARGET


def test_make_room_settles_for_the_cap_when_the_target_is_out_of_reach():
    mine = "(1) item 1 " + "m" * 1750
    v = f"History: README. Next: {mine}; (2) a short tail item"
    got, parked = ff.make_room(v + "q" * 300, keep=(mine,))
    assert ff.FLAGSHIP_NEXT_TARGET < len(got) <= ff.FLAGSHIP_NEXT_MAX and parked


def test_replace_over_the_cap_parks_by_itself(tmp_path, capsys):
    row = _full_row(10, 195)
    doc = DOC.replace("    next: >-\n      Only b.\n", "".join(ff.wrap("next", row)))
    f = tmp_path / "flagships.yaml"
    f.write_text(doc)
    (tmp_path / "ventures" / "b").mkdir(parents=True)
    old = "(3) item 3 " + "w" * 183
    longer = "(3) item 3 landed (README); next a much longer follow-up " + "z" * 150
    base = ["b", "--file", str(f), "--ventures-dir", str(tmp_path / "ventures")]
    assert ff.main(base + ["--replace", old, longer]) == 0
    got = ff.read_value(f.read_text(), "b", "next")
    assert longer in got and len(got) <= ff.FLAGSHIP_NEXT_TARGET
    assert "--make-room parked" in capsys.readouterr().err
    assert (tmp_path / "ventures" / "b" / "NEXT.md").exists()


def test_trim_parks_a_full_row_to_the_target(tmp_path):
    row = _full_row(10, 185)
    doc = DOC.replace("    next: >-\n      Only b.\n", "".join(ff.wrap("next", row)))
    f = tmp_path / "flagships.yaml"
    f.write_text(doc)
    (tmp_path / "ventures" / "b").mkdir(parents=True)
    base = ["b", "--file", str(f), "--ventures-dir", str(tmp_path / "ventures")]
    assert ff.main(base + ["--trim"]) == 0
    got = ff.read_value(f.read_text(), "b", "next")
    assert len(got) <= ff.FLAGSHIP_NEXT_TARGET and got.endswith(ff.PARK_POINTER)
    assert ff.read_value(f.read_text(), "a", "next") == ff.read_value(doc, "a", "next")


def test_items_split_only_outside_brackets():
    v = "History: README. Next: (a) one (with x; y inside); (b) two [p; q]; (c) three."
    assert ff.split_items(v) == ["History: README. Next: (a) one (with x; y inside)",
                                 "(b) two [p; q]", "(c) three."]
    got = [c for c, _ in ff.park_candidates(v, 1000)]
    assert "(b) two [p; q]" in got and not any(c.endswith("inside)") and "(with" not in c for c in got)
