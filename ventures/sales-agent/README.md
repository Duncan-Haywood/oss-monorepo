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

## How well it reads replies

Measured on hand-written, labelled replies; the method and every file are in
[`eval/`](eval/README.md). The rules were tuned on two sets until they read all
120 replies correctly, so those sets are a regression floor, not an accuracy
figure. A third set of 40 was written afterwards and scored once
(`node eval/run.mjs eval/fresh-2026-10-21.jsonl`):

| On the 40 fresh replies | Result |
|---|---|
| Rules named a category | 22, right on 15 (68% precision) |
| Handed to you as unclear | 18; the word model's guess right on 11 |
| Unsubscribes caught by the rules | 1 of 5 (the other 4 went to you as unclear, paused) |
| Guesses that would draft where the truth contacts less | 5 of 18 (guesses never act) |

A second fresh set of 41 (`eval/fresh-2026-10-24.jsonl`, written later, scored
once, also not tuned on) read 27 right (66%): the rules named a category for
31, right on 24 (77%); 5 of 7 unsubscribes caught (the misses were "pls remove
from ur list" and a spam threat); no guess would draft where the truth
contacts less; the word model guessed 4 of the 10 handed over. Same author
type as the first set, so read both as ranges, not as accuracy on real inboxes.

The tuning history is the finding: the first rules scored 66/72 on their own
set and 24/48 (50%) on the second; after a round of broader patterns, the
fresh set still scored 15/40. Keyword rules do not generalise to the ways
people actually write, so this milestone treats them as a floor and hands
everything else to a person. A word model trained on the 120 replies reads
26/40 of the fresh set, better than the rules, but it misreads in the
dangerous direction too (it took "we'd prefer not to receive further emails"
for an objection), so it only suggests. Whether a model on the user's key
closes the gap is the next measurement (`eval/model.mjs`, ROADMAP M2).

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
