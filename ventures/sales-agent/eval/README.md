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
| `fresh-2026-11-03.jsonl` | 21 | Opt-out edge cases (16 unsubscribes, agent-written). Scored once before the change (15/21, 5 of 16 opt-outs missed: "remove it immediately", French "ne m'écrivez plus", Italian "non contattarmi più", a GDPR Article 21 objection, "I don't want to hear from you again"), then patched: now 20/21, 16/16. A tuned set; no other set changed |
| `fresh-2026-11-03b.jsonl` | 50 | Non-opt-out replies (interested, not interested, not now, objections, questions, wrong person, out of office; 1 unsubscribe), agent-written. Scored once before the change (37/50): meeting asks read as questions ("are you free next Tuesday", "set up 20 minutes"), bare "Pass.", "different direction", legal-team and contract objections, "X left the company", and "interested ... so no" read as interested. Patched: now 50/50. A tuned set; the same patch moved 10-24b 36 to 37, 10-25 35 to 36, 10-30 30 to 32, none down |
| `fresh-2026-11-03c.jsonl` | 30 | 24 opt-outs (court-style, GDPR, "do-not-contact list", "no-solicitation policy", ES/FR/IT/PT/NL/DE) and 6 near-miss non-opt-outs, agent-written. Scored once before the change: 16/30, 10 of 24 opt-outs missed (the legal-risk direction). Patched: all 24 caught, 26/30 (27/30 since 2026-11-12, when a label typed `wrong_person`, not a category, was corrected to `left_company`). The 4 misses are non-opt-outs ("remove the pricing section", "don't contact me until January", "remove Dana from this thread", "do you stop sending data") that stop or hand to a person, the safe direction. A tuned set, not real inboxes |
| `fresh-2026-11-04.jsonl` | 20 | Quoted footers, signatures and auto-replies, agent-written, scored with `stripQuoted` applied first as production does. 14/20 before: an unsubscribe-link line inside an away notice read as an opt-out, and "I'd rather not get any more of these" was missed; 2 more misses were my own label errors, relabelled. Patched: 20/20. A tuned set |
| `fresh-2026-11-04b.jsonl` | 30 | Mixed replies (referrals, forwards, pricing and fit questions, not-now, declines, objections, auto-replies, 3 opt-outs), agent-written. Scored once before the change: 23/30, 0 overreach, 0 opt-outs missed, every miss handed to a person. Patched six phrasings ("check in again in six months", "not a priority this half", "isn't something we'd ever need", "drivers won't adopt another app, we tried that", "book me in", "open to a quick intro call / does Friday morning work"): now 28/30. Left on purpose: a forward plus a call ask reads as a handover, and "how did you get my email" goes to a person. A tuned set |
| `fresh-2026-11-05.jsonl` | 30 | Terse and mobile-style replies across all nine categories ("yes - call me on 555-0142", "Sounds expensive", "I don't trust AI writing my emails", a dead-inbox notice, a non-profit decline), agent-written. Scored once before the change: 21/30, 0 overreach, 0 opt-outs missed. Two misses were my own label errors, relabelled ("take us off your target list" is an unsubscribe; "who's the best person to talk to" is a question), leaving 23/30. Patched the seven others: 30/30. Across the older sets only `fresh-2026-10-30` moved (32/36 to 33/36); none fell. A tuned set, so 30/30 is not a forecast on real mail. |
| `fresh-2026-11-06.jsonl` | 30 | Longer, corporate-style replies (assistant hand-offs, SOC 2 and integration questions, frozen budget, legal and rep-adoption objections, parental-leave auto-reply, role-change redirect, a hard bounce, "Ok."), agent-written. Scored once before the change: 25/30, 0 overreach, 0 opt-outs missed, every miss was a hand-over or a less-contact error. Patched three phrasings ("legal won't let us", "reps hate anything that adds clicks", "I've moved to a different role and no longer handle"): now 28/30. Left on purpose: "I passed this to our ops lead, send times" reads as a handover, and "budget is frozen until the new fiscal year" reads as not-now (arguably right; the label is debatable). A tuned set, not a forecast on real mail. |
| `fresh-2026-11-07.jsonl` | 30 | Short mixed replies: GDPR and German/French opt-outs, Spanish decline, dated not-now asks, three out-of-office phrasings (one German), departed-mailbox and wrong-person notes, SaaS pre-sales questions, deliverability and security objections, meeting asks; agent-written. Scored once before the change: 26/30, 1 overreach, 0 opt-outs missed. Patched three phrasings ("can we do a quick call", "who should I talk to to get started", "spam our prospects / hurt our domain reputation"): now 29/30, and the older sets did not move except `fresh-2026-10-21` (17 to 18 right). Left on purpose: "send a one-pager I can forward to my CFO" reads as a forward (interested); the label is debatable. A tuned set, not a forecast on real mail. |
| `fresh-2026-11-08.jsonl` | 30 | Twelfth agent-written set: Dutch, Portuguese and Italian opt-outs, a competitor renewal, dated and conditional not-nows ("once we close our funding round, probably spring"), parental-leave and Dutch out-of-office, wrong-person and dead-mailbox notes, pricing, DPA and integration questions, legal/spam objections, meeting asks. Scored once before the change: 25/30, 1 overreach, 1 opt-out missed (Dutch "haal me van je lijst af"). Patched a Dutch opt-out, a "once we ... , spring" not-now and "spam under our name / got burned"; two labels ruled (a competitor renewal and "how does this differ from X" are objections, which the rules already said and earlier sets agree with): 30/30, older sets unchanged. A tuned set, not a forecast on real mail; labels written by the same agent that patched the rules. |
| `fresh-2026-11-09.jsonl` | 30 | Thirteenth agent-written set: Swedish, Polish and Danish opt-outs, a bare "STOP", a counsel-copied demand, an exasperated "Out. Of. Your. Database.", declines ("isn't for us", Spanish in-house solution, "decided against it two years ago"), dated and conditional not-nows, English and Swedish out-of-office, wrong-person and dead-mailbox notes, demo and calendar-link asks, pricing, Outlook, DPA and reference questions, competitor, security and price objections with subtypes. Scored once before the change: 18/30, 1 overreach, 2 opt-outs missed (Polish "usunąć mój adres", the exasperated one); 0 acted-on opt-outs wrong. Patched about a dozen narrow phrasings: 30/30; the older sets did not move except `fresh-2026-10-24` (28 to 29 right); none fell. A tuned set, not a forecast on real mail; labels written by the same agent that patched the rules. |
| `fresh-2026-11-10.jsonl` | 31 | Fourteenth agent-written set: Finnish, Czech, Turkish, French, German and English opt-outs ("report you for spam", bare "unsubscribe"), declines, budget-freeze and hiring-first not-nows, English and German out-of-office, left-company and wrong-person notes, interest (deck request, calendar link, "been looking for something like this"), cost, GDPR and Xero questions, and competitor, price, security and no-time-saving objections. Scored once before the change: 26/31, 1 overreach, 1 opt-out missed (Turkish "listenizden çıkarın"). One label ruled (a nonprofit with "no budget" is a price objection, not a decline). Patched Turkish and Finnish opt-outs, "not something we'd ever buy", "send over a short deck" and "been looking for something like this": 31/31. A first draft of the deck patch also matched "one-pager" and dropped `fresh-2026-10-24b` from 37 to 36, so it was narrowed to "deck"; no older set fell. A tuned set, not a forecast on real mail; labels written by the same agent that patched the rules. |
| `fresh-2026-11-08b.jsonl` | 20 | Fifteenth set, a false-opt-out probe: replies that contain stop words but are not opt-outs ("don't stop sending", "don't take me off the shortlist", "do you handle unsubscribe links", "unsubscribe from a different vendor", "was out of the office", "stop the search"). Before the change: 15/20, 6 false unsubscribes (a lead suppressed for good). After a narrow veto for negated, feature-question and third-party stop words, and a past-tense guard on "was out of the office": 17/20, 0 false unsubscribes, 0 opt-outs missed; the three misses go to a person (unclear). Left on purpose: "how do I unsubscribe my team members ..." still stops, as does "please don't contact me again until March" (a person asking to be left alone is stopped; a wrong suppression costs one lead, a missed opt-out costs more). No older set changed. Agent-written, unscored on real mail. |
| `fresh-2026-11-08e.jsonl` | 20 | Nineteenth set, a second false-not-now and wrong-person probe: replies with "not now", "in the middle of", "wrong person" or "budget is set" that are really a question, a price objection or a final no, beside true not-nows and handovers. Before the change: 9/20. After three narrow changes ("not later", "no need to check back", "close the file" beat not-now and wrong-person; "in the middle of" beside a question mark is not a pause; "costs more than" and "double what we pay" make a price objection that beats not-now): 15/20, 0 overreach, no older set changed. With the 2026-11-11 vetoes it scores 16/20; four left on purpose or open: "not the right person to ask about security" and "not the final decision maker ... demo" go to a person; a question that also says "ask you again in the spring" reads as not-now. Agent-written, tuned, unscored on real mail. |
| `fresh-2026-11-08c.jsonl` | 20 | Sixteenth set, a false-"interested" probe: polite declines, conditional yeses and partial noes that read positive ("happy to chat in theory ... close the file", "open to a demo after our fiscal year ... come back then", "not interested in the other plan" beside a proposed time). Before the change: 13/20, 3 overreach (two would have drafted a meeting reply to a decline or a later-date request). After narrow patches (decline phrases, "come back then" as not-now, a conditional demo plus not-now is not-now, a proposed time beats a partial no): 17/20, 1 overreach. The one left is a label call: "we just signed with another vendor" reads as a competitor objection and drafts an answer, where I labelled it a decline. No older set changed. Agent-written, unscored on real mail. |
| `fresh-2026-11-11.jsonl` | 20 | Eighteenth set, a false not-now and wrong-person probe: live leads that use the stop words ("I'm not the right person for budget but I'm the one who'd use it ... Friday?", "my colleague left but I've taken over ... what are you offering?", "wrong time, not wrong person", "I'd have said not now last month", "call me later today") beside real departed-contact and not-now notices. Before the change: 9/20, 1 overreach; 6 live leads would have been marked a departed contact (no more outreach), 3 not-now misreads. After narrow vetoes (a reply with a question or go-ahead and no referral address is not a departed contact; negated or same-day "not now"/"later" is not a deferral) and three additions ("stop following up" and "no more follow-ups" are opt-outs, found by the probe; "can you do Wednesday" is a meeting ask): 18/20, 0 overreach, no other set got worse and four improved by one. The 2 left go to a person. Agent-written, unscored on real mail. |
| `fresh-2026-11-12.jsonl` | 20 | Twentieth set, an auto-reply, bounce and non-English opt-out probe (German, French, Spanish stops, GDPR erasure, one-word STOP, out-of-office with return dates, mailbox-full and unknown-user bounces). Before the change: 19/20; the miss was "on sabbatical, messages are not monitored". After one narrow pattern pair in `engine.mjs`: 20/20, overreach 0. Agent-written and short, so 100% is a ceiling check, not a measure on real mail. |
| `fresh-2026-11-13.jsonl` | 20 | Twenty-first set, a question, objection and interest probe (pricing, trial, integration questions; incumbent, budget, security, size objections; booking and next-step interest). Scored once before any change: 17/20, no overreach; the two objection misses went to a person. Two narrow objection patches ("tried something similar ... a mess, sceptical", "doesn't fit a business our size"): 19/20, and the 2026-10-25 set gained one (38 to 39). Left unpatched on purpose: "Looks relevant. Looping in my colleague Dan who owns this" reads as a handover (wrong person); a person sees both readings. Agent-written, so a tuned score, not a forecast. |
| `fresh-2026-11-08d.jsonl` | 20 | Seventeenth set, a false-bounce and false-away probe: people who mention a bounce, an undeliverable address, a trip or a leave while asking something or agreeing to a call ("my last email bounced ... Yes, I'd like a call", "I'm travelling until the 20th, ping me after", "does your tool handle out of office notices?"), beside 4 real machine notices. Before the change: 9/20, 0 overreach; 3 real replies would have marked a live lead's address bounced (email stopped for good) and 6 were read as away notices. After one narrow veto (a reply with a question or an ask, no header signal and no daemon sender is not a bounce or an away notice): 16/20, 0 overreach. The 4 left are interested/objection versus question label calls. Agent-written, unscored on real mail. |

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

