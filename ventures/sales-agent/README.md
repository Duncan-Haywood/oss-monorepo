# Sales Agent

An open-source AI sales agent built in stages, with a person in the loop at
every step that contacts someone. This is the long-term home for the owner's
direction of 2026-10-21, "I want to make ai sales agents, this is a long term
process"; the stages are in [`ROADMAP.md`](ROADMAP.md).

**Milestone 1, live now: the inbox agent.** Paste the replies your outreach
got back. For each one it decides what the reply means, does the bookkeeping
a sales rep does by hand, and queues the replies worth sending for you to
approve:

| Reply | What the agent does on its own | What waits for you |
|---|---|---|
| Unsubscribe / stop | Stops every touch; adds the address to a suppression file with the date and their sentence as the record | Nothing. No reply is drafted |
| Bounce | Stops email to the address | Find the right address in your own records (it never guesses one) |
| Out of office | Pauses until the business day after their return date (one week if none) | A task if the auto-reply names another contact |
| Left / wrong person | Stops the cadence for that contact | A task to add the person they named, if you choose |
| Not interested | Stops the cadence; not suggested again for 180 days; a lost deal row | Nothing |
| Not now | Pauses until the date they gave (90 days if none) | A short acknowledgement draft |
| Objection (price, competitor, authority, need) | Pauses the cadence | A draft answer |
| Question | Pauses the cadence | A draft with a placeholder for your answer; it cannot be approved until you fill it in |
| Interested | Stops the automated cadence; marks the prospect qualified; a deal row for [Deal Keeper](../deal-keeper/) | A reply with your booking link or a request for times |
| Unclear | Pauses the cadence | The reply, with the word model's best guess. Nothing else is done on a guess |

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/sales-agent/

**Milestone 3, live now: the daily run.** Paste or pass the task CSV that
[Sales Cadence Builder](../sales-cadence-builder/) wrote and it answers "what do
I do today?": the touches that are due (overdue ones flagged, ones older than
five days set aside), minus anyone who unsubscribed, bounced (email only),
replied, is paused until a later date or sits on the suppression list
(addresses, `@domains`, phone numbers), and minus touches you mark as already
done. It holds touches the cadence builder flagged with issues, defers email
past a daily cap (40) and lists every touch it left out with the reason, so
the run is also an audit trail. With replies as well, today's replies are read
first, so someone who wrote "stop" this morning is not called this afternoon.
It sends nothing.

**Milestone 4a: self-host it.** [`self-host/`](self-host/README.md) runs the inbox agent on your own mailbox (IMAP, read-only), with an approval queue and an audit log, in Node, Docker or compose, or one-click on Render or Fly.io in your own account (`render.yaml`, `fly.toml`; see its README). It still sends nothing; approved drafts open in your mail app. Tested against a fake IMAP server, not yet a real mailbox.

