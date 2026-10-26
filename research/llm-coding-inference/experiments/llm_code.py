"""Milestone 5: code the NaijaSenti test part with a real local instruction-tuned LLM, zero-shot, and cache the scores.
Same corpus, seeded 30/70 split and truth as h6m_ppi_hc3.py (the 70% test part); a seeded subsample of N items is coded
(CPU time). Score = logit(Yes) - logit(No) for "Is the sentiment of this tweet negative?"; code = score > 0 (no tuning
on human labels). Resumable: appends to the cache tsv.

    python3 experiments/llm_code.py Qwen/Qwen2.5-0.5B-Instruct 6000
"""
import os
import random
import sys
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import h6m_ppi_hc3 as M6  # noqa: E402

qd = M6.qd
LANGNAME = {"hau": "Hausa", "ibo": "Igbo", "pcm": "Nigerian Pidgin", "yor": "Yoruba"}
PROMPT = ("Tweet: {t}\n\nIs the sentiment of this tweet negative? Answer Yes or No.")


def subsample_test(n, seed=20261030):
    rows = qd.load()
    rng = random.Random(qd.SEED)
    order = list(range(len(rows)))
    rng.shuffle(order)
    cut = int(qd.TRAIN_SHARE * len(rows))
    test = [rows[i] for i in order[cut:]]
    idx = sorted(random.Random(seed).sample(range(len(test)), min(n, len(test))))
    return test, idx


def main():
    model_id, n = sys.argv[1], int(sys.argv[2])
    torch.set_num_threads(int(os.environ.get("THREADS", 4)))
    test, idx = subsample_test(n)
    out = HERE / f"llm_scores_{model_id.split('/')[-1]}.tsv"
    done = {int(l.split("\t")[0]) for l in out.read_text().splitlines()} if out.exists() else set()
    tok = AutoTokenizer.from_pretrained(model_id)
    tok.padding_side = "left"
    model = AutoModelForCausalLM.from_pretrained(model_id, dtype=torch.bfloat16).eval()
    yes = [tok.encode(w, add_special_tokens=False)[0] for w in ("Yes", " Yes")]
    no = [tok.encode(w, add_special_tokens=False)[0] for w in ("No", " No")]
    todo = [i for i in idx if i not in done]
    # sort by length to cut padding
    todo.sort(key=lambda i: len(test[i][1]))
    t0, B = time.time(), 16
    with open(out, "a") as f:
        for s in range(0, len(todo), B):
            b = todo[s:s + B]
            msgs = [tok.apply_chat_template([{"role": "user", "content": PROMPT.format(t=test[i][1][:400].replace("\n", " "))}],
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
