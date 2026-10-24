# ambient-glance: when is a glance better than speech for an always-on assistant? (stylised utility model)

Track 2 (ambient AI assistant), milestone 6. A small closed-form utility model with a Monte Carlo
check chooses between three ways to deliver a short message: speak it into an earbud, show it on
a glanceable display (watch or small screen), or say nothing. Produced with AI assistance.
**Stylised, simulated results only**: every parameter is a round figure I chose, nothing is
fitted to people or measured on a device, and nothing is a claim about a real user or product.
Milestone 5 (`ambient-wearable`) is not done here: it needs datasheet figures and dated prices
that I could not retrieve from this container, so I took the milestone that needs no sourced
numbers.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-glance/

## Motivation

`ambient-interject` asked *whether* to speak. Once the assistant has decided something is worth
saying, the channel matters: speech is slow and public, but needs no free eyes; a glance is fast
and quiet, but only works if the wearer looks, and fits few words.

## Builds on (and does not claim affiliation with)

- Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI
  (<https://doi.org/10.1145/302979.303030>; citation as listed in `PROJECTS.md`, I did not
  re-read the paper). Source of the idea of choosing an action by expected utility, including the
  option of doing nothing; the rule here is that idea in its simplest form, not a reproduction.
- `research/ambient-interject` in this repository, for the style of the annoyance accounting.

No research group from `prompt.md` is built on; there is no lab tag.

## Method (`src/ambient_glance/sim.py`)

A message of `w` words must arrive within a deadline (20 s). Context: ambient `noise` in [0, 1],
whether `others` are talking, whether the wearer's `eyes are busy` (driving, carrying).

- **Speech** takes 1 s + w / 2.5 s. Value 1 &minus; 0.6 &times; noise (masking), 0 if past the
  deadline. Annoyance (0.15 + 0.05 &times; seconds) &times; (1 + others).
- **Glance** shows at most 8 words, so the value is P(look in time) &times; min(1, 8/w). The wearer
  looks at a Poisson rate of 0.10 per s with free eyes, one tenth of that when busy. Cost 0.05 +
  0.02 &times; reading time, with reading time cost four times higher when eyes are busy.
- **None** has utility 0. The best mode maximises expected utility; ties go to the quieter mode.

## Reproduce

```bash
cd research/ambient-glance
pip install numpy pytest
PYTHONPATH=src python3 -m pytest -q tests       # 10 tests
PYTHONPATH=src python3 experiments/run.py       # under a second, writes experiments/results.txt via redirect
```

## Results (all from `experiments/results.txt`)

1. **Best mode by context.** With eyes free, glance is best in almost every cell, the exceptions
   being medium messages (12 to 24 words) in a quiet room with nobody else talking, where speech
   wins. With eyes busy, speech wins for short messages, and silence takes over for longer ones as noise rises or others talk (at full noise with others talking, a glance wins for 3 to 5 words), because neither channel pays for its cost. Over the 84 grid contexts the winners are glance 49%,
   speech 29%, none 23%.
2. **Check.** Closed-form and Monte Carlo utilities agree to 0.0009 (6 cases, 200,000 draws each).
3. **A modelling artefact to read with care.** At 40 words with eyes free, a glance "wins" because
   speech is net negative and the model credits a truncated 8-word display with 8/40 of the
   value. Real value is unlikely to be linear in words shown.
4. **Sensitivity.** Scaling one parameter by 0.5 or 2 changes the best mode in at most 17% of
   contexts. The largest effects are speech annoyance per second (15%, 17%), speech rate (14%,
   13%) and the deadline (10%, 13%); the glance fixed cost and reading rate barely matter
   (&le; 4%).
5. **Twin gap.** Choosing modes with an assumed look rate of 0.10 per s when the real one is
   0.02, 0.05, 0.20 or 0.40 loses 0.032, 0.006, 0.008 and 0.036 utility per message (uniform
   weight over the grid). Assuming masking 0.6 when it is 0.2 or 1.0 loses 0.018 and 0.017. The
   look rate is the number a simulator of a person is least able to supply.
6. **Break-even.** With 6 words, noise 0.5, others talking and eyes free, glance becomes the best
   mode at a look rate of 0.010 per s (one glance every 100 s), because speech is then net
   negative; it is the best of the three, not necessarily good.

## Limitations

- All parameters are my round numbers; the ordering of modes is a property of the model, the
  sizes are not estimates. No human study, no device, no measured reading or speech rates.
- Messages are independent; no urgency levels, no queueing, no learning from dismissals, no
  repeat or combined (chime plus glance) modes, no haptic-only mode.
- Glance value is linear in words shown (see result 3); speech understanding ignores accents,
  earbud quality and content.
- The grid is uniform over contexts, not a distribution of real days, so the "share" figures
  and regrets are descriptive of the grid only.
- A visible display conflicts with the discreet-not-covert guardrail only if used to hide
  recording; this model is about delivery to the wearer. Recording consent is outside its scope
  (US federal law needs one party's consent, some states such as California need all parties;
  see `PROJECTS.md`).

## Next steps

- Fit look rates and reading rates to published human-factors data (citations to be checked
  first), or measure them in an owner-run study.
- Add urgency and a deadline distribution, and a combined chime-plus-glance mode.
- Revisit `ambient-wearable` when datasheet figures can be fetched and verified.

## Outside dependencies

None beyond numpy (and pytest for the tests). No model, dataset, service or hardware is used.
