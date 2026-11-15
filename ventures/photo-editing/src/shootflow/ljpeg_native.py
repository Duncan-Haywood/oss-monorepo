"""Optional native Huffman reader for the lossless-JPEG decoder.

ShootFlow stays standard-library only: this module carries the C source of
one small function as a string, compiles it with the system C compiler
(``cc``, or ``$CC``) the first time it is asked for, caches the shared
library under ``$SHOOTFLOW_CACHE`` (default ``~/.cache/shootflow``), and
loads it through ``ctypes``. With no compiler, a failed build or a refused
load, ``reader()`` returns ``None`` and the decoder keeps its pure-Python
Huffman loop (``raw_develop._huffman_run``), which is the reference. The
outputs are the same difference for difference (``tests/test_ljpeg_native.py``
runs every encoder case through both).

The C function is the Huffman pass only, the part measured at about 85% of
decoding (``eval/ljpeg-native-huffman-2026-11-12.md``): it reads de-stuffed
big-endian 32-bit words through one 16-bit table per component (code length
and size category for every 16-bit prefix) and writes one signed difference
per component per MCU. Past the end of the words the stream reads as zeros,
as in the Python reader. An invalid code returns -1 and the caller raises.

The same library carries ``shootflow_nikon_run``, the whole Nikon NEF decode
(Huffman pass, prediction and linearisation curve) of ``shootflow.nef``, whose
pure-Python decoder stays the reference (``tests/test_nef.py`` runs both), and
``shootflow_olympus_run``, the whole Olympus ORF decode of ``shootflow.orf``
(``tests/test_orf.py`` runs both), and ``shootflow_panasonic_run``, the whole
Panasonic RW2 decode of ``shootflow.rw2`` (``tests/test_rw2.py`` runs both), and the three Samsung SRW
decoders of ``shootflow.srw`` (``shootflow_samsung_rows_run``, ``_huffman_run``, ``_blocks_run``;
``tests/test_srw.py`` runs both), and ``shootflow_pentax_run``, the Pentax PEF decode of
``shootflow.pef`` (``tests/test_pef.py`` runs both), and ``shootflow_fuji_strip``, one strip of a
Fujifilm lossless compressed RAF (``shootflow.raf_compressed``; ``tests/test_raf_compressed.py`` runs both).

Nothing here downloads or runs anything but the system compiler on the
source below. ``SHOOTFLOW_NATIVE=0`` turns it off.
"""

from __future__ import annotations

import ctypes
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from array import array
from pathlib import Path
from typing import Any