**Milestone 7a: call prep.** `node cli.mjs --prep dana@example.com --prospects prospects.csv --replies thread.txt [--notes notes.txt] [--crm export.csv] [--suppression s.txt]` ([`prep.mjs`](prep.mjs), 2026-10-24) writes `call-prep.md` for one person: what the prospects table and CRM export say, what they wrote (each message read by the inbox agent's own rules), which of nine discovery fields (need, impact, budget, decision maker, timeline, process, criteria, alternatives, next step) their words or your notes already answer, quoted so you can see a false match, and the question to ask for each field still unknown. Anyone who asked to stop, bounced or is on your suppression list gets a warning first and no agenda. Reads only the files you pass, invents nothing, sends nothing. `prep.test.mjs` runs on a hand-built thread; the field matching is keyword rules and has not been scored against labelled notes.

**Milestone 7b: post-call follow-up.** `node cli.mjs --followup dana@example.com --notes call-notes.txt --prospects prospects.csv --offer offer.json` ([`followup.mjs`](followup.mjs), 2026-10-24) turns your call notes (one point per line) into a follow-up email draft: a recap that quotes only your notes, what you said you would do, what they said they would do, and the dated next step (or a request for times if the notes have none). It runs the inbox agent's draft checks (numbers must come from your notes or offer, no guarantees, no placeholders, an opt-out line) and writes no draft for anyone who asked to stop, bounced or is on your suppression list. `followup.test.mjs` uses hand-written notes; sorting lines into ours/theirs is pattern matching on "I will" / "Name will" and has not been scored on real notes. Sends nothing.

**Milestone 6: the research agent.** `node cli.mjs --crm export.csv --icp icp.json --offer offer.json` ([`research.mjs`](research.mjs)) reads a CRM export (HubSpot, Pipedrive and plain CSV headers are mapped), ranks one lead per company against your ideal customer profile with every point explained, and drafts a first touch for each. It drops opted-out, suppressed, customer, role-address (`info@`), duplicate and recently contacted rows, holds Canada, Germany and Austria for consent, and guesses no address and by default reads no website: each fact in a brief is a named field of your export. With `--web` (2026-10-24, [`webfacts.mjs`](webfacts.mjs)) it also reads each account's home page title and meta description, only if the site's robots.txt allows it (longest-match Allow/Disallow, `*` and `$`; a 401/403 on robots.txt counts as closed), one request per site a second apart, same-host redirects only, no links followed; every refusal is written in the brief. `webfacts.test.mjs` runs offline against injected fetches; no live site has been read yet. Drafts go through the same `checkDraft` as reply drafts. `research.test.mjs` runs on a hand-built HubSpot-style export, not a real one yet. Section 5 of the page (added 2026-10-24) runs the same engine in the browser: paste an export, describe the profile, get the ranked briefs and two CSVs; the page test checks the wiring and that the bundled example ranks as expected. The self-host server takes the same drafts into its approval queue (`POST /api/research` with `{crm, icp?, top?}`, 2026-10-24): each becomes an outbound item (no `Re:`, no In-Reply-To), suppressed and held rows never enter, a repeat upload adds nothing, placeholders must be filled before approval, and nothing sends without an approval and a click on Send (`self-host/agent.test.mjs`, fake SMTP only). Since 2026-10-24 the reader also copes with a byte-order mark, `;` separators, a single name column, several emails in a cell, a hard-bounce column and a marketing status of unsubscribed (tests on hand-made files). HubSpot header wording (2026-10-25, 1 test): "Unsubscribed from all email" was not recognised, so an unsubscribed contact got a draft, and a separate Lead Status of Unqualified was hidden behind Lifecycle Stage; both fixed. Headers from memory, rows made up. Mautic's contact export (2026-10-27, GPL fixtures read at run time, nothing copied, rows are Mautic's made-up ones): its `title` column is the salutation (`Mrs.`) and the job is `position`, so every contact came out titled "Mrs." and could never match an ICP title; salutations are now skipped (1 test, `research.test.mjs`). The other two Mautic files read clean. Header aliases added 2026-10-27 from vendor field lists, not from a real export (HubSpot "Associated Company"; Salesforce "Mailing Country", "Billing Country", "Has Opted Out of Email"; 1 test). Self-host header read (2026-10-28, 1 assertion in `self-host/agent.test.mjs`): `Auto-Submitted: auto-notified` (RFC 5436) now counts as machine-sent like `auto-replied` and `auto-generated`; before it fell through to the word rules. A search of mail, MimeKit, mail-mime-parser and postal-mime found no further real out-of-office mail. Still open: a real HubSpot or Pipedrive export (none found in public repositories or search on 2026-10-27).

**Page section 6 (2026-10-24):** the page now runs call prep and the post-call follow-up (`prep.mjs`, `followup.mjs`) in the browser: type an email, paste call notes, get the brief or the draft; it reuses the replies, prospects, CRM export, suppression list and offer already on the page. `page.test.mjs` checks the wiring and runs both engines on a hand-made thread; both buttons were also clicked once in headless Chromium (no page errors; with an empty offer the draft is flagged fix-first, as intended).

## The one rule

> The agent may always do less on its own. It may never do more without you.

Stopping, pausing and suppressing are automatic, because getting them wrong
costs a lead, while getting the opposite wrong costs a complaint or a fine.
Anything that would contact a person is a draft with `approval:
"needs_approval"` (or `"guess_check_first"`). The code has no send path; a test
fails if one appears. An AI model on your own key works under the same rule:
`mergeTriage` lets it turn "unclear" into "unsubscribe", or "question" into
"interested" (both only draft), but never turn an unsubscribe, a no or an
away message into a drafted reply.

## Why use this instead of what you have today

| Today | Problem for a small team | Sales Agent |
|---|---|---|
| "AI SDR" products (11x, Artisan, AiSDR and similar) | Send in your name at volume, priced per seat or per contact; you learn about a misread reply after it went out | Drafts only; every outbound line is approved by you; MIT, free, self-hostable |
| Outreach, Salesloft, Apollo sequences | Reply detection stops a sequence, but sorting replies, pausing to a date and keeping consent records is still manual or a top-tier feature | Sorts, dates and records automatically, from a paste or a CLI |
| Doing it by hand in the inbox | Unsubscribes get missed in a busy week; "try me in Q1" is forgotten | Every unsubscribe the rules catch is in a file; every pause has a date |

## How well it sorts call notes

