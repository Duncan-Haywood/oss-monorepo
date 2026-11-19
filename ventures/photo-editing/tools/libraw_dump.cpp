// Dump LibRaw's raw_image and the fields tools/libraw_dump_check.py compares, for a LibRaw build newer than rawpy's.
//
// Written 2026-11-18 because rawpy 0.28 bundles LibRaw 0.22.2, which refuses the Panasonic S1R II's 177 MP
// RW2 (RawFormat 8 in a 4 x 2 grid of tiles); LibRaw's git snapshot 202611 reads it. Build (LibRaw is LGPL/CDDL,
// fetched and built separately, never vendored here):
//
//   git clone --depth 1 https://github.com/LibRaw/LibRaw.git && make -C LibRaw -f Makefile.dist library
//   g++ -O2 -ILibRaw tools/libraw_dump.cpp LibRaw/lib/libraw.a -lz -lm -o libraw_dump
//   ./libraw_dump FILE.RW2 OUT.u16 > OUT.json
//
// OUT.u16 is raw_height rows of raw_width little-endian uint16 sensels (pitch removed); OUT.json the metadata.
#include "libraw/libraw.h"
#include <cstdio>

int main(int argc, char **argv) {
  if (argc != 3) {
    fprintf(stderr, "usage: %s FILE OUT.u16\n", argv[0]);
    return 2;
  }
  LibRaw r;
  int e = r.open_file(argv[1]);
  if (!e) e = r.unpack();
  if (e) {
    printf("{\"error\": \"%s\", \"libraw\": \"%s\"}\n", libraw_strerror(e), LibRaw::version());
    return 1;
  }
  const libraw_image_sizes_t &s = r.imgdata.sizes;
  FILE *f = fopen(argv[2], "wb");
  if (!f) return 1;
  const unsigned short *p = r.imgdata.rawdata.raw_image;
  for (int y = 0; y < s.raw_height; y++) fwrite(p + (size_t)y * (s.raw_pitch / 2), 2, s.raw_width, f);
  fclose(f);
  const libraw_colordata_t &c = r.imgdata.color;
  printf("{\"libraw\": \"%s\", \"make\": \"%s\", \"model\": \"%s\", \"raw_width\": %d, \"raw_height\": %d, ",
         LibRaw::version(), r.imgdata.idata.make, r.imgdata.idata.model, s.raw_width, s.raw_height);
  printf("\"crop\": [%d, %d, %d, %d], ", s.raw_inset_crops[0].cleft, s.raw_inset_crops[0].ctop,
         s.raw_inset_crops[0].cwidth, s.raw_inset_crops[0].cheight);
  printf("\"black\": %d, \"cblack\": [%d, %d, %d, %d], \"white\": %d, ", c.black, c.cblack[0], c.cblack[1],
         c.cblack[2], c.cblack[3], c.maximum);
  printf("\"cam_mul\": [%g, %g, %g, %g], \"cfa\": [%d, %d, %d, %d]}\n", c.cam_mul[0], c.cam_mul[1], c.cam_mul[2],
         c.cam_mul[3], r.COLOR(0, 0), r.COLOR(0, 1), r.COLOR(1, 0), r.COLOR(1, 1));
  return 0;
}
