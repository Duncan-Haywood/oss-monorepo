"""tools/card_scenes.py (repeat scenes in one body's sample set) and the per-body card floor of
tools/noise_aware_estimated.py (``card_floor`` with ``--cards``)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

try:
    import numpy as np  # noqa: F401

    HAS_NUMPY = True
except ImportError:  # pragma: no cover
    HAS_NUMPY = False


@unittest.skipUnless(HAS_NUMPY, "numpy")
class CardScenesTest(unittest.TestCase):
    def scene(self, seed, shape=(300, 400)):
        rng = np.random.default_rng(seed)
        base = rng.random((shape[0] // 20 + 1, shape[1] // 20 + 1))
        img = np.kron(base, np.ones((20, 20)))[: shape[0], : shape[1]]
        return np.repeat(img[:, :, None], 3, axis=2) * 0.8 + 0.05

    def test_same_scene_saved_two_ways_is_one_scene(self):
        from card_scenes import group, thumb

        a = self.scene(1)
        brighter = a * 1.7  # another bit depth or exposure: log luma shifts, correlation does not
        noisy = a + np.random.default_rng(9).normal(0, 0.01, a.shape)  # a higher-ISO copy
        cropped = np.zeros((300, 300, 3))  # an aspect-ratio crop around the same centre
        cropped[:] = a[:, 50:350]
        other = self.scene(2)
        out = group({n: thumb(t) for n, t in
                     {"a": a, "b_bright": brighter, "c_noisy": np.clip(noisy, 0, 1), "d_crop": cropped,
                      "e_other": other}.items()}, 0.8)
        self.assertTrue(out["a"]["keep"])
        for n in ("b_bright", "c_noisy", "d_crop"):
            self.assertFalse(out[n]["keep"], n)
            self.assertEqual(out[n]["scene"], 0)
        self.assertTrue(out["e_other"]["keep"])
        self.assertEqual(out["e_other"]["scene"], 1)

    def test_too_small_for_the_crop_is_its_own_scene(self):
        from card_scenes import group, thumb

        self.assertIsNone(thumb(self.scene(1, (100, 100))))
        out = group({"a": thumb(self.scene(1)), "b": None}, 0.8)
        self.assertTrue(out["b"]["keep"])

    def test_card_floor_spans_a_body_with_cards_and_a_file_without(self):
        from noise_aware_estimated import card_floor, card_of

        rows = [{"file": "x1", "snr": 25.0, "scenario": "equal", "feat": {"pca18": 0.02}},
                {"file": "x1", "snr": 25.0, "scenario": "equal", "feat": {"pca18": 0.03}},
                {"file": "x2", "snr": 25.0, "scenario": "equal", "feat": {"pca18": 0.01}},
                {"file": "x2", "snr": 12.0, "scenario": "equal", "feat": {"pca18": 0.05}},
                {"file": "y1", "snr": 25.0, "scenario": "equal", "feat": {"pca18": 0.0}}]  # unread: ignored
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write("\n".join(json.dumps(r) for r in rows))
        cards = {"x1": {"card": "Body X"}, "x2": {"card": "Body X"}, "y1": {"card": "Body Y"}}
        per_file = card_floor(f.name)
        self.assertEqual(per_file[("x1", 25.0, "equal")], 0.02)
        self.assertEqual(per_file[("x2", 25.0, "equal")], 0.01)
        per_body = card_floor(f.name, cards)
        self.assertEqual(per_body[("Body X", 25.0, "equal")], 0.01)
        self.assertEqual(per_body[("Body X", 12.0, "equal")], 0.05)
        self.assertNotIn(("Body Y", 25.0, "equal"), per_body)
        self.assertEqual(card_of("x1", cards), "Body X")
        self.assertEqual(card_of("z", cards), "z")
        self.assertEqual(card_of("x1", None), "x1")
        Path(f.name).unlink()


@unittest.skipUnless(HAS_NUMPY, "numpy")
class CardFloorRankTest(unittest.TestCase):
    def test_second_lowest_scene_on_cards_of_three_or_more(self):
        from noise_aware_estimated import card_floor

        def row(name, v):
            return {"file": name, "snr": 25.0, "scenario": "equal", "feat": {"pca18": v}}

        # Body X: three scenes reading (as their lowest tile) 0.01, 0.02, 0.05; Body Y: two scenes
        rows = [row("x1", 0.01), row("x1", 0.04), row("x2", 0.03), row("x2", 0.02), row("x3", 0.05),
                row("y1", 0.02), row("y2", 0.01)]
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write("\n".join(json.dumps(r) for r in rows))
        cards = {n: {"card": "X" if n[0] == "x" else "Y"} for n in ("x1", "x2", "x3", "y1", "y2")}
        self.assertEqual(card_floor(f.name, cards)[("X", 25.0, "equal")], 0.01)
        two = card_floor(f.name, cards, rank=2)
        self.assertEqual(two[("X", 25.0, "equal")], 0.02)  # x2's lowest tile, not x1's second tile
        self.assertEqual(two[("Y", 25.0, "equal")], 0.01)  # under three scenes: the lowest
        self.assertEqual(card_floor(f.name, rank=2)[("x1", 25.0, "equal")], 0.01)  # one file, one scene
        Path(f.name).unlink()


if __name__ == "__main__":
    unittest.main()
