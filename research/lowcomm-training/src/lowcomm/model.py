"""A small GPT-style decoder (nanoGPT layout: pre-LN blocks, GELU MLP, tied embeddings, causal attention)."""
import math
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class GPTConfig:
    vocab: int = 65
    block: int = 64
    layers: int = 2
    heads: int = 4
    dim: int = 128


class Block(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.ln1, self.ln2 = nn.LayerNorm(c.dim), nn.LayerNorm(c.dim)
        self.qkv, self.proj = nn.Linear(c.dim, 3 * c.dim), nn.Linear(c.dim, c.dim)
        self.fc, self.out = nn.Linear(c.dim, 4 * c.dim), nn.Linear(4 * c.dim, c.dim)
        self.heads = c.heads

    def forward(self, x):
        b, t, d = x.shape
        q, k, v = self.qkv(self.ln1(x)).split(d, dim=2)
        q, k, v = (z.view(b, t, self.heads, d // self.heads).transpose(1, 2) for z in (q, k, v))
        a = F.scaled_dot_product_attention(q, k, v, is_causal=True).transpose(1, 2).reshape(b, t, d)
        x = x + self.proj(a)
        return x + self.out(F.gelu(self.fc(self.ln2(x))))


class GPT(nn.Module):
    def __init__(self, c: GPTConfig):
        super().__init__()
        self.c = c
        self.tok, self.pos = nn.Embedding(c.vocab, c.dim), nn.Embedding(c.block, c.dim)
        self.blocks = nn.ModuleList(Block(c) for _ in range(c.layers))
        self.ln = nn.LayerNorm(c.dim)
        self.apply(self._init)

    @staticmethod
    def _init(m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, std=0.02)
            if getattr(m, "bias", None) is not None:
                nn.init.zeros_(m.bias)

    def forward(self, idx, targets=None):
        x = self.tok(idx) + self.pos(torch.arange(idx.shape[1], device=idx.device))
        for blk in self.blocks:
            x = blk(x)
        logits = self.ln(x) @ self.tok.weight.T  # weights tied with the embedding
        if targets is None:
            return logits
        return F.cross_entropy(logits.reshape(-1, logits.shape[-1]), targets.reshape(-1))

    def n_params(self):
        return sum(p.numel() for p in self.parameters())
