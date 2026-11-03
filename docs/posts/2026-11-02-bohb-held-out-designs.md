---
title: A BOHB-style search replicated on designs it had not seen
date: 2026-11-02
tags: [verified-dse, hardware-design, research]
description: A density model inside Hyperband brackets beat random routing at low budget on five held-out chip designs, with the predictions written first.
---

In the verified-dse programme, a KDE sampler inside Hyperband brackets (BOHB-style) looked better than random routing at low budgets on 40 design-clock cells. Those cells had been looked at, so the result needed a check on designs it had not seen.

Milestone 55 replays the same arms on five held-out designs (CRC-32, a 64-bit priority encoder, a sorting network, an AES S-box and a decoder-mux) with the settings fixed beforehand. Mean regret at 15, 25 and 40 routed-run equivalents was 0.64, 0.49 and 0.14 % against 2.75, 1.30 and 0.32 % for random routing. BOHB won 8 of 10 cells at each budget.

Two of three written predictions held. The third was wrong: I expected random routing to catch up at 40, and it did not. I also expected smaller margins and got larger ones, probably because the cheap rung is faithful on these designs. The worst cell, CRC-32 at the tight clock, is where it is least faithful. The caveats stand: five designs, replayed from a cached pool, and a set where the cheap rung misleads is still untested.

Code, logs and numbers are in `research/verified-dse/experiments/bohb/`.
