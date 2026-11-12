"""BattLeDIM 2020 data: download from Zenodo, check, cache, load.

Source: Vrachimis et al., "Dataset of BattLeDIM: Battle of the Leakage Detection and
Isolation Methods", Zenodo record 4017659 (doi:10.5281/zenodo.4017659), CC-BY-4.0.
The files are not copied into this repository; they are fetched into a cache
directory ($WATER_LEAKS_CACHE, default ~/.cache/water-leaks) and checked by SHA-256.
"""
from __future__ import annotations

import hashlib
import os
import urllib.request
from pathlib import Path

import numpy as np

RECORD = "https://zenodo.org/api/records/4017659/files/{name}/content"

# SHA-256 of the files as downloaded on 2026-11-12.
SHA256 = {
    "2018_Leakages.csv": "e1abd9d549a18880d8ae704dc90c06c8a3d5aecbd2541fa091548ef392084ba6",
    "2018_SCADA_Flows.csv": "7f7e8625c9d92b083ee079a54cffb9ef803876de1e35017c1da0455968daf3ff",
    "2018_SCADA_Levels.csv": "a1fc5f0229448a620b6220f4d079b3162a255b3070acdce448608fbfc760903c",
    "2018_SCADA_Pressures.csv": "7782d890a7195699be94ddc01cba392da7ca285908afff619065a9616e04dcae",
    "2019_Leakages.csv": "b2ffe56b6c2f3b6cdb6aae9aeb30b9c425ba911fff8e3716ae543a56ff7576cd",
    "2019_SCADA_Flows.csv": "c709ea5ecc03197e1fe70cf4c2de7225f71015acb50a7445ed7765b5029f7f15",
    "2019_SCADA_Levels.csv": "00624e97b72e63233beeccb48db528d43e59a87b116d0295d5c2a206ee0e75a8",
    "2019_SCADA_Pressures.csv": "a4af6616059cc9b366bbab76d880b2c772df544970c6ff4d4a29a58704ce05b1",
    "L-TOWN.inp": "a7551b86745f4cc3433c78e60023077fa1386947d4d35372ffd3a0405622b436",
    "dataset_configuration.yaml": "23471d8989d82c66a4909816ea248f7588d8ccc910e142265a7ea48db940b6a0",
}

STEP_MIN = 5  # SCADA sampling interval, minutes


def cache_dir() -> Path:
    d = Path(os.environ.get("WATER_LEAKS_CACHE", Path.home() / ".cache" / "water-leaks"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def fetch(name: str) -> Path:
    """Path to a checked local copy of one BattLeDIM file, downloading it if needed."""
    p = cache_dir() / name
    if not p.exists():
        tmp = p.with_suffix(p.suffix + ".part")
        with urllib.request.urlopen(RECORD.format(name=name), timeout=300) as r, open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        tmp.rename(p)
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    if name in SHA256 and h != SHA256[name]:
        raise ValueError(f"{name}: sha256 {h} does not match the recorded {SHA256[name]}")
    return p


def parse_scada(text: str):
    """Parse a BattLeDIM SCADA/leakage csv (';' separated, ',' decimals).

    Returns (timestamps as numpy datetime64[m], column names, float array [T, k]).
    """
    lines = text.strip().splitlines()
    cols = lines[0].split(";")[1:]
    ts, rows = [], []
    for ln in lines[1:]:
        parts = ln.split(";")
        ts.append(parts[0].strip()[:16].replace(" ", "T"))
        rows.append([float(x.replace(",", ".")) for x in parts[1:]])
    return np.array(ts, dtype="datetime64[m]"), cols, np.array(rows, dtype=float)


def load(kind: str, year: int):
    """kind in {'Pressures', 'Flows', 'Levels', 'Leakages'}; returns parse_scada output."""
    name = f"{year}_Leakages.csv" if kind == "Leakages" else f"{year}_SCADA_{kind}.csv"
    return parse_scada(fetch(name).read_text())


def parse_config_leaks(text: str):
    """Leak list from dataset_configuration.yaml: [(link, start, end, diameter_m, type, peak)]."""
    out, on = [], False
    for ln in text.splitlines():
        s = ln.strip()
        if s.startswith("leakages:"):
            on = True
            continue
        if on and s and not s.startswith("-"):
            break
        if on and s.startswith("- p"):
            f = [x.strip() for x in s[2:].split(",")]
            out.append((f[0], np.datetime64(f[1].replace(" ", "T"), "m"),
                        np.datetime64(f[2].replace(" ", "T"), "m"), float(f[3]), f[4],
                        np.datetime64(f[5].replace(" ", "T"), "m")))
    return out
