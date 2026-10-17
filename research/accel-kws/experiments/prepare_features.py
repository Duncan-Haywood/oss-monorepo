"""Decode Speech Commands v0.02 parquet shards into pooled MFCC features (cached .npz).

usage: python prepare_features.py <dir with {train,validation,test}-*.parquet> <out.npz>

The shards come from a third-party Hugging Face mirror of the original dataset (see README).
Keywords are all kept; other words ("unknown") are subsampled deterministically by a hash of the
file name so that the unknown class is about as large as the median keyword class.
"""
import glob
import hashlib
import io
import json
import os
import sys

import numpy as np
import pyarrow.parquet as pq
from scipy.io import wavfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from accel_kws import labels, mfcc  # noqa: E402


def keep_unknown(name, frac):
    h = int(hashlib.sha1(name.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return h < frac


def main(indir, out):
    meta = {}
    arrays = {}
    for split in ("train", "validation", "test"):
        files = sorted(glob.glob(os.path.join(indir, f"{split}-*.parquet")))
        info = []
        for f in files:
            t = pq.read_table(f, columns=["label", "file", "speaker_id"]).to_pylist()
            info.append(t)
        counts = {}
        for t in info:
            for r in t:
                counts[r["label"]] = counts.get(r["label"], 0) + 1
        kwc = sorted(counts.get(k, 0) for k in labels.KEYWORDS)
        median = kwc[len(kwc) // 2]
        nunk = sum(v for k, v in counts.items() if k not in labels.KEYWORDS and not k.startswith("_"))
        frac = min(1.0, median / max(nunk, 1))
        feats, ys, spk, names = [], [], [], []
        for f in files:
            tab = pq.read_table(f)
            rows = tab.to_pylist()
            batch, by, bs, bn = [], [], [], []
            for r in rows:
                lab = r["label"]
                if lab.startswith("_"):
                    continue
                if lab in labels.KEYWORDS:
                    y = labels.KEYWORDS.index(lab)
                elif keep_unknown(r["file"], frac):
                    y = len(labels.KEYWORDS)
                else:
                    continue
                sr, w = wavfile.read(io.BytesIO(r["audio"]["bytes"]))
                assert sr == mfcc.SR
                w = w.astype(np.float64) / 32768.0
                w = np.pad(w, (0, max(0, mfcc.CLIP - len(w))))[: mfcc.CLIP]
                batch.append(w)
                by.append(y)
                bs.append(r["speaker_id"])
                bn.append(r["file"])
            if batch:
                feats.append(mfcc.mfcc(np.stack(batch)).astype(np.float32))
                ys += by
                spk += bs
                names += bn
            print(split, os.path.basename(f), len(ys), flush=True)
        arrays[f"{split}_x"] = np.concatenate(feats)  # (N, 49, 10) unpooled
        arrays[f"{split}_y"] = np.array(ys, dtype=np.int64)
        arrays[f"{split}_spk"] = np.array(spk)
        meta[split] = {"n": len(ys), "unknown_fraction_kept": frac, "median_keyword_count": median,
                       "per_class": np.bincount(ys, minlength=11).tolist()}
    np.savez_compressed(out, **arrays)
    sp = {s: set(arrays[f"{s}_spk"].tolist()) for s in ("train", "validation", "test")}
    meta["speaker_overlap"] = {"train&validation": len(sp["train"] & sp["validation"]),
                               "train&test": len(sp["train"] & sp["test"]),
                               "validation&test": len(sp["validation"] & sp["test"])}
    print(json.dumps(meta, indent=1))
    with open(out.replace(".npz", ".json"), "w") as fh:
        json.dump(meta, fh, indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
