---
kind: milestone
subjects: [llm-coding-inference]
tagged: auto
---
# llm-coding-inference milestone 7p

Run on 2026-11-04. Extends 7o to two weaker coders (`nb-english`, `lexicon-en`) with `experiments/h7p_rare_guard_coders.py <coder> [reps]` (needs numpy: use `/usr/bin/python3.13` in the cloud container; data hosts were reachable).

Result: the sign of the coder-cells effect follows J (0.34: 8% narrower; 0.11: about 10% wider; 0.02: no change), so the pilot J screen (`TAU`), not the positives guard, protects width. Control coder reproduces 7o exactly. 1,000 draws take under a minute.

Open: a coder with J above 0.5; guard scaled by positives per cell; is `TAU` 0.3 right for J between 0.1 and 0.3. The 7p log entry says the prediction was not committed before the run.
