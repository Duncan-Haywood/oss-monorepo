# ambient-memory: what should an on-device assistant keep from a week of transcripts, and what survives a storage limit?

Track 2 (ambient AI assistant), milestone 3. On simulated days of transcripts I build the three
pieces of a memory that runs on the device: lexical retrieval (BM25), extractive daily
summaries, and retention policies that enforce a byte limit. Produced with AI assistance.
**Stylised, simulated results only**: the transcripts are synthetic word draws with planted
facts, nothing is fitted to real speech, and nothing is a claim about a real user, device or
product.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-memory/

## Motivation

`ambient-pipeline` measured the cost of hearing and answering; `ambient-interject` asked when to
speak. A day of speech is far more text than a phone should keep or an assistant should replay,
and a privacy-minded design sets a retention limit. The question is which policy keeps the
things a user will later ask about under a fixed limit.

## Builds on (and does not claim affiliation with)

- Robertson & Zaragoza (2009), "The Probabilistic Relevance Framework: BM25 and Beyond",
  *Foundations and Trends in Information Retrieval* 3(4), 333&ndash;389
  (<https://doi.org/10.1561/1500000019>; existence, authors, venue and year checked). I use the BM25
  scoring function with the common defaults k1 = 1.2, b = 0.75; the implementation is my own.
- Inverse document frequency as a measure of how informative a word is (the "importance"
  below is the mean IDF of an utterance's words). This is standard information-retrieval
  practice; I did not trace it to a single source.

No research group from `prompt.md` is built on; there is no lab tag.

## Method

A *world* (`sim.py`, class `World`) is 7 days of 1500 utterances. Filler utterances draw 9 words
from a Zipf-like vocabulary (3000 words, exponent 1.1). Each day plants 6 *facts* (42 in all): an
utterance of 6 words, 3 of which are *key words*. A later query repeats about half of the key
words plus one common word and asks for that fact. Two settings: `unique` (key words appear
nowhere else) and `tail` (key words are drawn from the rare half of the filler vocabulary, so
other utterances can contain them). A fact is *found* if the utterance containing it is in the
top 5 BM25 results (hit@5) over the store.

Policies under a byte limit (a fraction of the week's text, 372 kB): *fifo* (drop oldest),
*random*, *importance* (keep the utterances with the highest within-day mean IDF),
*summarise* (today in full; older days reduced to their top 10% by importance; then newest first).
10 seeds; "+-" is the standard deviation over seeds.

## Reproduce

```bash
cd research/ambient-memory
pip install numpy pytest
PYTHONPATH=src python3 -m pytest -q tests        # 12 tests
PYTHONPATH=src python3 experiments/run.py        # about 15 min, writes experiments/results.txt via tee
```

## Results (all from `experiments/results.txt`)

1. **Retrieval is not the bottleneck in this model.** BM25 hit@1 and hit@5 are 1.000 for every
   query overlap (1, 2 or 3 key words) and in both key-word settings, against 0.000 for
   "newest 5" and for 5 random utterances. This is a sanity check, not a finding: the planted
   key words are far rarer than anything else, which is the easiest case for a lexical method.
2. **Summaries.** Fraction of a day's facts in an extractive summary of 1%, 2%, 5%, 10%, 20% of
   the day's utterances: importance 0.58, 0.67, 0.85, 0.92, 0.97 (`unique`; 0.45, 0.57, 0.78,
   0.87, 0.93 for `tail`), against 0.02, 0.02, 0.03, 0.08, 0.22 for the first-k and 0.02, 0.02,
   0.02, 0.12, 0.20 for random-k. The advantage is built in: a fact contains rare words and the
   importance score rewards rare words. It shows the mechanism works, and says nothing about
   whether real facts are lexically rarer than chatter.
3. **Retention.** hit@5 over all 42 facts, store limited to 5%, 10%, 25%, 50% of the week:
   fifo 0.06, 0.11, 0.24, 0.50; random 0.05, 0.10, 0.26, 0.53 (both about equal to the kept
   fraction); importance 0.84, 0.93, 1.00, 1.00; summarise 0.04, 0.09, 0.95, 0.97 (`unique`).
   For `tail`: importance 0.77, 0.90, 0.99, 1.00; fifo and random as before. So if facts are
   lexically rare, keeping only the top 10% of utterances by IDF keeps about 90% of the facts.
4. **By age** (budget 10%, `unique`): fifo finds 78% of today's facts and none older; importance
   finds 87&ndash;98% at every age. *Summarise* is worse than importance at 5% and 10% because
   keeping today in full uses 14% of the week's bytes (one day in seven), so the limit is spent before
   older days get their summary. It is the best-behaved policy once the limit is above that, but
   it did not beat plain importance anywhere I measured; I would not recommend it from this.
5. **Cost.** 10,500 utterances (372 kB): index build 0.04 s, one query 1.9 ms on this container's
   CPU (one run, no repeats; a phone will differ).

## Limitations

- Facts differ from chatter by construction (rare words). Real transcripts have important
  moments made of common words ("yes, 3pm works") and chatter made of rare ones (names, food).
  Results 2 to 4 are the best case for the importance score.
- Queries repeat the stored words. Real queries paraphrase; a lexical retriever then misses and
  an embedding model, which I did not run, would be needed.
- No speech-recognition errors, no speaker identity, no time or context cues in the query.
- Importance is scored within a day with IDF over that day's retained text; utterance length,
  topic drift and repeated facts are not modelled. Facts are not re-asked, so there is no
  feedback to learn what to keep.
- Retention is a byte limit only. A time limit (delete after N days), user deletion and consent
  rules are product and legal questions that this project does not model; the README of any
  device built on it should state the recording-consent rules that apply (see `PROJECTS.md`).
- Summaries are extractive selections, not generated text; no LLM is used.

## Next steps

- Replace the synthetic words with a permissively licensed dialogue corpus (the owner's call on
  data) and score importance against labelled "later asked about" moments.
- Add a dense embedding retriever and paraphrased queries, and compare with BM25 on CPU cost.
- Add time-based retention and a learned importance score; use a day-end LLM summary as another
  policy, compared with the extractive one at the same size.
- Feed the on-device cost (build 0.04 s, query 1.9 ms) into `ambient-android`'s power budget.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset or service is used.