C_SOURCE = r"""
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

/* luts: nf tables of 65536 entries, entry = (length << 8) | size, or 0 for no code.
   Returns the number of differences written (mcus * nf) or -1 on an invalid code. */
long shootflow_huffman_run(const uint32_t *words, long nwords, long mcus, int nf,
                           const uint16_t *luts, int32_t *out)
{
    uint64_t acc = 0;
    int nbits = 0;
    long wi = 0;
    long k = 0;
    for (long m = 0; m < mcus; m++) {
        for (int c = 0; c < nf; c++) {
            if (nbits < 32) {
                uint64_t w = wi < nwords ? (uint64_t)words[wi] : 0;
                wi++;
                acc = (nbits ? (acc << 32) : 0) | w;
                nbits += 32;
            }
            unsigned peek = (unsigned)((acc >> (nbits - 16)) & 0xFFFF);
            uint16_t e = luts[(size_t)c * 65536 + peek];
            if (!e) return -1;
            int len = e >> 8, s = e & 0xFF;
            nbits -= len;
            if (s == 0) { out[k++] = 0; continue; }
            if (s == 16) { out[k++] = 32768; continue; }
            if (nbits < s) {
                uint64_t w = wi < nwords ? (uint64_t)words[wi] : 0;
                wi++;
                acc = (acc << 32) | w;
                nbits += 32;
            }
            nbits -= s;
            int32_t v = (int32_t)((acc >> nbits) & ((1u << s) - 1));
            if (v < (1 << (s - 1))) v -= (1 << s) - 1;
            out[k++] = v;
        }
    }
    return k;
}

/* The same Huffman pass, read straight from the entropy-coded bytes of a scan.

   Byte-for-byte the stream raw_develop._segment_words builds, without building it:
   a stuffed FF 00 reads as FF; FF followed by any other byte is a marker, and from
   there the segment reads as zeros. With restart > 0 the scan is decoded in
   intervals of `restart` MCUs: after each, the segment's marker is found (whether
   or not the decode reached it), the next FF D0-D7 at or after it is skipped, and
   the bit reader starts afresh (as raw_develop._scan_diffs does). With no restart
   marker left, the next interval starts at the end of the data and reads zeros.
   Returns mcus * nf, or -1 on an invalid code. Runs without the GIL (ctypes). */
static long scan_marker(const uint8_t *d, long len, long p)
{
    while (p < len) {
        if (d[p] == 0xFF && p + 1 < len) {
            if (d[p + 1] != 0) return p;
            p += 2;
        } else {
            p++;
        }
    }
    return len;
}

long shootflow_huffman_scan(const uint8_t *d, long len, long pos, long mcus, long restart,
                            int nf, const uint16_t *luts, const uint16_t *fast, int32_t *out)
{
    long k = 0;
    long done = 0;
    long p = pos;
    if (restart <= 0) restart = mcus;
    /* fast: nf 12-bit first look-ups (8 KB a component, they stay in L1) for codes of up
       to 12 bits; 0 sends the rare longer code to the full 16-bit table. */
    while (done < mcus) {
        if (done) {
            long stop = scan_marker(d, len, p);
            p = len;
            for (long i = stop; i + 1 < len; i++) {
                if (d[i] == 0xFF && d[i + 1] >= 0xD0 && d[i + 1] <= 0xD7) { p = i + 2; break; }
            }
        }
        long n = mcus - done < restart ? mcus - done : restart;
        uint64_t acc = 0;
        int nbits = 0;
        int ended = 0;  /* reached a marker or the end: zeros from here */
        for (long m = 0; m < n; m++) {
            for (int c = 0; c < nf; c++) {
                while (nbits < 32) {  /* a code and its extra bits take at most 31 */
                    if (!ended && nbits <= 32 && p + 4 <= len) {
                        /* Four bytes at once when none of them is FF (no stuffing, no marker). */
                        uint32_t w = ((uint32_t)d[p] << 24) | ((uint32_t)d[p + 1] << 16)
                                   | ((uint32_t)d[p + 2] << 8) | (uint32_t)d[p + 3];
                        uint32_t x = ~w;
                        if (!((x - 0x01010101u) & ~x & 0x80808080u)) {
                            acc = (acc << 32) | w;
                            nbits += 32;
                            p += 4;
                            continue;
                        }
                    }
                    unsigned b = 0;
                    if (!ended) {
                        if (p >= len) {
                            ended = 1;
                        } else if (d[p] == 0xFF && p + 1 < len) {
                            if (d[p + 1] == 0) { b = 0xFF; p += 2; }
                            else ended = 1;
                        } else {
                            b = d[p++];
                        }
                    }
                    acc = (acc << 8) | b;
                    nbits += 8;
                }
                uint16_t e = fast[(size_t)c * 4096 + ((acc >> (nbits - 12)) & 0xFFF)];
                if (!e) {
                    if (!luts) return -1;  /* every code fits the 12-bit table */
                    unsigned peek = (unsigned)((acc >> (nbits - 16)) & 0xFFFF);
                    e = luts[(size_t)c * 65536 + peek];
                    if (!e) return -1;
                }
                int len_ = e >> 8, s = e & 0xFF;
                nbits -= len_;
                if (s == 0) { out[k++] = 0; continue; }
                if (s == 16) { out[k++] = 32768; continue; }
                nbits -= s;
                int32_t v = (int32_t)((acc >> nbits) & ((1u << s) - 1));
                if (v < (1 << (s - 1))) v -= (1 << s) - 1;
                out[k++] = v;
            }
        }
        done += n;
    }
    return k;
}

/* raw_develop._predict_scan in C: differences to samples for any predictor 1-7 and any
   restart interval, masked to 16 bits, then shifted left by the point transform ``pt``
   (0-15) as _decode_scan does after the Python pass. Returns 0, or -1 when a reference
   would fall outside the image or a shifted sample would not fit in 16 bits (the Python
   pass then decides, and keeps the wide value as it always has). */
long shootflow_predict(const int32_t *diffs, long width, long height, int nf, int predictor,
                       int initial, long restart, int pt, uint16_t *out)
{
    if (pt < 0 || pt > 15) return -1;
    long row_len = width * nf;
    long mcu = 0, k = 0, first_line = 0;
    for (long y = 0; y < height; y++) {
        long base = y * row_len;
        for (long x = 0; x < width; x++) {
            int fresh = mcu == 0;
            if (restart && mcu && mcu % restart == 0) { fresh = 1; first_line = y; }
            mcu++;
            long at = base + x * nf;
            for (int c = 0; c < nf; c++) {
                int32_t diff = diffs[k++];
                int32_t pred;
                if (fresh) {
                    pred = initial;
                } else if (y == first_line) {
                    long r = x > 0 ? at - nf + c : at - row_len + c;
                    if (r < 0) return -1;
                    pred = out[r];
                } else if (x == 0) {
                    pred = out[at - row_len + c];
                } else {
                    int32_t ra = out[at - nf + c], rb = out[at - row_len + c];
                    int32_t rc = out[at - row_len - nf + c];
                    switch (predictor) {
                    case 1: pred = ra; break;
                    case 2: pred = rb; break;
                    case 3: pred = rc; break;
                    case 4: pred = ra + rb - rc; break;
                    case 5: pred = ra + ((rb - rc) >> 1); break;
                    case 6: pred = rb + ((ra - rc) >> 1); break;
                    default: pred = (ra + rb) >> 1; break;
                    }
                }
                out[at + c] = (uint16_t)((pred + diff) & 0xFFFF);
            }
        }
    }
    if (pt) {
        /* Shift only after every prediction: the predictors read the stored (unshifted)
           neighbours. A sample with any of its top pt bits set would overflow. */
        long n = row_len * height;
        uint16_t high = (uint16_t)(0xFFFFu << (16 - pt));
        for (long i = 0; i < n; i++) {
            if (out[i] & high) return -1;
            out[i] = (uint16_t)(out[i] << pt);
        }
    }
    return 0;
}

/* Nikon compressed NEF (shootflow.nef._decode_python in C): MSB-first bits with no
   stuffing, past the end reading as zeros. lut/lut2: 65536-entry prefix tables, entry
   (length << 8) | symbol, 0 for no code; lut2 (the after-split table) is used from row
   `split` when split > 0. vpred: the four starting predictions; curve: 0x4000 entries.
   Returns 0, or -1 on an invalid code. Runs without the GIL (ctypes). */
long shootflow_nikon_run(const uint8_t *d, long len, long width, long height,
                         const uint16_t *lut, const uint16_t *lut2, long split,
                         const uint16_t *vpred_in, const uint16_t *curve, uint16_t *out)
{
    uint64_t acc = 0;
    int nbits = 0;
    long p = 0;
    uint16_t vpred[2][2] = {{vpred_in[0], vpred_in[1]}, {vpred_in[2], vpred_in[3]}};
    uint16_t hpred[2] = {0, 0};
    const uint16_t *t = lut;
    for (long row = 0; row < height; row++) {
        if (split > 0 && row == split && lut2) t = lut2;
        uint16_t *o = out + row * width;
        for (long col = 0; col < width; col++) {
            while (nbits < 40) {
                acc = (acc << 8) | (p < len ? d[p] : 0);
                p++;
                nbits += 8;
            }
            uint16_t e = t[(acc >> (nbits - 16)) & 0xFFFF];
            if (!e) return -1;
            nbits -= e >> 8;
            int sym = e & 0xFF, l = sym & 15, shl = sym >> 4, take = l - shl;
            int32_t bits = 0;
            if (take > 0) {
                nbits -= take;
                bits = (int32_t)((acc >> nbits) & ((1u << take) - 1));
            }
            int32_t diff = (((bits << 1) + 1) << shl) >> 1;
            if (!l) diff = 0;
            else if ((diff & (1 << (l - 1))) == 0) diff -= (1 << l) - (shl ? 0 : 1);
            uint16_t v;
            if (col < 2) {
                v = (uint16_t)(vpred[row & 1][col] + diff);
                vpred[row & 1][col] = v;
                hpred[col] = v;
            } else {
                v = (uint16_t)(hpred[col & 1] + diff);
                hpred[col & 1] = v;
            }
            int16_t s = (int16_t)v;
            o[col] = curve[s < 0 ? 0 : (s > 0x3FFF ? 0x3FFF : s)];
        }
    }
    return 0;
}

/* The whole Olympus ORF decode of shootflow.orf._decode_python: one MSB-first stream
   from byte 7, no stuffing, past the end reading as zeros; per row and column parity a
   running magnitude, smoothed difference and run of small magnitudes; a unary count of
   leading zeros (twelve escape to a 16 - nbits field); then the edge or median-style
   prediction from left, up and up-left. Returns 0. Runs without the GIL (ctypes). */
long shootflow_olympus_run(const uint8_t *d, long len, long width, long height, uint16_t *out)
{
    uint64_t acc = 0;
    int nb = 0;
    long p = 7;
#define OLY_NEED(k) while (nb < (k)) { acc = (acc << 8) | (p < len ? d[p] : 0); p++; nb += 8; }
    for (long row = 0; row < height; row++) {
        int carry[2][3] = {{0, 0, 0}, {0, 0, 0}};
        uint16_t *o = out + row * width;
        for (long col = 0; col < width; col++) {
            int *c = carry[col & 1];
            int i = c[2] < 3 ? 2 : 0;
            int nbits = 2 + i;
            while (((unsigned)(uint16_t)c[0]) >> (nbits + i)) nbits++;
            OLY_NEED(3);
            nb -= 3;
            int s = (int)((acc >> nb) & 7);
            int low = s & 3, sign = (s & 4) ? -1 : 0;
            OLY_NEED(12);
            unsigned peek = (unsigned)((acc >> (nb - 12)) & 0xFFF);
            int high;
            if (!peek) {
                nb -= 12;
                int k = 16 - nbits;
                high = 0;
                if (k > 0) {
                    OLY_NEED(k);
                    nb -= k;
                    high = (int)((acc >> nb) & ((1u << k) - 1)) >> 1;
                }
            } else {
                int top = 11;
                while (!(peek >> top)) top--;
                high = 11 - top;
                nb -= high + 1;
            }
            int lowbits = 0;
            if (nbits > 0) {
                OLY_NEED(nbits);
                nb -= nbits;
                lowbits = (int)((acc >> nb) & ((1u << nbits) - 1));
            }
            c[0] = (high << nbits) | lowbits;
            int diff = (c[0] ^ sign) + c[1];
            c[1] = (diff * 3 + c[1]) >> 5;
            c[2] = c[0] > 16 ? 0 : c[2] + 1;
            int pred;
            if (row < 2 && col < 2) pred = 0;
            else if (row < 2) pred = o[col - 2];
            else if (col < 2) pred = o[col - 2 * width];
            else {
                int w = o[col - 2], n = o[col - 2 * width], nw = o[col - 2 * width - 2];
                int dw = w > nw ? w - nw : nw - w, dn = n > nw ? n - nw : nw - n;
                if ((w < nw && nw < n) || (n < nw && nw < w))
                    pred = (dw > 32 || dn > 32) ? w + n - nw : (w + n) >> 1;
                else
                    pred = dw > dn ? w : n;
            }
            o[col] = (uint16_t)(pred + (int)((unsigned)diff << 2 | (unsigned)low));
        }
    }
#undef OLY_NEED
    return 0;
}

/* The whole Panasonic RW2 (RawFormat 4) decode of shootflow.rw2._decode_python. d holds the
   sensor data with each 0x4000-byte block already rotated (shootflow.rw2.rotated_blocks), len a
   multiple of 0x4000. Bits come from the top of each block downward in 17-bit positions; runs of
   14 sensels reset two predictions; a 2-bit shift every third sensel. Returns 0. */
long shootflow_panasonic_run(const uint8_t *d, long len, long width, long height, uint16_t *out)
{
    long base = 0;
    unsigned vbits = 0;
    int first = 1;
#define PANA_BITS(n, dst) do { \
        if (!vbits) { if (first) first = 0; else base += 0x4000; } \
        vbits = (vbits - (n)) & 0x1FFFF; \
        long at_ = base + (long)((vbits >> 3) ^ 0x3FF0); \
        unsigned w_ = at_ + 1 < len ? (unsigned)d[at_] | ((unsigned)d[at_ + 1] << 8) : (at_ < len ? d[at_] : 0); \
        (dst) = (int)((w_ >> (vbits & 7)) & ((1u << (n)) - 1)); \
    } while (0)
    long k = 0;
    for (long row = 0; row < height; row++) {
        int pred[2] = {0, 0}, nonz[2] = {0, 0}, sh = 0;
        for (long col = 0; col < width; col++) {
            int i = (int)(col % 14), v;
            if (i == 0) pred[0] = pred[1] = nonz[0] = nonz[1] = 0;
            if (i % 3 == 2) { PANA_BITS(2, v); sh = 4 >> (3 - v); }
            int p = i & 1;
            if (nonz[p]) {
                int j;
                PANA_BITS(8, j);
                if (j) {
                    pred[p] -= 0x80 << sh;
                    if (pred[p] < 0 || sh == 4) pred[p] &= ~(-1 << sh);
                    pred[p] += j << sh;
                }
            } else {
                PANA_BITS(8, nonz[p]);
                if (nonz[p] || i > 11) { PANA_BITS(4, v); pred[p] = nonz[p] << 4 | v; }
            }
            out[k++] = (uint16_t)pred[col & 1];
        }
    }
#undef PANA_BITS
    return 0;
}

/* Samsung SRW readers of shootflow.srw (the Python decoders there are the reference).
   PH1 bits: MSB first from 32-bit little-endian words; past len, zeros. */
typedef struct { const uint8_t *d; long len; long p; uint64_t buf; int vbits; } srw_bits;
static uint32_t srw_word(const uint8_t *d, long len, long p)
{
    uint32_t w = 0;
    for (int i = 0; i < 4; i++) if (p + i >= 0 && p + i < len) w |= (uint32_t)d[p + i] << (8 * i);
    return w;
}
static unsigned srw_get(srw_bits *b, int n)
{
    if (n <= 0) return 0;
    if (b->vbits < n) { b->buf = b->buf << 32 | srw_word(b->d, b->len, b->p); b->p += 4; b->vbits += 32; }
    b->vbits -= n;
    return (unsigned)((b->buf >> b->vbits) & ((n >= 32) ? 0xFFFFFFFFu : ((1u << n) - 1)));
}

/* Compression 32770 with a row table (samsung_load_raw). out holds width*height + 64 sensels.
   Returns 0, or -1 on a bad bit length or a vertical prediction above the frame. */
long shootflow_samsung_rows_run(const uint8_t *d, long len, long start, long table, long width, long height,
                                uint16_t *out)
{
    for (long row = 0; row < height; row++) {
        long tp = table + 4 * row;
        if (tp + 4 > len) return -1;
        srw_bits b = { d, len, start + (long)srw_word(d, len, tp), 0, 0 };
        int lens[4];
        for (int c = 0; c < 4; c++) lens[c] = row < 2 ? 7 : 4;
        long base = row * width;
        for (long col = 0; col < width; col += 16) {
            int dir = (int)srw_get(&b, 1), ops[4];
            for (int c = 0; c < 4; c++) ops[c] = (int)srw_get(&b, 2);
            for (int c = 0; c < 4; c++) {
                if (ops[c] == 3) lens[c] = (int)srw_get(&b, 4);
                else if (ops[c] == 2) lens[c]--;
                else if (ops[c] == 1) lens[c]++;
            }
            for (int k = 0; k < 16; k++) {
                int c = k < 8 ? 2 * k : 2 * (k - 8) + 1;
                int n = lens[((c & 1) << 1) | (c >> 3)];
                if (n < 0 || n > 32) return -1;
                long v = (long)srw_get(&b, n);
                if (n && (v >> (n - 1))) v -= (long)1 << n;
                long pred;
                if (dir) {
                    long up = row - ((c & 1) ? 2 : 1);
                    if (up < 0) return -1;
                    pred = out[up * width + col + c];
                } else if (col) pred = out[base + col - ((c & 1) ? 1 : 2)];
                else pred = 128;
                out[base + col + c] = (uint16_t)(pred + v);
            }
        }
    }
    for (long row = 0; row + 1 < height; row += 2)
        for (long col = 0; col + 1 < width; col += 2) {
            uint16_t t = out[row * width + col + 1];
            out[row * width + col + 1] = out[(row + 1) * width + col];
            out[(row + 1) * width + col] = t;
        }
    return 0;
}

/* Compression 32772 (samsung2_load_raw): lut is 1024 entries of (length << 8) | bits.
   Returns 0, or -1 when a value leaves [0, 2^bits). */
long shootflow_samsung_huffman_run(const uint8_t *d, long len, long width, long height, int bits,
                                   const uint16_t *lut, uint16_t *out)
{
    uint64_t acc = 0;
    int nb = 0;
    long p = 0, k = 0;
    int vpred[2][2] = {{0, 0}, {0, 0}}, hpred[2] = {0, 0};
    long limit = 1L << bits;
#define S2_FILL(n) while (nb < (n)) { acc = acc << 8 | (p < len ? d[p] : 0); p++; nb += 8; }
    for (long row = 0; row < height; row++) {
        int *vp = vpred[row & 1];
        for (long col = 0; col < width; col++) {
            S2_FILL(10);
            unsigned e = lut[(acc >> (nb - 10)) & 1023];
            nb -= e >> 8;
            int n = e & 0xFF;
            int v = 0;
            if (n) {
                S2_FILL(n);
                nb -= n;
                v = (int)((acc >> nb) & ((1u << n) - 1));
                if (!(v >> (n - 1))) v -= (1 << n) - 1;
            }
            if (col < 2) { vp[col] += v; hpred[col] = vp[col]; }
            else hpred[col & 1] += v;
            int h = hpred[col & 1];
            if (h < 0 || h >= limit) return -1;
            out[k++] = (uint16_t)h;
        }
    }
#undef S2_FILL
    return 0;
}

/* Pentax PEF compression 65535 (shootflow.pef; dcraw's pentax_load_raw): lut is 4096 entries of
   (code length << 8) | difference bits, from the maker note's 0x0220 table, read 12 bits ahead MSB first.
   Returns 0, or -1 when a value leaves [0, 2^bits) or a code length is 0. */
long shootflow_pentax_run(const uint8_t *d, long len, long width, long height, int bits,
                          const uint16_t *lut, uint16_t *out)
{
    uint64_t acc = 0;
    int nb = 0;
    long p = 0, k = 0;
    int vpred[2][2] = {{0, 0}, {0, 0}}, hpred[2] = {0, 0};
    long limit = 1L << bits;
#define PX_FILL(n) while (nb < (n)) { acc = acc << 8 | (p < len ? d[p] : 0); p++; nb += 8; }
    for (long row = 0; row < height; row++) {
        int *vp = vpred[row & 1];
        for (long col = 0; col < width; col++) {
            PX_FILL(12);
            unsigned e = lut[(acc >> (nb - 12)) & 4095];
            if (!(e >> 8)) return -1;
            nb -= e >> 8;
            int n = e & 0xFF;
            int v = 0;
            if (n) {
                PX_FILL(n);
                nb -= n;
                v = (int)((acc >> nb) & ((1u << n) - 1));
                if (!(v >> (n - 1))) v -= (1 << n) - 1;
            }
            if (col < 2) { vp[col] += v; hpred[col] = vp[col]; }
            else hpred[col & 1] += v;
            int h = hpred[col & 1];
            if (h < 0 || h >= limit) return -1;
            out[k++] = (uint16_t)h;
        }
    }
#undef PX_FILL
    return 0;
}

/* Compression 32773 (samsung3_load_raw). out holds (height + 2) * width sensels, the frame from row 2.
   Returns 0, or -1 on a bad bit length. */
long shootflow_samsung_blocks_run(const uint8_t *d, long len, long start, long width, long height, uint16_t *out)
{
    static const int pa[7] = {-4, -2, -2, 0, 0, 2, 4}, pb[7] = {-4, -2, 0, 0, 2, 2, 4};
    if (start + 14 > len) return -1;
    int opt = d[start + 9];
    int init = d[start + 12] | d[start + 13] << 8;
    long off = 2 * width;
    long rowp = start + 16;
    for (long row = 0; row < height; row++) {
        srw_bits b = { d, len, rowp, 0, 0 };
        int mag = 0, pmode = 7, lent[3][2], lens[4] = {0, 0, 0, 0};
        for (int i = 0; i < 3; i++) lent[i][0] = lent[i][1] = row < 2 ? 7 : 4;
        long base = off + row * width;
        long green = off + (row - 1) * width + (1 - ((row & 1) << 1));
        long other = off + (row - 2) * width;
        long prow[2];
        prow[row & 1] = green;
        prow[~row & 1] = other;
        for (long tab = 0; tab + 15 < width; tab += 16) {
            if (!(opt & 4) && !(tab & 63)) {
                int i = (int)srw_get(&b, 2);
                if (i < 3) mag += i == 0 ? 0 : (i == 1 ? -2 : 2);
                else mag = (int)srw_get(&b, 12);
            }
            if (opt & 2) pmode = 7 - 4 * (int)srw_get(&b, 1);
            else if (!srw_get(&b, 1)) pmode = (int)srw_get(&b, 3);
            if ((opt & 1) || !srw_get(&b, 1)) {
                for (int c = 0; c < 4; c++) lens[c] = (int)srw_get(&b, 2);
                for (int c = 0; c < 4; c++) {
                    int i = ((int)((row & 1) << 1) | (c & 1)) % 3;
                    lens[c] = lens[c] < 3 ? lent[i][0] + (lens[c] == 0 ? 0 : (lens[c] == 1 ? 1 : -1))
                                          : (int)srw_get(&b, 4);
                    lent[i][0] = lent[i][1];
                    lent[i][1] = lens[c];
                }
            }
            for (int c = 0; c < 16; c++) {
                long col = tab + ((((long)c & 7) << 1) ^ (c >> 3) ^ (row & 1));
                long pred;
                if (pmode == 7 || row < 2) pred = tab ? out[base + tab - 2 + (col & 1)] : init;
                else {
                    long q = prow[col & 1] + col;
                    pred = ((long)out[q + pa[pmode]] + out[q + pb[pmode]] + 1) >> 1;
                }
                int n = lens[c >> 2];
                if (n < 0 || n > 32) return -1;
                long v = (long)srw_get(&b, n);
                if (n && (v >> (n - 1))) v -= (long)1 << n;
                out[base + col] = (uint16_t)(pred + v * (mag * 2 + 1) + mag);
            }
        }
        long used = b.p - rowp;
        rowp += (used + 15) / 16 * 16;
    }
    return 0;
}
/* Fujifilm compressed RAF, lossless or lossy: one strip (shootflow.raf_compressed.decode_strip, the
   reference). 18 lines of lw + 2 values (R0..R4, G0..G7, B0..B4); six pairs per group of six rows.
   out points at the strip's first sensel; rows are out_stride apart. qb is NULL for a lossless
   stream, else the strip's quantisation base per line group (lossy).
   Returns the number of coding errors (0 on a clean stream). */
static const int fuji_xtrans_abs[6][6] = {{1,1,0,1,1,2},{1,1,2,1,1,0},{2,0,1,0,2,1},
                                         {1,1,2,1,1,0},{1,1,0,1,1,2},{0,2,1,2,0,1}};
static const int fuji_pairs[6][2][2] = {{{0,2},{1,2}},{{1,3},{2,2}},{{0,3},{1,4}},
                                        {{1,5},{2,3}},{{0,4},{1,6}},{{1,7},{2,4}}};
static const int fuji_base[3] = {0, 5, 13};

typedef struct { const uint8_t *d; long p, end; uint32_t acc; int n; long err; } fuji_bits;

/* one quantiser: gradient table over -top..top, residual step 2 * q_base + 1 */
typedef struct { int8_t *t; int q_base, total, raw_bits, mult, max_grad, step; } fuji_qt;

static int fuji_log2ceil(int v) { int r = 0; if (v--) { do { r++; } while (v >>= 1); } return r; }

static int fuji_qt_init(fuji_qt *q, int top, int q_base, int p1, int p2, int p3, int mult, int max_grad) {
    q->t = (int8_t *)malloc((size_t)2 * top + 1);
    if (!q->t) return -1;
    for (int i = 0; i <= 2 * top; i++) {
        int v = i - top, t;
        if (v <= -p3) t = -4; else if (v <= -p2) t = -3; else if (v <= -p1) t = -2;
        else if (v < -q_base) t = -1; else if (v <= q_base) t = 0; else if (v < p1) t = 1;
        else if (v < p2) t = 2; else if (v < p3) t = 3; else t = 4;
        q->t[i] = (int8_t)t;
    }
    q->q_base = q_base; q->step = 2 * q_base + 1;
    q->total = (top + 2 * q_base) / (2 * q_base + 1) + 1;
    q->raw_bits = fuji_log2ceil(q->total);
    q->mult = mult; q->max_grad = max_grad;
    return 0;
}

static int fuji_main_qt(fuji_qt *q, int top, int q_base) {
    int p1 = 3 * q_base + 0x12, p2 = 5 * q_base + 0x43, p3 = 7 * q_base + 0x114;
    if (p1 > top || p1 < q_base + 1) p1 = q_base + 1;
    if (p2 < p1 || p2 > top) p2 = p1;
    if (p3 < p2 || p3 > top) p3 = p2;
    return fuji_qt_init(q, top, q_base, p1, p2, p3, 9, 0);
}

static inline int fuji_bit(fuji_bits *b) {
    if (!b->n) {
        if (b->p < b->end) b->acc = b->d[b->p++]; else { b->acc = 0; b->err++; }
        b->n = 8;
    }
    b->n--;
    return (b->acc >> b->n) & 1;
}

static inline int fuji_get(fuji_bits *b, int k) {
    int code = 0;
    while (k) {
        if (!b->n) {
            if (b->p < b->end) b->acc = b->d[b->p++]; else { b->acc = 0; b->err++; }
            b->n = 8;
        }
        int take = k < b->n ? k : b->n;
        b->n -= take;
        code = (code << take) | (int)((b->acc >> b->n) & ((1u << take) - 1));
        k -= take;
    }
    return code;
}

long shootflow_fuji_strip(const uint8_t *d, long start, long end, int bits, int lw, long lines,
                          int strip_width, int xtrans, long out_stride, uint16_t *out, const uint8_t *qb)
{
    int stride = lw + 2;
    int top = (1 << bits) - 1;
    int max_bits = 4 * fuji_log2ceil(top + 1), min_value = 0x40;
    int32_t *buf = (int32_t *)calloc((size_t)18 * stride, sizeof(int32_t));
    fuji_qt *mains = (fuji_qt *)calloc(256, sizeof(fuji_qt)); /* main quantisers, built per base on first use */
    fuji_qt side[3] = {{0}};
    long result = -1;
    if (!buf || !mains) goto done;
    if (fuji_main_qt(&mains[0], top, 0)) goto done;
    {
        static const int sp[3][4] = {{0x12, 0x43, 0x114, 5}, {0x15, 0x48, 0x11B, 6}, {0x18, 0x4D, 0x122, 7}};
        for (int i = 0; i < 3; i++) {
            int p1 = top >= sp[i][0] ? sp[i][0] : i + 1;
            int p2 = top >= sp[i][1] ? sp[i][1] : p1;
            int p3 = top >= sp[i][2] ? sp[i][2] : p2;
            if (fuji_qt_init(&side[i], top, i, p1, p2, p3, 3, sp[i][3])) goto done;
        }
    }
    fuji_qt *main_q = &mains[0];
    int ge[3][41][2], go[3][41][2], se[3][3][5][2], so[3][3][5][2];
    for (int s = 0; s < 3; s++) for (int g = 0; g < 41; g++) {
        ge[s][g][0] = go[s][g][0] = 1 << (bits - 6); ge[s][g][1] = go[s][g][1] = 1;
    }
    for (int s = 0; s < 3; s++) for (int t = 0; t < 3; t++) {
        int md = (side[t].total + 0x20) >> 6;
        if (md < 2) md = 2;
        for (int g = 0; g < 5; g++) { se[s][t][g][0] = so[s][t][g][0] = md; se[s][t][g][1] = so[s][t][g][1] = 1; }
    }
    /* coded[line][p & 3]: some sensel of the line's rows reads entry p */
    int coded[18][4] = {{0}};
    for (int row = 0; row < 6; row++) for (int x = 0; x < 12; x++) {
        int colour, idx;
        if (xtrans) { colour = fuji_xtrans_abs[row][x % 6];
                      idx = ((((x * 2) / 3) & ~1) | ((x % 3) & 1)) + ((x % 3) >> 1); }
        else { colour = (row & 1) ? ((x & 1) ? 2 : 1) : ((x & 1) ? 1 : 0); idx = x >> 1; }
        int li = fuji_base[colour] + (colour == 1 ? 2 + row : 2 + row / 2);
        coded[li][idx & 3] = 1;
    }
    fuji_bits b = {d, start, end, 0, 0, 0};
    for (long grp = 0; grp < lines; grp++) {
        if (qb) {
            int base = qb[grp];
            if (grp == 0 || base != main_q->q_base) {
                if (!mains[base].t && fuji_main_qt(&mains[base], top, base)) goto done;
                main_q = &mains[base];
                int md = (main_q->total + 0x20) >> 6;
                if (md < 2) md = 2;
                for (int s = 0; s < 3; s++) for (int g = 0; g < 41; g++) {
                    ge[s][g][0] = go[s][g][0] = md; ge[s][g][1] = go[s][g][1] = 1;
                }
            }
        }
        int nside = main_q->q_base < 3 ? main_q->q_base : 3;
        for (int pn = 0; pn < 6; pn++) {
            int (*cge)[2] = ge[pn % 3], (*cgo)[2] = go[pn % 3];
            int li[2];
            for (int k = 0; k < 2; k++) li[k] = fuji_base[fuji_pairs[pn][k][0]] + fuji_pairs[pn][k][1];
            int even[2] = {0, 0}, odd[2] = {1, 1};
            while (even[0] < lw || odd[0] < lw) {
                for (int step = 0; step < 2; step++) {
                    if (step == 0 && even[0] >= lw) continue;
                    if (step == 1 && even[0] <= 8) continue;
                    for (int k = 0; k < 2; k++) {
                        int32_t *cur = buf + (size_t)li[k] * stride, *up = cur - stride, *up2 = up - stride;
                        int p = step ? odd[k] : even[k];
                        if (step) odd[k] += 2; else even[k] += 2;
                        int c = p + 1, grad, interp;
                        int (*ctx)[2];
                        const fuji_qt *q = main_q;
                        if (!step) {
                            int rb = up[c], rc = up[c - 1], rd = up[c + 1], rf = up2[c];
                            int dcb = abs(rc - rb), dfb = abs(rf - rb), ddb = abs(rd - rb);
                            if (dcb > dfb && dcb > ddb) interp = rf + rd + 2 * rb;
                            else if (ddb > dcb && ddb > dfb) interp = rf + rc + 2 * rb;
                            else interp = rd + rc + 2 * rb;
                            if (!coded[li[k]][p & 3]) { cur[c] = interp >> 2; continue; }
                            ctx = cge;
                            for (int t = 0; t < nside; t++)
                                if (dfb + dcb <= side[t].max_grad) { q = &side[t]; ctx = se[pn % 3][t]; break; }
                            grad = q->t[top + rb - rf] * q->mult + q->t[top + rc - rb];
                            interp >>= 2;
                        } else {
                            int ra = cur[c - 1], rb = up[c], rc = up[c - 1], rd = up[c + 1], rg = cur[c + 1];
                            ctx = cgo;
                            for (int t = 0; t < nside; t++)
                                if (abs(rc - ra) + abs(rb - rc) <= side[t].max_grad) { q = &side[t]; ctx = so[pn % 3][t]; break; }
                            grad = q->t[top + rb - rc] * q->mult + q->t[top + rc - ra];
                            if ((rb > rc && rb > rd) || (rb < rc && rb < rd)) interp = (rg + ra + 2 * rb) >> 2;
                            else interp = (ra + rg) >> 1;
                        }
                        int *g = ctx[grad < 0 ? -grad : grad];
                        int sample = 0, code;
                        while (!fuji_bit(&b)) {
                            sample++;
                            if (b.err > 64) { result = b.err; goto done; }
                        }
                        if (sample < max_bits - q->raw_bits - 1) {
                            int dec = 0;
                            if (g[1] < g[0]) {
                                do { dec++; } while (dec <= 15 && (g[1] << dec) < g[0]);
                                if (dec > 15) dec = 15;
                            }
                            code = fuji_get(&b, dec) + (sample << dec);
                        } else {
                            code = fuji_get(&b, q->raw_bits) + 1;
                        }
                        if (code < 0 || code >= q->total) b.err++;
                        code = (code & 1) ? -1 - (code >> 1) : (code >> 1);
                        g[0] += code < 0 ? -code : code;
                        if (g[1] == min_value) { g[0] >>= 1; g[1] >>= 1; }
                        g[1]++;
                        interp = grad < 0 ? interp - code * q->step : interp + code * q->step;
                        if (interp < -q->q_base) interp += q->total * q->step;
                        else if (interp > q->q_base + top) interp -= q->total * q->step;
                        cur[c] = interp >= 0 ? (interp <= top ? interp : top) : 0;
                    }
                }
            }
            for (int k = 0; k < 2; k++) {
                int colour = fuji_pairs[pn][k][0];
                if (k == 1 && colour == fuji_pairs[pn][0][0]) continue;
                int last = colour == 1 ? 7 : 4;
                for (int i = 2; i <= last; i++) {
                    int32_t *ln = buf + (size_t)(fuji_base[colour] + i) * stride, *pv = ln - stride;
                    ln[0] = pv[1]; ln[lw + 1] = pv[lw];
                }
            }
        }
        for (int row = 0; row < 6; row++) {
            const int32_t *lines3[3] = {buf + (size_t)(fuji_base[0] + 2 + row / 2) * stride,
                                        buf + (size_t)(fuji_base[1] + 2 + row) * stride,
                                        buf + (size_t)(fuji_base[2] + 2 + row / 2) * stride};
            uint16_t *o = out + (size_t)(grp * 6 + row) * out_stride;
            for (int x = 0; x < strip_width; x++) {
                int colour, idx;
                if (xtrans) { colour = fuji_xtrans_abs[row][x % 6];
                              idx = ((((x * 2) / 3) & ~1) | ((x % 3) & 1)) + ((x % 3) >> 1); }
                else { colour = (row & 1) ? ((x & 1) ? 2 : 1) : ((x & 1) ? 1 : 0); idx = x >> 1; }
                o[x] = (uint16_t)lines3[colour][idx + 1];
            }
        }
        for (int colour = 0; colour < 3; colour++) {
            int last = colour == 1 ? 7 : 4;
            int32_t *l0 = buf + (size_t)fuji_base[colour] * stride;
            memcpy(l0, buf + (size_t)(fuji_base[colour] + last - 1) * stride, sizeof(int32_t) * 2 * stride);
            l0[2 * stride] = l0[stride + 1];
            l0[2 * stride + lw + 1] = l0[stride + lw];
        }
    }
    result = b.err;
done:
    if (mains) for (int i = 0; i < 256; i++) free(mains[i].t);
    for (int i = 0; i < 3; i++) free(side[i].t);
    free(mains); free(buf);
    return result;
}
"""

