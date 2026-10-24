"""The sky stack by Siril (siril.org, GPL, `brew install siril`), when it is installed.

Siril is the open-source standard for registering and stacking astro frames, and it beats the
built-in stacker (`astro_core`) where it matters: sub-pixel star centroids from PSF fits, a
homography registration that follows wide-angle lens distortion to the frame corners (the
built-in one is a similarity: rotation and shift only), and winsorized sigma rejection with
proper normalisation. It knows nothing of landscapes - it aligns everything on the stars - so the
land is ours: the frames it gets have everything below the skyline filled with flat sky tone
(town lights and a light-painted bush must not be taken for stars), it stacks them onto the
same reference frame our foreground uses, and `astro` blends its sky with our still land along
the snapped skyline, as with the built-in stack.

Frames go in and come out as 32-bit float FITS, written and read here (FITS stores rows bottom
first; both directions flip, so arrays keep image orientation). Siril runs headless as
`siril-cli -s script -d workdir` in a temp folder that is removed afterwards.
"""
from __future__ import annotations

import logging
import re
import shutil
import subprocess
import tempfile
from collections.abc import Sequence
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

DEFAULT_CLI = "siril-cli"
TIMEOUT_S = 3600
MIN_PAIRS = 10            # star pairs a frame needs with the reference, else Siril drops it
FIND_SIGMA = 0.5          # detection threshold above noise; 0.2 picks up noise as stars
FIND_ROUNDNESS = 0.1      # minimum star roundness: low, so slightly trailed stars still count


class SirilError(RuntimeError):
    pass


def cli(cfg) -> str | None:
    """The siril-cli to use, or None when it is not installed or turned off (astro_stacker =
    "builtin")."""
    extra = getattr(cfg, "extra", {}) or {}
    if extra.get("astro_stacker", "siril") == "builtin":
        return None
    exe = extra.get("siril_cli", DEFAULT_CLI)
    found = shutil.which(exe) or (exe if Path(exe).is_file() else None)
    return found


# --- FITS --------------------------------------------------------------------------------
def _card(key: str, value) -> bytes:
    if isinstance(value, bool):
        v = "T" if value else "F"
    else:
        v = str(value)
    return f"{key:<8}= {v:>20}".ljust(80).encode("ascii")


def write_fits(path: Path, img: np.ndarray) -> None:
    """(H, W) or (H, W, 3) float -> 32-bit float FITS, image orientation kept."""
    a = np.asarray(img, np.float32)
    planes = a[None] if a.ndim == 2 else np.moveaxis(a, -1, 0)          # (C, H, W)
    planes = planes[:, ::-1, :]                                         # FITS: first row is the bottom
    cards = [_card("SIMPLE", True), _card("BITPIX", -32), _card("NAXIS", 3 if a.ndim == 3 else 2),
             _card("NAXIS1", a.shape[1]), _card("NAXIS2", a.shape[0])]
    if a.ndim == 3:
        cards.append(_card("NAXIS3", a.shape[2]))
    cards.append(b"END".ljust(80))
    header = b"".join(cards)
    header += b" " * (-len(header) % 2880)
    data = np.ascontiguousarray(planes).astype(">f4").tobytes()
    data += b"\0" * (-len(data) % 2880)
    path.write_bytes(header + data)


def read_fits(path: Path) -> np.ndarray:
    """A FITS image -> float32 (H, W) or (H, W, C), image orientation."""
    raw = path.read_bytes()
    keys: dict[str, str] = {}
    off = 0
    while True:
        block = raw[off:off + 2880]
        off += 2880
        done = False
        for i in range(0, 2880, 80):
            card = block[i:i + 80].decode("ascii", "replace")
            key = card[:8].strip()
            if key == "END":
                done = True
                break
            if card[8:10] == "= ":
                keys[key] = card[10:].split("/")[0].strip().strip("'").strip()
        if done:
            break
    bitpix = int(keys["BITPIX"])
    dims = [int(keys[f"NAXIS{i}"]) for i in range(1, int(keys["NAXIS"]) + 1)]
    dtype = {-32: ">f4", -64: ">f8", 16: ">i2", 32: ">i4", 8: "u1"}[bitpix]
    n = int(np.prod(dims))
    data = np.frombuffer(raw, dtype=dtype, count=n, offset=off).astype(np.float64)
    data = data * float(keys.get("BSCALE", 1)) + float(keys.get("BZERO", 0))
    if bitpix > 0:                                    # integer data: Siril's 0..65535 range
        data /= 65535.0
    arr = data.reshape(dims[::-1]).astype(np.float32)  # (C, H, W) or (H, W)
    arr = arr[..., ::-1, :]
    return np.moveaxis(arr, 0, -1) if arr.ndim == 3 else arr


