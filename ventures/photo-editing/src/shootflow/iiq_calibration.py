"""Phase One's per-sensor calibration from an IIQ's ``0x110`` block, applied to the decoded sensels.

Every Phase One back writes a factory calibration into each raw: the sensor container's tag ``0x110`` points
(from byte 8) at a block that opens ``II``, two bytes, a 4-byte version, then a 4-byte offset (from the block's
start) of a directory: a 4-byte count, 4 spare bytes, and 12-byte entries (tag, length, offset from the block's
start). Capture One applies it; LibRaw does too (``phase_one_correct``). Without it the frame shows what the
back's maker calibrates away: a P45+'s right readout half 3-4% darker than its left and a vignette-like
falloff of up to 8% toward the corners, an IQ180's four sensor tiles at gains up to 10% apart, a P65+'s
bottom quadrants 3-4% bright, and hundreds to thousands of hot or dead sensels and a few dead columns.

The entries applied, in the block's own order (all on black-subtracted values; sensels at or below black are
left as they are, so the noise below black survives as it does elsewhere in the reader):

* ``0x400`` defects, 8 bytes each (column, row, type, spare). Type 129 a single sensel: replaced by the
  rounded mean of its in-frame same-colour neighbours (the two diagonal pairs and the four sensels two away
  for a green on a red row; the four two away and the four two away diagonally for every other colour).
  Types 131 and 137 a whole column: replaced, after every other entry, by
  ``0.0732233 * (four sensels two away diagonally) + 0.3535534 * (the sensels two left and two right)``, the
  weights of a smooth surface through the same-colour neighbours, for every row.
* ``0x401`` a flat field of float32 values, one per grid point for every colour; ``0x410`` and ``0x416`` the
  same with 16-bit values over 32768; ``0x40b`` two 16-bit values per grid point, red and blue (greens left).
  Each opens with eight 16-bit numbers: the grid's left column, top row, width, height and the column and
  row step. The gain at a sensel is bilinear between the four grid points around it, accumulated row by row
  and column by column in float32; the product is truncated. Rows and columns past the grid's last whole
  step are left. A back can carry several (an IQ180 has one per tile and per-sensel strips along the seams).
* ``0x419`` a polynomial for the right readout half (from the split column): a 4-byte header, then eight
  float32 ``p``; the gain term is shifted by the sensor temperature (``0x210``, a float32 in the value
  field): ``p3 += (t - p7) * p6 + 1``, and a value ``v`` becomes ``(p5 v + p3) v + p1``.
* ``0x41a`` a polynomial for the whole frame: four float32 ``p``; ``v`` becomes ``v + p0 + p1 v + p2 v^2 + p3 v^3``.
* ``0x41e`` a gain per readout quadrant: float32 at words 6, 10, 14 and 18 (top-left, top-right,
  bottom-left, bottom-right), each ``1 + g``, the product truncated.
* ``0x41f`` a linearisation curve per quadrant: sixteen 32-bit levels per quadrant (top-left, top-right,
  bottom-left, bottom-right); each quadrant's levels map to the four quadrants' rounded mean through a
  natural cubic spline in the 0-1 scale, pinned at 0, at ``ref15 * 65535 / own15`` and at 65535.
* ``0x431`` the four-tile backs' combined curve: seven reference levels, then seven gains per quadrant in
  units of 1/10000; each quadrant's spline maps ``ref`` to ``ref * gain / 10000`` (pinned at 0 and 65535).
  Either of ``0x41e`` and ``0x431`` applies once, and ``0x431`` stands in for ``0x41f`` too.

Not applied: ``0x412`` (a curve chosen by the nearest ``0x21a`` value; no file at hand carries it) and the
entries no reader documents (``0x402``-``0x408``, ``0x40f``, ``0x413``, ``0x414``, ``0x418``, ``0x41c``,
``0x420``-``0x439``). The block's layout and the arithmetic as LibRaw 0.22 reads them (``phase_one_correct``,
``phase_one_flat_field``, ``cubic_spline``; LGPL-2.1/CDDL), read for the format only; this is an independent
implementation, compared sensel for sensel with LibRaw's render on 16 backs in IIQ L, 16-bit IIQ L and IIQ S
(``tools/iiq_calibration_check.py``, ``eval/phaseone-iiq-calibration-2026-11-19.md``,
``eval/phaseone-iiq-calibration-newer-backs-2026-11-19.md``).
"""