_STATE: dict[str, object] = {}
_LOAD_LOCK = threading.Lock()  # tiles decode on several threads; build and load once


def _cache_dir() -> Path:
    base = os.environ.get("SHOOTFLOW_CACHE")
    if base:
        return Path(base)
    return Path.home() / ".cache" / "shootflow"


def _compiler() -> str | None:
    cc = os.environ.get("CC")
    if cc and shutil.which(cc):
        return cc
    for name in ("cc", "gcc", "clang"):
        found = shutil.which(name)
        if found:
            return found
    return None


def _build(target: Path) -> bool:
    cc = _compiler()
    if cc is None or sys.platform == "win32":
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="shootflow-cc-") as tmp:
        src = Path(tmp) / "huff.c"
        src.write_text(C_SOURCE)
        out = Path(tmp) / target.name
        flags = ["-O2", "-shared", "-fPIC"]
        if sys.platform == "darwin":
            flags = ["-O2", "-dynamiclib"]
        try:
            subprocess.run(
                [cc, *flags, "-o", str(out), str(src)],
                check=True,
                capture_output=True,
                timeout=60,
            )
        except (OSError, subprocess.SubprocessError):
            return False
        os.replace(out, target)  # atomic, so a parallel build never loads half a file
    return True


def _load():
    if os.environ.get("SHOOTFLOW_NATIVE", "1") == "0":
        return None
    digest = hashlib.sha256(C_SOURCE.encode()).hexdigest()[:16]
    suffix = ".dylib" if sys.platform == "darwin" else ".so"
    target = _cache_dir() / f"ljpeg-huffman-{digest}{suffix}"
    try:
        if not target.exists() and not _build(target):
            return None
        lib = ctypes.CDLL(str(target))
    except OSError:
        return None
    fn = lib.shootflow_huffman_run
    fn.restype = ctypes.c_long
    fn.argtypes = [
        ctypes.c_void_p,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_int,
        ctypes.c_void_p,
        ctypes.c_void_p,
    ]
    scan = lib.shootflow_huffman_scan
    scan.restype = ctypes.c_long
    scan.argtypes = [
        ctypes.c_char_p,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_int,
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_void_p,
    ]
    _STATE["scan"] = scan
    pred = lib.shootflow_predict
    pred.restype = ctypes.c_long
    pred.argtypes = [
        ctypes.c_void_p,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_long,
        ctypes.c_int,
        ctypes.c_void_p,
    ]
    _STATE["predict"] = pred
    nikon = lib.shootflow_nikon_run
    nikon.restype = ctypes.c_long
    nikon.argtypes = [ctypes.c_char_p, ctypes.c_long, ctypes.c_long, ctypes.c_long] + [ctypes.c_void_p] * 2 + [
        ctypes.c_long
    ] + [ctypes.c_void_p] * 3
    _STATE["nikon"] = nikon
    olympus = lib.shootflow_olympus_run
    olympus.restype = ctypes.c_long
    olympus.argtypes = [ctypes.c_char_p, ctypes.c_long, ctypes.c_long, ctypes.c_long, ctypes.c_void_p]
    _STATE["olympus"] = olympus
    panasonic = lib.shootflow_panasonic_run
    panasonic.restype = ctypes.c_long
    panasonic.argtypes = [ctypes.c_char_p, ctypes.c_long, ctypes.c_long, ctypes.c_long, ctypes.c_void_p]
    _STATE["panasonic"] = panasonic
    for name, args in (
        ("samsung_rows", [ctypes.c_char_p] + [ctypes.c_long] * 5 + [ctypes.c_void_p]),
        ("samsung_huffman", [ctypes.c_char_p] + [ctypes.c_long] * 3 + [ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p]),
        ("samsung_blocks", [ctypes.c_char_p] + [ctypes.c_long] * 4 + [ctypes.c_void_p]),
        ("pentax", [ctypes.c_char_p] + [ctypes.c_long] * 3 + [ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p]),
    ):
        f = getattr(lib, f"shootflow_{name}_run")
        f.restype = ctypes.c_long
        f.argtypes = args
        _STATE[name] = f
    fuji = lib.shootflow_fuji_strip
    fuji.restype = ctypes.c_long
    fuji.argtypes = [ctypes.c_char_p, ctypes.c_long, ctypes.c_long, ctypes.c_int, ctypes.c_int, ctypes.c_long,
                     ctypes.c_int, ctypes.c_int, ctypes.c_long, ctypes.c_void_p, ctypes.c_char_p]
    _STATE["fuji_strip"] = fuji
    return fn


