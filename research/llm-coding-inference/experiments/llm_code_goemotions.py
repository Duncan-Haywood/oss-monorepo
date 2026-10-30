"""Milestone 6ab: code the GoEmotions test part (the 6r..6aa split) with a real local instruction-tuned LLM, zero-shot, one
yes/no question per category, and cache the scores. Score = logit(Yes) - logit(No); no threshold is chosen here. Resumable.

    /tmp/v/bin/python experiments/llm_code_goemotions.py Qwen/Qwen2.5-1.5B-Instruct fear [limit]   # torch + transformers; tens of minutes on 4 CPU cores
"""
import os
import random
import sys
import time
from pathlib import Path

ARGS, sys.argv = sys.argv[1:], sys.argv[:1]  # imported experiment modules read argv at import

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[0]))
import group_shift_reddit as R  # noqa: E402
import h6r_rare_pilot as P  # noqa: E402

QUESTION = {"fear": "Does this Reddit comment express fear?", "sadness": "Does this Reddit comment express sadness?",
            "admiration": "Does this Reddit comment express admiration?", "neutral": "Does this Reddit comment express no particular emotion (neutral)?"}


def test_items(cat):
    """Test part as in h6z: (index into the test list, raw text key) -> we need raw text, so reload ids alongside."""
    import csv
    from collections import Counter, defaultdict
    import rare_audit as ra
    texts, cnt, unclear = {}, Counter(), set()
    for p in ra.ensure_csvs():
        with open(p, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["subreddit"] not in R.SUB2G:
                    continue
                i = row["id"]
                texts[i] = row["text"]
                cnt[i] += 1
                if row["example_very_unclear"] == "True":
                    unclear.add(i)
    ids = sorted(i for i in texts if cnt[i] >= 3 and i not in unclear)
    rows = P.load(cat)
    assert len(rows) == len(ids)
    rng = random.Random(R.SPLIT_SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(R.TRAIN_SHARE * len(rows))
    return [texts[ids[i]] for i in order[cut:]]


def main():
    model_id, cat = ARGS[0], ARGS[1]
    limit = int(ARGS[2]) if len(ARGS) > 2 else None
    torch.set_num_threads(int(os.environ.get("THREADS", 4)))
    texts = test_items(cat)
    n = len(texts) if limit is None else min(limit, len(texts))
    out = HERE / f"gollm_{cat}_{model_id.split('/')[-1]}.tsv"
    done = {int(l.split("\t")[0]) for l in out.read_text().splitlines()} if out.exists() else set()
    tok = AutoTokenizer.from_pretrained(model_id)
    tok.padding_side = "left"
    model = AutoModelForCausalLM.from_pretrained(model_id, dtype=torch.bfloat16).eval()
    yes = [tok.encode(w, add_special_tokens=False)[0] for w in ("Yes", " Yes")]
    no = [tok.encode(w, add_special_tokens=False)[0] for w in ("No", " No")]
    todo = sorted((i for i in range(n) if i not in done), key=lambda i: len(texts[i]))
    t0, B = time.time(), 16
    with open(out, "a") as f:
        for s in range(0, len(todo), B):
            b = todo[s:s + B]
            msgs = [tok.apply_chat_template(
                [{"role": "user", "content": f"Comment: {texts[i][:400]}\n\n{QUESTION[cat]} Answer Yes or No."}],
                tokenize=False, add_generation_prompt=True) for i in b]
            enc = tok(msgs, return_tensors="pt", padding=True)
            with torch.no_grad():
                lg = model(**enc).logits[:, -1, :].float()
            sc = (torch.logsumexp(lg[:, yes], 1) - torch.logsumexp(lg[:, no], 1)).tolist()
            for i, x in zip(b, sc):
                f.write(f"{i}\t{x:.4f}\n")
            f.flush()
            if (s // B) % 20 == 0:
                print(f"{s + len(b)}/{len(todo)} {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
