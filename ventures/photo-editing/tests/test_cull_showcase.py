"""tools/cull_showcase.py builds its bursts offline from a filled cache, with known kinds."""

import importlib.util
import shutil
import tempfile
import unittest
from pathlib import Path

try:
    from PIL import Image, ImageStat
except ImportError:  # pragma: no cover - Pillow is optional for the core
    Image = None

TOOL = Path(__file__).resolve().parents[1] / "tools" / "cull_showcase.py"


def _load():
    spec = importlib.util.spec_from_file_location("cull_showcase", TOOL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@unittest.skipIf(Image is None, "Pillow not installed")
class CullShowcaseTest(unittest.TestCase):
    def test_builds_every_frame_from_cache_with_its_kind(self):
        mod = _load()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cache = root / "cache"
            cache.mkdir()
            for name in mod.SHOOT:
                img = Image.new("RGB", (64, 48))
                for x in range(64):
                    for y in range(48):
                        img.putpixel((x, y), ((x * 4) % 256, (y * 5) % 256, 128 if (x // 8 + y // 8) % 2 else 32))
                img.save(cache / f"{name}.jpg")
            kinds = mod.build_shoot(root / "photos", cache)
            expected = sum(len(frames) for frames in mod.SHOOT.values())
            self.assertEqual(len(kinds), expected)
            self.assertEqual(len(list((root / "photos").glob("*.jpg"))), expected)
            self.assertEqual(kinds["butterfly_b.jpg"], "dark")
            self.assertEqual(kinds["fruits_c.jpg"], "blur")
            dark = Image.open(root / "photos" / "butterfly_b.jpg").convert("L")
            orig = Image.open(root / "photos" / "butterfly_a.jpg").convert("L")
            self.assertLess(ImageStat.Stat(dark).mean[0], ImageStat.Stat(orig).mean[0] * 0.5)

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
    def test_known_degradations_are_never_keepers_on_a_synthetic_burst(self):
        mod = _load()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "cache").mkdir()
            for name in mod.SHOOT:
                img = Image.new("RGB", (160, 120))
                seed = sum(map(ord, name))
                for x in range(160):
                    for y in range(120):
                        v = ((x // (6 + seed % 5)) + (y // (4 + seed % 7))) % 2
                        img.putpixel((x, y), (200 * v + 30, (seed * 7) % 200 + 20, 220 - 180 * v))
                img.save(root / "cache" / f"{name}.jpg", quality=95)
            self.assertEqual(mod.main(["--out", str(root)]), 0)


if __name__ == "__main__":
    unittest.main()
