#!/usr/bin/env python3
"""Milestone 5, stage 1: score a fixed sample of GSS respondents with a local open-weights model.

    HF_HOME=... python3 experiments/m5_local_llm/score.py --model Qwen/Qwen2.5-1.5B-Instruct [--threads 4]

Label-blind: it reads only the profile variables (no item answers) and writes P(yes) for every item
for every sampled respondent, whether or not they were asked it. Resumable (appends to the CSV).
The sample: a simple random sample of up to PER_GROUP respondents from each group in sample.GROUPS
(seed 0), so within a group the weighted share stays unbiased; a respondent drawn for two groups is
scored once. Writes results/scores_<model>.csv (id, year, item, p).
"""
import argparse
import csv
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'src'))
sys.path.insert(0, str(HERE))
import gss  # noqa: E402
import llm  # noqa: E402
import sample  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    from huggingface_hub import snapshot_download
    path = snapshot_download(a.model, allow_patterns=['*.json', '*.safetensors', '*.txt'])
    s = llm.Scorer(path, threads=a.threads)
    d = gss.load()
    pool = sample.draw(d)
    if a.limit:
        pool = pool.head(a.limit)
    out = HERE / 'results' / f"scores_{a.model.split('/')[-1]}.csv"
    out.parent.mkdir(exist_ok=True)
    done = set()
    if out.exists():
        with open(out) as fh:
            done = {(int(r['year']), int(r['id'])) for r in csv.DictReader(fh)}
    new = not out.exists()
    items = list(llm.QUESTIONS)
    t0 = time.time()
    with open(out, 'a', newline='') as fh:
        wr = csv.writer(fh)
        if new:
            wr.writerow(['year', 'id', 'item', 'p'])
        k = 0
        for _, r in pool.iterrows():
            key = (int(r.year), int(r.id))
            if key in done:
                continue
            its = items if r.tradition == 'Catholic' else [j for j in items if j != 'pope_infallible']
            for j, p in zip(its, s.score(llm.profile(r), its)):
                wr.writerow([key[0], key[1], j, f'{p:.6f}'])
            k += 1
            if k % 100 == 0:
                fh.flush()
                print(k, 'of', len(pool) - len(done), f'{(time.time() - t0) / k:.2f}s each', flush=True)
    print('done', k)


if __name__ == '__main__':
    main()
