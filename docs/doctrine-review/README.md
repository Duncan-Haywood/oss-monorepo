# Doctrine review

An ongoing audit of how closely the repository's Catholic fiction follows
**strict traditional Catholic doctrine**. It covers Hearth & Horizon's three
shelves (`ventures/hearth-and-horizon/stories/`) and Saints by Candlelight
(`ventures/saints-by-candlelight/episodes/`), 330 stories as of 2026-11-07.
The owner asked for it on 2026-11-07 as "an ongoing blog analysis".

| File | What |
|---|---|
| `RUBRIC.md` | the yardstick, the finding levels (D/M/L/P/T), the verdicts, the evidence rules |
| `reviews.yaml` | one entry per reviewed story: verdict, findings with verbatim quotes and fixes, notes, the story's sha256 at review time |
| `doctrine_review.py` | `status` (scoreboard), `check` (schema and quote verification; exit 1 on a misquote), `next -n N` (the next batch: religious shelves first, then by religious-term density), `stale` (stories edited since review) |
| `batch-1-sf-screen.txt` | batch 1's keyword screen of the 232 science fiction stories |

The write-ups are blog posts tagged `doctrine-review` in `docs/posts/`.

## Running the next part

1. `python3 docs/doctrine-review/doctrine_review.py stale` lists edited stories. Re-review them first.
2. `python3 docs/doctrine-review/doctrine_review.py next -n 40` gives the next batch.
3. Read each story in full against `RUBRIC.md`, then append its entries with `batch: N`, `reviewed`, and `sha256` (from `doctrine_review.py digest <id>`).
4. `python3 docs/doctrine-review/doctrine_review.py check` must exit 0.
5. Write part N as a post with the new `status` table. Say what changed since the last part, including fixes that landed.

Tests: `python3 -m unittest docs/doctrine-review/test_doctrine_review.py`.

Do the fixes in a separate change from the review. A reviewer who also edits a
story should leave the old review's sha256 in place, so that the story shows up
as stale and gets read again.
