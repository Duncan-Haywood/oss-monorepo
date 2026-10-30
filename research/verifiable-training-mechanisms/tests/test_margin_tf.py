import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
torch = pytest.importorskip("torch")
from vtm.margin_tf import load_text, train  # noqa: E402

CORPUS = os.path.join(os.path.dirname(__file__), "..", "experiments", "transformer", "corpus.txt")


def test_zero_tolerance_skipper_is_honest():
    d = load_text(CORPUS)
    a, _ = train(d, 0, steps=20)
    b, info = train(d, 0, steps=20, strategy="skip", tau=0.0)
    assert info["cheated"] == 0
    assert all(torch.equal(p, q) for p, q in zip(a.parameters(), b.parameters()))


def test_huge_tolerance_skips_every_step():
    d = load_text(CORPUS)
    _, info = train(d, 0, steps=10, strategy="skip", tau=1e9)
    assert info["cheated"] == 1.0
