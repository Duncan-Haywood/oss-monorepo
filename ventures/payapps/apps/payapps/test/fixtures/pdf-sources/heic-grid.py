# Writes the HEIC photos the WebCodecs HEIC path is tested on (src/shared/heif.ts,
# src/client/lib/heic-webcodecs.ts), encoded by libheif's x265 encoder through pillow-heif, not by us:
#   heic-grid-libheif.heic     600 x 400 stored as a 3 x 2 grid of 256 x 256 HEVC tiles (768 x 512,
#                              cropped to 600 x 400 by the grid's output size), as an iPhone stores
#                              its photos in 512 x 512 tiles
#   heic-grid-rot-libheif.heic the same picture with EXIF orientation 6, which libheif writes as an
#                              'irot' property
#   heic-grid-transpose-libheif.heic  EXIF orientation 5 (a transpose), written as irot then imir
#   heic-single-libheif.heic   the same picture as one HEVC image item, no grid
# The picture is a colour ramp with one block per tile, so a tile drawn in the wrong place shows.
# Run: pip install pillow pillow-heif; python3 pdf-sources/heic-grid.py .
import os
import sys

from PIL import Image, ImageDraw
import pillow_heif

pillow_heif.register_heif_opener()


def picture():
    img = Image.new("RGB", (600, 400))
    px = img.load()
    for y in range(400):
        for x in range(600):
            px[x, y] = (x * 255 // 599, y * 255 // 399, 128)
    d = ImageDraw.Draw(img)
    shades = [(255, 255, 255), (0, 0, 0), (255, 0, 0), (0, 160, 0), (0, 0, 255), (255, 200, 0)]
    for i, c in enumerate(shades):
        col, row = i % 3, i // 3
        x, y = col * 256 + 40, row * 256 + 40
        d.rectangle([x, y, min(x + 80, 599), min(y + 60, 399)], fill=c)
    return img


out = sys.argv[1]
img = picture()
pillow_heif.options.GRID_TILE_SIZE = 256
img.save(os.path.join(out, "heic-grid-libheif.heic"), "HEIF", quality=70)
exif = Image.Exif()
exif[0x0112] = 6
img.save(os.path.join(out, "heic-grid-rot-libheif.heic"), "HEIF", quality=70, exif=exif.tobytes())
exif[0x0112] = 5
img.save(os.path.join(out, "heic-grid-transpose-libheif.heic"), "HEIF", quality=70, exif=exif.tobytes())
pillow_heif.options.GRID_TILE_SIZE = 0
img.save(os.path.join(out, "heic-single-libheif.heic"), "HEIF", quality=70)