def available() -> bool:
    return reader() is not None


def reader():
    """The loaded C function, or None. Built and loaded once per process."""

    if "fn" not in _STATE:
        with _LOAD_LOCK:
            if "fn" not in _STATE:
                _STATE["fn"] = _load()
    return _STATE["fn"]


_LUT16_CACHE: dict[tuple, bytes] = {}


def lut16(table: dict[tuple[int, int], int]) -> bytes:
    """One 16-bit prefix table: entry ``(length << 8) | size``; 0 where no code starts."""

    key = tuple(sorted(table.items()))
    hit = _LUT16_CACHE.get(key)
    if hit is not None:
        return hit
    lut = array("H", bytes(2 * 65536))
    for (length, code), s in table.items():
        if not 1 <= length <= 16 or s > 16:
            continue
        free = 16 - length
        start = code << free
        span = 1 << free
        lut[start : start + span] = array("H", [(length << 8) | s]) * span
    raw = lut.tobytes()
    if len(_LUT16_CACHE) > 64:
        _LUT16_CACHE.clear()
    _LUT16_CACHE[key] = raw
    return raw


def huffman_run(words: array, mcus: int, tables: list[dict[tuple[int, int], int]]) -> array | None:
    """``mcus`` MCUs of differences as ``array('i')``; None for an invalid code.

    ``words`` is an ``array`` of 4-byte unsigned big-endian-ordered words (as
    ``raw_develop._segment_words`` builds them, before ``tolist``).
    """

    fn = reader()
    if fn is None:  # pragma: no cover - callers check first
        raise RuntimeError("native Huffman reader is not available")
    if words.itemsize != 4:  # pragma: no cover - CPython's 'I' is 4 bytes everywhere
        return None
    nf = len(tables)
    luts = b"".join(lut16(t) for t in tables)
    out = array("i", bytes(4 * mcus * nf))
    lut_buf = ctypes.create_string_buffer(luts, len(luts))
    if len(words) == 0:
        words = array(words.typecode, [0])
        nwords = 0
    else:
        nwords = len(words)
    w_addr, _ = words.buffer_info()
    o_addr, _ = out.buffer_info()
    got = fn(w_addr, nwords, mcus, nf, lut_buf, o_addr)
    if got < 0:
        return None
    return out