from __future__ import annotations

import ctypes
import hashlib
import os
import struct
import subprocess
import sys
import tempfile
import threading
from array import array
from pathlib import Path

TAG_META, TAG_TEMPERATURE = 0x110, 0x210
BASE = 8
DEFECTS, FLAT_FLOAT, FLAT_RB, FLAT, FLAT_2 = 0x400, 0x401, 0x40B, 0x410, 0x416
POLY_RIGHT, POLY_ALL, QUAD_GAIN, QUAD_LINEAR, QUAD_COMBINED = 0x419, 0x41A, 0x41E, 0x41F, 0x431
BAD_PIXEL, BAD_COLUMNS = 129, (131, 137)
# Same-colour neighbours of a defect: a green on a red row uses the first eight, every other colour the last.
NEIGHBOURS = ((-1, -1), (-1, 1), (1, -1), (1, 1), (-2, 0), (0, -2), (0, 2), (2, 0), (-2, -2), (-2, 2), (2, -2), (2, 2))
DIAGONAL_WEIGHT, SIDE_WEIGHT = 0.0732233, 0.3535534


def entries(data: bytes, directory: dict) -> list[tuple[int, int, int]]:
    """The calibration block's entries as (tag, length, absolute offset), in the block's order; [] without one."""

    hit = directory.get(TAG_META)
    if hit is None or not hit[1]:
        return []
    start = hit[2] + BASE
    if start + 12 > len(data) or data[start : start + 2] != b"II":
        return []
    at = start + struct.unpack_from("<I", data, start + 8)[0]
    if at + 8 > len(data):
        return []
    n = struct.unpack_from("<I", data, at)[0]
    if n > 4096 or at + 8 + 12 * n > len(data):
        return []
    out = []
    for k in range(n):
        tag, length, off = struct.unpack_from("<3I", data, at + 8 + 12 * k)
        if start + off + length <= len(data):
            out.append((tag, length, start + off))
    return out


def _clip_table(fn) -> array:
    out = array("H", [0]) * 65536
    for i in range(65536):
        v = fn(i)
        out[i] = 0 if v <= 0 else 65535 if v >= 65535 else int(v)
    return out


def _f32(v: float) -> float:
    return struct.unpack("<f", struct.pack("<f", v))[0]


def spline_table(xs: list[int], ys: list[int]) -> array:
    """A 65536-entry table through the points (0-65535 scale) by a natural cubic spline in the 0-1 scale."""

    n = len(xs)
    x = [v / 65535.0 for v in xs]
    y = [v / 65535.0 for v in ys]
    d = [x[i + 1] - x[i] for i in range(n - 1)]
    b = [0.0] + [(y[i] - y[i - 1]) / d[i - 1] for i in range(1, n)]
    # Second derivatives c[1..n-2] (c[0] = c[n-1] = 0) from the tridiagonal system, by forward elimination.
    diag = [0.0] * n
    rhs = [0.0] * n
    for i in range(1, n - 1):
        diag[i] = 2 * (d[i - 1] + d[i])
        rhs[i] = 6 * (b[i + 1] - b[i])
    for i in range(1, n - 2):
        f = d[i] / diag[i]
        diag[i + 1] -= f * d[i]
        rhs[i + 1] -= f * rhs[i]
    c = [0.0] * n
    for i in range(n - 2, 0, -1):
        c[i] = (rhs[i] - (d[i] * c[i + 1] if i + 1 <= n - 2 else 0.0)) / diag[i]
    out = array("H", [0]) * 65536
    for i in range(65536):
        xo = i / 65535.0
        yo = 0.0
        for j in range(n - 1):
            if x[j] <= xo <= x[j + 1]:
                v = xo - x[j]
                yo = (y[j] + ((y[j + 1] - y[j]) / d[j] - (2 * d[j] * c[j] + c[j + 1] * d[j]) / 6) * v
                      + c[j] * 0.5 * v * v + (c[j + 1] - c[j]) / (6 * d[j]) * v * v * v)
        out[i] = 0 if yo < 0 else 65535 if yo >= 1.0 else int(yo * 65535.0 + 0.5)
    return out