`node eval/followup.mjs` scores `followup.mjs` on 40 hand-written, labelled
one-line call notes (`eval/followup-notes-2026-10-24.jsonl`, written by an agent
who had read the regexes, so it flatters them). Before any change it got 34 of 40
(85%): it missed "He'll", "They'll", "She said she will", "They are going to"
(their promises read as recap) and "Send the sample file by Friday" and "Need to
send them the pricing" (ours; the second went to theirs). The rules were then
widened and now read all 40, so the set is a regression floor, not an accuracy
figure. Real reps' notes, with their shorthand, are still unmeasured.

## How well it reads replies

**Real delivery failures (2026-10-24).** The one real-message check so far: the
117 bounce and auto-reply messages in flufl.bounce's test data (Apache-2.0,
copied to [`eval/bounce-corpus/`](eval/bounce-corpus/NOTICE); Sendmail, Postfix,
Exim, Qmail, Yahoo, Exchange, Mail.ru and others, 2000 to 2016), run through the
same path as the IMAP poller (`node eval/bounces.mjs`). Before the change 102 of
117 were read right and three hard bounces (Sendmail "Returned mail", Dovecot
"Automatically rejected", Mail.ru in Russian) came out as out-of-office, which
pauses a dead address instead of stopping it. The rules were then changed
looking at those misses, so 116 of 117 is a tuned figure, not a fresh one; the
one left is a list-moderation hold worded "could not be delivered". Labels for
the 10 non-bounces were set by an agent reading each message. Cold-outreach
replies from people are still measured only on agent-written text.

**Five more real bounces, one bug (2026-10-24).** The mail gem's DSN fixtures (MIT,
[`eval/bounce-corpus-mail/`](eval/bounce-corpus-mail/NOTICE)) were scored before any change:
5 of 5 read right as to category. But two of them name five failed recipients each and the
reader kept only the first `Final-Recipient`, so four dead addresses would have stayed in the
cadence. `parseMessage` now collects every permanently failed recipient (`dsn.failed`) and
`toReplyBlock` emits one block per address; a test pins it on the real file.

Measured on hand-written, labelled replies; the method and every file are in
[`eval/`](eval/README.md). The rules were tuned on two sets until they read all
120 replies correctly, so those sets are a regression floor, not an accuracy
figure. A third set of 40 was written afterwards and scored once
(`node eval/run.mjs eval/fresh-2026-10-21.jsonl`):

| On the 40 fresh replies | Result |
|---|---|
| Rules named a category | 23, right on 16 (70% precision) |
| Handed to you as unclear | 17; the word model's guess right on 10 |
| Unsubscribes caught by the rules | 2 of 5 (the other 3 went to you as unclear, paused) |
| Guesses that would draft where the truth contacts less | 5 of 17 (guesses never act) |