## Real mail: the Enron corpus, added 2026-11-10

The first check of the reply rules on real people's writing at scale. `eval/enron.mjs`
reads raw messages exactly the way the self-host server does (`self-host/imap.mjs`
`parseMessage` and `toReplyBlock`, then `parseReplies` and `triage`) and counts what
each one is filed as.

**Data.** The Enron email corpus (CMU release; FERC made it public), from the CC0
copy at `github.com/asimov-datasets/enron.com` (commit `0c07e58`, one xz-compressed
RFC 822 message per file under `.bitcache/blobs/<2 hex>/`). Nothing from it is
committed. To fetch the same sample:

```
git clone --depth 1 --no-checkout https://github.com/asimov-datasets/enron.com.git enron
cd enron && git checkout HEAD -- '.bitcache/blobs/0*' '.bitcache/blobs/1*'
find .bitcache/blobs -name '*.xz' -print0 | xargs -0 -P 8 -n 500 xz -dk
node eval/enron.mjs <path>/.bitcache/blobs/1? --replies --labels eval/enron-labels/held.json
```

(`1?` stands for the sixteen folders `10`..`1f`; pass a directory holding links to
them.) 64,655 files; after removing the same message filed in several folders and
keeping `RE:` subjects, 9,534 replies in the `0*` half and 9,619 in the `1*` half.

**What it can and cannot say.** These are internal business replies, not replies to
cold outreach, so the corpus says nothing about how well the rules sort a sales
inbox. It does say how often a *stop* (unsubscribe, bounce, left the company, not
interested, out of office: a lead suppressed, paused or marked gone) fires on real
writing, and whether those stops are right. That is the costly error the
agent-written sets could not measure.

