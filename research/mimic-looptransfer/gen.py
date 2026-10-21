"""Regenerate texts from every imitator prompt that `mimic-loop` evolved, on its held-out test titles.

`mimic-loop` kept only 3 sample texts per round, so the prompts (kept in full) are replayed with the
same frozen model (Qwen2.5-0.5B-Instruct) and the same test titles, with two fresh sampling seeds.
Also computes the zero-shot scores (observer log-perplexity and cross-perplexity, as in
`mimic-contexts/zeroshot.py`) for every generated text and every human test text.
Writes texts.json. Needs torch and transformers; about 1 to 1.5 hours on 4 CPUs.
"""
import glob, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mimic-loop"))
import core
from game import Game

SEEDS = (1000, 1001)
MAXTOK = 64
OBS, PER = "Qwen/Qwen2.5-0.5B", "Qwen/Qwen2.5-0.5B-Instruct"


def prompts():
    """(family, proposer, round) -> imitator candidate dict, read from mimic-loop's results."""
    out = []
    for f in sorted(glob.glob(os.path.join(HERE, "..", "mimic-loop", "results", "*_s0.json"))):
        d = json.load(open(f))
        for r in d["rounds"]:
            out.append({"family": d["family"], "proposer": d["proposer"], "round": r["round"],
                        "imitator": r["imitator"], "shots": r["imitator_shots"],
                        "loop_paired_acc": r["paired_acc_current"], "loop_paired_acc_plain": r["paired_acc_plain"],
                        "loop_valid": r["valid"], "loop_len": r["mean_len"]})
    return out


class ZS:
    def __init__(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        self.torch = torch
        self.tok = AutoTokenizer.from_pretrained(OBS)
        self.obs = AutoModelForCausalLM.from_pretrained(OBS, torch_dtype=torch.float32).eval()
        self.per = AutoModelForCausalLM.from_pretrained(PER, torch_dtype=torch.float32).eval()

    def score(self, text):
        torch = self.torch
        ids = self.tok(text, return_tensors="pt", truncation=True, max_length=MAXTOK).input_ids
        if ids.shape[1] < 8:
            return None
        with torch.no_grad():
            lo = self.obs(ids).logits[0, :-1].float()
            lp = self.per(ids).logits[0, :-1].float()
        tgt = ids[0, 1:]
        lso = torch.log_softmax(lo, -1)
        return {"logppl": -lso.gather(1, tgt[:, None]).mean().item(),
                "xppl": -(torch.softmax(lp, -1) * lso).sum(-1).mean().item()}


def main():
    from lm import LM
    import torch
    torch.set_num_threads(4)
    lm = LM()
    zs = ZS()
    out = {"seeds": list(SEEDS), "human": {}, "runs": []}
    ctxs, games = {}, {}
    for fam in core.FAMILIES:
        ctxs[fam] = core.load_contexts(fam, seed=0)
        games[fam] = Game(lm, fam, ctxs[fam], 0)
        out["human"][fam] = [{"id": x["id"], "title": x["title"], "text": x["text"], **(zs.score(x["text"]) or {})}
                             for x in ctxs[fam]["test"]]
    cache, t0 = {}, time.time()
    for p in prompts():
        k = (p["family"], p["imitator"], tuple(p["shots"]))
        if k not in cache:
            g, test = games[p["family"]], ctxs[p["family"]]["test"]
            texts = []
            for s in SEEDS:
                texts += g.write({"text": p["imitator"], "shots": p["shots"]}, test, seed=s)
            cache[k] = [{"text": t, **(zs.score(t) or {})} for t in texts]
            print(len(cache), p["family"], p["proposer"], p["round"], round(time.time() - t0), flush=True)
        out["runs"].append({**p, "texts": cache[k]})
        json.dump(out, open(os.path.join(HERE, "texts.json"), "w"))


if __name__ == "__main__":
    main()
