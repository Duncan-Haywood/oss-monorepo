"""Manufacturing files: a minimal DXF (R12 polyline) of the profile for laser and router, plus a reader for tests."""
import numpy as np


def write_dxf(path: str, poly: np.ndarray, layer: str = "CUT") -> None:
    rows = ["0", "SECTION", "2", "ENTITIES", "0", "POLYLINE", "8", layer, "66", "1", "70", "1"]
    for x, y in poly:
        rows += ["0", "VERTEX", "8", layer, "10", f"{x:.4f}", "20", f"{y:.4f}"]
    rows += ["0", "SEQEND", "0", "ENDSEC", "0", "EOF"]
    with open(path, "w") as f:
        f.write("\n".join(rows) + "\n")


def read_dxf(path: str) -> np.ndarray:
    with open(path) as f:
        t = [s.strip() for s in f.read().splitlines()]
    pts, i = [], 0
    while i < len(t) - 1:
        if t[i] == "0" and t[i + 1] == "VERTEX":
            j = i + 2
            x = y = None
            while t[j] != "0":
                if t[j] == "10":
                    x = float(t[j + 1])
                if t[j] == "20":
                    y = float(t[j + 1])
                j += 2
            pts.append((x, y))
            i = j
        else:
            i += 2
    return np.array(pts)
