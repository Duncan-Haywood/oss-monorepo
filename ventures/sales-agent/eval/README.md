# Reply triage evaluation

Labelled sales replies for scoring the inbox agent's triage. **All replies
are hand-written by the agent that wrote the rules** (2026-10-21), modelled on
common reply patterns; the people, companies and addresses are invented. None
is a real email. Real inboxes will score differently; the direction of the
error (rules too narrow) is what these sets show reliably.

| File | Replies | Role |
|---|---|---|
| `replies.jsonl` | 72 | Written first. Rules tuned on it (first pass: 66/72) |
| `heldout.jsonl` | 48 | Written after the first tuning, scored once (24/48), then tuned on too |
| `fresh-2026-10-21.jsonl` | 40 | Written after the second tuning, scored once, **not tuned on**. The honest numbers |

Each line: `{"label", "subtype"?, "subject", "body", "from"?}`. Labels are the
categories in `engine.mjs` (`CATEGORIES`); `subtype` is set for objections.

```
node eval/run.mjs eval/fresh-2026-10-21.jsonl     # rules, then the word model's guess on what they hand over
node eval/run.mjs eval/fresh-2026-10-21.jsonl --json
LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=... node eval/model.mjs eval/fresh-2026-10-21.jsonl
```

What the numbers mean:

- **acted / precision**: replies the rules named a category for, and how many
  of those were right. Wrong-but-acted is where harm can happen.
- **overreach**: the chosen category drafts a message where the true one would
  contact less (e.g. "question" for a "not now").
- **unsubscribes not caught**: an unsubscribe the rules did not name. It goes
  to a person paused, but it is not added to the suppression file
  automatically.
- **guesses**: for replies the rules hand over, whether the word model's
  suggestion (`learn.mjs`) was right, and how often it would have drafted
  where the truth contacts less.

Measured 2026-10-21 on `fresh-2026-10-21.jsonl`: 15/40 right; acted on 22,
right on 15; overreach 1; 4 of 5 unsubscribes not caught; guesses right on
11 of 18, 5 overreaching. `engine.test.mjs` pins these so a rule change that
moves them is noticed: re-measure on a new fresh set, then update the pin and
the README and page together.

To add a set: write it before reading the rules' output on it, name it
`fresh-YYYY-MM-DD.jsonl`, score it once, and record the result here before
changing any rule.
