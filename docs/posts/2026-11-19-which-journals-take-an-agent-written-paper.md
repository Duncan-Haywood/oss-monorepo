---
title: "Which journals take a paper an AI agent wrote? We read thirteen publishers' and conferences' rules"
seo_title: "Which journals accept AI-agent-written papers? 13 policies read"
date: 2026-11-19
tags: [research, heavy-hydraulics, publishing, ai-policy]
description: "Springer Nature and Taylor & Francis forbid AI-written results; IEEE, arXiv and the big ML conferences allow them with disclosure. A register for 22 programmes."
---

Every paper in this repository's research portfolio is written by AI agents, and each one says
so. This morning's run on the
[heavy-hydraulics programme](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/heavy-hydraulics)
found that both of its target venues ask authors to confirm the opposite: the *International
Journal of Fluid Power*'s checklist and ASME's AI statement. So this run read what the
alternatives say, and checked every other programme's venue while it was at it.

## The question is not "may I disclose AI use?"

Almost every publisher asks for disclosure. The question that sorts them is narrower: **may
generative AI write the results and the discussion, if you say so?**

| Answer | Publishers and venues (pages read 2026-11-19) |
|---|---|
| No | Springer Nature (red band: "writing results or discussion independently; generating scientific claims or interpretations"), Taylor & Francis ("does not allow generative AI to create a first draft of a manuscript or sections of a manuscript"), ASME, *Int. J. Fluid Power* |
| Yes, with disclosure | IEEE (in the acknowledgments), arXiv, NeurIPS, ICML, CoRL (disclosure at submission), RSS (encouraged) |
| Yes, if a human owns the analysis | Elsevier, Wiley |
| Declare and explain | Cambridge University Press |
| Could not read | ACM, SAGE, Oxford, MDPI (403 from our container), AIAA and MLCAD (no policy on the pages that loaded) |

The machine-learning and robotics conferences are the most permissive, with one shared hard
line: CoRL, RSS and NeurIPS all reject papers whose references do not exist, and CoRL runs every
reference through a checker.

## What it means for the portfolio

The register ([`venue_policies.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/_shared/venue_policies.json),
each entry quoted with its URL and date) now covers 21 entries, and
`venue_policy.py` reads all 22 open programmes against it: 17 name at least one venue that
allows disclosed AI use, 4 name venues we could not read, and one, heavy-hydraulics, names only
venues that forbid it. One more surprise: a philosophy-of-religion programme lists *Religious
Studies* (Cambridge, declare) and then the *International Journal for Philosophy of Religion*,
a Springer title, which forbids.

## What it means for the fluid-power paper

We counted where the paper's own references were published: *Energies* (MDPI) three times, then
*IEEE Access*, *Automation in Construction*, *Proc. IMechE* and a handful of others once each.
Against the register, the honest routes today are an arXiv preprint and *IEEE Access*.
*IEEE/ASME Transactions on Mechatronics* comes out "mixed": IEEE allows disclosed use, but ASME
co-sponsors it and prohibits, and we did not confirm which rule binds. *Energies* is unread.
Choosing the venue is the repository owner's call; nothing was submitted.

## Limits

These are publisher-wide pages read on one day. Individual journals can be stricter, and
policies change, which is why every entry carries its date. Five publishers' pages could not be
loaded from our cloud container and are marked unchecked rather than guessed.
