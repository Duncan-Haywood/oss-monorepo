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


def test_park_candidates_drop_tail_items_the_last_pick_makes_redundant():
    # a short tail item, then a long one that alone frees enough: keep the short one
    long_item = "(1) a long open item " + "x" * 200
    v = f"History: README. Next: (0) first item here; {long_item}; (2) a short tail item"
    cands = ff.park_candidates(v, 120)
    assert [c for c, _ in cands] == [long_item]
    # when both are needed, both are still offered, tail first
    both = ff.park_candidates(v, 225)
    assert [c.split(")")[0] for c, _ in both] == ["(2", "(1"]


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


def test_refusal_names_a_landed_clause_in_the_runs_own_new(tmp_path, capsys):
    # PR #18147's record: a buildable --replace whose NEW said "landed" got only
    # "keep: (nothing; cut the clause)", with no sign the clause was its own.
    f = tmp_path / "f.yaml"
    f.write_text(DOC)
    mine = "Wall area fill landed 2026-11-21 (eval/geometry-quantities.md)"
    other = "Old drop fit landed 2026-11-16 (eval/drop.md)"
    new = f"{other}; " + "y" * (ff.FLAGSHIP_BUILDABLE_MAX - 60) + f". {mine}."
    assert ff.main(["a", "--field", "buildable", "--replace", "Something here.", new,
                    "--file", str(f)]) == 1
    err = capsys.readouterr().err
    assert "Your NEW text reports landed work" in err
    assert mine in err.partition("Your NEW text reports landed work")[2]
    # another run's landed clause stays in the usual list, the run's own is named apart
    hint = ff.landed_hint(f"{other}; {mine}.", 10, (mine,))
    own, _, rest = hint.partition("1 clause(s) report landed work")
    assert own.startswith("Your NEW text reports landed work") and mine in own
    assert other in rest and mine not in rest
    # with no --replace NEW to tell apart, every landed clause is listed as before
    hint = ff.landed_hint(f"{other}; {mine}.", 10)
    assert hint.startswith("2 clause(s) report landed work")
    assert "Your NEW" not in hint
    assert f.read_text() == DOC


def test_new_budget_when_shortening_cannot_fit():
    assert ff.new_budget(("abc",), 10).startswith(". Your NEW text (3 chars) cannot fit")
    assert ff.new_budget(("a", "b"), 5).startswith(". Your 2 NEW texts (2 chars together) cannot fit")
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
    # an implicit park moves only what the cap needs (ten run records,
    # 2026-11-17..18: it parked four to eight items for one longer clause)
    assert longer in got and ff.FLAGSHIP_NEXT_TARGET < len(got) <= ff.FLAGSHIP_NEXT_MAX
    err = capsys.readouterr().err
    assert "--make-room parked" in err and "parking 1 item(s)" in err
    assert "parks by itself" in err
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


def test_make_room_keeps_the_heading_the_runs_text_continues():
    # PR #16944: the run's NEW continued the clause before it ("synthetic
    # control: CA rank 1"; "MA, AZ, OR ranks 6-13; covariates failed"), and
    # --make-room parked that heading, leaving NEW under the wrong item.
    head = "(9) synthetic control: CA rank 1 of 39 " + "h" * 150
    mine = "MA, AZ, OR ranks 6-13; covariates failed " + "m" * 150
    v = _full_row(9, 190)[:-1] + "; " + head + "; " + mine + "."
    assert len(v) > ff.FLAGSHIP_NEXT_MAX
    got, parked = ff.make_room(v, keep=(mine,))
    assert parked and head in got and mine in got
    assert got.index(head) + len(head) + 2 == got.index(mine)


def test_park_candidates_skip_an_item_spanning_two_sentences():
    # "...carry-forward. joint drift ... Open: (0) drift model" is one `; `
    # item but two sentences; parking it would take the "Open:" label along.
    two = "next a real carry-forward. Open: (0) drift model " + "d" * 150
    v = _full_row(9, 190)[:-1] + "; " + two + "."
    cands = [c for c, _ in ff.park_candidates(v, 100)]
    assert cands and not any("carry-forward" in c for c in cands)
    # a version number or file name is not a sentence break
    assert not ff.SENTENCE.search("ships v1.2 and reads a.csv files")


