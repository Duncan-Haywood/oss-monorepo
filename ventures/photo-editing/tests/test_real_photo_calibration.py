from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

HAS_PIL = importlib.util.find_spec("PIL") is not None
TOOL = Path(__file__).resolve().parents[1] / "tools" / "real_photo_calibration.py"


@unittest.skipUnless(HAS_PIL, "needs Pillow")
class CalibrationHelperTests(unittest.TestCase):
    def test_tilt_crop_removes_corners_and_keeps_aspect(self) -> None:
        from PIL import Image

        spec = importlib.util.spec_from_file_location("real_photo_calibration", TOOL)
        module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(module)  # type: ignore[union-attr]
        out = module._tilt(Image.new("RGB", (100, 50), "white"), 4.0)
        self.assertEqual(out.size, (76, 38))


if __name__ == "__main__":
    unittest.main()
