---
kind: analysis
date: 2026-11-07
subjects: [hearth-and-horizon, saints-by-candlelight]
topics: [blog-posts, research-integrity]
---
# Doctrine review, batch 1 (agent note)

The owner asked for "an ongoing blog analysis on how closely the Catholic
fictional stories in the repo follow strict traditional Catholic doctrine".
Batch 1 reviewed 133 of the 330 stories: all of Little Lamps (27), all of
Saints by Candlelight (71), all of For Other Minds (13) and the 22
sacrament-densest Hearth & Horizon science fiction stories. Results: 87
faithful, 40 minor, 6 concern, 0 error. The tooling and how to run the next
part are in `docs/doctrine-review/README.md`. Part 1 is in
`docs/posts/2026-11-07-doctrine-review-part-1-how-catholic-is-the-catholic-fiction.md`.

**Method.** Six reviewer agents each read a batch in full against
`RUBRIC.md`. A seventh pass, the merging agent, ran `doctrine_review.py check`:
every quote was verbatim and every verdict met its floor. That agent also
spot-checked the concern findings in context, and rewrote the Cana lectionary
finding (056), whose reasoning was wrong although its conclusion was right.
Findings the reviewers marked "uncertain" are kept, with that word in the
issue text: Clare's sourcing, Melangell's calendar status, the river
baptism, and the rope-at-the-side-gate blessing. Check these before acting on
them.

**Next.**
- Part 2: `doctrine_review.py next -n 40`. That batch is 40 Hearth & Horizon science fiction stories, ordered by religious-term density. 197 remain.
- Fixes are a separate PR, one series at a time. The six concerns and the recurring date and rubric slips are listed in the post. Patterns worth a house-rule line in the bibles:
  - give the Roman Martyrology or General Calendar date and say when a date is local;
  - label every legend in the narration, not only in the notes;
  - make saints' prayers ask for intercession ("pray for us").
- Re-review a fixed story by leaving its old sha256: `stale` will list it.