def lut12(table: dict[tuple[int, int], int]) -> bytes:
    """The 12-bit first look-up: entry ``(length << 8) | size`` for codes of up to 12 bits."""

    lut = array("H", bytes(2 * 4096))
    for (length, code), s in table.items():
        if not 1 <= length <= 12 or s > 16:
            continue
        free = 12 - length
        lut[code << free : (code + 1) << free] = array("H", [(length << 8) | s]) * (1 << free)
    return lut.tobytes()


def _lut_buffers(tables):
    """``(full, fast)`` ctypes buffers for the scan reader.

    Phones write their own Huffman tables per tile, so these are built per call: the
    12-bit tables always (8 KB a component), the 16-bit ones only when some code is
    longer than 12 bits (else ``None``, and a miss in the 12-bit table is an invalid code).
    """

    fast = b"".join(lut12(t) for t in tables)
    fast_buf = ctypes.create_string_buffer(fast, len(fast))
    if all(length <= 12 for t in tables for (length, _code) in t):
        return None, fast_buf
    full = b"".join(lut16(t) for t in tables)
    return ctypes.create_string_buffer(full, len(full)), fast_buf


def scan_run(data: bytes, pos: int, mcus: int, tables: list[dict[tuple[int, int], int]], restart: int = 0) -> array | None:
    """A whole scan's differences from its entropy-coded bytes, as ``array('i')``.

    The de-stuffing, the word packing and the restart-interval walk of
    ``raw_develop._scan_diffs`` all run in C, so a tile holds the GIL only to
    set up the call (``eval/native-destuff-2026-11-13.md``). None for an invalid
    code, so the pure loop decides and raises exactly as before.
    """

    if reader() is None:  # pragma: no cover - callers check first
        raise RuntimeError("native Huffman reader is not available")
    scan: Any = _STATE.get("scan")
    if scan is None:  # pragma: no cover - loaded with the reader
        return None
    if not isinstance(data, bytes):
        data = bytes(data)
    nf = len(tables)
    lut_buf, fast_buf = _lut_buffers(tables)
    out = array("i", bytes(4 * max(1, mcus * nf)))
    o_addr, _ = out.buffer_info()
    got = scan(data, len(data), pos, mcus, restart or 0, nf, lut_buf, fast_buf, o_addr)
    if got < 0:
        return None
    if mcus * nf == 0:
        del out[:]
    return out