def plan(data: bytes, directory: dict, fields: dict) -> list[tuple]:
    """The corrections as a list of steps, in the order they apply.

    Steps: ``("table", table, r0, r1, c0, c1, name)``, ``("flat", head, k, grid, redblue, name)``,
    ``("pixels", [(row, col), ...])`` and, last, ``("columns", [col, ...])``."""

    width, height = fields["width"], fields["height"]
    split_col, split_row = fields.get("split_col", 0), fields.get("split_row", 0)
    temp_hit = directory.get(TAG_TEMPERATURE)
    temperature = struct.unpack("<f", struct.pack("<I", temp_hit[2]))[0] if temp_hit else 0.0
    quads = ((0, split_row, 0, split_col), (0, split_row, split_col, width), (split_row, height, 0, split_col),
             (split_row, height, split_col, width))
    steps: list[tuple] = []
    columns: list[int] = []
    gain_done = linear_done = False
    for tag, length, at in entries(data, directory):
        if tag == DEFECTS:
            pixels = []
            for k in range(length // 8):
                col, row, kind, _ = struct.unpack_from("<4H", data, at + 8 * k)
                if col >= width:
                    continue
                if kind in BAD_COLUMNS:
                    columns.append(col)
                elif kind == BAD_PIXEL and row < height:
                    pixels.append((row, col))
            if pixels:
                steps.append(("pixels", pixels))
        elif tag in (FLAT_FLOAT, FLAT, FLAT_2, FLAT_RB) and length >= 16:
            head = struct.unpack_from("<6H", data, at)
            if head[2] * head[3] * head[4] * head[5] == 0:
                continue
            wide = -(-head[2] // head[4])
            high = -(-head[3] // head[5])
            k = 2 if tag == FLAT_RB else 1
            n = wide * high * k
            size = 4 if tag == FLAT_FLOAT else 2
            if 16 + n * size > length:
                continue
            if tag == FLAT_FLOAT:
                grid = array("f", struct.unpack_from(f"<{n}f", data, at + 16))
            else:
                grid = array("f", (v / 32768.0 for v in struct.unpack_from(f"<{n}H", data, at + 16)))
            steps.append(("flat", head, k, grid, tag == FLAT_RB, f"{tag:#x}"))
        elif tag == POLY_RIGHT and length >= 36:
            p = [_f32(v) for v in struct.unpack_from("<8f", data, at + 4)]
            p3 = _f32(p[3] + (temperature - p[7]) * p[6] + 1)
            steps.append(("table", _clip_table(lambda i: _f32((p[5] * i + p3) * i + p[1])), 0, height,
                          split_col, width, "0x419"))
        elif tag == POLY_ALL and length >= 16:
            p = [_f32(v) for v in struct.unpack_from("<4f", data, at)]
            if any(p):
                steps.append(("table", _clip_table(lambda i: _f32(((p[3] * i + p[2]) * i + p[1]) * i + p[0]) + i),
                              0, height, 0, width, "0x41a"))
        elif tag == QUAD_GAIN and not gain_done and length >= 76:
            gains = [1.0 + struct.unpack_from("<f", data, at + 4 * w)[0] for w in (6, 10, 14, 18)]
            for g, (r0, r1, c0, c1) in zip(gains, quads):
                if g != 1.0:
                    steps.append(("table", _clip_table(lambda i, g=g: _f32(g * i)), r0, r1, c0, c1, "0x41e"))
            gain_done = True
        elif tag == QUAD_LINEAR and not linear_done and length >= 256:
            levels = struct.unpack_from("<64I", data, at)
            lc = [[v & 0xFFFF for v in levels[16 * q : 16 * q + 16]] for q in range(4)]
            ref = [(sum(lc[q][i] for q in range(4)) + 2) >> 2 for i in range(16)]
            for q, (r0, r1, c0, c1) in enumerate(quads):
                if not lc[q][15]:
                    continue
                top = ref[15] * 65535 // lc[q][15]
                steps.append(("table", spline_table([0, *lc[q], top, 65535], [0, *ref, top, 65535]), r0, r1, c0, c1,
                              "0x41f"))
            linear_done = True
        elif tag == QUAD_COMBINED and not gain_done and length >= 140:
            words = [v & 0xFFFF for v in struct.unpack_from("<35I", data, at)]
            ref, gains_q = words[:7], [words[7 + 7 * q : 14 + 7 * q] for q in range(4)]
            for q, (r0, r1, c0, c1) in enumerate(quads):
                ys = [ref[i] * gains_q[q][i] // 10000 for i in range(7)]
                if ys == ref:
                    continue
                steps.append(("table", spline_table([0, *ref, 65535], [0, *ys, 65535]), r0, r1, c0, c1, "0x431"))
            gain_done = linear_done = True
    if columns:
        steps.append(("columns", sorted(set(columns))))
    return steps


# --- the passes ---------------------------------------------------------------------------------------------


def _table_python(v, width, height, black, table, r0, r1, c0, c1):
    for row in range(max(0, r0), min(height, r1)):
        base = row * width
        for col in range(max(0, c0), min(width, c1)):
            x = v[base + col] - black
            if x > 0:
                y = black + table[x if x < 65536 else 65535]
                v[base + col] = y if y < 65535 else 65535


def _flat_python(v, width, height, black, head, k, grid, redblue, top, left):
    x0, y0, w, h, xs, ys = head
    wide, high = -(-w // xs), -(-h // ys)
    cur = [_f32(grid[i]) for i in range(wide * k)]
    for y in range(1, high):
        step = [_f32(_f32(grid[(y * wide) * k + i] - cur[i]) / ys) for i in range(wide * k)]
        rend = y0 + y * ys
        row = rend - ys
        while row < height and row < rend and row < y0 + h - ys:
            base = row * width
            rr = (row - top) & 1
            for x in range(1, wide):
                m = [cur[(x - 1) * k + s] for s in range(k)]
                d = [_f32(_f32(cur[x * k + s] - m[s]) / xs) for s in range(k)]
                cend = x0 + x * xs
                col = cend - xs
                while col < width and col < cend and col < x0 + w - xs:
                    slot = 0
                    go = True
                    if redblue:
                        go = rr == ((col - left) & 1)
                        slot = rr
                    if go:
                        xv = v[base + col] - black
                        if xv > 0:
                            out = black + int(_f32(xv * m[slot]))
                            v[base + col] = out if out < 65535 else 65535
                    for s in range(k):
                        m[s] = _f32(m[s] + d[s])
                    col += 1
            for i in range(wide * k):
                cur[i] = _f32(cur[i] + step[i])
            row += 1


C_SOURCE = r"""
#include <stdint.h>
#include <stdlib.h>

void shootflow_iiq_table(uint16_t *v, long width, long height, long black, const uint16_t *table,
                         long r0, long r1, long c0, long c1) {
    if (r0 < 0) r0 = 0;
    if (c0 < 0) c0 = 0;
    if (r1 > height) r1 = height;
    if (c1 > width) c1 = width;
    for (long row = r0; row < r1; row++) {
        uint16_t *p = v + row * width;
        for (long col = c0; col < c1; col++) {
            long x = (long)p[col] - black;
            if (x > 0) {
                long y = black + table[x < 65536 ? x : 65535];
                p[col] = (uint16_t)(y < 65535 ? y : 65535);
            }
        }
    }
}

int shootflow_iiq_flat(uint16_t *v, long width, long height, long black, const long *head, int k,
                       const float *grid, int redblue, long top, long left) {
    long x0 = head[0], y0 = head[1], w = head[2], h = head[3], xs = head[4], ys = head[5];
    long wide = w / xs + (w % xs != 0), high = h / ys + (h % ys != 0);
    float *cur = calloc((size_t)(wide * k), sizeof(float));
    float *step = calloc((size_t)(wide * k), sizeof(float));
    if (!cur || !step) { free(cur); free(step); return 1; }
    for (long i = 0; i < wide * k; i++) cur[i] = grid[i];
    for (long y = 1; y < high; y++) {
        for (long i = 0; i < wide * k; i++) step[i] = (grid[y * wide * k + i] - cur[i]) / (float)ys;
        long rend = y0 + y * ys;
        for (long row = rend - ys; row < height && row < rend && row < y0 + h - ys; row++) {
            uint16_t *p = v + row * width;
            int rr = (int)((row - top) & 1);
            for (long x = 1; x < wide; x++) {
                float m[2], d[2];
                for (int s = 0; s < k; s++) {
                    m[s] = cur[(x - 1) * k + s];
                    d[s] = (cur[x * k + s] - m[s]) / (float)xs;
                }
                long cend = x0 + x * xs;
                for (long col = cend - xs; col < width && col < cend && col < x0 + w - xs; col++) {
                    int slot = 0, go = 1;
                    if (redblue) {
                        go = rr == (int)((col - left) & 1);
                        slot = rr;
                    }
                    if (go && col >= 0) {
                        long xv = (long)p[col] - black;
                        if (xv > 0) {
                            float f = (float)xv * m[slot];
                            long out = black + (long)f;
                            p[col] = (uint16_t)(out < 65535 ? out : 65535);
                        }
                    }
                    for (int s = 0; s < k; s++) m[s] += d[s];
                }
            }
            for (long i = 0; i < wide * k; i++) cur[i] += step[i];
        }
    }
    free(cur);
    free(step);
    return 0;
}
"""

_STATE: dict[str, object] = {}
_LOCK = threading.Lock()


def _load():
    if os.environ.get("SHOOTFLOW_NATIVE", "1") == "0" or sys.platform == "win32":
        return None
    from shootflow.ljpeg_native import _cache_dir, _compiler

    digest = hashlib.sha256(C_SOURCE.encode()).hexdigest()[:16]
    suffix = ".dylib" if sys.platform == "darwin" else ".so"
    target = _cache_dir() / f"iiq-calibration-{digest}{suffix}"
    try:
        if not target.exists():
            cc = _compiler()
            if cc is None:
                return None
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="shootflow-cc-") as tmp:
                src = Path(tmp) / "iiq_calibration.c"
                src.write_text(C_SOURCE)
                built = Path(tmp) / target.name
                # No -ffast-math: the flat field's float32 accumulation order is part of the result.
                flags = ["-O2", "-ffp-contract=off"] + (["-dynamiclib"] if sys.platform == "darwin" else ["-shared", "-fPIC"])
                try:
                    subprocess.run([cc, *flags, "-o", str(built), str(src)], check=True, capture_output=True, timeout=60)
                except (OSError, subprocess.SubprocessError):
                    return None
                os.replace(built, target)
        lib = ctypes.CDLL(str(target))
    except OSError:
        return None
    P, L = ctypes.c_void_p, ctypes.c_long
    table = lib.shootflow_iiq_table
    table.restype = None
    table.argtypes = [P, L, L, L, P, L, L, L, L]
    flat = lib.shootflow_iiq_flat
    flat.restype = ctypes.c_int
    flat.argtypes = [P, L, L, L, P, ctypes.c_int, P, ctypes.c_int, L, L]
    return table, flat


def native():
    """The loaded C passes (table, flat field), or None."""

    if "fns" not in _STATE:
        with _LOCK:
            if "fns" not in _STATE:
                _STATE["fns"] = _load()
    return _STATE["fns"]


def _colour(row: int, col: int, top: int, left: int) -> int:
    """0 red, 1 green on a red row, 2 blue, 3 green on a blue row (RGGB at the image's top-left)."""

    return ((0, 1), (3, 2))[(row - top) & 1][(col - left) & 1]


def _pixels(v, width, height, black, pixels, top, left):
    def at(r, c):
        x = v[r * width + c] - black
        return x if x > 0 else 0

    for row, col in pixels:
        first = 0 if _colour(row, col, top, left) == 1 else 4
        total = count = 0
        for dr, dc in NEIGHBOURS[first : first + 8]:
            r, c = row + dr, col + dc
            if 0 <= r < height and 0 <= c < width:
                total += at(r, c)
                count += 1
        if count:
            v[row * width + col] = min(65535, black + (total + (count >> 1)) // count)


def _columns(v, width, height, black, columns):
    def at(r, c):
        if not (0 <= r < height and 0 <= c < width):
            return 0
        x = v[r * width + c] - black
        return x if x > 0 else 0

    bad = set(columns)
    for col in columns:
        # Neighbours two columns away; when one of them is bad too, the next good same-colour column on that side.
        lo, hi = col - 2, col + 2
        while lo in bad:
            lo -= 2
        while hi in bad:
            hi += 2
        for row in range(height):
            if lo == col - 2 and hi == col + 2:
                diag = at(row - 2, lo) + at(row - 2, hi) + at(row + 2, lo) + at(row + 2, hi)
                val = int(0.5 + diag * DIAGONAL_WEIGHT + (at(row, lo) + at(row, hi)) * SIDE_WEIGHT)
            else:
                a, b = at(row, lo), at(row, hi)
                val = int(0.5 + a + (b - a) * (col - lo) / (hi - lo))
            v[row * width + col] = min(65535, black + val)


def apply(values: array, data: bytes, directory: dict, fields: dict, use_native: bool = True) -> list[str]:
    """Apply the calibration in place to ``values`` (row-major, black level kept). Returns notes naming it."""

    steps = plan(data, directory, fields)
    if not steps:
        return []
    width, height, black = fields["width"], fields["height"], fields["black"]
    top, left = fields["top"], fields["left"]
    fns = native() if use_native else None
    ptr = values.buffer_info()[0]
    applied: list[str] = []
    for step in steps:
        kind = step[0]
        if kind == "table":
            _, table, r0, r1, c0, c1, name = step
            if fns is not None:
                fns[0](ptr, width, height, black, table.buffer_info()[0], r0, r1, c0, c1)
            else:
                _table_python(values, width, height, black, table, r0, r1, c0, c1)
            applied.append(name)
        elif kind == "flat":
            _, head, k, grid, redblue, name = step
            done = False
            if fns is not None:
                h = (ctypes.c_long * 6)(*head)
                done = fns[1](ptr, width, height, black, h, k, grid.buffer_info()[0], 1 if redblue else 0, top, left) == 0
            if not done:
                _flat_python(values, width, height, black, head, k, grid, redblue, top, left)
            applied.append(name)
        elif kind == "pixels":
            _pixels(values, width, height, black, step[1], top, left)
            applied.append(f"{len(step[1])} defective sensels")
        elif kind == "columns":
            _columns(values, width, height, black, step[1])
            applied.append(f"{len(step[1])} defective columns")
    seen: list[str] = []
    for name in applied:
        if name not in seen:
            seen.append(name)
    return ["IIQ: Phase One sensor calibration applied (" + ", ".join(seen) + ")"]


__all__ = ["apply", "entries", "native", "plan", "spline_table"]
