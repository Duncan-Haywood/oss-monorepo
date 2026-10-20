"""Local frozen model (Qwen2.5-0.5B-Instruct, Apache-2.0) as imitator, detector, judge and prompt writer."""
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-0.5B-Instruct"

class LM:
    def __init__(self, model=MODEL, threads=None):
        if threads: torch.set_num_threads(threads)
        self.tok = AutoTokenizer.from_pretrained(model, padding_side="left")
        self.m = AutoModelForCausalLM.from_pretrained(model, torch_dtype=torch.float32).eval()
        self.id = {k: self.tok.encode(k, add_special_tokens=False)[0] for k in ("A", "B", "Yes", "No")}
        self.calls = {"generate": 0, "score": 0}

    def _chat(self, system, user):
        return self.tok.apply_chat_template([{"role": "system", "content": system}, {"role": "user", "content": user}],
                                            add_generation_prompt=True, tokenize=False)

    @torch.no_grad()
    def generate(self, systems, users, max_new=100, temp=0.8, seed=0, batch=16):
        out = []
        for i in range(0, len(users), batch):
            texts = [self._chat(s, u) for s, u in zip(systems[i:i + batch], users[i:i + batch])]
            enc = self.tok(texts, return_tensors="pt", padding=True)
            torch.manual_seed(seed + i)
            g = self.m.generate(**enc, max_new_tokens=max_new, do_sample=True, temperature=temp, top_p=0.95,
                                pad_token_id=self.tok.eos_token_id)
            out += [self.tok.decode(r[enc["input_ids"].shape[1]:], skip_special_tokens=True).strip() for r in g]
            self.calls["generate"] += len(texts)
        return out

    @torch.no_grad()
    def logit_diff(self, systems, users, pos, neg, batch=8):
        """logit(pos) - logit(neg) for the first answer token."""
        res = []
        for i in range(0, len(users), batch):
            texts = [self._chat(s, u) for s, u in zip(systems[i:i + batch], users[i:i + batch])]
            enc = self.tok(texts, return_tensors="pt", padding=True)
            lg = self.m(**enc).logits[:, -1, :]
            res += (lg[:, self.id[pos]] - lg[:, self.id[neg]]).tolist()
            self.calls["score"] += len(texts)
        return res
