"""Decode the original Speech Commands v0.02 tarball (extracted) into MFCC features (cached .npz).

usage: python prepare_features.py <extracted dir> <out.npz>

Splits are the dataset's own validation_list.txt / testing_list.txt (speaker-disjoint by hash);
everything else is training. Keywords are all kept; other words ("unknown") are subsampled
deterministically by a hash of the file name to about the median keyword class size, as in
`accel-kws`. Reuses `accel-kws`'s MFCC front end unchanged.
"""
import hashlib
import json
import os
import sys

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "accel-kws", "src"))
from accel_kws import labels, mfcc  # noqa: E402


def keep_unknown(name, frac):
    h = int(hashlib.sha1(name.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return h < frac


def main(root, out):
    val = set(open(os.path.join(root, "validation_list.txt")).read().split())
    tst = set(open(os.path.join(root, "testing_list.txt")).read().split())
    words = sorted(d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d)) and not d.startswith("_"))
    files = {"train": [], "validation": [], "test": []}
    for w in words:
        for f in sorted(os.listdir(os.path.join(root, w))):
            rel = f"{w}/{f}"
            files["validation" if rel in val else "test" if rel in tst else "train"].append((w, rel))
    arrays, meta = {}, {}
    for split, items in files.items():
        kw = {k: sum(1 for w, _ in items if w == k) for k in labels.KEYWORDS}
        median = sorted(kw.values())[len(kw) // 2]
        nunk = sum(1 for w, _ in items if w not in labels.KEYWORDS)
        frac = min(1.0, median / max(nunk, 1))
        feats, ys, spk, batch = [], [], [], []
        for w, rel in items:
            if w in labels.KEYWORDS:
                y = labels.KEYWORDS.index(w)
            elif keep_unknown(rel, frac):
                y = len(labels.KEYWORDS)
            else:
                continue
            sr, a = wavfile.read(os.path.join(root, rel))
            assert sr == mfcc.SR
            a = a.astype(np.float64) / 32768.0
            batch.append(np.pad(a, (0, max(0, mfcc.CLIP - len(a))))[: mfcc.CLIP])
            ys.append(y)
            spk.append(rel.split("/")[1].split("_")[0])
            if len(batch) == 512:
                feats.append(mfcc.mfcc(np.stack(batch)).astype(np.float32)); batch = []
        if batch:
            feats.append(mfcc.mfcc(np.stack(batch)).astype(np.float32))
        arrays[f"{split}_x"] = np.concatenate(feats)
        arrays[f"{split}_y"] = np.array(ys, dtype=np.int64)
        arrays[f"{split}_spk"] = np.array(spk)
        meta[split] = {"n": len(ys), "unknown_fraction_kept": frac, "median_keyword_count": median,
                       "per_class": np.bincount(ys, minlength=11).tolist()}
        print(split, len(ys), flush=True)
    sp = {s: set(arrays[f"{s}_spk"].tolist()) for s in files}
    meta["speaker_overlap"] = {"train&validation": len(sp["train"] & sp["validation"]),
                               "train&test": len(sp["train"] & sp["test"]),
                               "validation&test": len(sp["validation"] & sp["test"])}
    np.savez_compressed(out, **arrays)
    json.dump(meta, open(out.replace(".npz", ".json"), "w"), indent=1)
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
