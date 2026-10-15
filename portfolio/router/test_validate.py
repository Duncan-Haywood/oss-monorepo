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
