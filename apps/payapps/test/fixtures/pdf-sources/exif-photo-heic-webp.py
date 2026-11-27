# Writes exif-photo-libheif.heic and exif-photo-pillow.webp: small photos whose EXIF was written by
# libheif (through pillow-heif) and by Pillow's libwebp writer, not by us, with the tags a phone
# photo carries: DateTime, the Exif sub-IFD's DateTimeOriginal and OffsetTimeOriginal, an
# orientation, a camera model and a GPS block. The HEIC puts its EXIF in an 'Exif' item located by
# the meta box's iinf and iloc (ISO/IEC 23008-12, as an iPhone does); the WebP in a RIFF 'EXIF' chunk.
# Used by src/shared/photo-exif.test.ts.
# Run: pip install pillow pillow-heif; python3 pdf-sources/exif-photo-heic-webp.py .
import os
import sys

from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()

out = sys.argv[1]
img = Image.new("RGB", (64, 48), (40, 120, 200))
exif = Image.Exif()
exif[0x010F] = "ExampleMaker"
exif[0x0110] = "Example Phone"
exif[0x0112] = 1
exif[0x0132] = "2026:11:24 16:42:31"
exif.get_ifd(0x8769)[0x9003] = "2026:11:24 16:42:30"
exif.get_ifd(0x8769)[0x9011] = "-08:00"
exif.get_ifd(0x8825)[0x0001] = "N"
exif.get_ifd(0x8825)[0x0002] = (37.0, 46.0, 30.0)
img.save(os.path.join(out, "exif-photo-libheif.heic"), "HEIF", quality=50, exif=exif.tobytes())
img.save(os.path.join(out, "exif-photo-pillow.webp"), "WEBP", quality=50, exif=exif.tobytes())
