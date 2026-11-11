"""Loading MaSTr1325 and a leakage-aware train/test split.

MaSTr1325 (Bovcon et al. 2019, IROS, CC BY 4.0): 1325 frames at 512x384 from a small
USV in the Gulf of Koper, each with a per-pixel mask: 0 obstacle or environment
(shore, boats, buoys, people), 1 water, 2 sky, 4 unknown (ignored). The frames come
from sequences, so neighbouring ids are near-duplicates. A random per-frame split leaks;
we split by blocks of consecutive ids instead.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

import numpy as np

OBSTACLE, WATER, SKY, UNKNOWN = 0, 1, 2, 4
IGNORE = 255  # what UNKNOWN becomes for training and scoring

IMAGES_URL = "https://data.vicos.si/borja/mastr1325_dataset/MaSTr1325_images_512x384.zip"
MASKS_URL = "https://data.vicos.si/borja/mastr1325_dataset/MaSTr1325_masks_512x384.zip"
SHA256 = {
    "MaSTr1325_images_512x384.zip": "3763337e780f463d8af98757f11dae4b00945d969dc04575fbbc5e5b0da56052",
    "MaSTr1325_masks_512x384.zip": "1e2daf08637bad9acfc2aa2c7a5674982ba66d6005d61bd0f633cdb7fc286ab9",
}


def frame_ids(root: Path) -> list[str]:
    """Ids (file stems without the mask suffix) that have both an image and a mask."""
    root = Path(root)
    ids = sorted(p.stem for p in root.glob("*.jpg") if (root / f"{p.stem}m.png").is_file())
    return ids


def block_key(fid: str, block: int = 25) -> str:
    """Group consecutive frames: the numeric part of the id // block, per prefix."""
    m = re.match(r"^(old_)?0*(\d+)(L?)$", fid)
    if not m:
        return fid
    prefix = (m.group(1) or "") + (m.group(3) or "")
    return f"{prefix}{int(m.group(2)) // block}"


def split(ids: list[str], test_frac: float = 0.2, block: int = 25, salt: str = "marine-detect") -> tuple[list[str], list[str]]:
    """Deterministic block split: a whole block of consecutive frames goes to test or train."""
    train, test = [], []
    for fid in ids:
        h = hashlib.sha256((salt + block_key(fid, block)).encode()).digest()
        (test if h[0] / 256.0 < test_frac else train).append(fid)
    return train, test


def remap(mask: np.ndarray) -> np.ndarray:
    """Labels 0/1/2 kept, 4 (and anything else) to IGNORE."""
    out = np.full(mask.shape, IGNORE, dtype=np.uint8)
    for k in (OBSTACLE, WATER, SKY):
        out[mask == k] = k
    return out


def load(root: Path, ids: list[str], size: tuple[int, int] = (320, 240)) -> tuple[np.ndarray, np.ndarray]:
    """Images as float32 (N, 3, H, W) in [0, 1] and masks as uint8 (N, H, W), resized to size=(W, H)."""
    from PIL import Image

    root = Path(root)
    xs, ys = [], []
    for fid in ids:
        im = Image.open(root / f"{fid}.jpg").convert("RGB").resize(size, Image.BILINEAR)
        mk = Image.open(root / f"{fid}m.png").resize(size, Image.NEAREST)
        xs.append(np.asarray(im, dtype=np.float32).transpose(2, 0, 1) / 255.0)
        ys.append(remap(np.asarray(mk)))
    return np.stack(xs), np.stack(ys)