def test_explicit_make_room_still_parks_to_the_target(tmp_path):
    row = _full_row(10, 195)
    doc = DOC.replace("    next: >-\n      Only b.\n", "".join(ff.wrap("next", row)))
    f = tmp_path / "flagships.yaml"
    f.write_text(doc)
    (tmp_path / "ventures" / "b").mkdir(parents=True)
    old = "(3) item 3 " + "w" * 183
    longer = "(3) item 3 next a much longer follow-up " + "z" * 170
    base = ["b", "--file", str(f), "--ventures-dir", str(tmp_path / "ventures")]
    assert ff.main(base + ["--replace", old, longer, "--make-room"]) == 0
    assert len(ff.read_value(f.read_text(), "b", "next")) <= ff.FLAGSHIP_NEXT_TARGET


def test_park_candidates_never_offer_a_landed_clause():
    # 2026-11-18: an implicit park moved landed results into NEXT.md as if
    # they were open items; a landed clause is cut, not parked.
    landed = "(10) odd leagues landed: 8 on 2x6 UNSAT " + "l" * 150
    v = _full_row(9, 190)[:-1] + "; " + landed + "."
    cands = [c for c, _ in ff.park_candidates(v, 400)]
    assert cands and not any("landed" in c for c in cands)


def test_dry_run_writes_nothing(tmp_path, capsys):
    row = _full_row(10, 195)
    doc = DOC.replace("    next: >-\n      Only b.\n", "".join(ff.wrap("next", row)))
    f = tmp_path / "flagships.yaml"
    f.write_text(doc)
    (tmp_path / "ventures" / "b").mkdir(parents=True)
    old = "(3) item 3 " + "w" * 183
    base = ["b", "--file", str(f), "--ventures-dir", str(tmp_path / "ventures"), "--dry-run"]
    assert ff.main(base + ["--replace", old, old + " " + "z" * 100]) == 0
    assert "would park" in capsys.readouterr().err
    assert f.read_text() == doc and not (tmp_path / "ventures" / "b" / "NEXT.md").exists()
    assert ff.main(base + ["--field", "buildable", "--replace", "x", "y"]) in (0, 1)
    assert f.read_text() == doc


def test_park_candidates_never_offer_history_before_the_open_marker():
    # 2026-11-18: "proved impossible: 7, 9 on 2x6" and "8 on 2x6, 12 on 2x9
    # UNSAT" were `; `-fragments of one landed sentence, before the row's
    # "next:", and were parked into NEXT.md as open items.
    hist = ("History: README. Odd leagues landed (eval/odd.txt): proved impossible: "
            "7, 9 on 2x6; on 9 slots 11, 13 teams on 2 courts, 17 on 3; 8 on 2x6, "
            "12 on 2x9 UNSAT; ")
    v = hist + "Next: (a) a real league's blackout list; (b) printed sheets on real paper."
    got = [c for c, _ in ff.park_candidates(v, 10**6)]
    assert got and not any("2x6" in c or "on 2 courts" in c for c in got)
    assert any("printed sheets" in c for c in got)
    # the NEXT.md pointer's "open items:" is not the marker
    assert ff.open_start("a; b. More open items: NEXT.md.") == 0
    # "Wanted, ...:" opens items too (wall-framing-takeoff)
    w = "History: README (x; y). Wanted, all needing real inputs: a real DXF; a deck plan."
    assert ff.open_start(w) == w.index("Wanted")


def test_real_rows_offer_no_item_before_their_open_marker():
    text = ff.FLAGSHIPS_PATH.read_text()
    import yaml
    for e in ff._entries(yaml.safe_load(text)):
        v = ff.read_value(text, e["venture"], "next")
        if not v:
            continue
        norm, start = " ".join(v.split()), ff.open_start(v)
        for c, _ in ff.park_candidates(v, 10**6):
            assert norm.find(c) + len(c) > start, (e["venture"], c)