def predict(
    diffs: array, width: int, height: int, nf: int, predictor: int, initial: int, restart: int, pt: int = 0
) -> array | None:
    """``raw_develop._predict_scan`` in C on an ``array('i')`` of differences: an ``array('H')``.

    With a point transform ``pt`` (0-15) the samples come back already shifted left by it, as
    ``_decode_scan`` shifts the Python pass's output. None when the C pass declines (a
    reference outside the image, or a shifted sample wider than 16 bits), so the Python pass
    decides.
    """

    fn: Any = _STATE.get("predict") if reader() is not None else None
    if fn is None or not isinstance(diffs, array) or diffs.typecode != "i":
        return None
    n = width * height * nf
    if len(diffs) < n or not 1 <= predictor <= 7 or not 0 <= pt <= 15:
        return None
    out = array("H", [0]) * max(1, n)  # one zeroed buffer, not a zeroed bytes copied in
    d_addr, _ = diffs.buffer_info()
    o_addr, _ = out.buffer_info()
    if fn(d_addr, width, height, nf, predictor, initial, restart or 0, pt, o_addr) < 0:
        return None
    if n == 0:
        del out[:]
    return out


def nikon_run(data: bytes, width: int, height: int, lut: array, lut2: array | None, split: int, vpred, curve) -> array | None:
    """``shootflow.nef._decode_python`` in C: an ``array('H')`` of curve-mapped sensels, or None on an
    invalid code (the Python decoder then decides and raises)."""

    fn: Any = _STATE.get("nikon") if reader() is not None else None
    if fn is None:
        return None
    if not isinstance(data, bytes):
        data = bytes(data)
    out = array("H", [0]) * max(1, width * height)
    vp = array("H", [int(v) & 0xFFFF for v in vpred[:4]])
    cv = array("H", [int(v) & 0xFFFF for v in curve[:0x4000]])
    if len(cv) < 0x4000:
        cv.extend(range(len(cv), 0x4000))
    l2 = lut2 if lut2 is not None else lut
    o_addr, _ = out.buffer_info()
    got = fn(
        data, len(data), width, height, lut.buffer_info()[0], l2.buffer_info()[0], split if lut2 is not None else 0,
        vp.buffer_info()[0], cv.buffer_info()[0], o_addr,
    )
    if got < 0:
        return None
    if width * height == 0:
        del out[:]
    return out


