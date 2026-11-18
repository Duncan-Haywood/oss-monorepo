#!/usr/bin/env python3
"""Numerical checks of the scorer, run after score.py: on the first N sampled respondents,
(a) the cached, batched path against one unbatched pass of the same tokens, both in float32, and
(b) the bfloat16 scores in results/scores_<model>.csv against float32.

    python3 experiments/m5_local_llm/check.py --model Qwen/Qwen2.5-1.5B-Instruct [--n 25]

Writes results/check_<model>.txt.
"""
import argparse
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'src'))
sys.path.insert(0, str(HERE))
import gss  # noqa: E402
import llm  # noqa: E402
import sample  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True)
ap.add_argument('--n', type=int, default=25)
a = ap.parse_args()
from huggingface_hub import snapshot_download  # noqa: E402
s = llm.Scorer(snapshot_download(a.model, allow_patterns=['*.json', '*.safetensors', '*.txt']), dtype=torch.float32)
tag = a.model.split('/')[-1]
bf = pd.read_csv(HERE / 'results' / f'scores_{tag}.csv').set_index(['year', 'id', 'item']).p
pool = sample.draw(gss.load()).head(a.n)
items = [j for j in llm.QUESTIONS if j != 'pope_infallible']
d_cache, d_bf = [], []
for _, r in pool.iterrows():
    prof = llm.profile(r)
    batched = s.score(prof, items)
    for j, p in zip(items[:3], batched[:3]):
        d_cache.append(abs(p - s.score_plain(prof, j)))
    for j, p in zip(items, batched):
        d_bf.append((p, bf[(int(r.year), int(r.id), j)]))
x = np.array(d_bf)
L = [f'{tag}, first {a.n} sampled respondents',
     f'(a) batched+cache vs unbatched, float32: max |diff| {max(d_cache):.2e} over {len(d_cache)} scores',
     f'(b) bfloat16 vs float32: median |diff| {np.median(np.abs(x[:, 0] - x[:, 1])):.4f}, '
     f'max {np.max(np.abs(x[:, 0] - x[:, 1])):.4f}, Pearson r {np.corrcoef(x[:, 0], x[:, 1])[0, 1]:.4f}, '
     f'mean fp32 {x[:, 0].mean():.4f} vs bf16 {x[:, 1].mean():.4f}, {len(x)} scores']
(HERE / 'results' / f'check_{tag}.txt').write_text('\n'.join(L) + '\n')
print('\n'.join(L))