# --- dated results move to HISTORY.md before open items are parked ---------

ROW = ("History: README. Kodak DCR 2026-11-18 = LibRaw (eval/kodak-dcr-*). "
       "Open checks that need a person: listen to the page. "
       "Hasselblad 3FR (eval/hasselblad-*). "
       "Next, most valuable first: (audit 2026-11-16: 26 of 27; faults in 21) . "
       "master-cli passed EBU 3341 2026-11-17; open: the EBU's WAVs (403). "
       "Sets 2026-11-19 (eval/sets.md: 186 sets). "
       "next: an RVB author 2026-11-19; a Revit export.")


def test_history_pieces_take_only_dated_finished_sentences():
    v = " ".join(ROW.split())
    got = [v[a:b] for a, b in ff.history_pieces(v)]
    assert any(g.startswith("Kodak DCR") for g in got)
    assert any(g.startswith("Sets 2026-11-19") for g in got)
    # the pointer, undated text, open work, a piece running into "open:",
    # and anything after the last open marker all stay
    assert not any(g.startswith("History") for g in got)
    assert not any("Hasselblad" in g or "need a person" in g for g in got)
    assert not any("master-cli" in g for g in got)
    assert not any("RVB" in g or "Revit" in g for g in got)
    # the run's own text is never moved
    assert not any("Sets" in v[a:b] for a, b in ff.history_pieces(v, ("Sets 2026-11-19",)))
    # a row with no open marker: history and open items cannot be told apart
    assert ff.history_pieces("History: README. Kodak DCR 2026-11-18 = LibRaw. More.") == []


def test_history_pieces_ignore_regex_brackets():
    # ids-model-check's row quotes "(?:", which unbalanced the bracket depth
    v = ("History: README. Patterns 2026-11-18 (anchors, (?: and \\/ repaired). "
         "Types 2026-11-19 (eval/t.md). next: a Revit export.")
    got = [v[a:b] for a, b in ff.history_pieces(v)]
    assert any(g.startswith("Types") for g in got)


def test_history_pieces_keep_dated_pieces_with_their_own_next_step():
    # changepoint-detector 2026-11-21: a shipped result whose sentence also
    # names the next step (lower-case "next", or "next:" inside brackets) is
    # open work, not history (PRs #17997, #18002, #18031)
    v = ("History: README. Counts: count default ships 2026-11-20 (README); real shop "
         "misses the 2011-09-01 build-up; next a bunched-count ramp cell. "
         "Middle shipped 2026-11-21 (README: next Middle as count default). "
         "Watch shipped 2026-11-19 (set-up page; next: its four links tried). "
         "Types 2026-11-19 (eval/t.md). Next: a Revit export.")
    got = [v[a:b] for a, b in ff.history_pieces(v)]
    assert any(g.startswith("Types") for g in got)
    assert not any("Counts" in g or "Middle" in g or "Watch" in g for g in got)


def test_history_pieces_never_take_the_open_list_after_a_marker():
    # ids-model-check 2026-11-22 (PR #18186): the items right after "next:"
    # carried a date inside a bracket and moved to HISTORY.md whole, leaving
    # "next:" dangling; and photo-editing's "dE 16, unsettled" (PR #18173)
    v = ("History: README. Sets 2026-11-19 (eval/sets.md); next: a page route for bSDD; "
         "Excel typing into the download (dropdowns 2026-11-19, eval/d.md: 0 of 476). "
         "IIQ 2026-11-18 = LibRaw; IQ4 matrix dE 16, unsettled (eval/iiq-*). "
         "Fill 2026-11-21 (eval/fill.md). Next: a BIM manager's table.")
    got = [v[a:b] for a, b in ff.history_pieces(v)]
    assert got == ["Fill 2026-11-21 (eval/fill.md)"]