def olympus_run(data: bytes, width: int, height: int) -> array | None:
    """``shootflow.orf._decode_python`` in C: an ``array('H')`` of sensels, row-major, or None without the
    native library."""

    fn: Any = _STATE.get("olympus") if reader() is not None else None
    if fn is None:
        return None
    if not isinstance(data, bytes):
        data = bytes(data)
    out = array("H", [0]) * max(1, width * height)
    fn(data, len(data), width, height, out.buffer_info()[0])
    if width * height == 0:
        del out[:]
    return out


def panasonic_run(data: bytes, width: int, height: int) -> array | None:
    """``shootflow.rw2._decode_python`` in C, given the already rotated blocks: an ``array('H')`` of sensels,
    row-major, or None without the native library."""

    fn: Any = _STATE.get("panasonic") if reader() is not None else None
    if fn is None:
        return None
    if not isinstance(data, bytes):
        data = bytes(data)
    out = array("H", [0]) * max(1, width * height)
    fn(data, len(data), width, height, out.buffer_info()[0])
    if width * height == 0:
        del out[:]
    return out


def _srw_call(name: str):
    return _STATE.get(name) if reader() is not None else None


def samsung_rows_run(data: bytes, start: int, table: int, width: int, height: int) -> array | None:
    """``shootflow.srw`` compression 32770 with a row table, in C: an ``array('H')``, or None without the
    native library. Raises ``DevelopError`` where the Python reference would."""

    fn: Any = _srw_call("samsung_rows")
    if fn is None:
        return None
    data = data if isinstance(data, bytes) else bytes(data)
    out = array("H", [0]) * (width * height + 64)
    if fn(data, len(data), start, table, width, height, out.buffer_info()[0]) < 0:
        from shootflow.raw_develop import DevelopError

        raise DevelopError("SRW: the 32770 stream is invalid (bad bit length or prediction)")
    del out[width * height :]
    return out


