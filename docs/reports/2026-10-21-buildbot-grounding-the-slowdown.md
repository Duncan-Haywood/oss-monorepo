# Grounding the robot slowdown: what track 20 changed once skills were simulated

**Date:** 2026-10-21. **Run:** research track, `research/buildbot-grounded`. **Method:** read the `results.json`
of `buildbot-carry` and `buildbot-fasten` and re-ran the `buildbot-cost` break-even with them. Numbers below are
from `research/buildbot-grounded/experiments/results.txt`.

`buildbot-cost` found a stock humanoid pays only if it is about as fast as the carpenter it replaces, but it had
to sweep the slowdown 1 to 10 because no skill was simulated. With the carry grid in hand the H1's carry slowdown
is 0.41 to 1.70 against a labourer carrying one stud a trip and 1.63 to 6.82 against one carrying four, with a
break-even of 1.07. The robot barely matters to the verdict: the labourer it is compared with decides it. The
taskbook's own rate sits between the two labourers, so a time study of how crews carry studs is worth more than
another robot model. The dollars are small either way (a $40 ceiling per house for H1 carrying).

Gaps found: the carry model uses 3.8 kg 2x4 studs while the taskbook house is 2x6 (5.81 kg mean); `buildbot-fasten`
says the G1 can press a nailer while the taskbook rejects it on static payload; fastening has coverage but no
nails-a-minute. All three are in the project's Limitations.