def test_archive_history_removes_cleanly_oldest_first():
    v = " ".join(ROW.split())
    out, moved = ff.archive_history(v, 0)
    assert moved[0].startswith("Kodak DCR")
    assert "Kodak" not in out and "Sets 2026-11-19" not in out and "audit" not in out
    assert "Next, most valuable first: master-cli passed" in out
    assert "listen to the page. Hasselblad" in out and out.startswith("History: README. Open checks")
    assert ";." not in out and ". ." not in out and "  " not in out
    # stops once it fits
    out2, moved2 = ff.archive_history(v, len(v) + len(ff.PARK_POINTER) + 1 - 10)
    assert len(moved2) == 1


def test_history_text_creates_then_appends():
    first = ff.history_text(None, "a", ["X 2026-11-18 (eval/x.md)"], "2026-11-19")
    assert first.startswith("# a: what has landed") and ff.HISTORY_HEADING in first
    assert "- (moved 2026-11-19) X 2026-11-18 (eval/x.md)\n" in first
    again = ff.history_text(first, "a", ["Y 2026-11-19"], "2026-11-20")
    assert again.count(ff.HISTORY_HEADING) == 1 and again.endswith("- (moved 2026-11-20) Y 2026-11-19\n")
    # an existing HISTORY.md (ai-bookkeeper's) keeps its text, gains the heading
    own = ff.history_text("# b: what has landed\n- old entry\n", "b", ["Z 2026-11-19"], "d")
    assert own.startswith("# b: what has landed\n- old entry\n\n" + ff.HISTORY_HEADING)


def test_edit_over_the_cap_moves_history_before_parking(tmp_path, capsys):
    head = "History: README. " + " ".join(
        f"Result {i} 2026-11-{10 + i} (eval/r{i}.md: {'x' * 130})." for i in range(8))
    tail = " Next: (a) " + "a" * 200 + "; (b) " + "b" * 200 + "."
    value = head + tail
    assert 1700 < len(value) < 2000
    doc = ("flagships:\n  - venture: a\n    next: >-\n      " + value + "\n")
    f = tmp_path / "flagships.yaml"
    f.write_text(doc)
    (tmp_path / "ventures" / "a").mkdir(parents=True)
    new = "(c) " + "c" * 300
    rc = ff.main(["a", "--replace", "; (b)", f"; {new}; (b)", "--file", str(f),
                  "--ventures-dir", str(tmp_path / "ventures")])
    assert rc == 0
    got = ff.read_value(f.read_text(), "a", "next")
    assert len(got) <= ff.FLAGSHIP_NEXT_TARGET
    assert "a" * 200 in got and "b" * 200 in got and new in got  # no open item parked
    assert not (tmp_path / "ventures" / "a" / "NEXT.md").exists()
    hist = (tmp_path / "ventures" / "a" / "HISTORY.md").read_text()
    assert "Result 0 2026-11-10" in hist and "Result 0" not in got
    assert "HISTORY.md" in capsys.readouterr().out


def test_dry_run_reports_history_moves_without_writing(tmp_path, capsys):
    value = ("History: README. " + " ".join(f"R{i} 2026-11-1{i} ({'x' * 200})." for i in range(9))
             + " Next: a real file.")
    f = tmp_path / "flagships.yaml"
    f.write_text("flagships:\n  - venture: a\n    next: >-\n      " + value + "\n")
    before = f.read_text()
    (tmp_path / "ventures" / "a").mkdir(parents=True)
    assert ff.main(["a", "--trim", "--dry-run", "--file", str(f),
                    "--ventures-dir", str(tmp_path / "ventures")]) == 0
    err = capsys.readouterr()
    assert "would move to HISTORY.md" in err.err and "to HISTORY.md; nothing written" in err.out
    assert f.read_text() == before and not (tmp_path / "ventures" / "a" / "HISTORY.md").exists()


