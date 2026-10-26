from __future__ import annotations

import stat
import sys
import tempfile
import unittest
from pathlib import Path

from shootflow.faces import DETECTOR_ENV, detect_faces, parse_faces


class ParseFacesTests(unittest.TestCase):
    def test_closed_eyes_on_a_prominent_face_cost_story_score(self) -> None:
        report = parse_faces({"faces": [{"size": 0.1, "eyes_open": 0.9}, {"size": 0.08, "eyes_open": 0.1}]})
        assert report is not None
        self.assertEqual((report.face_count, report.prominent_faces, report.worst_eyes_open), (2, 2, 0.1))
        self.assertAlmostEqual(report.story_adjustment, 0.03 - 0.25 * 0.9)

    def test_open_eyes_earn_the_small_bonus_and_background_blinks_are_ignored(self) -> None:
        open_eyes = parse_faces({"faces": [{"size": 0.2, "eyes_open": 1.0}]})
        background = parse_faces({"faces": [{"size": 0.2, "eyes_open": 1.0}, {"size": 0.004, "eyes_open": 0.0}]})
        assert open_eyes is not None and background is not None
        self.assertAlmostEqual(open_eyes.story_adjustment, 0.03)
        self.assertEqual(background.worst_eyes_open, 1.0)

    def test_no_faces_and_unknown_eyes_are_neutral_or_bonus_only(self) -> None:
        self.assertEqual(parse_faces({"faces": []}).story_adjustment, 0.0)  # type: ignore[union-attr]
        unknown = parse_faces({"faces": [{"size": 0.1, "eyes_open": None}]})
        assert unknown is not None
        self.assertAlmostEqual(unknown.story_adjustment, 0.03)

    def test_bad_shapes_are_rejected(self) -> None:
        for bad in (None, [], {"faces": "x"}, {"faces": [1]}, {"faces": [{"size": 2}]},
                    {"faces": [{"size": 0.1, "eyes_open": True}]}, {"faces": [{"size": float("nan")}]},
                    {"faces": [{"size": 0.1}] * 65}):
            self.assertIsNone(parse_faces(bad), bad)


class DetectFacesTests(unittest.TestCase):
    def test_unset_variable_means_off(self) -> None:
        self.assertIsNone(detect_faces(Path("x.jpg"), environ={}))

    def test_external_command_is_run_without_a_shell(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / "det.py"
            script.write_text(
                "import json,sys\nprint(json.dumps({'faces':[{'size':0.1,'eyes_open':0.2 if 'blink' in sys.argv[-1] else 0.9}]}))\n"
            )
            script.chmod(script.stat().st_mode | stat.S_IXUSR)
            env = {DETECTOR_ENV: f"{sys.executable} {script}"}
            blink = detect_faces(Path("blink.jpg"), environ=env)
            fine = detect_faces(Path("fine.jpg"), environ=env)
            assert blink is not None and fine is not None
            self.assertLess(blink.story_adjustment, 0.0)
            self.assertGreater(fine.story_adjustment, 0.0)

    def test_failures_fall_back_to_none(self) -> None:
        self.assertIsNone(detect_faces(Path("a.jpg"), environ={DETECTOR_ENV: "/no/such/detector"}))
        self.assertIsNone(detect_faces(Path("a.jpg"), environ={DETECTOR_ENV: f"{sys.executable} -c 'print(1)'"}))
        self.assertIsNone(detect_faces(Path("a.jpg"), environ={DETECTOR_ENV: "'unterminated"}))


if __name__ == "__main__":
    unittest.main()
