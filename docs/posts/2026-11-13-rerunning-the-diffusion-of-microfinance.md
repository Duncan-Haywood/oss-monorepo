---
title: "Re-running The Diffusion of Microfinance: the data and the story reproduce, the point estimate does not"
seo_title: "Reproducing Banerjee et al. 2013 microfinance diffusion: qN and qP"
date: 2026-11-13
tags: [research, civ-seeding, networks, reproduction]
description: "A port of the replication code for the 2013 microfinance diffusion study recovers take-up and the counterfactual, but not qN 0.10, qP 0.50."
---

In 2007 a lender called Bharatha Swamukti Samsthe began offering microfinance in villages
around Bangalore. It told a few "leaders" in each village (teachers, shopkeepers, self-help
group heads) and let word of mouth do the rest. Banerjee, Chandrasekhar, Duflo and Jackson
had surveyed every household's social ties beforehand, so they could watch the product move
through 43 real networks. Their paper, *The Diffusion of Microfinance* (Science, 2013), fitted
a model in which every informed household tells each neighbour with some probability per
period: q<sub>P</sub> if it took a loan, q<sub>N</sub> if it did not. The published fit was
q<sub>N</sub> = 0.10 and q<sub>P</sub> = 0.50. People who adopt talk about it far more.

We opened a research programme on that data today (`research/civ-seeding`). The question is
whether a product like this spreads as a *simple* contagion (one informed friend is enough) or
a *complex* one (you need several adopting friends), and whom a rollout should seed if the data
can't tell. The application we have in mind is the first households in a solar-home-system or
cookstove rollout. Before testing anything new, we ported the authors' archived Matlab
estimation code to Python and re-ran it on their own data (CC0).

**What reproduces.** Non-leader take-up averages 18.7% across the 43 villages; the paper says
18.5%. Leaders: 24.7% against 24.8%. Adopters pass the word on more than non-adopters in 98.4%
of 1,000 bootstrap draws. Silence the non-adopters (set q<sub>N</sub> to 0) and simulated
take-up falls by a third (0.337). The paper says it falls from 20.2% to 13.7%, a drop of 0.32.

**What does not.** The best-fitting point, with the archived grid, moments and weights, is
q<sub>N</sub> = 0.05 and q<sub>P</sub> = 0.30, the same for three simulation seeds. The published
point scores 11 times worse on the same criterion. The q<sub>P</sub> direction is nearly flat: the
bootstrap's 95% interval runs from 0.15 to 1.0, and the criterion stays within a factor of 2 of
its minimum from 0.25 to 0.50. q<sub>N</sub> = 0.10 is clearly worse than 0.05 at every value of
q<sub>P</sub>. Two checks we added after seeing the gap point the same way, not toward 0.50:
two-step optimal weights give q<sub>P</sub> 0.20 to 0.25, and four-month periods replaced by
quarters give 0.15 (months give q<sub>N</sub> 0.01, q<sub>P</sub> 0.10).

We don't know yet why. The published table may use moments, weights or a finer grid that the
archived script doesn't default to. The Science version, which we did not open, may differ from
the 2012 working paper we read. Or our port differs in a way the ten tests miss. The honest
reading is narrower than "the paper is wrong". The data and the qualitative story hold up. The
second parameter is pinned down much less tightly than one number suggests.

That weak identification is the programme's real subject. If the strength of word of mouth
from adopters can't be pinned down from who ended up with a loan, it's an open question
whether the same data can tell news-like spreading from reinforcement-driven spreading. And
those two give opposite seeding advice: central people for one, tight clusters for the other.
Next comes fitting a reinforcement model to the same villages and asking how often the moments
pick the right model on villages simulated from each.

Code, data and the pre-registered log:
[`research/civ-seeding`](../../research/civ-seeding/README.md). Produced with AI assistance; no
affiliation with the study's authors is implied.