def test_real_rows_move_no_open_work_to_history():
    text = ff.FLAGSHIPS_PATH.read_text()
    import yaml
    for e in ff._entries(yaml.safe_load(text)):
        v = " ".join((ff.read_value(text, e["venture"], "next") or "").split())
        for a, b in ff.history_pieces(v):
            piece = v[a:b]
            assert ff.DATE.search(piece) and not ff.OPENISH.search(piece), (e["venture"], piece)
            assert a < ff.open_start(v) or a < [m.start() for m in ff.OPEN_MARK.finditer(v)][-1]
            assert ff._aside(piece) or not any(
                v[:a].rstrip().endswith(m.group()) for m in ff.OPEN_MARK.finditer(v)), (e["venture"], piece)


# --- an undated result a park picks goes to HISTORY.md, not NEXT.md ---------

@pytest.mark.parametrize("item", [
    "lasting moves to more days: cut has the power (8 of 9 cells)",
    "two covariates: harmless one's warning 0 of 170 false finds, 1.27x bias (bar failed)",
    "(2) clumpy counts: NB1 shipped",
    "(7) longest path shipped 2026-11-19 (floatpaths.mjs; eval/longest-path-2026-11-19.md: 26 of 26)",
    "(5) foo exporter 2026-11-20 (eval/foo-2026-11-20.md)",
    "gapShape word on listed units (pulse faded 90%, 20% false)",
    # dated entries that end on their evidence (DATED_EVIDENCE), PR #17951's row
    "two courses 2026-11-20 (golf-courses.test.mjs)",
    "facet-result cache 2026-11-18 (eval/applies-cache-2026-11-18.md: 68 IDS 7.9 to 4.6 s)",
    "Americano scorer page 2026-11-19 (americano-night.html, night.mjs: live table)",
])
def test_is_result_finished_results(item):
    assert ff.is_result(item)


@pytest.mark.parametrize("item", [
    "next a real panel with a known slope event",
    "(4) driftWarning on real shocks",
    "3 log n led on all TCPD post hoc (0.754 vs 0.697), test it on fresh labelled data",
    "TSSB/HAS/UTSA (README): count, shape checks failed; next phase-tolerant shapes",
    "a real CR3 with tiles stacked (0 of 986 M sensels differ on 39 frames)",
    "bowling: most even of several dealings landed; left: 10 x 32 misses",
    "refresh the Bulgaria page when its draft passes",
    "the note quotes it",
    # dated, with evidence, but open work follows the bracket or is the point
    "home-and-away breaks exact since 2026-11-13 (eval/pair-exact.txt): a timetable search on it",
    "quality round 89 (`audits/2026-11-19-r2.json`, craft 2): engine.mjs is 3,004 lines. Split it",
    "golf two courses 2026-11-20 (README)",
    "a rebuild after 2026-11-23 (eval/rebuild.md: needs the new feed)",
    # a numbered open-list item holding its progress so far (PR #17963's record)
    "(4) advanced breps on revolved/NURBS surfaces (8 in kleine_Wohnung; planes and "
    "cylinders read 2026-11-20, 703 of 767 = IfcOpenShell to 0.1%; faceted openings as "
    "signed tetrahedra; eval/advanced-breps-2026-11-20.md), overlapping shell pieces as a union",
    "(4) loans: LendingClub rounds payments up (99.97% of 445k, README), `--round up`",
])
def test_is_result_keeps_open_items_open(item):
    assert not ff.is_result(item)


def test_park_files_results_in_history_and_open_items_in_next(tmp_path, capsys):
    res = "cut has the power on lasting moves (8 of 9 cells, " + "r" * 150 + ")"
    opn = "next a real panel with a known slope event " + "o" * 150
    value = "History: README. Next: (a) " + "a" * 1500 + "; " + opn + "; " + res + "."
    assert len(value) < ff.FLAGSHIP_NEXT_MAX
    f = tmp_path / "flagships.yaml"
    f.write_text("flagships:\n  - venture: a\n    next: >-\n      " + value + "\n")
    (tmp_path / "ventures" / "a").mkdir(parents=True)
    rc = ff.main(["a", "--replace", "(a) ", "(a) " + "z" * 200 + " ", "--file", str(f),
                  "--ventures-dir", str(tmp_path / "ventures")])
    assert rc == 0, capsys.readouterr().err
    got = ff.read_value(f.read_text(), "a", "next")
    assert len(got) <= ff.FLAGSHIP_NEXT_MAX and res not in got
    hist = (tmp_path / "ventures" / "a" / "HISTORY.md").read_text()
    assert res in hist
    nxt = tmp_path / "ventures" / "a" / "NEXT.md"
    assert not nxt.exists() or res not in nxt.read_text()
    assert "a result rather than an open item" in capsys.readouterr().err


