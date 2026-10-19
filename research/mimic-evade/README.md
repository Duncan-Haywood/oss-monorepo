# Can an imitator fool a prompt-free human-vs-machine text detector with cheap surface edits, such as typos, contractions or dropping the chat preamble?

Track 11 (adversarial human imitation), a no-model slice before milestone 2 (`mimic-loop`), built on `mimic-contexts`. It was chosen because any imitator prompt will first try cheap surface moves, and nobody had measured how far those alone move the reference n-gram detector. **Preliminary, stylised: the edits are scripted rules applied to RAID's plain-prompt text, not edits an LLM chose; one seed; held-out poetry, reviews and wiki only.** Produced with AI assistance (Claude). No LLM was run and no text was written by the session agent.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/mimic-evade/

**Result.** The detector's held-out AUROC is 0.927. Editing only the machine texts (humans untouched) barely moves it for most edits: lowercasing and whitespace flattening change nothing (0.927; the vectoriser lowercases and tokenises on whitespace, so this is invariance by construction, not a finding), stripping markdown, dropping the "Sure, here is" preamble and contractions move it by at most 0.005 (contractions go *up*, to 0.931). 2% character typos cost about 0.012 (0.915; paired 95% bootstrap interval of the difference −0.014 to −0.010). Keeping only the first half of each text costs the most, −0.051 (0.876; −0.061 to −0.044), and all edits combined except truncation cost −0.008 (0.919). No edit gets near chance. When the detector is refit with the same edit applied to its training machine texts, AUROC rises above the baseline for typos (0.956), truncation (0.969) and the combination (0.961): the edit becomes a feature the detector learns. Numbers are in `results.txt` and `results.json`; `experiments/figure.svg` plots them.

```bash
cd research/mimic-evade
pip install numpy scipy scikit-learn
python3 -m unittest discover -s tests -v      # 5 tests
python3 evade.py && python3 figure.py         # about 3 minutes
```

## Motivation

A detector's worth is its robustness to the cheapest attack. Before spending model calls on an optimised imitator, this fixes the floor: how much a rule-based, zero-model "imitator" gains from surface edits alone, and whether a defender who knows the edit simply wins it back.

## Builds on

`research/mimic-contexts` (suite and n-gram detector, imported unchanged). `research/mimic-surface` (what the detector keys on, and length). Dugan et al. (2024), RAID, for the text. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Method

The detector is `mimic-contexts`' TF-IDF character 1-4 and word 1-2 gram logistic regression, fit on the five training families. Eight edit rules (`evade.py`) are applied to the LLM texts of the three held-out families, with a fixed seed for the typo rule. For each edit the table reports: AUROC with machine texts edited (the attack), with both classes edited (a control: does the edit hurt the detector, or merely shift the text?), and with a detector refit on training texts whose machine side had the same edit (the adaptive defender). Intervals are percentile bootstraps over rows (300 resamples) of the paired AUROC difference.

## Limitations

The edits are crude rules. A prompted LLM can rewrite content, not only surface, and `mimic-loop` is where that is tested. Truncation changes length, which is family-specific (`mimic-contexts`), so the half-text drop mixes shorter text with the edit; the adaptive gain above baseline probably reflects the detector learning "short machine text" and should not be read as the edit helping the defender in general. One seed; the typo rate was fixed at 2% in advance and not swept. The vectoriser's lowercasing makes two rows trivially null. Three RAID chat models only.

## Next steps

Sweep the typo rate; run the same edits against the zero-shot score of `mimic-contexts` (where typos should raise perplexity and look human); then let a local instruct model choose its own edits in `mimic-loop`.

## Owner steps

None.

## Outside dependencies

`mimic-contexts` suite (RAID text), NumPy, SciPy, scikit-learn. MIT.
