---
title: "The plot with the fewest species is not the poorest: rarefaction and Chao1 in the browser"
seo_title: "Free species richness calculator: rarefaction, Chao1, Hill numbers"
date: 2026-11-18
tags: [biodiversity, species-richness, rarefaction, chao1, hill-numbers, ecology, statistics, research-algorithms, browser]
description: "A free tool that compares sites at equal sample coverage, tried on ten years of Portal Project rodent captures, with a simulation of where Chao1 falls short."
---

Count the species at two sites and the site you sampled harder will usually
come out richer, even if the two are the same. Ecologists have known this for
decades. The fix most of them now use comes from Anne Chao's group:
rarefaction and extrapolation with Hill numbers (Chao et al. 2014), with
sites compared at equal *sample coverage*, the share of individuals that
belong to species already found, rather than at equal sample size (Chao and
Jost 2012). Until now it mostly meant installing the iNEXT R package. The new
[species diversity tool](../../ventures/species-diversity/) does it in the
browser, from the command line or as an agent call, and nothing is uploaded.
You get Chao1 and ACE for the species not found yet, richness, Shannon and
Simpson diversity as effective numbers of species, the curves, and every
site compared at one coverage with bootstrap intervals.

## Ten years of desert rodents

The [Portal Project](https://github.com/weecology/PortalData) has trapped
rodents on 24 plots near Portal, Arizona, every month since 1977, and
publishes every capture under CC0. I counted the distinct tagged animals
first caught on each plot from 2016 to 2025: 6,094 rodents of 21 species.

Plot 10 caught only 105 of them, the smallest haul, and 9 species, the
fewest of any plot. Ranked by species seen, it comes last. Rarefied and
extrapolated to the common coverage of 98.1%, it has 11.9 species and ranks
ninth of 24. Its interval (7.1 to 16.7) is the widest in the table, which is
the honest answer for a plot with 105 animals.

Pooled by treatment, richness is not the story: controls, kangaroo-rat
exclosures and all-rodent exclosures each have 20 or 21 species at coverage
above 99.9%. Evenness is. At a common coverage of 99.97%, Simpson diversity
is 3.51 effective species on the controls (95% interval 3.37 to 3.65) and
2.95 where kangaroo rats are kept out (2.75 to 3.15). There one pocket
mouse, *Chaetodipus penicillatus*, is 1,044 of the 1,900 animals. That is a
description of pooled counts, not a re-analysis of the experiment.

## Where Chao1 falls short

Chao1 adds f1²/(2f2) species to the count, from the singletons and
doubletons. It is a lower bound, and the page says so. To see how far below,
I drew 1,000 samples from each of four assemblages with known abundances and
counted how often each 95% interval held the truth
(`eval/coverage-output.txt`):

| Quantity | Interval held the truth |
| --- | --- |
| rarefied richness at half the sample | 91.9% to 97.7% |
| richness extrapolated to twice the sample | 87.4% to 98.7% |
| Shannon diversity | 85.4% to 95.9% |
| Simpson diversity | 89.5% to 94.1% |
| Chao1 against true richness | 49.5% to 92.6% |

With 120 lognormal species and 200 individuals, Chao1 averaged 82.6, and its
interval held 120 only half the time. Its other failure is the reverse: when
all 40 species of an even assemblage had already been found, the interval
still sat above the 40 seen and held the truth 54.7% of the time. Rarefied
and extrapolated curves are more dependable than the asymptote, which is the
argument for comparing sites on the curve.

The simulation also caught a mistake of mine. The first version clipped the
Shannon and Simpson intervals at the sample's observed value, which seemed
harmless, since the estimate is rarely below it. In the most uneven scenario
that cut Simpson coverage to 68.8%. Without the clip it is 94.1%.

## How it was checked

An independent Python reference computes rarefaction from
`scipy.stats.hypergeom` species by species, the Chao-Wang-Jost entropy tail
from mpmath's Lerch transcendent, and observed diversity and ACE from
scikit-bio. On 13 assemblages, simulated and real, the engine agrees to 1e-10
or better. The rarefied expectations also match the means of 20,000 real
subsamples to within 1%. One gap remains: R was not available here, so there
has been no side-by-side run against iNEXT itself. That is the next check,
and incidence data (Chao2) is the next feature.

The tool is MIT licensed and builds on published papers. It is not affiliated
with their authors, with iNEXT or with the Portal Project. This post and the
tool were written with AI assistance.
