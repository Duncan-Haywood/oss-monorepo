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
| `fresh-2026-10-24b.jsonl` | 41 | Third set, written the same day by the session that then patched the rules. Scored once **before** any change (34/41); that author had read the earlier sets' miss list, so it is easier than the others. Its two missed unsubscribes were then patched, so it is now a tuned set |
| `fresh-2026-10-25.jsonl` | 42 | Opt-out-heavy (18 unsubscribes). Scored once before the change (25/42, 9 of 18 opt-outs caught), then the missed opt-outs were patched: now 34/42, 18/18. A tuned set |
| `fresh-2026-10-24.jsonl` | 41 | Written by a later session that had not read the rules' output on it, scored once, **not tuned on**. A second honest measurement; same caveat: still written by an agent |
| `fresh-2026-10-30.jsonl` | 36 | Opt-out and edge cases, agent-written. Scored once before the change (26/36, 4 of 10 opt-outs missed: "take this address off", "cease all correspondence", "struck my name from", a CCPA delete / do-not-sell request), then those four were patched: now 30/36, 10/10 opt-outs. A tuned set |

`bounce-corpus/` and `bounces.mjs` are the exception to "hand-written": 117 real
delivery-failure messages (see the NOTICE there), scored through the IMAP
parser. Not tuned on before 2026-10-24: 102/117; after: 116/117.

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

Measured 2026-10-24 on `fresh-2026-10-24.jsonl` (41 replies, 7 unsubscribes):
27/41 right (66%); acted on 31, right on 24 (77% precision); overreach 0;
5 of 7 unsubscribes caught (missed: "pls remove from ur list", "If I get one
more of these I'm reporting it as spam", both handed over as unclear); the
word model's guess right on 4 of the 10 handed over, 1 overreaching. Misses by
kind: four objections read as "question" or unclear (price, existing tool,
signer, past bad experience), two "interested" read as "question" (a
Thursday 2pm proposal; "how do we get started?"), one "left company"
(a forwarding contact) and one "not interested" (formal phrasing) handed over.
Both fresh sets agree on the shape: the rules are cautious but miss informal
and formal phrasings alike, and two sets are 81 replies by one kind of author.

To add a set: write it before reading the rules' output on it, name it
`fresh-YYYY-MM-DD.jsonl`, score it once, and record the result here before
changing any rule.

Measured 2026-10-24 on `fresh-2026-10-24b.jsonl` (41 replies), before any
change: 34/41 right (83%); acted on 29, right on 28 (97%); overreach 0;
unsubscribes not caught 2 ("Cease and desist all further email", and a French
"Merci de me retirer de votre liste ... Ne me contactez plus"). Other misses,
all handed to a person: a formal "decided not to proceed", "isn't a priority",
two objections (legal review, vendor lock-in) and "who should I schedule with"
read as a question not interest. The higher score than the other fresh sets
comes from the author having read their miss lists, not from better rules.
Then "cease and desist", "cease further contact" and French, German, Spanish
and Italian opt-out phrasings were added (one example each, so unverified in
those languages); the set now reads 36/41 and the unsubscribes all land. The
patterns also moved `fresh-2026-10-21` from 15 to 16 right (a "cease" phrase),
so its pins changed; the other three sets are unchanged.

## Call notes (prep and follow-up), added 2026-10-26

`calls.mjs` scores two things the reply sets do not: which of the nine discovery
fields a note mentions (`prep.mjs`), and whether a call-note line is ours, theirs,
the dated next step or recap (`followup.mjs`). Hand-written by the agent that wrote
the rules; invented people and companies.

| File | Items | Role |
|---|---|---|
| `calls-prep.jsonl` | 30 | Written first, scored before tuning: 14/30 exact, recall 48%, precision 88%. Tuned on after |
| `calls-followup.jsonl` | 44 | Written first, scored before tuning: 32/44 (73%). Tuned on after: 44/44 |
| `calls-prep-fresh.jsonl` | 20 | Written after tuning, scored once: 12/20 exact, precision 85%, recall 61% |
| `calls-followup-fresh.jsonl` | 26 | Written after tuning, scored once: 24/26, then one fix ("Need to send ..." read as a name): 25/26 |

Read the tuned sets as a regression floor and the fresh sets as the range. Field
detection by keyword misses paraphrase ("two full days every month to chase
receipts", "Booked a second call for the 22nd", "Funding is approved"); it rarely
invents a field, which is the safe direction, since an unknown field only means one
more question on the agenda. Run: `node eval/calls.mjs`.

## How the sets compare with a real reply mix, added 2026-10-25

None of the sets above is real mail, so one thing is checkable: how the *mix* of
labels compares with real replies. BusySeed publishes row-level data on 1,857
cold-email replies from 45 campaigns (Dec 2025 to Aug 2026; CC BY 4.0;
[methodology](https://v7.busyseed.com/research/where-cold-email-replies-actually-come-from/methodology)).
The file has a sentiment tag per reply but no reply text, so it cannot score the
rules; it gives only proportions. Its tags do not match ours one for one (it has
no out-of-office or bounce tag, and "neutral" is its biggest bucket), so only the
two ends compare cleanly:

| Share of replies | BusySeed (real, n=1,857) | Our six agent-written sets (n=284) |
|---|---|---|
| Unsubscribe or hostile | 1.7% (31) | 19% (55); 14% to 43% per set |
| Interested | 6.6% (123) | 12% (33) |
| Not interested | 21% (391) | 12% (33, plus 6 "objection") |

Reading it: the sets over-sample opt-outs about eleven times and interested
replies about twice, which is the right call for testing the legal-risk direction
(a missed opt-out costs more than a missed objection) but means the percent-right
figures above are not what a real inbox would show. In a real inbox the rules'
job is mostly telling "not interested" and neutral replies apart from the rare
opt-out, and with 1.7% opt-outs the cost of a false opt-out (a lead suppressed
for good) grows relative to a missed one, since there are about thirteen
non-opt-outs for each real opt-out. We have not measured the false-opt-out rate
on real text. The data is from one vendor's campaigns, and the opt-out tag
merges hostile replies, so treat the 1.7% as a rough figure.
