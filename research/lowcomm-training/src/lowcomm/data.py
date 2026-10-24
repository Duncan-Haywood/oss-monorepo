"""Character-level data. Tiny Shakespeare (Karpathy's char-rnn corpus, public domain text) is fetched on demand."""
import os
import urllib.request

import torch

URL = "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt"


def load_shakespeare(cache=None):
    cache = cache or os.path.join(os.environ.get("LOWCOMM_CACHE", "/tmp"), "tinyshakespeare.txt")
    if not os.path.exists(cache):
        with urllib.request.urlopen(URL, timeout=60) as r, open(cache, "wb") as f:
            f.write(r.read())
    with open(cache, encoding="utf-8") as f:
        return f.read()


class CharData:
    """90/10 train/validation split of a text; batches are drawn from a caller-supplied generator so that every
    worker's data stream is a function of the seed alone."""

    def __init__(self, text, block=64):
        chars = sorted(set(text))
        self.vocab = len(chars)
        ids = torch.tensor([chars.index(c) for c in text], dtype=torch.long)
        n = int(0.9 * len(ids))
        self.train, self.val, self.block = ids[:n], ids[n:], block

    def batch(self, split, size, gen):
        d = self.train if split == "train" else self.val
        ix = torch.randint(len(d) - self.block - 1, (size,), generator=gen)
        x = torch.stack([d[i:i + self.block] for i in ix])
        y = torch.stack([d[i + 1:i + 1 + self.block] for i in ix])
        return x, y

    def val_batches(self, size, n, seed=12345):
        g = torch.Generator().manual_seed(seed)
        return [self.batch("val", size, g) for _ in range(n)]