A second fresh set of 41 (`eval/fresh-2026-10-24.jsonl`, written later, scored
once, also not tuned on) read 27 right (66%): the rules named a category for
31, right on 24 (77%); 5 of 7 unsubscribes caught (the misses were "pls remove
from ur list" and a spam threat); no guess would draft where the truth
contacts less; the word model guessed 4 of the 10 handed over. Same author
type as the first set, so read both as ranges, not as accuracy on real inboxes.

A third set of 41 (`eval/fresh-2026-10-24b.jsonl`) scored 34 right (83%) before
any change, but its author had read the other sets' misses, so it flatters the
rules. It exposed two unsubscribes the rules missed ("cease and desist", a French
opt-out); both are now caught, along with German, Spanish and Italian phrasings
(untested on real mail). Details: `eval/README.md`.

The tuning history is the finding: the first rules scored 66/72 on their own
set and 24/48 (50%) on the second; after a round of broader patterns, the
fresh set still scored 15/40 (16/40 after the later "cease" pattern). Keyword rules do not generalise to the ways
people actually write, so this milestone treats them as a floor and hands
everything else to a person. A word model trained on the 120 replies reads
26/40 of the fresh set, better than the rules, but it misreads in the
dangerous direction too (it took "we'd prefer not to receive further emails"
for an objection), so it only suggests. Whether a model on the user's key
closes the gap is the next measurement (`eval/model.mjs`, ROADMAP M2).

**Fourth set, opt-outs (2026-10-25, `eval/fresh-2026-10-25.jsonl`, 42 replies).** Written by an agent that had read the rules' pattern list, aimed at unsubscribe wording (18 of 42), scored once before any change: 25 right (60%), rules acted on 25 and were right on all 25, and only 9 of 18 opt-outs were caught. Missed: "please stop", "Leave me alone", "Strike me from your lists", "I never gave you permission... Don't write again", "unsub", "take it off whatever list you bought", and French, German and Spanish "no longer send" phrasings. An unsubscribe that is not caught is paused for a person but not added to the suppression file, so this is the legal-risk direction. Patterns were added for each; the set then reads 34 of 42 with 18 of 18 opt-outs caught and still no wrong action, so that is a tuned figure. The rest are the old gap: "Pass.", "We tried something like this before", "try Priya Rao there" and a CFO-decides objection go to a person as unclear. The patch moved the 10-21 set from 16 to 17 right (3 to 2 opt-outs missed) and changed no other set. Author-written, not real inboxes.

### Real mail clients, quote stripping (2026-10-24)

On 11 real emails from GitHub's `email_reply_parser` fixtures (MIT;
[`eval/real-threads/`](eval/real-threads/README.md)) the old quote stripper read
5 right. It dropped replies typed under the quote (a bottom-posted "please remove
me" would have vanished), kept a wrapped "On ... wrote:" line and an Outlook
`*From:*` history. All 11 read right after the fix. Not sales replies and a small
sample: a regression floor, not an accuracy figure.

### Call prep and follow-up, measured

On labelled call notes (`eval/calls.mjs`): follow-up line sorting read 32 of 44
right before tuning and 24 of 26 on a fresh set; prep field detection found
about 61% of the fields mentioned in 20 fresh notes (precision 85%) and 48%
(precision 88%) in the first 30 before tuning. Misses are paraphrase; false
matches are rare. The brief says a "known" field may be a false match, so read
the quote. Notes are agent-written, not real calls.

## Use it

- **Page:** paste replies (each starting `From:`, or separated by `---`), and
  optionally your prospect CSV and suppression list. Download the updated
  prospects, the suppression additions, Deal Keeper rows, your tasks and the
  approved drafts.
- **CLI:** `node cli.mjs --replies replies.txt --prospects prospects.csv
  --suppression suppression.txt --offer offer.json --out out/` writes
  `queue.json`, `prospects.csv`, `suppression-add.csv`, `deals.csv` and
  `tasks.csv`. Set `LLM_PROVIDER`/`LLM_MODEL`/`LLM_API_KEY` (or
  `ANTHROPIC_API_KEY` etc., or `LLM_PROVIDER=ollama`) to add a model.
- **Agents:** `node platform/agents/tools.mjs call sales-agent runInbox
  --input '{"replies":"From: a@x.example\nPlease remove me.","today":"2026-10-21"}'`,
  or `call_tool` on the repository's MCP server.
- **Library:** `runInbox({ replies, prospects, suppression, offer, today })`
  returns `{ items, prospects, suppression, deals, tasks, summary }`.
  `runDaily({ tasks, prospects, suppression, done, today })` (in `daily.mjs`)
  returns `{ queue, held, dropped, stale, summary, brief }`; `runMorning` runs
  the inbox first, then the daily run.
- **Daily run, CLI:** `node cli.mjs --tasks cadence-tasks.csv [--replies replies.txt]
  [--prospects p.csv] [--suppression s.txt] [--done done.txt] --out out/` also
  writes `todays-queue.csv`, `left-out.csv` and `brief.md`.

## Files

- `engine.mjs`: reply parsing (headers, quoted history, signatures), date
  finding, the triage rules, the policy per category, draft templates that
  state only what the user typed, and `checkDraft` (no number absent from the
  offer or their reply, no guarantees or fake urgency, no unfilled
  placeholder, an opt-out line).
- `learn.mjs` + `model.mjs`: the naive Bayes second opinion; `node learn.mjs
  --write` rebuilds `model.mjs` from `eval/replies.jsonl` and
  `eval/heldout.jsonl` (a test checks they match).
- `ai.mjs` + `byok.mjs`: model triage and draft polish on the user's own key;
  `byok.mjs` is a synced copy of `platform/llm/byok.mjs`.
- `daily.mjs`: the daily run (M3); `daily.test.mjs` builds its task lists with
  the real cadence builder.
- `eval/`: the labelled sets, `run.mjs` (rules and guesses) and `model.mjs`
  (a model, on your key).
- `cli.mjs`, `index.html`, `usage.mjs` (local-only counters with an opt-out).

`node --test` runs the suite.

**Limits.** English only. Reads one reply at a time, not a thread. Dates are
read in US order for `3/4`. It does not connect to a mailbox yet (ROADMAP M4),
so replies are pasted or exported.

**No warranty.** Free and as-is; not legal or sales-compliance advice. You are
responsible for honouring every opt-out, including ones this tool misses, and
for CAN-SPAM, GDPR/PECR, CASL and TCPA in your own outreach.

**Privacy.** The page runs in your browser and uploads nothing. With a model
key, each reply and draft goes from your browser to the provider you chose.
