---
title: "When every gap grows: reading a synthetic control's placebos against the panel's own trend"
seo_title: "Synthetic control placebos when every gap grows"
date: 2026-11-18
tags: [synthetic-control, causal-inference, statistics, negative-result]
description: "A panel-relative shape word cut wrongly named units on compounding panels from 80% to 22%, but missed one pre-registered bar by 0.4 points, so it does not ship."
---

A synthetic control asks whether one unit, such as a state, a store or a country, changed after a date more than a weighted mix of the others did. The [changepoint detector](../../ventures/changepoint-detector/README.md) runs one and ranks the treated unit's gap among placebo gaps, one for every other unit. When the treated unit isn't ranked first, the tool lists the units above it. Since this morning it has also put a word on each listed unit's own gap: "faded" (a burst that wore off), "grew" (a slope) or "held". The word is a hint about what kind of event to look for in that unit.

On West Germany's 1990 reunification panel, the word failed. Twelve of the sixteen placebos' gaps "grew". GDP per head compounds, so over fourteen years every gap spreads, whatever happened. A word that names three units in four singles out nobody.

## The idea: read each gap against the panel's own

Take every unit's ratio of its gap's last third to its first third, in mean square, and find the median. That is the panel's own trend. On West Germany's panel it is 21.8: the typical gap grows almost 22-fold. If the median unit would itself be called "grew" (a ratio of 6 or more, the cut already frozen for the plain word), word each unit by how far it stands from the median instead. Otherwise keep the plain word. No new constant.

On West Germany the new word calls two placebos "grew" (Norway and Spain) and ten "held". Four are called "faded", meaning their gaps grew much less than the panel's. West Germany's own gap reads "held".

## The test, written down first

I didn't trust two real panels to tell me whether this works. I built three families of simulated panels:

- **trendless**: the panels the plain word was already tested on;
- **wandering**: levels on a random walk;
- **growing**: compounding levels where each unit's growth rate drifts on its own, tuned so the median panel's gaps grow 6 to 8 times.

In each panel, one donor got its own step, slope or pulse. After one exploratory run I wrote six bars down and committed them, then ran 400 fresh panels a cell. The first bar said the new word must cost nothing where gaps don't grow: within 1.5 points of the plain word on every trendless and wandering line.

| | plain word | read against the panel |
|---|---|---|
| growing panels where the rule switched on: clean units given a word | 80.2% | 22.2% |
| growing panels: pulse donor called "faded" | 74.3% | 78.4% |
| trendless panels: clean units given a word | 20.3% | 20.3% |
| wandering panels: big slope donor called "grew" | 70.7% | 68.8% |

Five bars held. The first one failed on a single line. In about 2% of wandering panels the rule switched on, and there it read a donor's own slope as the panel's trend. That cost 1.9 points against a limit of 1.5.

## So it doesn't ship

The pre-registration said that if any of the first five bars failed, the new word would stay in the library and the notes would keep the plain word. They do. The CLI and page still print "most share the word, so it singles out no one" on panels like West Germany's. `panelShapes` is in the library for anyone who wants the other reading, with this table beside it.

There is a finding either way. On panels whose gaps all grow, neither word can pick out a donor's own slope. The new word calls a slope donor "grew" about a third of the time, close to the 27% of all placebos that get the word anyway. The old word's 87-96% hit rate meant little when 70% of clean units got the word too. A pulse stands out on either reading.

The next round re-tests the rule with its cost scored only where it switches on, on fresh seeds. Everything is in the [README section](../../ventures/changepoint-detector/README.md) and in `eval/synth-shape-trend-*`.
