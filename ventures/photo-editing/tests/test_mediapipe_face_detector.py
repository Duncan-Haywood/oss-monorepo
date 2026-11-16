from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from shootflow.faces import parse_faces

TOOL = Path(__file__).resolve().parents[1] / "tools" / "mediapipe_face_detector.py"


def _load():
    spec = importlib.util.spec_from_file_location("mediapipe_face_detector", TOOL)
    module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


class BlinkMapTests(unittest.TestCase):
    def test_threshold_reads_half_and_the_map_falls_with_the_blink_score(self) -> None:
        tool = _load()
        self.assertAlmostEqual(tool.eyes_open_from_blink(tool.BLINK_CLOSED_AT), 0.5, places=3)
        scores = [tool.eyes_open_from_blink(b / 10) for b in range(11)]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_the_measured_cases_land_on_the_right_side(self) -> None:
        # eval/blink-landmarker-2026-11-16.md: open faces up to 0.44, shut ones from 0.50.
        tool = _load()
        self.assertGreater(tool.eyes_open_from_blink(0.438), 0.65)  # laughing squint
        self.assertLess(tool.eyes_open_from_blink(0.65), 0.15)  # shut, head tipped back


class TileAndMergeTests(unittest.TestCase):
    def test_tiles_start_with_the_frame_and_cover_it(self) -> None:
        tool = _load()
        boxes = tool.tiles(1800, 1200)
        self.assertEqual(boxes[0], (0, 0, 1800, 1200))
        self.assertEqual(len(boxes), 1 + 4 + 9)
        for left, top, right, bottom in boxes:
            self.assertTrue(0 <= left < right <= 1800 and 0 <= top < bottom <= 1200)
        self.assertEqual(max(b[2] for b in boxes[1:5]), 1800)
        self.assertEqual(max(b[3] for b in boxes[5:]), 1200)

    def test_one_face_seen_in_three_tiles_is_kept_once_with_the_mean_blink(self) -> None:
        tool = _load()
        frame = (1000, 1000)
        views = [
            tool.face_entry((100, 100, 300, 320), (0.40, 0.60), frame),
            tool.face_entry((105, 98, 298, 318), (0.30, 0.50), frame),
            tool.face_entry((110, 110, 290, 310), (0.20, 0.40), frame),
            tool.face_entry((600, 600, 700, 720), (0.05, 0.05), frame),  # someone else
        ]
        merged = tool.merge_faces(views)
        self.assertEqual(len(merged), 2)
        first = merged[0]
        self.assertEqual((first["box"], first["views"]), ([100, 100, 300, 320], 3))
        self.assertEqual(first["blink"], [0.3, 0.5])
        self.assertEqual(first["eyes_open"], tool.eyes_open_from_blink(0.5))

    def test_a_face_too_small_to_read_the_lids_gets_null_and_shootflow_accepts_it(self) -> None:
        tool = _load()
        small = tool.face_entry((0, 0, tool.MIN_EYE_FACE_PX - 1, 70), (0.9, 0.9), (400, 300))
        self.assertIsNone(small["eyes_open"])
        report = parse_faces({"faces": [small, tool.face_entry((0, 0, 200, 220), (0.7, 0.8), (400, 300))]})
        assert report is not None
        self.assertEqual(report.prominent_faces, 2)
        self.assertLess(report.worst_eyes_open, 0.1)


class CommandTests(unittest.TestCase):
    def test_without_a_model_the_command_fails_so_shootflow_keeps_its_score(self) -> None:
        env = {k: v for k, v in os.environ.items() if k != "SHOOTFLOW_FACE_LANDMARKER"}
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "x.png"
            image.write_bytes(b"")
            result = subprocess.run([sys.executable, str(TOOL), str(image)], capture_output=True, text=True, env=env)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