# --- --history: the run names a finished result, the tool moves it ---------

@pytest.mark.parametrize("value, piece, want", [
    ("a; R done; b.", "R done", "a; b."),
    ("Pointer. R done. Next: x.", "R done.", "Pointer. Next: x."),
    ("Pointer. R done; b.", "R done", "Pointer. b."),
    ("a; R done. Next: x.", "R done", "a. Next: x."),
    ("R done; b.", "R done", "b."),
    ("a; R done.", "R done", "a."),
    ("a; R\n      done; b.", "R done", "a; b."),  # folded text matches unfolded
])
def test_remove_text_keeps_separators_tidy(value, piece, want):
    assert ff.remove_text(value, piece) == want


def test_remove_text_refuses_text_not_in_the_row():
    with pytest.raises(ValueError, match="--history: not found"):
        ff.remove_text("a; b.", "zz")


def _row(tmp_path, value):
    f = tmp_path / "flagships.yaml"
    f.write_text("flagships:\n  - venture: a\n    next: >-\n      " + value + "\n")
    (tmp_path / "ventures" / "a").mkdir(parents=True)
    return f, ["--file", str(f), "--ventures-dir", str(tmp_path / "ventures")]


def test_history_moves_a_result_with_the_replace_and_no_park(tmp_path, capsys):
    # The 2026-11-19 refusal: a row of undated results the heuristics cannot see.
    res = "X reader (README): 63 of 64 right " + "r" * 400
    value = "History: README. Next: (a) " + "a" * 1200 + "; " + res + "; (b) b item."
    assert len(value) < ff.FLAGSHIP_NEXT_MAX
    f, extra = _row(tmp_path, value)
    rc = ff.main(["a", "--replace", "(b) b item", "(b) b item; (c) " + "c" * 500,
                  "--history", res] + extra)
    assert rc == 0
    got = ff.read_value(f.read_text(), "a", "next")
    assert res not in got and "a" * 1200 in got and "c" * 500 in got
    assert not (tmp_path / "ventures" / "a" / "NEXT.md").exists()  # no open item parked
    hist = (tmp_path / "ventures" / "a" / "HISTORY.md").read_text()
    assert res in hist and ff.HISTORY_HEADING in hist
    assert "moved 1 result(s)" in capsys.readouterr().out


def test_history_alone_and_dry_run(tmp_path, capsys):
    f, extra = _row(tmp_path, "History: README. Next: a; R done; b.")
    before = f.read_text()
    assert ff.main(["a", "--history", "R done", "--dry-run"] + extra) == 0
    assert f.read_text() == before and "1 to HISTORY.md" in capsys.readouterr().out
    assert ff.main(["a", "--history", "R done"] + extra) == 0
    assert ff.read_value(f.read_text(), "a", "next") == "History: README. Next: a; b."


def test_history_on_another_field_is_a_usage_error(tmp_path):
    f, extra = _row(tmp_path, "History: README. Next: a.")
    with pytest.raises(SystemExit):
        ff.main(["a", "--field", "buildable", "--history", "a"] + extra)


