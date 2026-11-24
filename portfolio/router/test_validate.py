import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate  # noqa: E402


def problems(data, name="v"):
    errors = []
    validate.check(Path(name), data, errors)
    return errors


BASE = {"name": "v", "description": "d", "owner": "o"}


def test_prototype_may_omit_bookkeeping():
    assert problems({**BASE, "stage": "prototype"}) == []


def test_launched_requires_bookkeeping():
    errs = problems({**BASE, "stage": "launched"})
    assert any("kill_criteria" in e for e in errs)
    assert any("economics" in e for e in errs)


def test_prototype_present_blocks_are_still_checked():
    errs = problems({**BASE, "stage": "prototype", "budget": {"monthly_cap": -1}})
    assert any("monthly_cap" in e for e in errs)


def test_flagship_next_over_cap_is_reported(tmp_path):
    p = tmp_path / "flagships.yaml"
    p.write_text("flagships:\n  - venture: x\n    next: " + "a" * 2100 + "\n  - venture: y\n    next: ok\n")
    errors = []
    validate.check_flagships(errors, p)
    assert len(errors) == 1 and "x `next:`" in errors[0]


def test_flagship_buildable_over_cap_is_reported(tmp_path):
    p = tmp_path / "flagships.yaml"
    p.write_text("flagships:\n  - venture: x\n    buildable: " + "a" * 700 + "\n    next: ok\n"
                 "  - venture: y\n    buildable: short\n    next: ok\n")
    errors = []
    validate.check_flagships(errors, p)
    assert len(errors) == 1 and "x `buildable:`" in errors[0]


def test_flagship_hosts_must_be_a_list_of_urls(tmp_path):
    p = tmp_path / "flagships.yaml"
    p.write_text("flagships:\n  - venture: x\n    hosts: archive.org\n    next: ok\n"
                 "  - venture: y\n    hosts: [https://archive.org/]\n    next: ok\n")
    errors = []
    validate.check_flagships(errors, p)
    assert len(errors) == 1 and "x `hosts:`" in errors[0]


def test_flagship_hyphen_fold_is_reported(tmp_path):
    p = tmp_path / "flagships.yaml"
    p.write_text("flagships:\n  - venture: x\n    next: >-\n      see ventures/wall-\n      framing/README.md\n")
    errors = []
    validate.check_flagships(errors, p)
    assert len(errors) == 1 and "flagships.yaml:4" in errors[0] and "flagship_field.py" in errors[0]


def test_flagship_not_before_must_be_a_date(tmp_path):
    p = tmp_path / "flagships.yaml"
    p.write_text("flagships:\n  - venture: x\n    not_before: after the tag\n    next: ok\n"
                 "  - venture: y\n    not_before: 2026-11-24\n    next: ok\n")
    errors = []
    validate.check_flagships(errors, p)
    assert len(errors) == 1 and "x `not_before:`" in errors[0]


def test_bets_come_first_in_order_and_others_say_why(tmp_path):
    p = tmp_path / "flagships.yaml"
    good = ("flagships:\n"
            "  - venture: a\n    bet: 1\n    app: private-monorepo/apps/a\n    next: ok\n"
            "  - venture: b\n    bet: 2\n    app: private-monorepo/apps/b\n    next: ok\n"
            "  - venture: c\n    demoted: no bet in bets.md\n    next: ok\n")
    p.write_text(good)
    errors = []
    validate.check_flagships(errors, p)
    assert errors == []
    p.write_text("flagships:\n"
                 "  - venture: c\n    next: ok\n"
                 "  - venture: a\n    bet: 2\n    app: apps/a\n    next: ok\n")
    errors = []
    validate.check_flagships(errors, p)
    text = "\n".join(errors)
    assert "c is not a bet" in text and "sits below a demoted row" in text
    assert "expected 1" in text and "needs `app: private-monorepo/apps/<slug>`" in text


def test_file_without_bets_skips_the_bet_check(tmp_path):
    p = tmp_path / "flagships.yaml"
    p.write_text("flagships:\n  - venture: x\n    next: ok\n")
    errors = []
    validate.check_flagships(errors, p)
    assert errors == []
