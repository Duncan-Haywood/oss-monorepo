# Reader instructions for the Enron stop labels

The brief a blind reader gets when labelling a half of the Enron corpus
(`eval/README.md`, "Real mail: the Enron corpus"). Rounds 3 to 6 gave their
readers these instructions in the session prompt; from round 7 (2026-11-11)
they are kept here, so every later round can hand its reader the same text,
and a human second reader can work from it too.

## What you see

A shuffled list of replies (a number, a Message-ID and the reply text after
quote stripping). Each one is a message some rule set filed as a *stop*. You
are not told which rule set, which category it fired, or how many rule sets
there are. Don't try to guess.

## What you write

One label per reply, for what the **writer's own words** mean if the reply
were an answer to a sales or outreach email. Judge the whole reply, not one
sentence.

| Label | Use when the writer |
|---|---|
| `unsubscribe` | asks to stop receiving mail, or to be taken off a list or distribution |
| `not_interested` | declines: "no thanks", "not interested", "we don't need it", "please cancel the service". A bare "No." or "Nope." with nothing else, or with only a sign-off, is `not_interested` |
| `out_of_office` | says they are away and the reply is mostly about that (an away notice, or "I'm out until Monday, will reply then") |
| `left_company` | says they (or the person written to) have left, or that someone else is now the right contact for this |
| `bounce` | is a delivery failure notice from a mail system |
| `none` | means none of these: a working reply that only mentions an absence, a list, a handover or a "no" in passing, someone else's no, reported speech, news text, a joke |
| `ambiguous` | could fairly be read two ways |

Rules of thumb from earlier rounds:

- An absence mentioned in passing inside a working reply ("I'll be out
  tomorrow, so let's talk Thursday about the contract terms ...") is `none`.
  An absence that is the point of the reply is `out_of_office`.
- A third party's departure stated as news ("Val is no longer working here")
  is `left_company` only if a salesperson writing to Val would learn Val is
  gone; family members and other companies' staff are `none`.
- The writer's own handover ("I've passed this to Dave") is `none` unless
  the writer says they are not the right person.
- Footers, disclaimers and list instructions are `none`.

## Output

A JSON file, `{"rows": [{"n": 1, "reader": "none"}, ...]}`, one row per
reply, in any order. No text from the corpus goes in the file.
