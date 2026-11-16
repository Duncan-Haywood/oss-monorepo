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


class EdgeMirrorTests(unittest.TestCase):
    """A half face at the frame edge is searched for in a strip reflected across that edge
    (eval/blink-edge-mirror-2026-11-16.md)."""

    def setUp(self) -> None:
        try:
            import numpy  # noqa: F401
        except ImportError:  # pragma: no cover
            self.skipTest("numpy not installed")
        self.tool = _load()

    def _frame(self, width: int = 30, height: int = 20):
        import numpy as np

        pixels = np.zeros((height, width, 3), dtype=np.uint8)
        pixels[:, :, 0] = np.arange(width, dtype=np.uint8)[None, :]
        pixels[:, :, 1] = np.arange(height, dtype=np.uint8)[:, None]
        return pixels

    def test_each_edge_gets_a_strip_of_the_set_depth(self) -> None:
        views = {v[0]: v[1:] for v in self.tool.edge_views(1000, 600)}
        self.assertEqual(views, {"left": (400, 0, 600), "right": (400, 0, 600), "top": (240, 0, 1000), "bottom": (240, 0, 1000)})

    def test_shallow_levels_split_the_edge_into_overlapping_segments(self) -> None:
        saved = self.tool.EDGE_LEVELS
        self.tool.EDGE_LEVELS = ((0.15, 3),)
        try:
            right = [v for v in self.tool.edge_views(1000, 600) if v[0] == "right"]
        finally:
            self.tool.EDGE_LEVELS = saved
        self.assertEqual(len(right), 3)
        self.assertEqual(right[0][1:3], (150, 0))
        self.assertEqual(right[-1][3], 600)
        for (_, _, _, end), (_, _, start, _) in zip(right, right[1:]):
            self.assertLess(start, end)  # overlap

    def test_a_segment_maps_back_with_its_offset_along_the_edge(self) -> None:
        depth, pad, line = 150, 50, 200
        box = self.tool.edge_face_box((line - 40, 100, line + 40, 200), "right", depth, line, pad, (1000, 600), start=300)
        self.assertEqual(box, (960.0, 350.0, 1000.0, 450.0))

    def test_the_strip_is_reflected_across_the_edge_and_the_line_marks_the_edge(self) -> None:
        pixels = self._frame()
        for edge in ("left", "right", "top", "bottom"):
            depth = 8
            view, line, pad = self.tool.mirror_strip(pixels, edge, depth)
            self.assertEqual(view[0, 0, 0], self.tool.EDGE_MARGIN_GREY)  # plain margin
            if edge == "right":  # frame's last column on both sides of the line
                self.assertEqual(view[pad, line - 1, 0], 29)
                self.assertEqual(view[pad, line, 0], 29)
                self.assertEqual(view[pad, line - depth, 0], 30 - depth)
            elif edge == "left":
                self.assertEqual(view[pad, line, 0], 0)
                self.assertEqual(view[pad, line - 1, 0], 0)
                self.assertEqual(view[pad, line + depth - 1, 0], depth - 1)
            elif edge == "bottom":
                self.assertEqual(view[line - 1, pad, 1], 19)
                self.assertEqual(view[line, pad, 1], 19)
            else:
                self.assertEqual(view[line, pad, 1], 0)
                self.assertEqual(view[line - 1, pad, 1], 0)

    def test_a_face_on_the_line_maps_back_to_the_visible_half(self) -> None:
        frame = (960, 640)
        depth, pad = 384, 100
        line = depth + pad
        # Right edge: a face 260 px wide centred on the line, so 130 px of it is in the frame.
        box = self.tool.edge_face_box((line - 130, 150, line + 130, 450), "right", depth, line, pad, frame)
        self.assertEqual(box, (830.0, 50.0, 960.0, 350.0))
        box = self.tool.edge_face_box((line - 130, 150, line + 130, 450), "left", depth, line, pad, frame)
        self.assertEqual(box, (0.0, 50.0, 130.0, 350.0))
        depth = 256
        line = depth + pad
        box = self.tool.edge_face_box((200, line - 100, 400, line + 100), "top", depth, line, pad, frame)
        self.assertEqual(box, (100.0, 0.0, 300.0, 100.0))
        box = self.tool.edge_face_box((200, line - 100, 400, line + 100), "bottom", depth, line, pad, frame)
        self.assertEqual(box, (100.0, 540.0, 300.0, 640.0))

    def test_a_half_face_reads_its_lids_by_the_whole_face_width(self) -> None:
        frame = (960, 640)
        half = self.tool.face_entry((930, 100, 960, 200), (0.8, 0.8), frame, lid_face_px=60)
        self.assertLess(half["eyes_open"], 0.1)
        self.assertIsNone(self.tool.face_entry((930, 100, 960, 200), (0.8, 0.8), frame)["eyes_open"])

    def test_a_whole_face_or_its_reflection_off_the_line_is_dropped(self) -> None:
        frame = (960, 640)
        depth, pad = 384, 100
        line = depth + pad
        inside = (line - 300, 150, line - 60, 450)  # wholly on the frame's side
        reflection = (line + 60, 150, line + 300, 450)
        off_centre = (line - 200, 150, line + 60, 450)  # crosses the line, centre 70 px off
        for box in (inside, reflection, off_centre):
            self.assertIsNone(self.tool.edge_face_box(box, "right", depth, line, pad, frame))


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
