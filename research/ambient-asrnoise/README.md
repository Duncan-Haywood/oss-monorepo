# ambient-asrnoise: how much does speech-recognition error hurt an always-on assistant's trigger policies?

Track 2 (ambient AI assistant), a new question rather than another variant of the audit and
doubly-robust chain (`ambient-confest` to `ambient-drrepeat`), which has gone to micro-variants.
`ambient-interject` compared when to speak assuming a clean transcript; here the transcript comes
from an ASR with a word error rate (WER), and I ask which policies degrade first. Produced with AI
assistance. **Stylised, simulated results only:** the way WER enters each signal is my assumption,
nothing is fitted to real speech recognition, and nothing is a claim about a real product.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-asrnoise/

## Headline (all from `experiments/results.txt`)

At 2 false interruptions per hour, going from WER 0 to 0.5 cuts a two-word wake phrase's recall
from 0.151 to 0.039 (a 74% loss), and a transcript-reading intent threshold from 0.365 to 0.089
(a 76% loss); a keyword rule keeps more (0.531 to 0.254) but runs at 18 to 29 false
interruptions per hour, so it is not at equal annoyance. A policy that never reads the
transcript (an acoustic score with d&prime; = 1) falls only from 0.189 to 0.087. In the base
model the transcript policy still leads at WER 0.5 by a hair (0.089 vs 0.087); if its separation
shrinks as (1 &minus; WER)<sup>2</sup>, it falls behind the acoustic policy at WER 0.3 to 0.4.

## Method

The world is `ambient-interject`'s: 10 s windows, a need with probability 0.03, others talking
30% of the time (false interruptions cost x2 then). WER `e` enters as follows (the assumptions):

| signal | with ASR error `e` |
|---|---|
| wake phrase (2 words) | said-and-heard probability x (1 &minus; e)<sup>2</sup>; plus 0.002 e false wakes from errors spelling it |
| trigger keyword (1 word) | probability x (1 &minus; e); plus 0.02 e confusion false positives |
| transcript intent score | N(d&prime;(1 &minus; e)<sup>k</sup>, 1) when help is wanted, N(0, 1) otherwise; d&prime; = 2, k = 1 |
| acoustic intent score | N(1, 1) vs N(0, 1), independent of e |

Threshold policies speak on the wake phrase or when the score passes a threshold tuned on 20
simulated hours to a budget of false interruptions per hour; they are evaluated on fresh 200 h
worlds, 20 seeds, "+-" is the standard deviation over seeds.

## Reproduce

```bash
cd research/ambient-asrnoise
pip install numpy pytest
PYTHONPATH=src python3 -m pytest -q tests       # 6 tests
PYTHONPATH=src python3 experiments/run.py       # under a minute, writes experiments/results.txt
python3 experiments/figure.py                   # writes experiments/recall_vs_wer.svg
```

## Results

1. **Recall at equal annoyance (budget 2/h, thresholds re-tuned at each WER).** Recall at WER
   0.0 / 0.2 / 0.5: wake phrase 0.151 / 0.097 / 0.039; transcript threshold 0.365 / 0.233 / 0.089;
   acoustic threshold 0.189 / 0.142 / 0.087. The wake phrase loses the largest share of its
   recall at every WER, because two words must both be recognised.
2. **Not re-tuning is cheap in this model.** A threshold tuned at WER 0 and deployed at 0.5 keeps
   recall 0.085 (vs 0.089 re-tuned) and its false rate falls from 2.0 to 1.86 per hour: errors
   shift both classes' scores down together, so annoyance stays under budget and only a little
   recall is left on the table. The seed-to-seed sd of the false rate is about 0.3 per hour.
3. **Crossover.** The recall of transcript minus acoustic policy is positive at all WER for
   k = 1 with an acoustic d&prime; of 0.8 (+0.017 at 0.5), crosses zero at about 0.4 to 0.5 for
   k = 1 with 1.2, at about 0.4 for k = 2 with 0.8, and at about 0.25 for k = 2 with 1.2.
4. **Budget.** At WER 0.3 the transcript policy's advantage grows with the budget (recall 0.177
   vs 0.120 at 2/h; 0.238 vs 0.157 at 4/h; 0.082 vs 0.077 at 0.5/h).

## What this leaves out (limitations)

- The mapping from WER to signal quality is assumed. Real errors are not independent per word,
  concentrate on rare words and names (often the wake phrase), and rise with noise, accents and
  overlapping talkers; ASR confidence scores, which a real system would use, are not modelled.
- Needs are independent across windows, signals independent given the need, and the acoustic
  score's separation is one number I picked. A real prosody or addressee detector is not this.
- Wake-phrase detectors in practice are dedicated acoustic keyword spotters, not ASR output; the
  wake row models a transcript-matched phrase, as used for custom phrases.
- `ambient-pipeline` measured WER 0.010 on synthetic speech at 20 dB white noise, so the
  larger WERs here are hypotheticals, not measured conditions.
- Consent: this models listening policy only. Always-on recording of people who have not agreed
  is unlawful in some places (several US states need all parties' consent); keep audio on the
  device, store none by default, and tell people nearby.

## Next steps

- Replace the assumed scaling with measured WER on real, permissively licensed noisy speech
  (the owner's call, as it concerns data), and fit k.
- Add ASR confidence as a signal and test whether it recovers the loss.

## Owner steps

None.

## Outside dependencies

numpy and pytest. No model, dataset, service or hardware.

## Figure

`experiments/recall_vs_wer.svg` is drawn by `experiments/figure.py` from the committed `results.txt`.
