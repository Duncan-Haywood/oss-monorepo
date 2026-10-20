"""Zero-shot scores from two related open models (Binoculars-style, Hans et al. 2024).

observer = Qwen2.5-0.5B, performer = Qwen2.5-0.5B-Instruct. Per text (first MAXTOK=64 tokens; first 120 texts per family and label):
  logppl   observer log-perplexity
  xppl     cross-perplexity: mean over positions of the cross-entropy between the performer's
           next-token distribution and the observer's log-probabilities
  bino     logppl / xppl   (lower => more machine-like)
Writes data/zeroshot.json: {id: {logppl, xppl, ntok}}.
"""
import gzip, json, sys, time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MAXTOK = 64
PERCELL = 120   # first PERCELL texts of each (family, label): CPU cost is ~1 s per text
OBS, PER = "Qwen/Qwen2.5-0.5B", "Qwen/Qwen2.5-0.5B-Instruct"


def main():
    torch.set_num_threads(4)
    tok = AutoTokenizer.from_pretrained(OBS)
    obs = AutoModelForCausalLM.from_pretrained(OBS, torch_dtype=torch.float32).eval()
    per = AutoModelForCausalLM.from_pretrained(PER, torch_dtype=torch.float32).eval()
    items = [json.loads(l) for l in gzip.open("data/suite.jsonl.gz", "rt", encoding="utf8")]
    seen, sub = {}, []
    for it in items:
        k = (it["family"], it["label"])
        seen[k] = seen.get(k, 0) + 1
        if seen[k] <= PERCELL:
            sub.append(it)
    items = sub
    out, t0 = {}, time.time()
    for i, it in enumerate(items):
        ids = tok(it["text"], return_tensors="pt", truncation=True, max_length=MAXTOK).input_ids
        if ids.shape[1] < 8:
            continue
        with torch.no_grad():
            lo = obs(ids).logits[0, :-1].float()
            lp = per(ids).logits[0, :-1].float()
        tgt = ids[0, 1:]
        lso = torch.log_softmax(lo, -1)
        logppl = -lso.gather(1, tgt[:, None]).mean().item()
        pp = torch.softmax(lp, -1)
        xppl = -(pp * lso).sum(-1).mean().item()
        out[it["id"] + it["label"]] = {"logppl": logppl, "xppl": xppl, "ntok": int(ids.shape[1])}
        if i % 50 == 0:
            print(i, len(items), round(time.time() - t0), flush=True)
    json.dump(out, open("data/zeroshot.json", "w"))


if __name__ == "__main__":
    main()