def samsung_huffman_run(data: bytes, width: int, height: int, bits: int) -> array | None:
    """``shootflow.srw`` compression 32772 in C: an ``array('H')``, or None without the native library."""

    fn: Any = _srw_call("samsung_huffman")
    if fn is None:
        return None
    from shootflow import srw

    data = data if isinstance(data, bytes) else bytes(data)
    lut = array("H", [(length << 8) | n for length, n in srw.huffman_lut()])
    out = array("H", [0]) * max(1, width * height)
    if fn(data, len(data), width, height, bits, lut.buffer_info()[0], out.buffer_info()[0]) < 0:
        from shootflow.raw_develop import DevelopError

        raise DevelopError("SRW: a 32772 value is out of range")
    del out[width * height :]
    return out


def samsung_blocks_run(data: bytes, start: int, width: int, height: int) -> array | None:
    """``shootflow.srw`` compression 32773 in C: an ``array('H')``, or None without the native library."""

    fn: Any = _srw_call("samsung_blocks")
    if fn is None:
        return None
    data = data if isinstance(data, bytes) else bytes(data)
    out = array("H", [0]) * ((height + 2) * width)
    if fn(data, len(data), start, width, height, out.buffer_info()[0]) < 0:
        from shootflow.raw_develop import DevelopError

        raise DevelopError("SRW: the 32773 stream is invalid (bad bit length)")
    return out[2 * width :]


def pentax_run(data: bytes, width: int, height: int, bits: int, lut: array) -> array | None:
    """``shootflow.pef`` compression 65535 in C (``lut``: 4096 entries of ``(length << 8) | bits``): an
    ``array('H')``, or None without the native library. Raises ``DevelopError`` where the Python reference would."""

    fn: Any = _srw_call("pentax")
    if fn is None:
        return None
    data = data if isinstance(data, bytes) else bytes(data)
    lut = array("H", lut)
    if len(lut) != 4096:
        raise ValueError("the Pentax lookup has 4096 entries")
    out = array("H", [0]) * max(1, width * height)
    if fn(data, len(data), width, height, bits, lut.buffer_info()[0], out.buffer_info()[0]) < 0:
        from shootflow.raw_develop import DevelopError

        raise DevelopError("PEF: the compressed stream is invalid (a value out of range or an unassigned code)")
    del out[width * height :]
    return out


def fuji_strip_function():
    """``shootflow_fuji_strip`` (one strip of a compressed RAF, ``shootflow.raf_compressed``), or None."""

    return _STATE.get("fuji_strip") if reader() is not None else None
