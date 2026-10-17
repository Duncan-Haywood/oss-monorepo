"""The imitation game on top of `lm.LM`: prompt rendering, detector scoring and the alternating loop."""
import random
import core

def paired_user(a, b):
    return (f"Text A:\n{a}\n\nText B:\n{b}\n\nOne of these was written by a person and one by an AI model. "
            "Which one was written by the person? Answer with a single letter, A or B.")

def single_user(t):
    return f"Text:\n{t}\n\nWas this text written by a person? Answer Yes or No."

def imitator_system(c, pool_texts):
    s = c["text"]
    for i in c["shots"]:
        s += "\n\nExample of a real text from this kind of context:\n" + pool_texts[i]
    return s

class Game:
    def __init__(self, lm, family, ctx, seed=0):
        self.lm, self.family, self.ctx, self.seed = lm, family, ctx, seed
        self.pool_texts = [x["text"] for x in ctx["pool"]]
        self.ref_grams = set().union(*(core.ngrams(x["text"]) for x in ctx["refs"] if x not in ctx["test"]))
        self.ref_len = sum(len(x["text"]) for x in ctx["opt"]) / len(ctx["opt"])

    # imitator side ------------------------------------------------------
    def write(self, imitator, items, seed):
        sys_p = imitator_system(imitator, self.pool_texts)
        outs = self.lm.generate([sys_p] * len(items), [core.imitator_user(self.family, x["title"]) for x in items],
                                seed=seed)
        return [core.trunc(o) for o in outs]

    def valid(self, texts):
        """Not copying people and not saying (almost) nothing: mean length against the human
        references, and the share of generated 4-grams found in any non-test human reference."""
        mean_len = sum(len(t) for t in texts) / len(texts)
        cr = sum(core.copy_rate(t, self.ref_grams) for t in texts) / len(texts)
        return mean_len >= 0.4 * self.ref_len and cr <= 0.1, mean_len, cr

    # detector side ------------------------------------------------------
    def margins(self, detector, items, texts, seed=0):
        """Paired margin per item, order-balanced: >0 when the detector picks the human text."""
        sysd = detector["text"]
        rng = random.Random(seed)
        users, syss = [], []
        for x, t in zip(items, texts):
            users += [paired_user(x["text"], t), paired_user(t, x["text"])]
            syss += [sysd, sysd]
        d = self.lm.logit_diff(syss, users, "A", "B")
        # d[0::2]: human is A (high = right). d[1::2]: human is B (low = right).
        return [a - b for a, b in zip(d[0::2], d[1::2])]

    def single_scores(self, detector, texts):
        return self.lm.logit_diff([detector["text"]] * len(texts), [single_user(t) for t in texts], "Yes", "No")