**Method.** The `0*` half was the tuning half: every stop the rules fired there (399)
was read and labelled right, wrong or ambiguous, and narrow vetoes were written from
the wrong ones (`VETO` in `engine.mjs`). The `1*` half was held out and scored once
after the change: the union of the stops the old and new rules fired (420) was
labelled from a shuffled list with the engine hidden. Labels:
`eval/enron-labels/{dev,held}.json` (Message-ID, category before and after, label;
no text). "Right" means that, read as a reply to an outreach email, the sentence
means that stop ("No.", "Take me off this list", "I am out of the office until
Monday"). One agent wrote the vetoes and the labels; no second reader yet.

| Stops fired on `RE:` replies | Before | After |
|---|---|---|
| Tuning half (9,534): right / wrong / ambiguous | 100 / 285 / 14 (399) | 99 / 61 / 13 (173) |
| **Held-out half (9,619), scored once** | **113 / 291 / 16 (420)** | **108 / 124 / 15 (247)** |
| Held-out precision (ambiguous as wrong) | 27% | 44% |
| Held-out wrong stops per 1,000 replies | 30 | 13 |
| Real auto-replies (subject or `Auto-Submitted`), both halves | 90 of 92 | 91 of 92 |

What fired wrongly, most to least: confidentiality footers ("if you received this in
error ... delete this message from your system" read as an opt-out), sign-off contact
lines ("if you have any questions, please contact me at x5702" read as a referral to
someone else, so the lead was marked gone), "I left you a voicemail" and "when I
left" read as leaving the company, list footers ("To unsubscribe from this group,
send an email to"), "there is no need to ...", "I'll pass it on to ...", "the
counterparty is not interested", "we are fine with ...", "please advise if you are
planning to be out of the office", "I will return a signed copy". One real fault in
the other direction: an auto-reply sent from `postmaster@` ("I am on maternity
leave; please contact ...") was read as a bounce, which marks a live address dead;
it is now an away notice.

The held-out half lost 5 right stops, all referrals worded like a sign-off ("please
contact Bob Williams re this; he is the litigation manager", "I will be out
tomorrow, so please contact Bill with questions"). They now reach a person as a
question or unclear rather than stopping the lead, the cheaper direction. The 124
wrong stops left are mostly third-person "no need"/"don't need", news text, quoted
Lotus Notes history the stripper does not cut (`Name@ENRON 03/06/2000 ... To: ...
Subject:`), and replies under a "Returned mail" subject. Whether the vetoes cost
opt-outs in real sales replies is not measured: Enron holds only a few dozen real
"take me off this list" replies, all still caught, and the agent-written opt-out
sets did not move.

### Second round, on a third half (2026-11-11)

The first round's held-out half had been read in full by the time its score was
written down, so it could no longer test a second round. This one adds a third
half and keeps it unread until the end.

**Method.** Rules changed looking only at the stops still firing on the `0*` and `1*`
halves (61 + 124 wrong). The `2*` half (16 more folders, same checkout with
`'.bitcache/blobs/2*'`, 9,584 `RE:` replies) was not opened while tuning. Then the
union of the stops the old and new code fired there (281) was shuffled, the engine's
answers hidden, and labelled by a **separate agent** (same model family, so not an
independent human reader) with one of `unsubscribe`, `not_interested`,
`out_of_office`, `left_company`, `bounce`, `none` or `ambiguous` for what the writer's
own words mean. A stop is right when that matches the category fired. The one stop
only the final code fired (a bare "no") was labelled by the run agent.
Labels: `eval/enron-labels/fresh.json` (Message-ID, category before and after,
reader's category; no text). `node eval/enron.mjs <dir of links to blobs/2?>
--replies --labels eval/enron-labels/fresh.json`.

**What changed** (`engine.mjs`, each line commented with its real phrasing):

- *Quote stripping.* Lotus Notes headers (`Name@ECT` / `09/26/2000 11:19 AM` / `To:`,
  or `"Doe, Pat" <x> on 11/03/2000 03:18:19 PM`) and `---- Forwarded by` lines now end
  the reply. Before, the quoted history was read as the writer's words, which caused
  about a third of the wrong stops left after round one.
- *Narrower rules.* "I/we left" counts only with a company-shaped object ("I left
  Acme in March", "the firm"), not "I left you a voicemail" or "I left at noon"; the
  referral rule needs a capitalised name right after "please contact/email" (with
  the `i` flag, `[A-Z][a-z]+` had matched any word, so "Please email the form back
  to me" was a referral); "I'm out" needs an away continuation (of the office, of
  town, until, next week, on leave); "retired" needs a subject; "we're good" no
  longer matches "were good" (the optional apostrophe made "were" match).
- *Vetoes.* Someone else told to stop ("she needs to stop sending these"), "don't
  need to <verb>" other than talk/buy/switch/meet, "no need to <verb>" other than
  follow up/schedule/contact, "good to go", someone else's return ("you will be
  back on Friday"), being back already, past absences, people mentioning an
  undeliverable message, and "delete this message from your system" footers.

| Stops fired on `RE:` replies | Round 1 rules | Round 2 rules |
|---|---|---|
| Tuning `0*` (9,559): right / wrong / ambiguous / new, unlabelled | 99 / 61 / 13 / 1 | 83 / 19 / 7 / 13 |
| Tuning `1*` (9,619): same | 108 / 124 / 15 / 0 | 98 / 26 / 7 / 7 |
| **Fresh `2*` (9,584), scored once: right / wrong / ambiguous** | **76 / 171 / 11 (258)** | **79 / 88 / 5 (172)** |
| Fresh precision (ambiguous as wrong) | 29% | 46% |
| **Fresh wrong stops per 1,000 replies** | **17.8** | **9.2** |
| Real auto-replies, all three halves | 143 of 145 | 143 of 145 |

Read the fresh row, not the tuning rows: the tuning halves fell 185 to 45 wrong
stops, the fresh half 171 to 88, so about half of what the changes fixed on the
text they were written from carries to new text. The fresh *before* column is also
the first honest reading of round one: 17.8 wrong stops per 1,000, worse than the
13 the `1*` half reported, as expected once a half has been read.

Right stops on the fresh half: 6 lost, 9 gained. Three of the lost are one real
pattern the stripper now hides: "Mine too...!!! PLEASE" typed above a quoted "Take
me off this list", which reads the quote as the request. The others: "I'm out of
pocket" and a typo ("out ot the office"), now unclear and sent to a person, and a
third person who "has left the company" in a quoted message. On the tuning halves
the right stops fell 207 to 181, almost all because the stop was in quoted
history: the earlier labels judged the flagged sentence, wherever it sat.

What is left on the fresh half (88): not-interested on "don't need"/"no need"
in ordinary work talk (30), colleagues' or future absences read as away notices
(29, "I will be out of the office Friday, but in all next week"), referrals and
handovers (15), list and to-do wording (8), and 6 stops of the wrong kind. More cut forwards reach a person as
empty replies (279 empty after stripping, from 17), which costs nothing but a
look. No change on any agent-written reply set (`node --test`, 346 pass).

### Third round, on a fourth half (2026-11-11)

**Method.** Rules changed looking only at the stops still wrong on `0*`, `1*` and `2*` (19 + 26 + 88 under the round-2
rules). The `3*` half (16 more folders, `'.bitcache/blobs/3*'`, 9,656 `RE:` replies) was not opened until the rules
were frozen. Then the union of the stops the round-2 and round-3 code fired there (154; every round-3 stop was also a
round-2 stop) was shuffled with a fixed seed, the engine's answers hidden, and labelled once by a **separate agent**
(same model family again, so still no independent human reader) with the writer-intent category. One instruction differs
from round 2's reader: a bare "No." or "Nope." with nothing else is labelled `not_interested`, as round 1's labels did,
because as a reply to outreach it is a decline. Round 2's reader labelled them `none`; that is 14 of the 88 wrong stops
on `2*`, a scoring difference, not a rule fault. On `3*` there are 9 bare "No." stops, all scored right in both columns.
Labels: `eval/enron-labels/fourth.json` (Message-ID, category before and after, reader's category; no text).
`node eval/enron.mjs <dir of links to blobs/3?> --replies --labels eval/enron-labels/fourth.json`.

**What changed** (`engine.mjs`, the "Third round" block after `VETO`, each line quoting its real phrasing):

- *Reply subjects.* A `Re:`/`Fw:` subject is the thread's subject, usually the one we wrote, so it is no longer read for
  unsubscribe, not-interested, away or left-company ("RE: TW Unsubscribed Capacity", "Re: Louise Kitchen - out of
  office", "Re: Bobette Riner is no longer at TNE"). Auto-reply subjects ("Out of Office: ...") do not start with
  `Re:` and still count. Bounces already worked this way.
- *Someone else is away.* A named person or he/she/they/both before "is/are/will be out, back, away, travelling, on
  leave" ("Mike is out of the office this week, but I'll follow up", "Both are out of the office right now"). A wrong
  veto here sends the reply to a person rather than pausing the lead.
- *Back already, or here and acting*: "I just got back in the office", "I've been away from the office sick", "I'm
  travelling today but I'll call you back" (not an away notice's "but I will reply on my return").
- *Forwarding and other people*: "I will pass this information along", "he is not a great fit", "she decided against
  it", "the guys who left the company", "would you please contact Patti", "tell them to stop sending invoices".
- *Plans, conditions and scheduling*: "were not looking to expand", "all set to move forward", "close the file before
  you attach", "we do not need access until Monday", "No need to call Lone Star", "Saturday doesn't work for me",
  "moved on to plan B", "I will remove it from John's calendar".
- *The final-no check* no longer fires on "not later than" or "seems to not ever get resolved".
- *One opt-out added*: "please discontinue sending me these requests" (the `2*` reader's own `unsubscribe`).

| Stops fired on `RE:` replies | Round 2 rules | Round 3 rules |
|---|---|---|
| Tuning `0*` (9,559): right / wrong / ambiguous / unlabelled | 83 / 19 / 7 / 13 | 83 / 17 / 1 / 12 |
| Tuning `1*` (9,619): same | 98 / 26 / 7 / 7 | 93 / 17 / 2 / 6 |
| Tuning `2*` (9,584): right / wrong / ambiguous | 79 / 88 / 5 | 80 / 30 / 3 |
| **Fresh `3*` (9,656), scored once: right / wrong / ambiguous** | **47 / 105 / 2 (154)** | **46 / 81 / 2 (129)** |
| Fresh precision (ambiguous as wrong) | 31% | 36% |
| **Fresh wrong stops per 1,000 replies** | **10.9** | **8.4** |
| Real auto-replies caught, all four halves | 183 of 186 | 183 of 186 |
| Real bounces caught (sender or subject), all four halves | 161 of 167 | 161 of 167 |

Read the fresh row. On the halves the rules were written from, wrong stops fell 133 to 64 (52%); on new text, 105 to
81 (23%), less than the half that carried over in round 2. The easy patterns are gone, and what is left is spread thin.
The fresh *before* column is also the first honest reading of round 2's rules on new text: 10.9 wrong stops per 1,000,
against the 9.2 it reported on `2*`.

The five right stops lost on `1*` are all subject lines ("Re: unsubscribe Lighthouse" above "Your address has been
removed"; "Re: No longer with EOL Product Control" above "You bet"). Round 1's labels judged the flagged sentence
wherever it sat; none is the writer asking for a stop. On `3*` one right stop was lost: "Can you please contact
Stephanie with these requests ... she is handling", a real handover the new "would/can you contact" veto now sends to
a person. Opt-out recall on the labelled opt-outs in `2*` and `3*` (`eval/optout-recall.mjs`): 37 of 38 before and
after; messages labelled `not` but filed unsubscribe, 7 to 6. Agent-written reply sets unchanged (`node --test`).

What is left on the fresh half (81): away notices (38), mostly first-person short absences in work talk ("I will be
out of the office Friday, but in all next week") and third persons the name pattern misses ("Mike Moscoso, is out
today", "Marcus von Bach is ... currently out"); not-interested (28 plus 2 of the wrong kind), mostly "don't need the
X" in ordinary work talk; left-company (6) and unsubscribe (6). The first-person short absences are the hard case: a
real reply to outreach that says "I'm out Friday" is close to an away notice, and pausing the lead for a day is cheap.
A fifth half (`4*`) is unread for the next round.

### Fourth round, on a fifth half (2026-11-11)

**Method.** Rules changed looking only at the stops still wrong on `0*`-`3*` under the round-3 rules (17 + 17 + 30 + 81).
The `4*` half (16 more folders, `'.bitcache/blobs/4*'`, 9,589 `RE:` replies) was not opened: its round-3 stops were
saved to a file unread before any rule changed. With the rules frozen, the union of the stops the round-3 and round-4
code fired there (134; every round-4 stop was also a round-3 stop, same category) was shuffled with a fixed seed, the
engine's answers hidden, and labelled once by a **separate agent** (same model family, so still no independent human
reader) with the writer-intent category, the same instructions as round 3 (a bare "No." with nothing else or only a
sign-off is `not_interested`). Labels: `eval/enron-labels/fifth.json` (Message-ID, category before and after, reader's
category; no text). `node eval/enron.mjs <dir of links to blobs/4?> --replies --labels eval/enron-labels/fifth.json`
scores `after` (the `reader` field is compared with the category fired now).

**What changed** (`engine.mjs`, the "Fourth round" block after the third, each line quoting its real phrasing):

- *Whose absence.* `awayIsSomeoneElse` walks back from the away phrase to the nearest subject. If it is not the writer
  (I, me, my, we), the reply is not an away notice. Examples: "Craver, Edison's CEO, is traveling and won't be back in the
  office", "the person she needs to talk to is out of the office", "One of those guys should be back", "Somehow her Out of
  Office notification stopped working", "the Whalley's will be returning on Sunday", "We hope you will return soon to our
  site". Sentence openers, days, months and words after a preposition ("I am in SF today but will be back") are not
  subjects. This replaces nothing: round 3's `THIRD_AWAY` still runs.
- *Away briefly, here otherwise*: "I will be out of the office on Friday, but will be in all next week", "this afternoon
  but in all day tomorrow". *Not an absence*: "in and out of the office", "two days out of the office will do to my
  workload", "traveling a bunch", "not sure when I will be back", "will return to PDX".
- *Bare "No."* The rule `^(nope|no|nah)\.?$` fires per sentence, so "No. I don't think I know him" and "No - they pay you
  just for being you!" were declines. A bare no now stands only when the rest of the reply has no conversational words
  (a sign-off, a name, a title) or also declines. The sentence splitter no longer splits "No. 5" (a numbered item).
- *Not-interested vetoes*: "We're all fine, but very busy!!!", "We are set for closing at 10:00 AM", "I'll pass on any other
  articles", "don't need the talking points, but we should still", "if you get comfortable ... then we do NOT need to
  meet", "We don't need three different people", "I don't need Stokes & Bartholemew to serve", "isn't really relevant
  for purposes of", "not relevant when", "no need to set up a formal agenda", "does not fit in a Deficiency Default".
- *Unsubscribe vetoes*: "take it off, take it as vacation", "take it off the market", "rather not get into the habit",
  "rather not have that process further delay", someone else leaving the writer alone ("At least they leave me alone", "so
  he will leave me alone"), "No more email for you today", "TW Unsubscribed Capacity", "feel free to call our lawyer".
- *Left-company vetoes*: "a confidentiality provision that goes to internal", "There is one that goes to Vallejo", "now
  that Randy Baker has left Reliant", "I was just asking the wrong person".

| Stops fired on `RE:` replies | Round 3 rules | Round 4 rules |
|---|---|---|
| Tuning `0*` (9,559): right / wrong / ambiguous / unlabelled | 83 / 17 / 1 / 12 | 71 / 10 / 1 / 10 |
| Tuning `1*` (9,619): same | 93 / 17 / 2 / 6 | 85 / 9 / 0 / 6 |
| Tuning `2*` (9,584): right / wrong / ambiguous | 80 / 30 / 3 | 79 / 14 / 2 |
| Tuning `3*` (9,656): same | 46 / 81 / 2 | 46 / 40 / 2 |
| **Fresh `4*` (9,589), scored once: right / wrong / ambiguous** | **65 / 69 / 0 (134)** | **64 / 48 / 0 (112)** |
| Fresh precision (ambiguous as wrong) | 49% | 57% |
| **Fresh wrong stops per 1,000 replies** | **7.2** | **5.0** |
| Real auto-replies caught, all five halves | 228 of 231 | 228 of 231 |
| Real bounces caught (sender or subject), all five halves | 205 of 214 | 205 of 214 |

Read the fresh row. On the halves the rules were written from, wrong stops fell 145 to 73 (50%); on new text, 69 to 48
(30%). The fresh *before* column is the first honest reading of round 3's rules on new text: 7.2 wrong stops per 1,000,
under the 8.4 it reported on `3*`, partly because `4*` simply has fewer stops.

*Right stops lost.* On `4*`, one: "Carol St Clair is the attorney working on this now that Janice Moore has left
Enron". That is a real handover, which the new "now that X has left" veto sends to a person. On the tuning halves 21
were lost (12 on `0*`, 8 on `1*`, 1 on `2*`), all a "No." followed by an answer: "Nope. That would involve reading",
"No. The reference date has expired", "No. 1 -- (a) We need to clarify". Rounds 1 and 2 labelled the flagged sentence
on its own. Read as the writer's whole reply, none declines anything. They now reach a person as unclear or a
question, the cheaper direction.

*Checks.* Opt-out recall on the labelled opt-outs in `2*` and `3*` (`eval/optout-recall.mjs`): 37 of 38 before and after;
messages labelled `not` but filed unsubscribe, 6 of 79, unchanged. Agent-written reply sets unchanged (`node --test`, 343
before; 379 with the new real-mail phrasings in `enron-eval.test.mjs`).

*Two bugs found after scoring.* Two of the frozen round-4 vetoes were case-sensitive by mistake. The "not an absence"
pattern lacked the `i` flag because it shared a regex with the capitalised-place check. The "now that X has left"
veto missed a capitalised "Now". Both were fixed after the `4*` score was written down. Re-run on `4*`, the fixed rules
give the same 64 / 48, and on `3*` one fewer wrong stop (40 to 39 in the table above; the frozen rules gave 40).

What is left on the fresh half (48 wrong):

- *Not-interested (19).* "don't need the X" in work talk ("we do not need the extra night", "we don't need an RTO"),
  "No need to call", "We're good." after settling a bill, and three "No." replies that go on to talk. Those three stayed
  stops because `REST_DECLINES` counts any "need", "thanks" or "n't" in the rest of the reply as a decline. That is too
  broad. It was found by scoring, so the fix waits for round 5.
- *Away notices (13).* First-person short absences: "I will be out of the office Friday", "I am traveling tomorrow and
  will call you on Monday".
- *Left-company (13).* Mostly handovers ("I've handed this over to Jeff", "Please speak with Tana"), plus "I've quit
  predicting" and "the timing does not work for me".
- *Unsubscribe (3).* "the only item from your list", "take my mind off", "opt-out" in a statute.

`5*` and later are unread for round 5.

### Fifth round, on a sixth half (2026-11-11)

**Method.** Rules changed looking only at the stops still not right on `0*`-`4*` under the round-4 rules (10 + 9 + 14 +
39 + 48 wrong, plus the unlabelled and ambiguous ones). The `5*` half (16 more folders, `'.bitcache/blobs/5*'`, 9,538 `RE:`
replies) was checked out with the others, and its round-4 stops were saved to a file unread before any rule changed. With
the rules frozen and committed, the union of the stops the round-4 and round-5 code fired there (107; every round-5 stop
was also a round-4 stop, same category) was shuffled with a fixed seed (20261112), the engine's answers hidden, and
labelled once by a **separate agent** (same model family, so still no independent human reader) with the writer-intent
category and the same instructions as rounds 3 and 4. Labels: `eval/enron-labels/sixth.json` (Message-ID, category before
and after, reader's category; no text). `node eval/enron.mjs <dir of links to blobs/5?> --replies --labels
eval/enron-labels/sixth.json` scores the current rules.

**What changed** (`engine.mjs`, the "Fifth round" block after the fourth, each line quoting its real phrasing):

- *The bare "No." check.* Round 4's `REST_DECLINES` counted any "not", "n't", "need", "already" or "thanks" in the rest of
  the reply as a decline, so "NO. I need to know how many beds there are total", "No. I do not have any contact
  information for them" and "no - I never heard back" stayed declines. The rest must now decline in words that mean it
  (not interested, no thanks, stop, remove, we're all set, don't need it, not a fit, not something we'd ever buy). A rest
  that is only a sign-off ("No. thank you") still leaves the "No." standing.
- *A short absence inside a working reply* (the hard case rounds 3 and 4 left). Under a `Re:`/`Fw:` subject, with no
  auto-reply header, when the reply has two or more sentences of other substance (five or more words, none of the away,
  contact, cover or footer vocabulary) and the away sentence names a day or part of one with no return date ("I will be out
  of the office that day", "out of the office this morning with a sick kid", "I'm travelling on Monday, so please ask my
  assistant"), it reaches a person instead of pausing the lead. A longer absence or a return date ("until November 12th",
  "back on Thursday") still pauses, and a subject that is itself the notice ("Out of office -- Dec. 4 and 5") keeps the
  away reading however long the body runs. The first draft of this rule had neither limit: it cut real auto-reply recall
  on the tuning halves from 228 to 201 of 231 (people's own "Out of office" announcements, long and chatty), so both limits
  were added before freezing.
- *"Don't need the X" or "we're set" beside a request of the reader* is scoping work, not a decline: "we do not need the
  extra night - is it ok to cancel ... please send a new confirm", "I don't need your map inserted ... Can you center the
  one I already have", "i don't need the value. I just need the sitara transport report", "we are all set ... Give me a
  call". "Not interested", "no thanks" and "not a fit" still decline whatever else the reply asks.
- *Left-company vetoes*: someone else's handover told after the fact ("Mr. Lay had passed this on to Joe Hirko", "She said
  that she passed it on to Fred Boas", "modified jump calibration code and passed it to IT"), quitting a habit ("I've quit
  predicting"), "left us short", "Faxing drafts does not work for me". The writer's own handover ("I've passed this to our
  CTO") still files as left / wrong person with a person deciding, as designed on 2026-11-04, although the round 3-5
  readers label those `none`.
- *Not-interested and unsubscribe vetoes*: reported speech ("So I told her I was not interested for now"), "they are not
  looking at us", "the opportunity to opt-out of the program", "take my mind off the pain", "the only item from your list".

| Stops fired on `RE:` replies | Round 4 rules | Round 5 rules |
|---|---|---|
| Tuning `0*` (9,559): right / wrong / ambiguous / unlabelled | 71 / 10 / 1 / 10 | 67 / 9 / 1 / 10 |
| Tuning `1*` (9,619): same | 85 / 9 / 0 / 6 | 77 / 7 / 0 / 6 |
| Tuning `2*` (9,584): right / wrong / ambiguous | 79 / 14 / 2 | 71 / 7 / 2 |
| Tuning `3*` (9,656): same | 46 / 39 / 2 | 46 / 26 / 2 |
| Tuning `4*` (9,589): same | 64 / 48 / 0 | 63 / 22 / 0 |
| **Fresh `5*` (9,538), scored once: right / wrong / ambiguous** | **34 / 69 / 4 (107)** | **33 / 52 / 4 (89)** |
| Fresh precision (ambiguous as wrong) | 32% | 37% |
| **Fresh wrong stops per 1,000 replies** | **7.2** | **5.5** |
| Real auto-replies caught, all six halves | 264 of 268 | 264 of 268 |
| Real bounces caught (sender or subject), all six halves | 257 of 268 | 257 of 268 |

Read the fresh row. On the halves the rules were written from, wrong stops fell 120 to 71 (41%); on new text, 69 to 52
(25%), less than round 4's 30%. The fresh *before* column is the first honest reading of round 4's rules on new text: 7.2
wrong stops per 1,000, against the 5.0 it reported on `4*`. So the 5.0 was partly a quiet half, and round 5's 5.5 should be
read the same way until a seventh half says otherwise.

*Right stops lost.* On `5*`, one: "No. I'll let this one go. Thanks", a real decline whose rest ("I'll let this one go")
the narrower list does not read as declining. On the tuning halves 21 were lost. Twelve are "No." replies that go on to
answer ("No. The GP contribution is enough", "No. We buy and sell where we see value"), which rounds 1 and 2 labelled on
the flagged sentence alone. Seven are short absences in working replies that rounds 1 and 2 labelled right ("I will be out
of the office that day"); round 4's reader labelled one of the same messages, filed again in `4*`, as `none`. The readers
disagree on these, and this round sides with the later ones only for absences of a day or less. The rest: "I am no longer
using the Palm Pilot and therefore do not need the Palm.Net service" beside "Please cancel" (a request, so the soft-no veto
fires), and one sentence that is both a sick day and a handover.

*Checks.* Opt-out recall on the labelled opt-outs in `2*` and `3*` (`eval/optout-recall.mjs`): 37 of 38 before and after;
messages labelled `not` but filed unsubscribe, 6 of 79, unchanged. The 113-message recall set needs the whole corpus and
was not re-run this round. Agent-written reply sets unchanged (`node --test`, 404 before; 423 with the round-5 real-mail
phrasings in `enron-eval.test.mjs`).

What is left on the fresh half (52 wrong):

- *Away notices (17).* Short absences the new rule does not reach because the reply is short ("I'm out all day tomorrow.",
  "I will be out of the office tomorrow.") or the absence is longer ("out of the office the next two weeks", "for the
  balance of the year"). As replies to outreach, several of these are close to an away notice; the reader's `none` is
  strict, and pausing a lead for a day costs little.
- *Not-interested (15).* "We're fine." and "NO THANKS!" in personal chat, "I don't need to be on the call", "we are good,
  only 1.3 contract difference", "don't need ceo's and vp's".
- *Left-company (13).* Mostly referrals and the writer's own handovers ("Please contact Brent Price for our DASH", "I passed
  it on to Stacey"), which this product files as wrong person by design; plus a third person who "left the company" and a
  joke ("I just retired").
- *Unsubscribe (6) and bounce (1).* "take further action", "getting out of your system", "taken off the following from
  your list", "kudos to all those who opted", and a person mentioning "a delivery failure notice".

`6*` and later are unread for round 6.

### Sixth round, on a seventh half, and a second reader on the sixth (2026-11-11)

**Two round 5s.** Two sessions wrote a round 5 at the same time, from the same stops on `0*`-`4*`, each freezing its rules
before `5*` was read and each having its own separate agent label `5*` blind. One landed (above). The other (PR #14741)
was scored on the same 107 messages: every round-5 stop of either rule set was a round-4 stop, so both readers labelled
exactly the round-4 stops. That gives the first measure of how far two readers agree. Second reader's labels:
`eval/enron-labels/sixth-reader2.json` (Message-ID and category; no text).

*Reader agreement on `5*`*: 87 of 107 same category (81%); stop or not, 89 of 107. Of the 20 disagreements, 11 are the
writer's own absence (second reader `out_of_office`, first `none` or ambiguous), 4 are handovers, 3 are declines, and 2 are one reader's ambiguous against the other's none.

| On `5*` (9,538 replies), wrong stops per 1,000 (right / wrong / ambiguous) | First reader (landed) | Second reader |
|---|---|---|
| Round-4 rules | 7.2 (34 / 69 / 4) | 5.8 (50 / 55 / 2) |
| Landed round 5 | 5.5 (33 / 52 / 4) | 4.2 (48 / 40 / 1) |
| Parallel round 5 (PR #14741, never landed) | 4.7 (32 / 45 / 4) | 3.7 (45 / 35 / 1) |

The choice of reader moves the score by 1.0 to 1.4 per 1,000, as much as a whole round of rule changes. Both readers rank the
three rule sets the same way. So a single blind reader can rank rule sets, but its per-1,000 figure carries a reader effect
of that size. Compare rounds only under the same reader, and treat a gain under about 1 per 1,000 as within reader noise. A human reader is still missing.

**Method.** Round 6 is the landed round 5 plus what the parallel version had and the landed one lacked, then fixes from
`5*` (now a read half). Before any rule changed, the landed round-5 stops on `6*` (16 more folders, `'.bitcache/blobs/6*'`,
9,592 `RE:` replies) were written to a file unread. The rules were then frozen (`engine.mjs` sha256 `af751e48...`), and the
union of the stops the round-5 and round-6 code fired there (101) was shuffled with a fixed seed (20261113), the engine's
answers hidden, and labelled once by a separate agent (same model family) with the same instructions as round 5's second
reader. Labels: `eval/enron-labels/seventh.json`. `node eval/enron.mjs <dir of links to blobs/6?> --replies --labels
eval/enron-labels/seventh.json`.

**What changed** (`engine.mjs`, the "Sixth round" block):

- *An absence mentioned deep in a long reply*, whatever its length: a first-person away sentence counts only when it is
  among the first two sentences (after a greeting) or the reply is three sentences or fewer, or it states a span ("until
  November 12th", round 5's policy that a stated date pauses). A reply offering another time ("Tomorrow is better than
  Monday") is scheduling. Round 5's `SHORT_ABSENCE` kept "I will be out of the office for the next few days" and "I am on
  vacation beginning this afternoon, and will return on Monday" as away notices.
- *Who did the passing on*, by round 4's subject walk instead of a fixed pattern ("Mr. Lay had passed this on to Joe").
- *"Don't need" with an object we don't sell, with or without a request beside it* ("I don't need this spreadsheet
  everyday", "We do not need anyone speaking at this"); a product word within two words, or "at this time", keeps a decline.
- *A bare "No." whose rest declines in other words*: "No. I'll let this one go", "No. I will not agree to any penalty
  charges" (both lost on `5*` by every round-5 version); "I do not need a regulatory lawyer at this time" (also lost on `5*`).
- *Narrow vetoes*: "send me your resume, I shall forward it", "e-mail Karen or me", "will be back tonight", "when we're set
  to trade", "No need for Ken's involvement", "take this off your list" (a to-do list), "delete it from your system" after a
  "delivery error". One opt-out added: a bare "remove from list".

| Stops fired on `RE:` replies | Landed round 5 | Round 6 |
|---|---|---|
| Tuning `0*` (9,559): right / wrong / ambiguous / unlabelled | 68 / 9 / 1 / 10 | 57 / 2 / 1 / 7 |
| Tuning `1*` (9,619): same | 77 / 7 / 0 / 6 | 68 / 5 / 0 / 5 |
| Tuning `2*` (9,584): same | 71 / 7 / 2 / 0 | 66 / 5 / 2 / 1 |
| Tuning `3*` (9,656): same | 46 / 26 / 2 / 0 | 44 / 8 / 2 / 0 |
| Tuning `4*` (9,589): same | 63 / 22 / 0 / 0 | 64 / 13 / 0 / 1 |
| Tuning `5*` (9,538), first reader / second reader | 33 / 52 / 4; 48 / 40 / 1 | 34 / 45 / 4; 49 / 33 / 1 |
| **Fresh `6*` (9,592), scored once: right / wrong / ambiguous** | **45 / 54 / 2 (101)** | **45 / 41 / 2 (88)** |
| Fresh precision (ambiguous as wrong) | 45% | 51% |
| **Fresh wrong stops per 1,000 replies** | **5.6** | **4.3** |
| Real auto-replies caught, all seven halves | 315 of 320 | 315 of 320 |
| Real bounces caught (sender or subject), all seven halves | 304 of 315 | 304 of 315 |

Read the fresh row. No right stop was lost on `6*`. Wrong stops fell 54 to 41 (24%) on new text, against 123 to 78 (37%,
first-reader labels) on the halves the rules were written from. The fresh *before* column is the first honest reading of the
landed round 5 on new text: 5.6 per 1,000, against the 5.5 it reported on `5*` (a different reader; see above). Most of the
gain is absences (26 wrong to 16).

*Right stops lost on the tuning halves*: 27 (11 on `0*`, 9 on `1*`, 5 on `2*`, 2 on `3*`; one gained on each of `4*` and `5*`).
Almost all are mid-reply first-person absences, which rounds 1 and 2 labelled by the sentence and later readers split on.

*Checks.* Opt-out recall on the labelled opt-outs in `2*` and `3*`: 37 of 38, unchanged. Agent-written reply sets: no reply
changes category against the landed round 5. `node --test`: 411 pass (398 before this round's tests).

What is left on `6*` (41 wrong): away notices (16), not-interested (11), left-company (7), unsubscribe (6), one bounce. Also
still open: "Please cancel the Palm.Net service ... do not need the Palm.Net service", a real decline that round 5's
request check reads as scoping (a request beside a soft no); `7*` and later are unread for round 7.

### Seventh round, on an eighth half: the rules have reached the reader's noise (2026-11-11)

**Method.** As round 6: before any rule changed, the round-6 stops on `7*` (16 more folders, `'.bitcache/blobs/7*'`, 9,428
`RE:` replies) were written to a file unread. Rules changed looking only at the stops still not right on `0*`-`6*`
(mostly the 41 on `6*`, then `3*`-`5*`), were frozen (`engine.mjs` sha256 `52f6408406d0...`, commit "seventh round ... frozen
before 7* is read"), and the union of the stops either rule set fired on `7*` (90) was shuffled with a fixed seed (20261114),
the engine's answers hidden, and labelled once by a separate agent (same model family). New this round: the reader's brief is
a file, [`enron-labels/READER.md`](enron-labels/READER.md), written from the instructions rounds 3-6 gave in their prompts, so
later rounds and a human second reader can use the same text. Labels: `eval/enron-labels/eighth.json`.

**What changed** (`engine.mjs`, the "Seventh round" block):

- *A stated span needs a date after it*: round 6 read any "through" as one, so "I am traveling wednesday but reachable through
  my assistant" deep in a long reply still paused the lead.
- *Away vetoes*: clock-time spans ("out of the office ... 9:30 until 11", "from 1030 until 300"), "willing to get away from my
  desk", "won't be able to attend ... since I am travelling", "I'm here until mid-May", "will be back in not too long". A reply
  about which times work ("these new dates don't work for me", "I can meet at 900 on Thurs") is scheduling.
- *Unsubscribe vetoes*: "take my ring off", "I'll take it off the list" (the writer removing), "getting out of your system would
  help" (a file), a reported 'sent back a screaming "UNSUBSCRIBE" message', "those who opted out of" an event; "never EVER
  called you" no longer matches "never ever call".
- *Not-interested*: someone else's no by the subject walk ("John was not interested in Mike"), "don't need anything from you
  yet", "no thanks necessary", "it is not relevant that", "not looking to make money" (a goal, not a purchase), "does not fit any
  of the doors"; a bare "No." followed by "just wanted / just a chance" answers a question. Added as a decline: "Please cancel
  the X service", "no longer using the X service" (the Palm.Net case open since round 5); "please cancel" no longer counts as a
  request that turns a soft no into scoping.
- *Left-company*: "please contact X for our DASH", "if you have any questions, please speak with", family ("my husband is no
  longer with"), "dates don't work for me", and the writer's own handover *with a promise to come back* ("I have passed it on to
  Dave and will let you know!"). A bare "I passed it on to Stacey" still files as wrong person, by design.
- *Bounce*: "I received a delivery failure notice when I tried to forward this".

| Stops fired on `RE:` replies, wrong (right lost) | Round 6 | Round 7 |
|---|---|---|
| Tuning `0*`-`4*` | 33 | 28 (one right lost: "We do not need anything from you yet", labelled right on `0*` and `none` when the same message came back on `6*`) |
| Tuning `5*` (first reader) | 45 | 32 |
| Tuning `6*` | 41 | 17 (none lost; one more right stop, the Palm.Net cancel on `1*`) |
| **Fresh `7*` (9,428), scored once: right / wrong / ambiguous** | **49 / 38 / 3 (90)** | **49 / 37 / 3 (89)** |
| Fresh precision (ambiguous as wrong) | 54% | 55% |
| **Fresh wrong stops per 1,000 replies** | **4.0** | **3.9** |

**Read the fresh row: no measurable gain.** Round 7 changed one stop out of 90 on new text (an away mention dropped; the reader
says `none`), against 24 on the half it was written from. The `6*` gain was real for `6*` but did not carry. Two reasons, both
measured:

- *Repeated text.* The corpus files the same message under several IDs, and each half holds copies of the others: 43 of the
  88 round-6 stops on `6*` have the same text (first 300 characters, case and punctuation folded) as a stop on `0*`-`5*`, and
  49 of the 90 on `7*` repeat a stop on `0*`-`6*`. A fix for a repeat moves a tuning half and does nothing for a fresh one. 8
  of round 7's 24 removals on `6*` were repeats of earlier halves.
- *What is left is policy, not phrasing.* Of the 37 wrong stops on `7*`, 20 are the writer's own absence inside a working
  reply. Whether "I am out of the office until next Thursday and can't give you the detail now" should pause a lead is a
  product choice the readers decide one way (`none`) and the product the other (a stated date pauses, round 5). More vetoes
  won't move it.

The fresh `before` column is also the first honest reading of round 6 on new text: 4.0 per 1,000 (4.3 on `6*`, its own fresh
half). So rounds 6 and 7 both sit at about 4 wrong stops per 1,000 real replies under one reader, a figure that a second reader
moves by about 1. **Rule rounds on this corpus have stopped paying.** The next useful measurements are a different reader (a
person, or another model family, labelling from `READER.md`), the away policy decided on purpose, and real replies to outreach.

*Checks.* Opt-out recall on the labelled opt-outs (`eval/optout-recall.mjs`, `2*`-`7*`): 115 of 119, same misses before and
after. Agent-written reply sets (792 replies in `replies.jsonl`, `heldout.jsonl`, `fresh-*.jsonl`): no reply changes category
against round 6 (one did in the first draft, "Not looking to cancel our contract", fixed before freezing). Real auto-replies
and bounces caught: unchanged on every half. `node --test`: 471 pass (441 before this round's tests).

### The away policy, decided on purpose (2026-11-11)

Round 7 left one question that more rules could not answer: when a person writes back "I'm out of the office this entire
week on vacation, so I will be unable to participate", should the lead pause (the product, since round 5, when a date is
stated) or should the reply reach a person (what the blind readers said, `none`, 20 of the 37 wrong stops on `7*`)? Reading
every away stop on `7*` (33) settled it: all 33 were typed by a person, with a greeting, a name, a question or a promise to call,
including the 13 the reader called away notices. So the answer is both, split by who wrote it:

- **A machine's away notice pauses silently**, as before: a header signal (`Auto-Submitted`, `Precedence: auto_reply`,
  `X-Autoreply`), an auto-responder's own subject ("Automatic reply:", "Out of Office:", "OOO", "Away"; never a `Re:`), a
  daemon or no-reply sender, or wording only a template uses ("This is an automatic message", "I will respond to your message
  when I return", "limited email access", "for anything urgent", "messages are not monitored", a body that opens "Thanks for
  your email. I am on ..."). `engine.mjs` `awayNotice`.
- **A person who says they are away gets both readings** (`subtype: "person_away"`): the cadence pauses until the business day
  after the date they give (one week with none), and the reply goes into the tasks so a person reads it. Nothing is drafted.

The pause costs nothing in either reading, and hiding a person's reply is the error that loses a lead, so the split errs toward
the task: a notice taken for a person adds one task to read; a person taken for a notice is hidden. No away label needs to
change under this policy, because a `none` and an `out_of_office` reading of a person's away reply are both served. The other
stop categories are untouched. `eval/enron.mjs` now counts `person_away` replies apart ("reached a person") and no longer as stops.

| `RE:` replies, rules frozen at round 7 | Silent stops: right / wrong / ambiguous, before | After | Away replies that now reach a person (reader's label) |
|---|---|---|---|
| `2*`-`6*` (47,959; readers' labels) | 253 / 71 / 10 | 201 / 44 / 6 | 83 (52 out_of_office, 26 none, 4 ambiguous, 1 not_interested) |
| **`7*` (9,428; round 7's fresh half)** | **49 / 37 / 3** | **36 / 17 / 3** | **33 (13 out_of_office, 20 none)** |
| `7*`, wrong silent stops per 1,000 | 3.9 | **1.8** | |
| `7*`, only stops whose text no earlier half fired on (`--seen`) | | 10 / 12 / 3 (25 of 56) | 16 |
| `0*`-`1*` (older right/wrong labels) | 125 / 6 / 1 | 90 / 5 / 1 | 38 (35 right, 1 wrong, 2 unlabelled) |

(`2*`-`6*` cells sum the five halves; the 'before' column is the round-7 rules as landed, read with today's script.)

**Read it as a policy, not a blind score.** The policy was chosen after reading `7*`'s labels (round 7 had already reported
the 20), and its effect on the labelled stops is mechanical: every person-typed away reply now reaches a person, so the readers'
`none` on those is satisfied by construction. What it costs is measured instead:

- *Tasks.* 154 away replies across the eight halves (2.0 per 1,000 real replies) now land in the tasks, each a person's own
  writing. Two remain silent pauses on human `RE:` replies, both real templates ("I will respond to your message when I return";
  "This is an automatic message").
- *Real auto-replies.* All 365 messages the corpus marks as auto-replies by subject or header stay silent notices (0 sent to a
  person). The body wording alone, with the subject and header taken away, recognises only 14 of them as notices, so a
  header-less, subject-less notice will usually cost a task to read. That is the cheap direction, and modern responders
  (Gmail, Outlook, Exchange) set `Auto-Submitted`.
- *Agent-written sets.* Of the 61 away replies in `replies.jsonl`, `heldout.jsonl` and `fresh-*.jsonl`, 2 are now read as a
  person ("I'm currently out on a family emergency. My colleague ... can help", "I've left the office for the day and will be
  back tomorrow morning"); the template wording was widened on these sets (a first draft sent 15 of the 61 to a person), so they
  are tuning data for `awayNotice`, not a score. No reply changes category.

**De-duplicated, the fresh half is small.** With `--seen` (drop every stop whose first 300 characters, case and punctuation
folded, an earlier half already fired on), 31 of `7*`'s 56 silent stops are repeats. On the 25 left, precision is 40% (10 right,
12 wrong, 3 ambiguous), lower than the 64% with repeats: list mail and opt-out chains that repeat across halves are mostly right.
Any further rule round should score on de-duplicated text only, and a 25-stop half is too small to measure a rule change against
the ~1 per 1,000 reader effect. The useful next data is a second reader on these and real replies to outreach.

### A third reader from another model family: a local 8B model is not a second reader (2026-11-12)

Every Enron label so far came from agents of one model family. Item (1) of the flagship's `next:` asked for a reader from
another family, run with no key. `eval/model-reader.mjs` does that: it gives a local model `enron-labels/READER.md` as the
system prompt (its batch-file "Output" section swapped for "answer with one label"), then one reply at a time, at
temperature 0, through any OpenAI-compatible server (llama.cpp, Ollama, vLLM). It never sees the rules, their answers or
the other readers' labels. `compare` prints exact agreement, stop-or-not agreement and Cohen's kappa between label files.

**Setup.** Meta-Llama-3.1-8B-Instruct, Q4_K_M GGUF (bartowski's build on Hugging Face, 4.9 GB), on a `llama-cpp-python`
0.3.16 server, CPU only, 4 cores, `--n_ctx 4096`, 10 to 15 s per reply. It labelled every stop the three agent-labelled
halves hold (298: `5*` 107, `6*` 101, `7*` 90; texts gathered by Message-ID with `model-reader.mjs texts`, since earlier
rounds' stops that no longer fire are still labelled). Labels: `enron-labels/{sixth,seventh,eighth}-llama.json` (no text).
Every answer parsed as a label; it never answered `ambiguous` and twice answered `bounce`.

| Agreement, same Message-IDs | Exact | Stop or not | Kappa |
|---|---|---|---|
| `5*`: agent reader 1 vs agent reader 2 (107) | 87 (81%) | 89 | 0.71 |
| `5*`: agent reader 1 vs Llama 8B | 58 (54%) | 67 | 0.39 |
| `5*`: agent reader 2 vs Llama 8B | 65 (61%) | 75 | 0.49 |
| `5*`: agent reader 1 vs Qwen2.5 7B | 71 (66%) | 79 | 0.52 |
| `5*`: agent reader 2 vs Qwen2.5 7B | 79 (74%) | 85 | 0.64 |
| `5*`: Llama 8B vs Qwen2.5 7B | 70 (65%) | 79 | 0.56 |
| `6*`: agent reader vs Llama 8B (101) | 64 (63%) | 69 | 0.52 |
| `7*`: agent reader vs Llama 8B (90) | 68 (76%) | 73 | 0.68 |

**It disagrees in one direction: toward the rules.** On `5*` the commonest split (19 of 49) is agent `none`, Llama
`not_interested`: a "no" in passing, someone else's no, reported speech, the very phrasings the rule rounds spent six rounds
vetoing. Over the three halves the agent reader called 160 of the stops `none`; Llama gave 74 of those (46%) the category
the rules fired, and called 79 `none`. On the 128 the agent reader called right, Llama agreed 111 times (87%). A reader that
falls for the same surface cues as the rules is not an independent check: it makes the rules look better than they are.

**A second small model, to tell the family from the size.** Qwen2.5-7B-Instruct (Q4_K_M, same server and brief) on the
same 107 `5*` stops (`enron-labels/sixth-qwen.json`): closer to the agent readers than Llama (66% and 74%, kappa 0.52 and
0.64) and the only small model that used `ambiguous` (5 times), but still under the 81% the agent readers reach with each
other. Of the 68 `5*` stops the first agent reader called `none`, Qwen sided with the rules on 25 and Llama on 36. Two 7-8B
models from two more families both lean the same way, so the lean looks like a small-model trait, not one family's.

| Wrong silent stops on today's rules, per 1,000 `RE:` replies | Agent reader 1 | Agent reader 2 | Llama 8B |
|---|---|---|---|
| `5*` (9,538) | 2.3 (30 / 22 / 2) | 2.1 (34 / 20 / 0) | 1.7 (38 / 16 / 0) |
| `6*` (9,592) | 0.9 (36 / 9 / 1) | | 1.1 (35 / 11 / 0) |
| `7*` (9,428) | 1.6 (36 / 15 / 3) | | 1.8 (37 / 17 / 0) |

(Right / wrong / ambiguous in brackets. `5*` and `6*` are tuning halves now, so their figures are low by construction.)
On the stops today's rules still fire, the three readers land within 0.6 per 1,000 of one another, because most of the stops
the readers fought over have since been vetoed or moved to a person by the away policy.

**Where both families say wrong, the stop is wrong.** On `7*`'s 56 silent stops (before the veto below), the agent reader and
Llama agree on 43: 31 right, 12 wrong. The 12 are plain phrasing faults: "I am not interested in climbing a mountain", "good
teams don't need to change their uniforms", "these dates don't work for him", "the fuel valve replacement is scheduled", "if you
do not have enough response from your list below". 9 of them are among the 25 de-duplicated stops (`--seen`), where the two
readers agree on 18: 9 right, 9 wrong. That double-wrong list is the cleanest input a future rule round has, and it is now read.

**One veto from it** (`engine.mjs`, after "don't work for (me|us)"): a date or time that "doesn't work for" anyone is
scheduling ("Lay asked me to let you know that these dates don't work for him, either"). On the eight halves (`0*`-`7*`,
76,565 `RE:` replies) it removes exactly the two copies of that message on `7*` and no other stop; auto-reply and bounce
catches unchanged. `7*` is a read half, so this is tuning, not a score: wrong silent stops there go 17 to 15 under the agent
reader.

**What it means.** A 7-8B local model can't stand in for a second reader on this task: it agrees with the agent reader
less than the two agent readers agree with each other, and its errors lean toward the rules. The agent-reader figures stay
the reference. A person reading `READER.md`, or a larger model from another family, is still the missing second reader;
`model-reader.mjs` runs either (a hosted one with `LLM_BASE_URL`/`LLM_API_KEY` on any OpenAI-compatible endpoint).

```
node eval/model-reader.mjs texts <dir of links to blobs/7?> --ids eval/enron-labels/eighth.json > 7-texts.json
LLM_BASE_URL=http://localhost:8080/v1 LLM_MODEL=llama node eval/model-reader.mjs label 7-texts.json \
  --ids eval/enron-labels/eighth.json --out eval/enron-labels/eighth-llama.json   # resumable
node eval/model-reader.mjs compare eval/enron-labels/eighth.json eval/enron-labels/eighth-llama.json
```

## A free local model on every reply set (2026-11-12)

ROADMAP M2 asked for a local model's score with `eval/model.mjs`. **Setup:** Qwen2.5-7B-Instruct, Q4_K_M GGUF
(bartowski's build on Hugging Face, 4.7 GB), `llama-cpp-python[server]` 0.3.16 built from source in a venv (about 3 min),
`--n_ctx 4096 --n_threads 4 --chat_format chatml`, CPU only, 4 cores, 15 GB RAM. 9 to 12 s a reply; 792 replies took about
2.5 hours. The prompt is the product's own `TRIAGE_SYSTEM` (`ai.mjs`), one reply at a time, quoted history stripped as
`parseReplies` does. Answers (category, subtype, return date; no text) are in `model-answers/qwen2.5-7b-q4km.json`, keyed by a
hash of subject and body, so any change to the merge can be re-scored offline:

```
LLM_PROVIDER=llamacpp LLM_MODEL=qwen node eval/model.mjs eval/fresh-*.jsonl eval/replies.jsonl eval/heldout.jsonl \
  --cache eval/model-answers/qwen2.5-7b-q4km.json            # resumable; retries transport failures
node eval/model.mjs eval/fresh-*.jsonl --offline --cache eval/model-answers/qwen2.5-7b-q4km.json --misses
```

`model.mjs` now prints three scores per set on the same replies (rules, model alone, merged as the product runs it) and two
harms beside overreach and missed opt-outs: **false stops** (a reply read as less contact than it asked for) and **false
opt-outs** (a live lead that would be suppressed for good). 789 of 792 answers parsed; the other 3 were broken JSON and fall
back to the rules. 9 more were misspelt labels ("unsubscribed", "unsubcribe", "uninterested"), now mapped by
`CATEGORY_ALIASES` in `ai.mjs` and re-asked.

| Set | Rules now | Rules before tuning | Model alone | Merged now |
|---|---|---|---|---|
| `fresh-2026-10-21` (honest) | 19/40 | 15 | 35 | 33 |
| `fresh-2026-10-24` (honest) | 30/41 | 27 | 35 | 35 |
| `fresh-2026-10-24b` | 37/41 | 34 | 36 | 36 |
| `fresh-2026-10-25` | 39/42 | 25 | 41 | 41 |
| `fresh-2026-10-30` | 33/36 | 26 | 28 | 32 |
| `fresh-2026-11-03` | 21/21 | 15 | 21 | 21 |
| `fresh-2026-11-03b` | 50/50 | 37 | 46 | 49 |
| `fresh-2026-11-03c` | 27/30 | 16 | 28 | 27 |
| `fresh-2026-11-04` | 20/20 | 14 | 17 | 19 |
| `fresh-2026-11-04b` | 29/30 | 23 | 27 | 28 |
| `fresh-2026-11-05` | 30/30 | 21 | 26 | 29 |
| `fresh-2026-11-06` | 28/30 | 25 | 27 | 26 |
| `fresh-2026-11-07` | 29/30 | 26 | 26 | 29 |
| `fresh-2026-11-08` | 30/30 | 25 | 26 | 28 |
| `fresh-2026-11-08b` (false opt-out probe) | 17/20 | 15 | 9 | 15 |
| `fresh-2026-11-08c` (false interested) | 17/20 | 13 | 16 | 17 |
| `fresh-2026-11-08d` (false bounce, away) | 16/20 | 9 | 11 | 17 |
| `fresh-2026-11-08e` (false not-now) | 16/20 | 9 | 17 | 18 |
| `fresh-2026-11-09` | 30/30 | 18 | 29 | 30 |
| `fresh-2026-11-10` | 31/31 | 26 | 28 | 30 |
| `fresh-2026-11-11` (false not-now, wrong person) | 18/20 | 9 | 13 | 17 |
| `fresh-2026-11-12` | 20/20 | 19 | 18 | 20 |
| `fresh-2026-11-13` | 19/20 | 17 | 18 | 18 |
| **672 fresh replies** | **606** | **464** | **578** | **615** |
| `replies` + `heldout` (tuning sets) | 120/120 | (66/72, 24/48) | 106 | 113 |

"Rules before tuning" is each set's first score as recorded in the table at the top of this file (the rules as they stood the
day the set was written); 11-05's is before its two relabels. It is the fair comparison for a model that was never tuned:
**578 against 464, 86% against 69%.** The rules as they are now (90%) beat the model alone, because they were patched on
these very replies. The two honest sets are the only ones neither was tuned on: model 70 of 81, rules 49.

**Where the model goes wrong, it goes wrong in the costly direction.** Over all 792 it read 66 live replies as a stop (the
rules: 19) and 10 as opt-outs that were not (rules: 2, both in the 11-03c near-miss set). Examples: "Do you handle unsubscribe
links and suppression lists for us?" and "Can you stop the sequence for one account but keep sending to the rest?" as
opt-outs; "Can you resend the attachment? It didn't open" and "I got a bounce when I tried your calendar link" as bounces;
"Call me later today, around 3pm", "Now is actually a perfect time ... Can you do Wednesday at 10?" and "Not a good time this
week, but I'm very interested. Can we do a call on the 18th?" as not now; four away notices as not now. On the five trap
probes (100 replies written to bait exactly this) it scored 66, the rules before tuning 55, after 84.

**The merge, before and after** (`ai.mjs`, `mergeTriage`). The old rule let the model lower contact freely, so every one of
those errors went through: on all 792 the merged triage read 687 (below the rules alone), with 71 false stops and 12 false
opt-outs. Three changes:

1. A model's `unsubscribe` or `bounce` is a flag, not an action: the rules' answer stands, and `runInbox` adds a task saying
   what the model read. The lead is paused or already out of the cadence, and nothing is sent without approval.
2. A model may not move a reply the rules read as `interested`.
3. A model may not move a no-draft category to a drafting one at the same rank (`out_of_office` to `not_now`). The comment
   above the merge already said "never from a no-contact category to a drafting one"; equal ranks slipped through.

| All 792 | Right | False stops | False opt-outs | Opt-outs not caught |
|---|---|---|---|---|
| Rules | 726 | 19 | 2 | 4 |
| Model alone | 684 | 66 | 10 | 2 |
| Merged, old rule | 687 | 71 | 12 | 0 |
| Merged, now | 728 | 37 | 2 | 4 (all 4 flagged to a person) |

All three were chosen after seeing these answers, so "merged, now" is a tuned figure; changes 2 and 3 were each better on the
honest pair and on all 792 when compared offline (2: 66 vs 66 right on the honest pair with 6 false stops vs 7, 421 vs 407 of
the first 472; 3: 68 vs 66 and 584 vs 574 of the first 638). Change 1 is a policy, not a score: on the honest sets it costs
the four opt-outs the rules missed and the model caught ("Can you please not email this address in future", "we'd prefer not
to receive further emails", "pls remove from ur list", "If I get one more of these I'm reporting it as spam"); each now pauses
the lead and reaches a person as "the model reads this reply as a request to stop", where before it went straight to the
suppression list. Of the 23 stop flags over all 792, 4 are right; a 7B model's stop reading is mostly noise.

**What it means for a user.** A free local 7B model is worth running beside the rules: on unfamiliar replies it reads 86% where
fresh keyword rules read 69%, and under the merge it adds 19 right answers on the honest pair and 2 over all 792 (it loses 17 on
the sets the rules were tuned on) while adding no false opt-outs. It is not a replacement for the rules, and its stop readings must not act on their own. Still
open: a hosted model (needs a key) and a larger local one (14B, about 9 GB) on the same sets; whether the 37 false stops the
merge still lets through (mostly question to objection or not now) cost anything a person would notice.

## The 37 false stops, by what a person would see (2026-11-12)

The section above left one question open: whether the 37 false stops the merge still let through cost anything a person
would notice. No model host answered this run (huggingface.co, registry.ollama.ai and modelscope.cn all 403 through the
proxy), so this is offline, from the committed 7B answers. The way to answer it is by what each category *does* in
`runInbox` (`engine.mjs`), not by its rank:

- `not_interested` and `left_company` end the cadence with **no draft and no task**. A live reply that lands there is lost
  without anyone reading it.
- `unclear`, `question`, `objection`, `not_now` and `interested` all put the reply in front of a person (a task, a draft to
  approve, or both). A wrong label among these is seen and fixed when the person reads the draft.
- `question` and `objection` differ in one way that matters: `question` adds an "Answer their question" task and drafts an
  answer; `objection` drafts a rebuttal.

Tabulating every merged answer that differed from the rules' answer (`model right` means the model's label matched):

| Rules -> merged | Model right | Model wrong | What the wrong ones cost |
|---|---|---|---|
| question -> objection | 3 | 11 | "What does it cost for a team of 12?", "Does it work with Xero?", "Is it GDPR compliant?" get a rebuttal and lose the answer task |
| unclear -> not_interested | 5 | 6 | "ok", "Noted.", "Lol. Maybe. Sure, whatever, call my assistant.", "attached to the spreadsheet": closed unread |
| unclear -> left_company | 5 | 2 | "I'm the wrong person to convince. Our CEO hates cold email tools", "he has been here 12 years. What is this about?": closed unread |
| objection -> not_interested | 1 | 4 | "We already have Salesforce", "We renewed with a competitor", "no budget this year": closed unread |
| objection -> left_company | 0 | 2 | "We switched to FleetPlan last year": closed unread |
| unclear -> not_now | 4 | 8 | a draft and a 90-day pause; seen when the draft is read |
| others (question -> interested, unclear -> objection, between the two closes, ...) | 16 | 10 | drafting categories, seen; or one close for another |

So the replies a person would never see were the **16 lost silently** under the merge (`model.mjs` now counts them; the
rules alone lose 3), and the costly-but-visible ones were the 11 questions answered as
objections. The model's closes from a category a person reads were right 11 of 25 times: not reliable enough to act alone.

**Two changes to `mergeTriage`, same shape as the stop flags:**

1. A model's `not_interested` or `left_company` on a reply the rules read as `unclear`, `question` or `objection` is a flag.
   The rules' answer stands; on an unclear reply the model's reading becomes the guess the person sees ("The model reads it
   as not interested. Check it before you act."), on an objection it is a task ("The model reads this reply as a plain no").
2. A model may not turn a rules `question` into an `objection`.

```
node eval/model.mjs eval/fresh-*.jsonl eval/replies.jsonl eval/heldout.jsonl --offline --cache eval/model-answers/qwen2.5-7b-q4km.json
```

| | Right | False stops | Lost silently | Overreach | False opt-outs | Close flags (right/wrong) |
|---|---|---|---|---|---|---|
| All 792, merge before | 728 | 37 | 16 | 4 | 2 | - |
| All 792, merge now | 735 | 24 | 3 | 6 | 2 | 11 / 14 |
| Honest pair (81), before | 68 | 6 | 1 | 1 | 0 | - |
| Honest pair (81), now | 62 | 5 | 0 | 1 | 0 | 5 / 1 |
| Rules alone, all 792 | 726 | 19 | 3 | 4 | 2 | - |

**Read it honestly.** On the two honest sets the label score falls from 68 to 62: six correct closes there ("We have
decided not to proceed. All the best.", "Thank you for reaching out, however this is not something our firm will be
pursuing", "I'm not the one who decides on this. Our COO, Priya, handles all vendor choices") now wait for a person instead
of closing on their own. That is the price, and it is paid in reading time: each is one look at a reply with the model's
reading already written beside it. In return no live reply is closed unread by the model (16 to 3, the 3 being the rules'
own). The two new overreaches are true "no"s the rules read as objections ("we've decided to build this in-house", "we just
signed with another vendor"): each now gets a draft that waits for approval, plus a task saying the model reads a plain no,
and nothing is sent. Both changes were chosen after seeing these answers, so the 735 is a tuned figure; the honest-pair drop
is the untuned cost. The rules (`triage`) did not change, so the Enron re-score the rules' changes need does not apply here.

Still open: a larger or hosted model, which may close well enough to act alone (a 14B, when a model host answers); and
whether the 11-of-25 close accuracy holds on real replies.

## A 14B local model on the same replies (2026-11-12)

**Setup.** Qwen2.5-14B-Instruct, Q4_K_M, Qwen's own split GGUF (three files, 8.99 GB) from Hugging Face, which answered on
the third run of 2026-11-12. Same `llama-cpp-python[server]` 0.3.16 venv build, `--n_ctx 4096 --n_threads 4 --chat_format
chatml`, CPU only, 4 cores, 15 GB RAM. **Load it with `--use_mmap false`**: with mmap on, the AMX repack this CPU build does
holds a second copy beside the mapped file and the kernel killed the server at about 15 GB; with mmap off it sits at 10 GB.
21.3 s a reply. Same product prompt (`TRIAGE_SYSTEM`), same merge, answers in `model-answers/qwen2.5-14b-q4km.json`:

```
LLM_PROVIDER=llamacpp LLM_MODEL=qwen node eval/model.mjs eval/fresh-*.jsonl eval/replies.jsonl eval/heldout.jsonl \
  --cache eval/model-answers/qwen2.5-14b-q4km.json
```

**First 181: the two honest sets and the five trap probes**, the replies the flagship's `next:` asked for first. The 7B
column is the committed 7B cache re-scored offline on the same replies with today's merge.

| Same 181 replies | Rules | 7B alone | 14B alone | 7B merged | 14B merged |
|---|---|---|---|---|---|
| Right | 133 | 136 | 144 | 147 | 146 |
| Honest pair (81) right | 49 | 70 | 72 | 62 | 61 |
| False stops | 12 | 30 | 26 | 11 | 12 |
| False opt-outs | 0 | 6 | 9 | 0 | 0 |
| Lost silently | 1 | 4 | 2 | 1 | 2 |
| Stop flags for a person (right / wrong) | | | | 4 / 12 | 4 / 14 |
| Close flags (right / wrong) | | | | 8 / 4 | 8 / 1 |

Twice the size buys 8 replies alone (4%) and nothing merged. Its opt-out reading is no better: 9 false opt-outs to the 7B's
6, among them "Who gave you my email?", "Do you handle unsubscribe links and suppression lists for us?" and "Our legal
team asks: are you CAN-SPAM compliant", and it reads "Can you resend the attachment? It didn't open" and "I got a bounce
when I tried your calendar link" as bounces just as the 7B did. A model's stop stays a flag, for the 14B too.

The one place it differs is its closes. Of the replies the rules leave to a person as `unclear`, the 14B called 7 a plain
no or the wrong person, and all 7 were ("We have decided not to proceed. All the best.", "We don't use outside software
for this and don't plan to.", "You've got the wrong Sam, I work in finance not operations."); the 7B called 11 and was right
on 7. Its one wrong close came from an objection ("we already pay for QuickBooks and I'm not adding a second tool").

**Pre-registered, before the 14B saw the other 611 replies** (committed in this PR before that run finished): the hypothesis
is that a 14B's `not_interested` or `left_company` on a reply the rules read as `unclear` is right often enough to act
alone. It is accepted if, on the 611 replies not in the 181 (the other fresh sets and the two tuning sets), those closes
are right at least 85% of the time and at most 2 of them lose a live reply silently. If accepted, it becomes an opt-in
setting, not the default, since a deployer's model may be smaller. Closes from `question` or `objection` stay flags either
way. The counterfactual is computed from the committed cache with the merge's close flag lifted for that one case.

## "We are not interested": a veto narrowed with an Enron re-score (2026-11-12)

A probe found that "We are not interested, thanks." went to a person as `unclear`, while "We're not interested, thanks." and
"I am not interested, thanks." stopped as `not_interested`. The cause was a veto written in the second Enron round for
someone else's no ("the counterparty is not interested", "tell them you're not interested"): its `are not interested` also
matched "we are", and "we're" was never in it. So the plainest decline a firm writes depended on whether the writer used
the contraction. Also caught: "Thanks but we are not interested.", "We are not interested at this time.", "Honestly we are
not interested in this."

**The change.** One lookbehind: `(?<!\bwe )are not interested` (engine.mjs, `VETO.not_interested`). "They are", "you're",
"is" and "assume that X is" still veto.

**The re-score.** `eval/enron.mjs --replies --json` on all eight halves (`0*` to `7*`, 76,565 RE: replies), with the old
and new engine, compared by Message-ID: stops went from 414 to 417. The three new stops are two texts (one is filed twice):

| Half | Text (paraphrased) | Right? |
|---|---|---|
| `5*` | "We are not interested in the sofa. Thanks." | Yes: a decline of an offer, exactly the reply this is for |
| `5*`, `6*` | "We are the plaintiff but we are not interested in pursuing it." (internal note on a lawsuit) | No: a status note, not a decline |

So one new wrong stop in 76,565 replies (0.013 per 1,000, against the 1.8 per 1,000 fresh wrong silent stops the away policy
left on `7*`), and the cost of that error is a lead paused as "not interested", not suppressed. No stop was lost. Not
narrowed further: "we are not interested in pursuing it" is also how a prospect declines, and one internal Enron note is not
enough to tell the two apart. The agent-written sets (`eval/run.mjs`) and the model merge (`eval/model.mjs --offline` with
the Qwen2.5 7B cache) score the same before and after (728/792 merged): none of their replies uses the phrase, which is why
no earlier round saw it. Tests: `enron-eval.test.mjs`, "we are not interested is the writer's own decline".

## Mail files read as the server reads a mailbox (2026-11-11)

`eval/mailfile-enron.mjs <dir>` writes every Enron message under `<dir>` into one mbox (mboxrd escaping), reads it back
through `mailfile.mjs` (the page's and CLI's `--mail` path) and compares each reply item (from, subject, body, header
signals) with the self-host server's own read of the same message (`replyBlocks`, then `parseReplies(block)[0]`).

On the `0*` folders (32,211 messages, 90.0 MB): 32,210 identical, 32,211 in the same category; the one difference is a
newsletter whose body ends in a `---` line, which the file path drops so it does not read as a separator. Two messages
over 200 KB are cut there, as the IMAP poller cuts them. With the page's default (replies only): 9,588 kept, 22,623 left
out as not replies. Before the reader moved to `mime.mjs`, a one-off script compared the old `Buffer` reader with the new
one on all 32,211 files read both as latin1 and as UTF-8: 0 differences. Running all 9,588 replies through `runInbox`
is what found the `wrong_person` crash (README, "Two bugs found on the way").

## Public mbox files: real Takeout and Thunderbird exports (2026-11-11)

`node eval/mailfile-public.mjs` fetches eleven mbox files published on GitHub (found with a code search for
`X-Gmail-Labels` and `X-Mozilla-Status` in `.mbox` files), checks each against the sha256 prefix read on 2026-11-11 and
prints counts only: no message text, and the files are not committed (their licences are not ours). Four are real exports
(UAlbanyArchives/mailbagit and mark-watson/power-java: Takeout, the second CRLF; the8472/mldht and
johannes-riecken/mailman: Thunderbird `From - ` envelopes, the second CRLF); seven are exporter fixtures. A personal
mailbox the same search turned up is left out on purpose.

| | before | after | Python `mailbox` + `email` |
|---|---|---|---|
| messages split right | 10 of 11 files (InboxQA: 107 for 105) | 11 of 11 | 10 of 11 (same 107) |
| messages with no text | 3 (two split halves, one stray boundary) | 0 | 3 |

Both faults, and the fixes (`MboxSplitter`'s envelope check, `parseMessage`'s boundary fallback), are in the README,
"Real exported mailboxes". At scale, `eval/mailfile-enron.mjs <dir> --mboxo` writes the 32,211 `0*` Enron messages
without escaping: 139 messages hold a `From ` line after a blank line (157 lines). A split at every such line, as this
reader did before and Python's `mailbox` does, cuts all 139; the envelope check makes 0 extra splits and the output is
identical to the escaped file's (32,210 of 32,211 as the server reads them, the same one `---` difference as above). A
first version took any `name:` line as a header and still split 7 messages whose `From the Editor` line was followed by a
`http://` URL; a header now needs whitespace after the colon. The escaped (mboxrd) run is unchanged by both fixes.

Not tried: Apple Mail's `.mbox` export (a folder holding an `mbox` file) and
`Content-Length`-delimited mboxcl2 files, none found public.

## Sent mail read as the done list (2026-11-11)

`eval/sent-enron.mjs` runs every Enron message filed in a folder whose `X-Folder` names "sent" through
`createCollector` with the message's own From address as `own`, and writes the recipients (To and Cc) and UTC day the
collector records; `eval/sent-enron-reference.py` reads the same files with Python's `email` package
(`getaddresses`, `parsedate_to_datetime`); `--compare` counts agreement. Same fetch as "Real mail: the Enron corpus",
`0*` half (32,211 files).

| run | messages | same recipients | same day | not recorded |
|---|---|---|---|---|
| first (address pattern excluded `'`) | 7,836 | 7,745 | 7,836 | 0 |
| apostrophe kept inside an address, trimmed in front | 7,836 | 7,801 | 7,836 | 0 |

The 56 fixed were real addresses such as `o'neal.winfree@enron.com`, `denis.o'connell@enron.com`, read as
`neal.winfree@`/`connell@`: a sent step to such a person would not have matched and would have been queued again.
The 35 left are corpus damage (`'fricke@enron.com`, `vallo".'"elaina@enron.com`, `moore'.'charlie@enron.com`) that
neither reader can get right. What this does not test: whether subject matching against a cadence plan finds the
touches a real rep sent; Enron has no cadence plans.

## Real opt-outs: a recall set from the rest of Enron, added 2026-11-10

The Enron check above measured stops that fired wrongly. This one measures the
other, costlier direction: of the real messages in which a person asks to come
off a list, how many do the rules file as unsubscribe? A miss means the next
follow-up goes to someone who asked us to stop.

**Data.** The fourteen-sixteenths of the corpus the first check never read
(`.bitcache/blobs/2*` to `f*`, same CC0 copy and commit; checkout as above with
`git checkout HEAD -- .bitcache/blobs`), 451,475 human messages after removing
duplicates, auto-replies and bounces. Every message, not only `RE:` subjects,
because people often ask off a distribution list in a new message.

**Candidates, chosen without the rules.** `eval/optout-recall.mjs` casts a net
written separately from `RULES.unsubscribe` and much wider (`NET`: any sentence
about lists, removal, receiving or being sent things). It caught 9,221
messages, nearly all noise ("get me the numbers", "drop me a line", newsletter
footers). A second, first-person filter (`FIRST_PERSON`, minus `FOOTER`) kept sentences about the writer's own
removal or mail ("remove/take/get/delete me ... off/from", "off this list",
"stop/don't send me", "no longer need to receive") and dropped footer
instructions ("to unsubscribe", "click", "if you no longer wish"): 1,028
messages, 389 distinct texts.

**Labels.** All 389 texts were read with the engine's answer hidden and
labelled `optout` (the writer asks to stop getting this mail or to come off a
list), `not` (asking to remove *someone else*, a meeting list, "I left you off
the list", spam footers that say "UNSUBSCRIBE ME PLEASE" as link text) or
`ambiguous` (6: "better leave me off the list" for a dinner, "please do not
e-mail me at this address after today"). Duplicates share their text's label.
`eval/enron-labels/optout.json` holds Message-ID, label and the category before
the change; no text. One agent labelled; no second reader yet.

| Real opt-outs filed unsubscribe | Before | After |
|---|---|---|
| **Distinct texts (113), read once before any change** | **103 (91.2%)** | 112 (99.1%) |
| Messages (298) | 279 (93.6%) | 297 (99.7%) |
| Labelled `not` filed unsubscribe (719 messages) | 59 | 59 |
| Enron tuning half, stops fired on 9,559 `RE:` replies | 173 | 174 (the new one is a right stop) |
| Enron held-out half, stops fired, labelled right / wrong | 108 / 124 | 108 / 124 (unchanged) |

The before column is the untuned measurement. The after column is tuned on the
same set: the ten missed texts were read and five narrow patterns written from
them ("please get me off", "get my name taken off the ... list", "delete me /
my name from", "do not send me these charts / any other solicitation"), so 99%
is a regression floor, not an accuracy figure. The false-direction check is on
the earlier halves, which the new patterns were not written from: no new wrong
stop on either. The one miss left is a typo ("please review my name from the
list"). The ten misses had gone to `unclear` (6) or `question` (4): none was filed as
interest, and each reaches a person before a reply is drafted, but none stops
the sequence, so a follow-up would still have gone out.

What it cannot say: this is internal mail, so these opt-outs come off
distribution lists and newsletters, not cold outreach; a sales prospect's
"take me off" may be phrased differently. The recall is over the net's
phrasings: an opt-out using none of the net's words ("I'm not the right
audience for these") is outside the set. The 59 `not` messages still filed
unsubscribe are mostly spam whose footer reads "UNSUBSCRIBE ME PLEASE", "take
it/this one off the list" about a deal, and "remove them from the list of
signatories"; left alone, because in a reply to outreach "take it off your
list" usually means the address.

```
node eval/optout-recall.mjs <dir of links to blobs/2?..f?> --labels eval/enron-labels/optout.json
node eval/optout-recall.mjs <dir> --blind     # the candidates, engine answer hidden, for a second reader
```

## The word model, leave-one-set-out (2026-11-11)

`node eval/guess-cv.mjs` (`--min-margin=N` to withhold low-margin guesses, `--json`). Since 2026-11-11 `learn.mjs` trains
on every reply file here (`replies`, `heldout`, `fresh-*`), so a fresh set no longer scores the shipped model fairly. This
script does: each file is guessed by a model trained on all the others, counted only on replies the current rules hand to
a person (where the product shows the guess). Fresh files, 57 hand-offs: 28 right, 2 overreach, 0 unsubscribes drafted;
the old 120-reply model on the same hand-offs: 19 right, 7 overreach, 1 unsubscribe drafted. Margin sweep (all files):
0 -> 28/64 shown 64, overreach 2; 3 -> 22/34, 1; 8 -> 15/17, 0. Pinned in `engine.test.mjs`. The guess numbers recorded in
older tests (fresh-2026-10-21, fresh-2026-10-24) are kept by scoring them with `baselineModel()` from `run.mjs`.
