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
| `fresh-2026-11-03c.jsonl` | 30 | 24 opt-outs (court-style, GDPR, "do-not-contact list", "no-solicitation policy", ES/FR/IT/PT/NL/DE) and 6 near-miss non-opt-outs, agent-written. Scored once before the change: 16/30, 10 of 24 opt-outs missed (the legal-risk direction). Patched: all 24 caught, 26/30. The 4 misses are non-opt-outs ("remove the pricing section", "don't contact me until January", "remove Dana from this thread", "do you stop sending data") that stop or hand to a person, the safe direction. A tuned set, not real inboxes |
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
