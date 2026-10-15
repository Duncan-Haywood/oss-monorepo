"""Model-free parts of the mimic-loop: contexts, prompt spaces, metrics and the four proposers.

Nothing here imports torch, so the tests run without a model. `lm.py` supplies the model.
"""
import gzip, json, math, os, random, re

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "..", "mimic-contexts", "data", "suite.jsonl.gz")
CHARS = 400  # every text, human or generated, is cut to this many characters (length control)

FAMILIES = {
    "reddit": "a post on an online discussion forum (the text is the body of the post)",
    "reviews": "a customer review of a film, product or business",
}

# Fixed banks of prompt fragments. Random search, the GA and the GrIPS-style edits all search
# subsets of these; the LLM proposer writes free text instead.
IMITATOR_FRAGMENTS = [
    "Write the way a real person types online, not like an assistant.",
    "Use casual, plain words and contractions.",
    "Do not use bullet points, headings or bold text.",
    "Never start with 'Sure', 'Here is' or a greeting to the reader.",
    "Include one concrete personal detail, such as a place, a number or a name.",
    "Let sentences be uneven: some short, some run-on.",
    "A small typo or missing capital is fine.",
    "Do not end with a summary or a polite closing line.",
    "Show a specific opinion or feeling instead of a balanced overview.",
    "Start in the middle of a thought, as if continuing a conversation.",
    "Avoid words like 'significant', 'overall', 'moreover' and 'delve'.",
    "Stay on the topic of the title and write about 60 words.",
]
DETECTOR_FRAGMENTS = [
    "AI text is usually polished, balanced and generic.",
    "People include odd specifics: names, numbers, places, asides.",
    "People make typos and drop capitals; assistants rarely do.",
    "Assistants like tidy structure, lists and a closing summary.",
    "Assistants often open with a greeting or restate the title.",
    "People often ramble or leave a thought unfinished.",
    "Judge the voice and the content, not the topic.",
    "Words like 'significant', 'overall' and 'moreover' point to an assistant.",
    "Strong, specific opinions point to a person; hedged ones to an assistant.",
    "Think about which text feels lived-in rather than composed.",
]
PLAIN_IMITATOR = "Write the text a person would write for the context below."
PLAIN_DETECTOR = "You compare two texts and decide which one a person wrote."

# --------------------------------------------------------------------------- data

def trunc(text, n=CHARS):
    text = " ".join(text.split())
    if len(text) <= n:
        return text
    cut = text[:n]
    return cut[: cut.rfind(" ")] if " " in cut else cut

def load_contexts(family, path=SUITE, seed=0, n_opt=12, n_test=24, n_pool=6):
    """Human items of one family as contexts, split into optimisation, test and few-shot pool."""
    rows = [json.loads(l) for l in gzip.open(path, "rt", encoding="utf8")]
    h = [r for r in rows if r["family"] == family and r["label"] == "human" and len(" ".join(r["text"].split())) >= CHARS]
    h.sort(key=lambda r: r["id"])
    random.Random(seed).shuffle(h)
    items = [{"id": r["id"], "title": " ".join(r["title"].split()), "text": trunc(r["text"])} for r in h]
    assert len(items) >= n_opt + n_test + n_pool, (family, len(items))
    return {"opt": items[:n_opt], "test": items[n_opt:n_opt + n_test], "pool": items[n_opt + n_test:n_opt + n_test + n_pool],
            "refs": items}

def imitator_user(family, title):
    return f"Context: {FAMILIES[family]}.\nTitle: {title}\n\nWrite the text now. Output only the text."

# --------------------------------------------------------------------------- candidates
# A candidate is {"bits": tuple|None, "shots": tuple, "text": str}. `text` is the prompt body
# (fragments joined, or free text from the LLM proposer); `shots` index the few-shot pool.

def render(base, bank, bits, shots=()):
    body = base + "".join(" " + f for f, b in zip(bank, bits) if b)
    return body

def make(base, bank, bits, shots=()):
    return {"bits": tuple(bits), "shots": tuple(shots), "text": render(base, bank, bits)}

def free(text, shots=()):
    return {"bits": None, "shots": tuple(shots), "text": text.strip()}

def key(c):
    return (c["bits"], c["shots"], c["text"])

# --------------------------------------------------------------------------- metrics

def words(t):
    return re.findall(r"[a-z0-9']+", t.lower())

def ngrams(t, n=4):
    w = words(t)
    return {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}

def copy_rate(text, ref_grams, n=4):
    g = ngrams(text, n)
    return len(g & ref_grams) / len(g) if g else 0.0

def distinct_n(texts, n=2):
    allg, tot = set(), 0
    for t in texts:
        w = words(t)
        gs = [tuple(w[i:i + n]) for i in range(len(w) - n + 1)]
        allg.update(gs); tot += len(gs)
    return len(allg) / tot if tot else 0.0

def auroc(pos, neg):
    """P(score_pos > score_neg) with ties counted half."""
    if not pos or not neg:
        return float("nan")
    s = 0.0
    for p in pos:
        for q in neg:
            s += 1.0 if p > q else 0.5 if p == q else 0.0
    return s / (len(pos) * len(neg))

def boot_ci(xs, stat=lambda v: sum(v) / len(v), reps=400, seed=0):
    rng = random.Random(seed)
    n = len(xs)
    vals = sorted(stat([xs[rng.randrange(n)] for _ in range(n)]) for _ in range(reps))
    return vals[int(0.025 * reps)], vals[int(0.975 * reps) - 1]