# --- stacking ----------------------------------------------------------------------------
def sky_only(frame: np.ndarray, sky: np.ndarray) -> np.ndarray:
    """The frame with everything below the skyline replaced by flat sky tone (the median of the
    sky's lowest band per channel), so only stars are there to register."""
    out = frame.copy()
    if sky.all():
        return out
    rows = np.where(sky.any(axis=1))[0]
    band = sky.copy()
    if len(rows):
        band[: max(0, rows.max() - max(8, frame.shape[0] // 20))] = False   # just above the skyline
    tone = np.median(frame[band if band.any() else sky], axis=0)
    out[~sky] = tone
    return out


def script(n_ref: int, kappa: tuple[float, float] = (3.0, 3.0)) -> str:
    """The Siril script: link the FITS frames as a sequence, register on the stars against our
    reference frame, stack with winsorized rejection, 32-bit out."""
    lo, hi = kappa
    return "\n".join([
        "requires 1.2.0",
        "link sky",
        # Landscape astro is shot at the longest exposure before trailing shows at web size, which
        # on a 61 MP sensor is several times what keeps stars round at pixel level (16 mm 30 s,
        # 70 mm 30 s). Siril's default shape checks are for round telescope stars and threw nearly
        # all of these out (7 of hundreds found, 1-2 of 6 frames registered); relaxed and with
        # elongated stars allowed, it finds hundreds and registers 5 of 6, 10 of 11.
        f"setfindstar reset -sigma={FIND_SIGMA:g} -relax=on -roundness={FIND_ROUNDNESS:g}",
        f"setref sky_ {n_ref}",
        f"register sky_ -transf=homography -interp=lanczos4 -minpairs={MIN_PAIRS}",
        f"stack r_sky_ rej w {lo:g} {hi:g} -norm=addscale -32b -out=result",
        "",
    ])


def stack(frames: Sequence[np.ndarray], sky: np.ndarray, ref: int, cfg, exe: str | None = None) -> np.ndarray:
    """Register `frames` (linear RGB, one size) on their stars onto frames[ref] and stack them.
    Returns the linear RGB sky in frames[ref]'s geometry. Raises SirilError when Siril fails
    (too few stars, a frame with nothing to match): the caller falls back to the built-in stack."""
    exe = exe or cli(cfg)
    if not exe:
        raise SirilError("siril-cli not found")
    work = Path(tempfile.mkdtemp(prefix="igmp-siril-"))
    try:
        for i, f in enumerate(frames):
            write_fits(work / f"sky{i + 1:05d}.fit", sky_only(f, sky))
        (work / "stack.ssf").write_text(script(ref + 1))
        run = subprocess.run([exe, "-d", str(work), "-s", str(work / "stack.ssf")], capture_output=True,
                             text=True, timeout=int((getattr(cfg, "extra", {}) or {}).get("siril_timeout", TIMEOUT_S)))
        out = work / "result.fit"
        if run.returncode != 0 or not out.exists():
            tail = "\n".join(line for line in (run.stdout + run.stderr).splitlines() if "CFITSIO" not in line)[-1500:]
            raise SirilError(f"siril-cli failed ({run.returncode}): {tail}")
        skipped = len(re.findall(r"Image \d+ skipped", run.stdout))
        kept = len(frames) - skipped
        if kept < max(2, len(frames) / 2):
            raise SirilError(f"siril registered only {kept} of {len(frames)} frames")
        result = read_fits(out)
        if result.ndim == 2:
            result = np.repeat(result[..., None], 3, axis=2)
        h, w = frames[ref].shape[:2]
        if result.shape[:2] != (h, w):
            raise SirilError(f"siril returned {result.shape[:2]}, expected {(h, w)}")
        log.info("siril: stacked %d of %d frames", kept, len(frames))
        return result
    finally:
        shutil.rmtree(work, ignore_errors=True)
