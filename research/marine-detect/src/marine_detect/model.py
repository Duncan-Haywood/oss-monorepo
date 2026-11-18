"""Models: LR-ASPP MobileNetV3-Large (Howard et al. 2019) and a per-pixel colour+row baseline."""
from __future__ import annotations

import numpy as np
import torch
from torch import nn

from .data import IGNORE
from .degrade import fog, glint

MEAN = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
STD = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)


class LRASPP(nn.Module):
    """torchvision's LR-ASPP head on an ImageNet MobileNetV3-Large backbone, 3 classes."""

    def __init__(self, pretrained: bool = True):
        super().__init__()
        from torchvision.models import MobileNet_V3_Large_Weights
        from torchvision.models.segmentation import lraspp_mobilenet_v3_large

        w = MobileNet_V3_Large_Weights.IMAGENET1K_V1 if pretrained else None
        self.net = lraspp_mobilenet_v3_large(weights=None, weights_backbone=w, num_classes=3)

    def forward(self, x):
        return self.net((x - MEAN) / STD)["out"]


class PixelMLP(nn.Module):
    """Classical rung: each pixel's RGB, HSV-ish chroma and normalised row, 1x1 convolutions only."""

    def __init__(self, hidden: int = 32):
        super().__init__()
        self.f = nn.Sequential(nn.Conv2d(5, hidden, 1), nn.ReLU(), nn.Conv2d(hidden, hidden, 1), nn.ReLU(),
                               nn.Conv2d(hidden, 3, 1))

    def forward(self, x):
        n, _, h, w = x.shape
        row = torch.linspace(0, 1, h).view(1, 1, h, 1).expand(n, 1, h, w)
        sat = (x.max(1, keepdim=True).values - x.min(1, keepdim=True).values)
        return self.f(torch.cat([(x - MEAN) / STD, sat, row], 1))


def augment(x: np.ndarray, y: np.ndarray, rng: np.random.Generator, degrade: bool) -> tuple[np.ndarray, np.ndarray]:
    """Horizontal flip always possible; with degrade, fog and glint each with probability 0.5."""
    x = x.copy()
    y = y.copy()
    for i in range(len(x)):
        if rng.random() < 0.5:
            x[i] = x[i, :, :, ::-1]
            y[i] = y[i, :, ::-1]
        if degrade:
            if rng.random() < 0.5:
                x[i] = fog(x[i], float(rng.uniform(0.15, 1.0)))
            if rng.random() < 0.5:
                x[i] = glint(x[i], y[i], float(rng.uniform(0.0, 0.9)), seed=int(rng.integers(1 << 30)))
    return x, y


def train(model: nn.Module, X: np.ndarray, Y: np.ndarray, epochs: int, seed: int, degrade: bool,
          batch: int = 8, lr: float = 5e-4, log=print) -> nn.Module:
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    steps = epochs * ((len(X) + batch - 1) // batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=steps)
    lossf = nn.CrossEntropyLoss(ignore_index=IGNORE)
    model.train()
    for ep in range(epochs):
        order = rng.permutation(len(X))
        tot = 0.0
        for b in range(0, len(X), batch):
            idx = order[b:b + batch]
            xb, yb = augment(X[idx], Y[idx], rng, degrade)
            out = model(torch.from_numpy(np.ascontiguousarray(xb)))
            loss = lossf(out, torch.from_numpy(np.ascontiguousarray(yb)).long())
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            tot += float(loss.detach()) * len(idx)
        log(f"  epoch {ep + 1}/{epochs} loss {tot / len(X):.4f}")
    model.eval()
    return model


@torch.no_grad()
def predict(model: nn.Module, X: np.ndarray, batch: int = 16) -> np.ndarray:
    model.eval()
    out = []
    for b in range(0, len(X), batch):
        out.append(model(torch.from_numpy(np.ascontiguousarray(X[b:b + batch]))).argmax(1).numpy().astype(np.uint8))
    return np.concatenate(out)