def test_refusal_names_history_flags(tmp_path, capsys):
    # every item is a result or the run's own text, so nothing can be parked
    # undated results before the open marker: never parked, never auto-moved
    items = [f"R{i} reader passed {i} of 9 " + "x" * 300 for i in range(6)]
    value = "History: README. " + "; ".join(items) + ". Next: own item."
    f, extra = _row(tmp_path, value)
    before = f.read_text()
    for flag in ("--no-make-room", "--make-room"):
        rc = ff.main(["a", "--replace", "own item", "own item " + "y" * 300, flag] + extra)
        err = capsys.readouterr().err
        assert rc == 1 and f.read_text() == before, flag
        assert "--history 'R0 reader passed 0 of 9" in err and "check each is done" in err, flag
    # and the flags it names make the same call fit
    rc = ff.main(["a", "--replace", "own item", "own item " + "y" * 300,
                  "--history", items[1], "--history", items[2]] + extra)
    assert rc == 0


def test_history_candidates_skip_pointer_and_own_text():
    v = "History and every measurement: README. Next: A passed 3 of 4; next a real file; B ships."
    got = ff.history_candidates(v, keep=("B ships",))
    assert got == ["A passed 3 of 4"]


def test_new_budget_splits_the_cut_across_several_replacements():
    a, b = "x" * 60, "y" * 40
    got = ff.new_budget((a, b), 10)
    assert "2 NEW texts are 100 characters together; at most 90 fit" in got
    assert "60 -> 54" in got and "40 -> 36" in got
    assert sum(int(n) for n in __import__("re").findall(r"-> (\d+)", got)) == 90


def test_new_spanning_an_item_break_is_never_moved_or_parked(tmp_path, capsys):
    # PRs #17798 and #17912: a NEW of "X ships (...); next Y" matched neither
    # item whole, so "Counts: X ships (...)" read as a result and moved to
    # HISTORY.md, and the run's next step went with it.
    new = ('count default ships (README "A count default" ' + "d" * 200 + "); next the eager "
           "ladder with it as Quiet, then real orders")
    value = ("History: README. Next: (a) " + "a" * 1500 + "; (b) " + "b" * 250 + "; (c) cc; Counts: nb "
             "ships opt-in; next a rule so it can be the default. joint drift (measured).")
    assert len(value) < ff.FLAGSHIP_NEXT_MAX < len(value) + 200
    f, extra = _row(tmp_path, value)
    rc = ff.main(["a", "--replace", "nb ships opt-in; next a rule so it can be the default",
                  new] + extra)
    assert rc == 0, capsys.readouterr().err
    got = ff.read_value(f.read_text(), "a", "next")
    assert "Counts: " + new in got and "(c) cc" in got and "b" * 250 not in got
    hist = tmp_path / "ventures" / "a" / "HISTORY.md"
    assert not hist.exists() or "count default ships" not in hist.read_text()


@pytest.mark.parametrize("piece, mine", [
    ('Counts: count default ships (README "A count default")', True),
    ("next the eager ladder with it as Quiet, then real orders", True),
    ("an unrelated open item about something else", False),
    ("the panel ships today with real orders", False),  # "real orders" is under 12
])
def test_holds_new_sees_partial_overlap(piece, mine):
    keep = ('count default ships (README "A count default"); next the eager ladder with it '
            "as Quiet, then real orders",)
    assert ff.holds_new(piece, keep) is mine


def test_implicit_park_refuses_to_move_a_big_item_for_a_small_overrun(tmp_path, capsys):
    # PR #17900: an edit a few characters over the cap parked an unrelated open item.
    big = "a real deployer's repository " + "q" * 700
    value = "History: README. Next: (a) " + "a" * 1200 + "; own item; " + big + "."
    f, extra = _row(tmp_path, value)
    before = f.read_text()
    grow = "own item " + "y" * (ff.FLAGSHIP_NEXT_MAX - len(value) + 10)
    rc = ff.main(["a", "--replace", "own item", grow] + extra)
    err = capsys.readouterr().err
    assert rc == 1 and f.read_text() == before
    assert "would park" in err and "Shorten your NEW text by" in err and "--make-room" in err
    assert ff.main(["a", "--replace", "own item", grow, "--make-room"] + extra) == 0
    assert big in (tmp_path / "ventures" / "a" / "NEXT.md").read_text()
