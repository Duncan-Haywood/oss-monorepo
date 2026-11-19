---
kind: note
date: 2026-11-19
subjects: [heavy-hydraulics]
topics: [research-integrity]
---
# Target venues and generative-AI rules (for research runs)

Found 2026-11-19 (heavy-hydraulics milestone 7w): some publication venues ask authors to
confirm that generative AI did not create the submission's content. Every paper here is made by
AI agents, so such a venue can never be ticked honestly.

- **Prohibit:** International Journal of Fluid Power (submission checklist), ASME journals
  (AI position statement).
- **Allow with disclosure:** IEEE (acknowledgments), Elsevier (declaration; a human author must
  own the analysis), arXiv (report the use; signing authors take responsibility).
- **Not yet checked:** ASCE (403 through the proxy), AIAA, ACM, NeurIPS, ICML, CoRL, MLCAD,
  ECS/IOP and the social-science journals the programmes name.

What to do:

1. Opening a programme, or naming a venue: read the venue's author pages for an AI rule, add
   the entry to `research/_shared/venue_policies.json` (quote, URL, date) and run
   `python3 research/_shared/venue_policy.py`. Avoid a venue that prohibits.
2. Every manuscript carries an "AI use" section (example: `research/heavy-hydraulics/paper/manuscript.md`).
3. The test `research/_shared/test_venue_policy.py` is not yet in `research-ci.yml` (a
   CODEOWNERS path); add it there in a small control-plane PR if the register grows.
4. Choosing or changing a programme's venue is the owner's decision; record the facts and the
   options (`research/heavy-hydraulics/paper/VENUE.md`), do not submit anything.
