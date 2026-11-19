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
``shootflow.pef`` (``tests/test_pef.py`` runs both), and ``shootflow_hasselblad_run``, the Hasselblad 3FR
decode of ``shootflow.hasselblad`` (``tests/test_hasselblad.py`` runs both), and ``shootflow_fuji_strip``, one strip of a
Fujifilm lossless compressed RAF (``shootflow.raf_compressed``; ``tests/test_raf_compressed.py`` runs both),
and ``shootflow_crx_band``, one band of a Canon CR3 (``shootflow.cr3``; ``tests/test_cr3.py`` runs both),
and ``shootflow_craw_plane``, one plane of a C-RAW CR3 (``shootflow.cr3_wavelet``; ``tests/test_cr3_wavelet.py``
runs both), and ``shootflow_kodak_run``, the Kodak DCR compression-65000 decode of ``shootflow.kodak``
(``tests/test_kodak.py`` runs both).

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

/* Panasonic RW2 RawFormat 5 and 7 (shootflow.rw2._packed_python): each 16-byte line, as a
   little-endian 128-bit number, holds 128 / bits sensels from its lowest bit up. d is already in
   reading order (RawFormat 5's blocks rotated). Returns 0, or -1 when d is short. */
long shootflow_panasonic_packed_run(const uint8_t *d, long len, long width, long height, int bits, uint16_t *out)
{
    int per = 128 / bits;
    long lines = width / per;
    if (len < lines * 16 * height) return -1;
    uint32_t mask = (1u << bits) - 1;
    for (long row = 0; row < height; row++) {
        uint16_t *o = out + row * width;
        for (long l = 0; l < lines; l++, d += 16) {
            uint64_t lo = 0, hi = 0;
            for (int b = 7; b >= 0; b--) { lo = lo << 8 | d[b]; hi = hi << 8 | d[8 + b]; }
            for (int i = 0; i < per; i++) {
                int at = i * bits;
                uint64_t v;
                if (at >= 64) v = hi >> (at - 64);
                else if (at + bits <= 64) v = lo >> at;
                else v = (lo >> at) | (hi << (64 - at));
                *o++ = (uint16_t)(v & mask);
            }
        }
    }
    return 0;
}

/* Panasonic RW2 RawFormat 6 (shootflow.rw2._c6_python): 11 sensels a 16-byte line, fields read
   from the top bit down. Returns 0, or -1 when d is short. */