def sigmoid(x):
    return 1 / (1 + math.exp(-max(-30, min(30, x))))

def pair_fitness(margins):
    """Detector fitness from paired margins (>0: the detector picked the human text).
    Mixes accuracy with a smooth term so 16 pairs still rank candidates."""
    acc = sum(m > 0 for m in margins) / len(margins)
    soft = sum(sigmoid(m) for m in margins) / len(margins)
    return (acc + soft) / 2

# --------------------------------------------------------------------------- proposers
# Each proposer spends exactly `budget` calls of `evaluate(candidate) -> fitness` (higher is
# better) and returns (best_candidate, best_fitness, history). `inc` is the incumbent, already
# scored as `inc_f` against the current opponent (that score is not charged to the budget).

class Space:
    def __init__(self, base, bank, max_shots=0, pool=0):
        self.base, self.bank, self.max_shots, self.pool = base, bank, max_shots, pool

    def rand_shots(self, rng):
        k = rng.randint(0, self.max_shots) if self.pool else 0
        return tuple(sorted(rng.sample(range(self.pool), k))) if k else ()

    def rand(self, rng):
        bits = tuple(int(rng.random() < 0.4) for _ in self.bank)
        return make(self.base, self.bank, bits, self.rand_shots(rng))

    def with_bits(self, c, bits, shots=None):
        return make(self.base, self.bank, bits, c["shots"] if shots is None else shots)

    def as_bits(self, c):
        return c["bits"] if c["bits"] is not None else (0,) * len(self.bank)

def run_random(space, evaluate, inc, inc_f, budget, rng, **_):
    hist = [(inc, inc_f)]
    for _ in range(budget):
        c = space.rand(rng)
        hist.append((c, evaluate(c)))
    return best(hist), hist

def best(hist):
    return max(hist, key=lambda x: x[1])

def run_grips(space, evaluate, inc, inc_f, budget, rng, **_):
    """GrIPS-style (Prasad et al. 2023) edit search without the paraphrase step: add, delete or
    swap one fragment, keep the edit if it improves the best so far."""
    cur, cur_f, hist = inc, inc_f, [(inc, inc_f)]
    for _ in range(budget):
        bits = list(space.as_bits(cur))
        on = [i for i, b in enumerate(bits) if b]; off = [i for i, b in enumerate(bits) if not b]
        ops = (["add"] if off else []) + (["del"] if on else []) + (["swap"] if on and off else [])
        op = rng.choice(ops)
        if op == "add": bits[rng.choice(off)] = 1
        elif op == "del": bits[rng.choice(on)] = 0
        else: bits[rng.choice(on)] = 0; bits[rng.choice(off)] = 1
        c = space.with_bits(cur, bits)
        f = evaluate(c); hist.append((c, f))
        if f > cur_f:
            cur, cur_f = c, f
    return best(hist), hist

def run_ga(space, evaluate, inc, inc_f, budget, rng, pop=4, **_):
    """Small genetic algorithm over fragment bitmasks: `pop` random individuals, then children
    by uniform crossover of two of the best two plus one mutation, until the budget is spent."""
    hist = [(inc, inc_f)]
    scored = []
    for _ in range(min(pop, budget)):
        c = space.rand(rng); scored.append((c, evaluate(c)))
    hist += scored
    for _ in range(budget - len(scored)):
        top = sorted(scored + [(inc, inc_f)], key=lambda x: -x[1])[:2]
        a, b = space.as_bits(top[0][0]), space.as_bits(top[-1][0])
        bits = [rng.choice((x, y)) for x, y in zip(a, b)]
        i = rng.randrange(len(bits)); bits[i] ^= 1
        c = space.with_bits(top[0][0], bits, rng.choice((top[0][0]["shots"], top[-1][0]["shots"])))
        f = evaluate(c); scored.append((c, f)); hist.append((c, f))
    return best(hist), hist

def meta_prompt(role, hist, failures):
    top = sorted(hist, key=lambda x: -x[1])[:3]
    lines = [f"You improve the instructions given to a language model that must {role}.",
             "Earlier instructions and their scores (higher is better):"]
    for c, f in top:
        lines.append(f"- score {f:.2f}: {c['text'][:400]}")
    if failures:
        lines.append("Examples where the current best instructions did badly:")
        lines += [f"* {x[:200]}" for x in failures[:2]]
    lines.append("Write one new, better instruction paragraph of under 80 words. Output only that paragraph.")
    return "\n".join(lines)

def run_llm(space, evaluate, inc, inc_f, budget, rng, write=None, role="", failures=(), **_):
    """OPRO-style (Yang et al. 2024): a local LLM sees the top earlier prompts with scores and a
    couple of failures and writes the next prompt. `write(meta_prompt) -> str` is the model."""
    hist = [(inc, inc_f)]
    for _ in range(budget):
        text = write(meta_prompt(role, hist, failures)) if write else ""
        text = " ".join(text.split())[:600]
        if len(text) < 20:
            text = inc["text"]  # model wrote nothing usable: re-score the incumbent text (costs a call)
        c = free(text, inc["shots"])
        hist.append((c, evaluate(c)))
    return best(hist), hist

PROPOSERS = {"random": run_random, "ga": run_ga, "grips": run_grips, "llm": run_llm}
