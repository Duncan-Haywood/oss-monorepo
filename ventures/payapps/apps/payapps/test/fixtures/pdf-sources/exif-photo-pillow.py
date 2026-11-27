# Writes exif-photo-pillow.jpg: a small JPEG whose EXIF was written by Pillow (little-endian "II",
# as Samsung and Pixel phones write it), with the tags a phone photo carries: DateTime, the Exif
# sub-IFD's DateTimeOriginal and OffsetTimeOriginal, an orientation, a camera model and a GPS block.
# Used by src/shared/photo-exif.test.ts. Run: python3 pdf-sources/exif-photo-pillow.py exif-photo-pillow.jpg
import sys
from PIL import Image

img = Image.new("RGB", (64, 48), (200, 120, 40))
exif = Image.Exif()
exif[0x010F] = "ExampleMaker"
exif[0x0110] = "Example Phone"
exif[0x0112] = 6
exif[0x0132] = "2026:11:25 14:05:12"
exif.get_ifd(0x8769)[0x9003] = "2026:11:25 14:05:09"
exif.get_ifd(0x8769)[0x9011] = "-05:00"
exif.get_ifd(0x8825)[0x0001] = "N"
exif.get_ifd(0x8825)[0x0002] = (40.0, 26.0, 46.0)
img.save(sys.argv[1], "JPEG", quality=80, exif=exif)