long shootflow_panasonic_c6_run(const uint8_t *d, long len, long width, long height, uint16_t *out)
{
    static const int widths[14] = {14, 14, 2, 10, 10, 10, 2, 10, 10, 10, 2, 10, 10, 10};
    long lines = width / 11;
    if (len < lines * 16 * height) return -1;
    for (long row = 0; row < height; row++) {
        uint16_t *o = out + row * width;
        for (long l = 0; l < lines; l++, d += 16) {
            uint64_t lo = 0, hi = 0;
            for (int b = 7; b >= 0; b--) { lo = lo << 8 | d[b]; hi = hi << 8 | d[8 + b]; }
            uint32_t vals[14];
            int pos = 128;
            for (int f = 0; f < 14; f++) {
                int w = widths[f];
                pos -= w;
                uint64_t v;
                if (pos >= 64) v = hi >> (pos - 64);
                else if (pos + w <= 64) v = lo >> pos;
                else v = (lo >> pos) | (hi << (64 - pos));
                vals[f] = (uint32_t)(v & ((1u << w) - 1));
            }
            int k = 0;
            int64_t first[2] = {0, 0}, prev[2] = {0, 0}, mul = 0, base = 0;
            for (int pix = 0; pix < 11; pix++) {
                if (pix % 3 == 2) {
                    int code = (int)vals[k++];
                    if (code == 3) code = 4;
                    mul = (int64_t)1 << code;
                    base = (int64_t)0x200 << code;
                }
                int64_t e = vals[k++];
                int p = pix & 1;
                if (first[p]) {
                    e *= mul;
                    if (base < 0x2000 && prev[p] > base) e += prev[p] - base;
                    prev[p] = e;
                } else {
                    first[p] = e;
                    if (e) prev[p] = e; else e = prev[p];
                }
                e -= 15;
                *o++ = (uint16_t)(e < 0 ? 0 : (e <= 0xFFFF ? e : 0x3FFF));
            }
        }
    }
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

/* Hasselblad 3FR compression 7 (shootflow.hasselblad; dcraw's hasselblad_load_raw): a lossless-JPEG
   header, then a bit stream read MSB first from little-endian 32-bit words, no byte stuffing. Each pair
   of sensels takes two Huffman size codes (lut: 65536 entries of (length << 8) | size), then the two
   differences. A sensel is predicted from the one two columns left (0x8000 at a row's start); with
   psv 11, from row 2 on, plus half the same-colour sensel two rows up minus half the one left of it.
   Returns 0, -1 on an unassigned code, -2 when memory runs out. */
long shootflow_hasselblad_run(const uint8_t *d, long len, long width, long height, int psv,
                              const uint16_t *lut, uint16_t *out)
{
    uint64_t acc = 0;
    int nb = 0;
    long p = 0;
#define HB_FILL(n) while (nb < (n)) { uint32_t w = 0; for (int q = 3; q >= 0; q--) w = w << 8 | (p + q < len ? d[p + q] : 0); p += 4; acc = acc << 32 | w; nb += 32; }
    /* dcraw keeps each prediction unmasked (an int): three rows of them, the current one and two above. */
    int32_t *back = (int32_t *)calloc((size_t)(3 * (width > 0 ? width : 1)), sizeof(int32_t));
    if (!back) return -2;
    for (long row = 0; row < height; row++) {
        int32_t *cur = back + (row % 3) * width;
        const int32_t *up2 = back + ((row + 1) % 3) * width;
        uint16_t *o = out + row * width;
        for (long col = 0; col < width; col += 2) {
            int len2[2], diff[2];
            for (int c = 0; c < 2; c++) {
                HB_FILL(16);
                unsigned e = lut[(acc >> (nb - 16)) & 0xFFFF];
                if (!(e >> 8)) { free(back); return -1; }
                nb -= e >> 8;
                len2[c] = e & 0xFF;
            }
            for (int c = 0; c < 2; c++) {
                int n = len2[c];
                int v = 0;
                if (n) {
                    HB_FILL(n);
                    nb -= n;
                    v = (int)((acc >> nb) & ((1u << n) - 1));
                    if (!(v & (1 << (n - 1)))) v -= (1 << n) - 1;
                    if (v == 65535) v = -32768;
                }
                diff[c] = v;
            }
            for (long s = col; s < col + 2 && s < width; s++) {
                int pred = 0x8000;
                if (col) pred = cur[s - 2];
                if (col && row > 1 && psv == 11) pred += up2[s] / 2 - up2[s - 2] / 2;
                pred += diff[s & 1];
                o[s] = (uint16_t)(pred & 0xFFFF);
                cur[s] = pred;
            }
        }
    }
#undef HB_FILL
    free(back);
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

/* Canon CR3 (CRX) band at imageLevels 0, the twin of shootflow.cr3.decode_band:
   median edge predictor, adaptive Rice code and JPEG-LS run mode. Each value, clamped to the
   signed bits range plus 2^(bits-1), goes to out[line * stride + 2 * x] (one 2x2 position of the
   sensor). Returns 0, or -1 on an invalid stream. */
typedef struct { const uint8_t *d; long len, pos; uint64_t acc; int n; } crx_bits;
static void crx_fill(crx_bits *b) {
    while (b->n <= 56) { uint64_t v = b->pos < b->len ? b->d[b->pos] : 0; b->pos++; b->acc |= v << (56 - b->n); b->n += 8; }
}
static inline uint32_t crx_get(crx_bits *b, int k) {
    if (!k) return 0;
    if (b->n < k) crx_fill(b);
    uint32_t v = (uint32_t)(b->acc >> (64 - k)); b->acc <<= k; b->n -= k; return v;
}
static inline long crx_zeros(crx_bits *b) {
    long count = 0;
    for (;;) {
        if (b->n < 33) crx_fill(b);
        if (b->acc) {
            int z = __builtin_clzll(b->acc);
            if (z < b->n) { count += z; b->acc <<= z; b->acc <<= 1; b->n -= z + 1; return count; }
        }
        count += b->n; b->acc = 0; b->n = 0;
        if (b->pos > b->len + 16) return -1;
    }
}
static const int crx_J[32] = {0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,5,5,6,6,7,7,8,9,10,11,12,13,14,15};
static inline int crx_next_k(int k, uint32_t code) {
    int nk = k - (code < (uint32_t)((1 << k) >> 1)) + ((code >> k) > 2) + ((code >> k) > 5);
    return nk < 15 ? nk : 15;
}
static inline long crx_error(crx_bits *b, int k) {
    long code = crx_zeros(b);
    if (code < 0) return -1;
    if (code >= 41) return crx_get(b, 21);
    if (k) return (long)crx_get(b, k) | (code << k);
    return code;
}
static inline long crx_run(crx_bits *b, int *s, long length) {
    if (!crx_get(b, 1)) return 0;
    long n = 1;
    while (crx_get(b, 1)) {
        n += 1L << crx_J[*s];
        if (n > length) { n = length; break; }
        if (*s < 31) ++*s;
        if (n == length) break;
    }
    if (n < length) {
        if (crx_J[*s]) n += crx_get(b, crx_J[*s]);
        if (*s > 0) --*s;
        if (n > length) return -1;
    }
    return n;
}
static void crx_store(const int32_t *line, long width, int bits, uint16_t *out)
{
    int32_t lo = -(1 << (bits - 1)), hi = (1 << (bits - 1)) - 1, mid = 1 << (bits - 1);
    for (long x = 0; x < width; x++) {
        int32_t v = line[x];
        out[2 * x] = (uint16_t)((v < lo ? lo : (v > hi ? hi : v)) + mid);
    }
}
/* The median-predicted band as signed values, row-major into dst (width * height). */
static long crx_median_band(const uint8_t *d, long len, long width, long height, int32_t *dst)
{
    crx_bits b = {d, len, 0, 0, 0};
    int32_t *bufs = (int32_t *)calloc((size_t)(2 * (width + 2)), sizeof(int32_t));
    if (!bufs) return -1;
    int32_t *cur = bufs, *prev = bufs + width + 2;
    int s = 0, k = 0;
    long i = 0, length = width, code, n;
    cur[0] = 0;
    while (length > 1) {
        if (cur[i]) cur[i + 1] = cur[i];
        else {
            n = crx_run(&b, &s, length);
            if (n < 0) goto bad;
            if (n) {
                length -= n;
                while (n-- > 0) { cur[i + 1] = cur[i]; i++; }
                if (length <= 0) break;
            }
            cur[i + 1] = 0;
        }
        if ((code = crx_error(&b, k)) < 0) goto bad;
        cur[i + 1] += -(int32_t)(code & 1) ^ (int32_t)(code >> 1);
        k = crx_next_k(k, (uint32_t)code); i++; length--;
    }
    if (length == 1) {
        cur[i + 1] = cur[i];
        if ((code = crx_error(&b, k)) < 0) goto bad;
        cur[i + 1] += -(int32_t)(code & 1) ^ (int32_t)(code >> 1);
        k = crx_next_k(k, (uint32_t)code); i++;
    }
    cur[i + 1] = cur[i] + 1;
    memcpy(dst, cur + 1, (size_t)width * sizeof(int32_t));
    for (long line = 1; line < height; line++) {
        int32_t *t = prev; prev = cur; cur = t;
        cur[0] = prev[1];
        long j = 0; i = 0; length = width;
        while (length > 0) {
            int median = 1;
            if (length > 1 && cur[i] == prev[j + 1] && cur[i] == prev[j + 2]) {
                n = crx_run(&b, &s, length);
                if (n < 0) goto bad;
                if (n) {
                    length -= n; j += n;
                    while (n-- > 0) { cur[i + 1] = cur[i]; i++; }
                    if (length <= 0) break;
                }
                median = 0;
            }
            int32_t a = cur[i], bb = prev[j + 1], value;
            if (median) {
                int32_t c = prev[j], delta = bb - c;
                int neg = delta < 0;
                int pick = (((c < a) ^ neg) << 1) + ((a < bb) ^ neg);
                value = pick < 2 ? delta + a : (pick == 2 ? a : bb);
            } else value = bb;
            if ((code = crx_error(&b, k)) < 0) goto bad;
            cur[i + 1] = value + (-(int32_t)(code & 1) ^ (int32_t)(code >> 1));
            if (length > 1) {
                int32_t nd = (prev[j + 2] - prev[j + 1]) * 2;
                code = (code + (nd < 0 ? -nd : nd)) >> 1;
                j++;
            }
            k = crx_next_k(k, (uint32_t)code); i++; length--;
        }
        cur[i + 1] = cur[i] + 1;
        memcpy(dst + line * width, cur + 1, (size_t)width * sizeof(int32_t));
    }
    free(bufs);
    return 0;
bad:
    free(bufs);
    return -1;
}

long shootflow_crx_band(const uint8_t *d, long len, long width, long height, int bits, uint16_t *out, long stride)
{
    int32_t *vals = (int32_t *)malloc((size_t)width * (size_t)height * sizeof(int32_t));
    if (!vals) return -1;
    if (crx_median_band(d, len, width, height, vals) < 0) { free(vals); return -1; }
    for (long line = 0; line < height; line++) crx_store(vals + line * width, width, bits, out + line * stride);
    free(vals);
    return 0;
}

/* Canon CR3 C-RAW (CMP1 version 0x200), the twin of shootflow.cr3_wavelet: the bands other than the
   deepest LL are coded with no value prediction (crx_highpass, cr3_wavelet.decode_highpass), every
   coefficient is multiplied by its quantisation step, and the reversible 5/3 inverse rebuilds each
   level, deepest first. */
static inline int crx_next_k_cap(int k, uint32_t code, int cap) {
    int nk = k - (code < (uint32_t)((1 << k) >> 1)) + ((code >> k) > 2) + ((code >> k) > 5);
    return (!cap || nk < cap) ? nk : cap;
}
static inline int crx_bump(int k, const int32_t *kcol, long i) {
    if (kcol[i + 1] - k <= 1) return k >= 15 ? 15 : k;
    return k + 1;
}
#define ZIG(c) (-(int32_t)((c) & 1) ^ (int32_t)((c) >> 1))
#define ZIG1(c) (-(int32_t)(((c) + 1) & 1) ^ (int32_t)(((c) + 1) >> 1))
static long crx_highpass(const uint8_t *d, long len, long width, long height, int32_t *dst)
{
    crx_bits b = {d, len, 0, 0, 0};
    int32_t *mem = (int32_t *)calloc((size_t)(3 * (width + 2)), sizeof(int32_t));
    if (!mem) return -1;
    int32_t *above = mem, *cur = mem + width + 2, *kcol = mem + 2 * (width + 2);
    int s = 0, k = 0;
    long i = 0, length = width, code, n;
    while (length > 1) {
        if (cur[i]) {
            if ((code = crx_error(&b, k)) < 0) goto bad;
            cur[i + 1] = ZIG(code);
            k = crx_next_k_cap(k, (uint32_t)code, 15);
        } else {
            n = crx_run(&b, &s, length);
            if (n < 0) goto bad;
            length -= n;
            while (n-- > 0) { kcol[i] = 0; cur[i + 1] = 0; i++; }
            if (length <= 0) break;
            if ((code = crx_error(&b, k)) < 0) goto bad;
            cur[i + 1] = ZIG1(code);
            k = crx_next_k_cap(k, (uint32_t)code, 15);
        }
        kcol[i] = k; i++; length--;
    }
    if (length == 1) {
        if ((code = crx_error(&b, k)) < 0) goto bad;
        cur[i + 1] = ZIG(code);
        k = crx_next_k_cap(k, (uint32_t)code, 15);
        kcol[i] = k;
    }
    memcpy(dst, cur + 1, (size_t)width * sizeof(int32_t));
    for (long line = 1; line < height; line++) {
        int32_t *t = above; above = cur; cur = t;
        memset(cur, 0, (size_t)(width + 2) * sizeof(int32_t));
        above[width + 1] = 0;
        long last = width - 1;
        i = 0;
        while (i < last) {
            if (above[i + 2] | above[i + 1] | cur[i]) {
                if ((code = crx_error(&b, k)) < 0) goto bad;
                cur[i + 1] = ZIG(code);
                k = crx_bump(crx_next_k_cap(k, (uint32_t)code, 0), kcol, i);
            } else {
                n = crx_run(&b, &s, width - i);
                if (n < 0) goto bad;
                for (long j = i; j < i + n; j++) kcol[j] = 0;
                i += n;
                if (i >= last) {
                    if (i == last) {
                        if ((code = crx_error(&b, k)) < 0) goto bad;
                        cur[i + 1] = ZIG1(code);
                        k = crx_next_k_cap(k, (uint32_t)code, 15);
                        kcol[i] = k;
                    }
                    i++;
                    continue;
                }
                if ((code = crx_error(&b, k)) < 0) goto bad;
                cur[i + 1] = ZIG1(code);
                k = crx_bump(crx_next_k_cap(k, (uint32_t)code, 0), kcol, i);
            }
            kcol[i] = k; i++;
        }
        if (i == last) {
            if ((code = crx_error(&b, k)) < 0) goto bad;
            cur[i + 1] = ZIG(code);
            k = crx_next_k_cap(k, (uint32_t)code, 15);
            kcol[i] = k;
        }
        memcpy(dst + line * width, cur + 1, (size_t)width * sizeof(int32_t));
    }
    free(mem);
    return 0;
bad:
    free(mem);
    return -1;
}
#undef ZIG
#undef ZIG1

/* The 5/3 inverse's even samples (cr3_wavelet._evens): for even sample k, the high coefficients before (ia)
   and after (ib). first: the high band opens with a coefficient borrowed from a neighbour before; last: the
   bands run on past the end (a neighbour after). Returns the count of evens computed. */
static long crx_evens(long n, long nh, int first, int last, long *ia, long *ib)
{
    long hoff = first ? 1 : 0, ne = (n + 1) >> 1;
    long count = ne + ((last && !(n & 1)) ? 1 : 0);
    for (long k = 0; k < count; k++) {
        long a = k - 1 + hoff, b = k + hoff;
        int a_ok = a >= 0, b_ok = b < nh && (last || 2 * k + 1 < n);
        if (!a_ok) a = b;
        if (!b_ok) b = a;
        ia[k] = a; ib[k] = b;
    }
    return count;
}

/* One line of the 5/3 inverse: n samples from low and high (nh coefficients); even, ia, ib are scratch of
   n / 2 + 2. Low and high must hold every coefficient crx_evens names. */
static int crx_inv53(const int32_t *low, long nl, const int32_t *high, long nh, long n, int first, int last,
                     int32_t *out, int32_t *even, long *ia, long *ib)
{
    if (n <= 1) { if (nl < 1) return -1; out[0] = low[0]; return 0; }
    long hoff = first ? 1 : 0;
    long count = crx_evens(n, nh, first, last, ia, ib);
    if (count > nl || ia[count - 1] >= nh || ib[count - 1] >= nh || (n >> 1) + hoff > nh) return -1;
    for (long k = 0; k < count; k++) even[k] = low[k] - ((high[ia[k]] + high[ib[k]] + 2) >> 2);
    for (long k = 0; k < (n >> 1); k++) {
        int32_t h = high[k + hoff];
        out[2 * k] = even[k];
        out[2 * k + 1] = k + 1 < count ? h + ((even[k] + even[k + 1]) >> 1) : h + even[k];
    }
    if (n & 1) out[n - 1] = even[n >> 1];
    return 0;
}

/* The step-table row and column of a coefficient (cr3_wavelet.step_row, step_col): borrowed edge
   coefficients take the nearest own row or column's step. */
static inline long crx_step_row(long r, long h, long rs, long re, long rows)
{
    long i = r < rs ? 0 : (r < h - re ? r - re : h - re - rs - 1);
    return i < 0 ? 0 : (i >= rows ? rows - 1 : i);
}
static inline long crx_step_col(long x, long w, long cs, long ce, long shift, long cols)
{
    long c = x < cs ? 0 : (x < w - ce ? (x - cs) >> shift : (w - ce - cs - 1) >> shift);
    return c < 0 ? 0 : (c >= cols ? cols - 1 : c);
}

/* One plane of one C-RAW tile. bands: 3 * levels + 1 subbands in coded order; for each: offset and size in
   sample, width, height, step multiplier, step base, column shift, then the borrowed edge coefficients
   (columns at the start and end, rows at the start and end). level_out: each level's output width and
   height, deepest first (the last is the tile's). flags: neighbouring tiles (1 right, 2 left, 4 below,
   8 above). steps: each level's step table (rows of qw), at step_off[level]. Writes
   out[2y * stride + 2x] for the tile's width x height. */
long shootflow_craw_plane(const uint8_t *sample, long sample_len, int levels, const long *band_info,
                          const long *level_out, int flags, const int32_t *steps, const long *step_off,
                          const long *step_rows, long qw, long width, long height, int bits, uint16_t *out,
                          long stride)
{
    int nb = 3 * levels + 1;
    int32_t *coef[10] = {0};
    long bw[10], bh[10];
    long rc = -1;
    int left = (flags & 2) != 0, right = (flags & 1) != 0, top = (flags & 8) != 0, bottom = (flags & 4) != 0;
    int32_t *rows_lo = NULL, *rows_hi = NULL, *scratch = NULL, *cur = NULL;
    long *ia = NULL, *ib = NULL;
    if (levels < 1 || levels > 3) return -1;
    for (int bi = 0; bi < nb; bi++) {
        const long *f = band_info + 11 * bi;
        long off = f[0], size = f[1], w = f[2], h = f[3], mult = f[4], base = f[5], shift = f[6];
        long cs = f[7], ce = f[8], rs = f[9], re = f[10];
        long level = bi == 0 ? 0 : (bi - 1) / 3;
        if (w < 1 || h < 1) goto done;
        bw[bi] = w; bh[bi] = h;
        coef[bi] = (int32_t *)calloc((size_t)(w * h), sizeof(int32_t));
        if (!coef[bi] || off < 0 || size < 0 || off + size > sample_len || step_rows[level] < 1) goto done;
        if (size) {
            long r = bi == 0 ? crx_median_band(sample + off, size, w, h, coef[bi]) : crx_highpass(sample + off, size, w, h, coef[bi]);
            if (r < 0) goto done;
        }
        for (long y = 0; y < h; y++) {
            const int32_t *st = steps + step_off[level] + crx_step_row(y, h, rs, re, step_rows[level]) * qw;
            int32_t *row = coef[bi] + y * w;
            for (long x = 0; x < w; x++) {
                if (!row[x]) continue;
                long col = crx_step_col(x, w, cs, ce, shift, qw);
                int64_t q = base + (((int64_t)(uint32_t)st[col] * mult) >> 3);
                if (q < 1) q = 1;
                if (q > 0x168000) q = 0x168000;
                row[x] = (int32_t)(row[x] * q);
            }
        }
    }
    {
        long maxw = 0, maxh = 0;
        for (int l = 0; l < levels; l++) {
            if (level_out[2 * l] > maxw) maxw = level_out[2 * l];
            if (level_out[2 * l + 1] > maxh) maxh = level_out[2 * l + 1];
        }
        if (maxw < 1 || maxh < 1 || level_out[2 * (levels - 1)] != width || level_out[2 * levels - 1] != height) goto done;
        long maxn = maxw > maxh ? maxw : maxh;
        rows_lo = (int32_t *)malloc((size_t)(maxh + 2) * (size_t)maxw * sizeof(int32_t));
        rows_hi = (int32_t *)malloc((size_t)(maxh + 2) * (size_t)maxw * sizeof(int32_t));
        scratch = (int32_t *)malloc((size_t)(maxn / 2 + 2) * sizeof(int32_t));
        ia = (long *)malloc((size_t)(maxn / 2 + 2) * sizeof(long));
        ib = (long *)malloc((size_t)(maxn / 2 + 2) * sizeof(long));
        if (!rows_lo || !rows_hi || !scratch || !ia || !ib) goto done;
    }
    {
        int32_t *ll = coef[0];
        long llw = bw[0], llh = bh[0];
        for (int l = 0; l < levels; l++) {
            int32_t *hl = coef[3 * l + 1], *lh = coef[3 * l + 2], *hh = coef[3 * l + 3];
            long ow = level_out[2 * l], oh = level_out[2 * l + 1];
            long hlw = bw[3 * l + 1], lhw = bw[3 * l + 2], hhw = bw[3 * l + 3];
            long nlo = llh < bh[3 * l + 1] ? llh : bh[3 * l + 1];
            long nhi = bh[3 * l + 2] < bh[3 * l + 3] ? bh[3 * l + 2] : bh[3 * l + 3];
            if (nlo > oh + 2 || nhi > oh + 2) goto done;
            for (long y = 0; y < nlo; y++)
                if (crx_inv53(ll + y * llw, llw, hl + y * hlw, hlw, ow, left, right, rows_lo + y * ow, scratch, ia, ib) < 0) goto done;
            for (long y = 0; y < nhi; y++)
                if (crx_inv53(lh + y * lhw, lhw, hh + y * hhw, hhw, ow, left, right, rows_hi + y * ow, scratch, ia, ib) < 0) goto done;
            int32_t *res = (int32_t *)malloc((size_t)(ow * oh) * sizeof(int32_t));
            if (!res) goto done;
            if (oh <= 1) memcpy(res, rows_lo, (size_t)ow * sizeof(int32_t));
            else {
                long hoff = top ? 1 : 0;
                long count = crx_evens(oh, nhi, top, bottom, ia, ib);
                int32_t *ev = (int32_t *)malloc((size_t)count * (size_t)ow * sizeof(int32_t));
                if (!ev || count > nlo || ia[count - 1] >= nhi || ib[count - 1] >= nhi || (oh >> 1) + hoff > nhi) {
                    free(ev); free(res); goto done;
                }
                for (long k = 0; k < count; k++) {
                    const int32_t *a = rows_lo + k * ow, *p = rows_hi + ia[k] * ow, *q = rows_hi + ib[k] * ow;
                    int32_t *e = ev + k * ow;
                    for (long x = 0; x < ow; x++) e[x] = a[x] - ((p[x] + q[x] + 2) >> 2);
                }
                for (long r = 0; r < (oh >> 1); r++) {
                    memcpy(res + 2 * r * ow, ev + r * ow, (size_t)ow * sizeof(int32_t));
                    const int32_t *hr = rows_hi + (r + hoff) * ow, *e0 = ev + r * ow;
                    int32_t *o = res + (2 * r + 1) * ow;
                    if (r + 1 < count) { const int32_t *e1 = ev + (r + 1) * ow; for (long x = 0; x < ow; x++) o[x] = hr[x] + ((e0[x] + e1[x]) >> 1); }
                    else for (long x = 0; x < ow; x++) o[x] = hr[x] + e0[x];
                }
                if (oh & 1) memcpy(res + (oh - 1) * ow, ev + (oh >> 1) * ow, (size_t)ow * sizeof(int32_t));
                free(ev);
            }
            if (cur) free(cur);
            cur = res; ll = res; llw = ow; llh = oh;
        }
        int32_t mid = 1 << (bits - 1), topv = (1 << bits) - 1;
        for (long y = 0; y < height; y++) {
            const int32_t *r = cur + y * width;
            uint16_t *o = out + 2 * y * stride;
            for (long x = 0; x < width; x++) { int32_t v = r[x] + mid; o[2 * x] = (uint16_t)(v < 0 ? 0 : (v > topv ? topv : v)); }
        }
    }
    rc = 0;
done:
    for (int bi = 0; bi < nb; bi++) free(coef[bi]);
    free(rows_lo); free(rows_hi); free(scratch); free(cur); free(ia); free(ib);
    return rc;
}
/* Panasonic RW2 RawFormat 8 (shootflow.rw2._c8_tile_python): one tile of Huffman-coded 2x2 blocks.
   lookup: symbol for each value of the next 16 bits (17 = none). meta: lengths[17], shifts[17],
   initial[4] (TL, TR, BL, BR), top. Decodes min(pairs, height / 2) row pairs into out (width a row).
   Returns 0, or -2 on a code that matches no symbol. Bytes are read from their lowest bit. */
long shootflow_panasonic_c8_tile(const uint8_t *d, long len, long width, long height, long pairs,
                                 const uint8_t *lookup, const int32_t *meta, uint16_t *out)
{
    static uint8_t rev[256];
    static int rev_ready = 0;
    if (!rev_ready) {
        for (int b = 0; b < 256; b++) {
            int r = 0;
            for (int k = 0; k < 8; k++) if (b >> k & 1) r |= 0x80 >> k;
            rev[b] = (uint8_t)r;
        }
        rev_ready = 1;
    }
    const int32_t *lengths = meta, *shifts = meta + 17, *initial = meta + 34;
    int32_t top = meta[38];
    static const int order[4] = {0, 2, 1, 3};
    long rows = height / 2;
    if (pairs >= 0 && pairs < rows) rows = pairs;
    uint64_t acc = 0;
    int have = 0;
    long p = 0;
    int32_t first[4] = {initial[0], initial[1], initial[2], initial[3]};
    for (long pair = 0; pair < rows; pair++) {
        int32_t base[4] = {first[0], first[1], first[2], first[3]};
        uint16_t *o0 = out + 2 * pair * width, *o1 = o0 + width;
        for (long col = 0; col < width; col += 2) {
            int32_t block[4];
            for (int k = 0; k < 4; k++) {
                int slot = order[k];
                while (have <= 56) { acc = acc << 8 | (p < len ? rev[d[p]] : 0); p++; have += 8; }
                int sym = lookup[(acc >> (have - 16)) & 0xFFFF];
                if (sym >= 17) return -2;
                have -= lengths[sym];
                int s = shifts[sym];
                int extra = sym - s;
                int32_t step;
                if (extra > 0) {
                    have -= extra;
                    int32_t raw = (int32_t)((acc >> have) & ((1u << extra) - 1));
                    step = (raw >> (extra - 1)) ? raw << s : (raw << s) - (1 << sym) + (s ? 0 : 1);
                } else if (sym && !((acc >> (have - 1)) & 1)) {
                    step = -(1 << sym);
                } else {
                    step = 0;
                }
                if (s) step += 1 << (s - 1);
                int32_t v = base[slot] + step;
                block[slot] = v < 0 ? 0 : v > top ? top : v;
            }
            base[0] = block[0]; base[1] = block[1]; base[2] = block[2]; base[3] = block[3];
            if (col == 0) { first[0] = block[0]; first[1] = block[1]; first[2] = block[2]; first[3] = block[3]; }
            o0[col] = (uint16_t)block[0]; o0[col + 1] = (uint16_t)block[1];
            o1[col] = (uint16_t)block[2]; o1[col + 1] = (uint16_t)block[3];
        }
    }
    return 0;
}

/* Kodak compression 65000 (shootflow.kodak; dcraw's kodak_65000_decode and _load_raw): each row in blocks
   of up to 256 sensels, size rounded up to 4, one byte of two 4-bit bit lengths per pair; a length over 12
   means the block is plain (groups of six 16-bit words hold eight values). Otherwise an LSB-first stream
   refilled from two big-endian 16-bit words, low word first, after a 16-bit prefix when size % 8 == 4.
   Two predictors (one per CFA column), reset per block; each value goes through table (65536 entries).
   be: the file's 16-bit words are big-endian. Returns the count of sensels outside the table (0 is good). */
long shootflow_kodak_run(const uint8_t *d, long len, long start, long width, long height,
                         const uint16_t *table, int be, uint16_t *out)
{
    long p = start, bad = 0;
#define KD(i) ((i) < len ? d[(i)] : 0)
    for (long row = 0; row < height; row++) {
        for (long col = 0; col < width; col += 256) {
            int count = (int)(width - col < 256 ? width - col : 256);
            int size = (count + 3) & ~3;
            int lens[260], vals[264];
            int plain = 0;
            long q = p;
            for (int i = 0; i < size; i += 2) {
                int c = KD(q); q++;
                lens[i] = c & 15; lens[i + 1] = c >> 4;
                if (lens[i] > 12 || lens[i + 1] > 12) { plain = 1; break; }
            }
            if (plain) {
                q = p;
                for (int i = 0; i < size; i += 8) {
                    unsigned w[6];
                    for (int j = 0; j < 6; j++) {
                        unsigned a = KD(q + 2 * j), b = KD(q + 2 * j + 1);
                        w[j] = be ? (a << 8 | b) : (b << 8 | a);
                    }
                    q += 12;
                    vals[i] = (int)((w[0] >> 12) << 8 | (w[2] >> 12) << 4 | (w[4] >> 12));
                    vals[i + 1] = (int)((w[1] >> 12) << 8 | (w[3] >> 12) << 4 | (w[5] >> 12));
                    for (int j = 0; j < 6; j++) vals[i + 2 + j] = (int)(w[j] & 0xFFF);
                }
            } else {
                uint64_t acc = 0;
                int nb = 0;
                if ((size & 7) == 4) { acc = (uint64_t)(KD(q) << 8 | KD(q + 1)); q += 2; nb = 16; }
                for (int i = 0; i < size; i++) {
                    int n = lens[i];
                    if (nb < n) {
                        uint64_t w = (uint64_t)KD(q) << 8 | (uint64_t)KD(q + 1) | (uint64_t)KD(q + 2) << 24 | (uint64_t)KD(q + 3) << 16;
                        q += 4;
                        acc |= w << nb;
                        nb += 32;
                    }
                    int v = 0;
                    if (n) {
                        v = (int)(acc & ((1u << n) - 1));
                        acc >>= n;
                        nb -= n;
                        if (!(v & (1 << (n - 1)))) v -= (1 << n) - 1;
                    }
                    vals[i] = v;
                }
            }
            p = q;
            long pred[2] = {0, 0};
            uint16_t *o = out + row * width + col;
            for (int i = 0; i < count; i++) {
                long code;
                if (plain) code = vals[i];
                else { pred[i & 1] += vals[i]; code = pred[i & 1]; }
                if (code < 0) { bad++; code = 0; }
                else if (code > 0xFFFF) { bad++; code = 0xFFFF; }
                o[i] = table[code];
            }
        }
    }
#undef KD
    return bad;
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
    packed = lib.shootflow_panasonic_packed_run
    packed.restype = ctypes.c_long
    packed.argtypes = [ctypes.c_char_p, ctypes.c_long, ctypes.c_long, ctypes.c_long, ctypes.c_int, ctypes.c_void_p]
    _STATE["panasonic_packed"] = packed
    c6 = lib.shootflow_panasonic_c6_run
    c6.restype = ctypes.c_long
    c6.argtypes = [ctypes.c_char_p, ctypes.c_long, ctypes.c_long, ctypes.c_long, ctypes.c_void_p]
    _STATE["panasonic_c6"] = c6
    c8 = lib.shootflow_panasonic_c8_tile
    c8.restype = ctypes.c_long
    c8.argtypes = [ctypes.c_char_p, ctypes.c_long, ctypes.c_long, ctypes.c_long, ctypes.c_long, ctypes.c_char_p,
                   ctypes.c_void_p, ctypes.c_void_p]
    _STATE["panasonic_c8"] = c8
    for name, args in (
        ("samsung_rows", [ctypes.c_char_p] + [ctypes.c_long] * 5 + [ctypes.c_void_p]),
        ("samsung_huffman", [ctypes.c_char_p] + [ctypes.c_long] * 3 + [ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p]),
        ("samsung_blocks", [ctypes.c_char_p] + [ctypes.c_long] * 4 + [ctypes.c_void_p]),
        ("pentax", [ctypes.c_char_p] + [ctypes.c_long] * 3 + [ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p]),
        ("hasselblad", [ctypes.c_char_p] + [ctypes.c_long] * 3 + [ctypes.c_int, ctypes.c_char_p, ctypes.c_void_p]),
        ("kodak", [ctypes.c_char_p] + [ctypes.c_long] * 4 + [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]),
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
    crx = lib.shootflow_crx_band
    crx.restype = ctypes.c_long
    crx.argtypes = [ctypes.c_char_p, ctypes.c_long, ctypes.c_long, ctypes.c_long, ctypes.c_int, ctypes.c_void_p, ctypes.c_long]
    _STATE["crx"] = crx
    craw = lib.shootflow_craw_plane
    craw.restype = ctypes.c_long
    craw.argtypes = [ctypes.c_char_p, ctypes.c_long, ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int,
                     ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_long, ctypes.c_long, ctypes.c_long,
                     ctypes.c_int, ctypes.c_void_p, ctypes.c_long]
    _STATE["craw"] = craw
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


def panasonic_packed_run(data: bytes, width: int, height: int, bits: int) -> array | None:
    """``shootflow.rw2._packed_python`` (RawFormat 5 and 7) in C: an ``array('H')``, or None without the
    native library."""

    fn: Any = _STATE.get("panasonic_packed") if reader() is not None else None
    if fn is None:
        return None
    data = data if isinstance(data, bytes) else bytes(data)
    out = array("H", [0]) * max(1, width * height)
    if fn(data, len(data), width, height, bits, out.buffer_info()[0]) < 0:
        from shootflow.raw_develop import DevelopError

        raise DevelopError("RW2: the sensor data is cut short")
    del out[width * height :]
    return out


def panasonic_c6_run(data: bytes, width: int, height: int) -> array | None:
    """``shootflow.rw2._c6_python`` (RawFormat 6) in C: an ``array('H')``, or None without the native library."""

    fn: Any = _STATE.get("panasonic_c6") if reader() is not None else None
    if fn is None:
        return None
    data = data if isinstance(data, bytes) else bytes(data)
    out = array("H", [0]) * max(1, width * height)
    if fn(data, len(data), width, height, out.buffer_info()[0]) < 0:
        from shootflow.raw_develop import DevelopError

        raise DevelopError("RW2: the sensor data is cut short")
    del out[width * height :]
    return out


def panasonic_c8_tile(data: bytes, params, width: int, height: int, pairs: int | None = None) -> array | None:
    """``shootflow.rw2._c8_tile_python`` (RawFormat 8, one tile) in C: an ``array('H')`` of
    ``width`` x (2 x row pairs) sensels, or None without the native library."""

    fn: Any = _STATE.get("panasonic_c8") if reader() is not None else None
    if fn is None:
        return None
    data = data if isinstance(data, bytes) else bytes(data)
    rows = height // 2 if pairs is None else min(height // 2, pairs)
    meta = array("i", list(params.lengths) + list(params.shifts) + list(params.initial) + [params.top])
    out = array("H", [0]) * max(1, width * rows * 2)
    if fn(data, len(data), width, height, -1 if pairs is None else pairs, params.lookup, meta.buffer_info()[0],
          out.buffer_info()[0]) < 0:
        from shootflow.raw_develop import DevelopError

        raise DevelopError("RW2 RawFormat 8: a code matches no symbol (corrupt data)")
    del out[width * rows * 2 :]
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


def hasselblad_run(data: bytes, width: int, height: int, psv: int, lut: bytes) -> array | None:
    """``shootflow.hasselblad._decode_python`` in C (``lut``: ``lut16`` of the stream's Huffman table): an
    ``array('H')``, or None without the native library. Raises ``DevelopError`` where the Python reference would."""

    fn: Any = _srw_call("hasselblad")
    if fn is None:
        return None
    data = data if isinstance(data, bytes) else bytes(data)
    if len(lut) != 2 * 65536:
        raise ValueError("the Hasselblad lookup has 65536 16-bit entries")
    out = array("H", [0]) * max(1, width * height)
    got = fn(data, len(data), width, height, psv, lut, out.buffer_info()[0])
    if got == -2:
        raise MemoryError("3FR: no memory for the decoder's three prediction rows")
    if got < 0:
        from shootflow.raw_develop import DevelopError

        raise DevelopError("3FR: the compressed stream holds a code its Huffman table does not assign")
    del out[width * height :]
    return out


def kodak_run(data: bytes, start: int, width: int, height: int, table: array, big_endian: bool) -> array | None:
    """``shootflow.kodak._decode_python`` in C (``table``: the 65536-entry linearisation table): an
    ``array('H')``, or None without the native library. Raises ``DevelopError`` where the Python reference would."""

    fn: Any = _srw_call("kodak")
    if fn is None:
        return None
    data = data if isinstance(data, bytes) else bytes(data)
    if len(table) != 0x10000 or table.typecode != "H":
        raise ValueError("the Kodak table is an array('H') of 65536 entries")
    out = array("H", [0]) * max(1, width * height)
    bad = fn(data, len(data), start, width, height, table.buffer_info()[0], 1 if big_endian else 0, out.buffer_info()[0])
    if bad:
        from shootflow.raw_develop import DevelopError

        raise DevelopError(f"DCR: {bad} sensels decode outside the linearisation table; the stream is damaged")
    del out[width * height :]
    return out


def fuji_strip_function():
    """``shootflow_fuji_strip`` (one strip of a compressed RAF, ``shootflow.raf_compressed``), or None."""

    return _STATE.get("fuji_strip") if reader() is not None else None


def crx_function():
    """``shootflow_crx_band`` (one band of a Canon CR3, ``shootflow.cr3``), or None."""

    return _STATE.get("crx") if reader() is not None else None


def craw_function():
    """``shootflow_craw_plane`` (one plane of a Canon C-RAW CR3, ``shootflow.cr3_wavelet``), or None."""

    return _STATE.get("craw") if reader() is not None else None
