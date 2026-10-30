from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

from shootflow.faces import DETECTOR_ENV, detect_faces

TOOL = Path(__file__).resolve().parents[1] / "tools" / "opencv_face_detector.py"
HAS_CV2 = importlib.util.find_spec("cv2") is not None and importlib.util.find_spec("numpy") is not None


def _load():
    spec = importlib.util.spec_from_file_location("opencv_face_detector", TOOL)
    module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


class EyeScoreTests(unittest.TestCase):
    def test_score_falls_with_the_number_of_eyes_found(self) -> None:
        score = _load().eyes_open_score
        self.assertEqual((score(2), score(1), score(0)), (0.95, 0.5, 0.1))


@unittest.skipUnless(HAS_CV2, "needs opencv-python-headless<5 and numpy")
class DetectorCommandTests(unittest.TestCase):
    def test_a_frame_with_no_face_reports_none_through_the_real_contract(self) -> None:
        import cv2
        import numpy as np

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "plain.png"
            cv2.imwrite(str(path), np.full((240, 320, 3), 128, dtype=np.uint8))
            report = detect_faces(path, environ={DETECTOR_ENV: f"{sys.executable} {TOOL}"})
        assert report is not None
        self.assertEqual((report.face_count, report.prominent_faces), (0, 0))


if __name__ == "__main__":
    unittest.main()
