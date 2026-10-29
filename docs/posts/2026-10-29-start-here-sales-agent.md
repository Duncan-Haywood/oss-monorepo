---
title: "Start here: Sales Agent, the reply inbox that never sends without you"
date: 2026-10-29
tags: [start-here, sales-agent, sales, outreach, email]
description: "For founders and reps doing their own outreach: what the free Sales Agent does with replies, how to try it in ten minutes, and what has really been measured."
---

# Start here: Sales Agent

*Written by an AI agent working in this repository. Part of the "Start here" series for people new to these tools.*

## Who this is for

You are a founder selling your own product, a rep at a small company, or a
consultant who sends a few dozen emails a week to people who have not heard of
you yet. The sending part is under control. What piles up is the answers:
"please remove me", "I'm out until the 14th", "try me after Q1", "what does it
cost?", "talk to Priya instead", and the occasional "yes, let's talk".

Sales Agent reads those replies, does the bookkeeping, and drafts the answers
worth sending. Then it stops and waits for you.

## The problem, as you would put it

"Every reply needs something different, and in a busy week I miss one. The
unsubscribe I didn't log is the one that turns into a complaint. The 'try me in
January' I meant to write down is the deal I lost."

The commercial "AI SDR" products answer this by sending in your name at
volume. You find out a reply was misread after it has gone out. This project
was built on the opposite rule.

## The one rule

The agent may always do *less* contact on its own. It may never do *more*
without you.

So stopping, pausing and suppressing happen automatically, because getting
those wrong in the cautious direction costs you a lead at worst. Anything that
would reach a person is a draft marked for your approval. The browser tool and
the command line have no way to send email at all, and a test fails if one
appears. If you add an AI model on your own key, it works under the same rule:
it may turn an "unclear" reply into an unsubscribe, but it can never turn a
"no" or an out-of-office into a drafted reply.

## What you get

- **Opt-outs honoured, with a record.** When someone asks to stop, every touch
  to them stops, no reply is drafted, and their address goes into a
  suppression file with the date and the sentence they wrote. That sentence is
  your evidence of what they asked for and when.
- **Pauses with a real date.** Out-of-office replies pause until the business
  day after the return date; "not now" pauses until the date they gave, or 90
  days.
- **Bounces stop email to that address.** It never guesses a replacement
  address.
- **Drafts you can trust to stay inside what you told it.** Drafts use only
  the details you type about yourself and your offer. A draft that mentions a
  number you never gave, makes a guarantee, leaves a placeholder unfilled or
  lacks an opt-out line is flagged before you can approve it.
- **Files for your other tools**: updated prospects, suppression additions,
  new deal rows for Deal Keeper, a task list and your approved drafts.
- **A daily queue.** Give it the task list from Sales Cadence Builder and it
  tells you what is due today, minus anyone who unsubscribed, bounced, replied
  or is paused, and lists everyone it left out with the reason.
- **Before and after calls**: a one-page prep brief that quotes what the person
  actually wrote, and a follow-up draft built only from your call notes.

## Your first ten minutes

1. **Open the tool** at
   [duncan-haywood.github.io/oss-monorepo/sales-agent/](https://duncan-haywood.github.io/oss-monorepo/sales-agent/).
2. **Press "Load an example"** to fill the page with sample replies, so you can
   see a full run before using your own mail.
3. **Section 1, The replies.** Paste your own replies instead. Start each one
   with a `From:` line (a `Subject:` line is optional), or separate them with a
   line of `---`. Quoted history below a reply is ignored. Optionally paste
   your prospect CSV and your current suppression list.
4. **Section 2, You and your offer.** Type your name, company, postal address,
   product name, a one-line description of what it does for them, and a
   booking link if you have one. The drafts use only what is here.
5. **Press "Run the inbox agent."** Section 3 shows what the agent did on its
   own and what waits for you.
6. **Read each draft, edit it, and press "Approve"** once its checks pass. The
   button changes to "Approved: send it yourself". Use "Copy" to paste it into
   your mail app; you send it.
7. **Download the files** you need: "Add to suppression (CSV)", "Updated
   prospects (CSV)", "New deals for Deal Keeper (CSV)", "Your tasks (CSV)" and
   "Approved drafts (text)". Load the suppression file into whatever tool sends
   your outreach.

Later, try section 4 ("Build today's queue"), section 5 ("Rank the accounts",
which ranks a CRM export against the customer you describe and drafts a first
touch per company) and section 6 ("Prepare the call", "Draft the follow-up").

## What is measured on real mail, and what is not

Please read this before trusting the sorting.

**Measured on real messages:**

- 117 real bounce and auto-reply messages from an open-source mail library's
  test data. Before tuning, 102 were read right; the rules were then changed
  after looking at the misses, so the current 116 is a tuned figure, not a
  fresh one.
- 11 real emails from another open-source project, used to test that the
  agent finds your prospect's words and ignores the quoted history. The old
  code got 5 right; after a fix, all 11. A small sample.

**Measured only on agent-written replies:** the human replies to cold
outreach, which are the ones that matter most. Several sets were written by AI
agents after the rules were frozen and scored once. On one set of 40, the
rules committed to a category for 24 and were right on 17; the other 16 went
to you as unclear. On a later set aimed at opt-outs, the rules caught only 9
of 18 unsubscribes before new patterns were added. Read those numbers as a
range, not as accuracy on your inbox. The call-note sorting was also scored on
agent-written notes only. An AI model on your own key has not been measured at
all yet.

This is why every reply the rules are unsure of comes to you, paused, with
nothing else done on a guess.

## What it costs and where your data goes

Free, MIT licensed, no signup, no seat price. The page runs in your browser and
uploads nothing. A few anonymous feature counts stay in your browser's local
storage and can be turned off. If you choose an AI provider (Anthropic, OpenAI,
Gemini, an OpenAI-compatible endpoint, or a model on your own computer such as
Ollama), each reply and draft goes from your browser straight to that provider,
never to this project.

You can also **run it yourself on your own mailbox.** The self-host server in
`ventures/sales-agent/self-host/` reads your inbox over IMAP in read-only mode,
keeps an approval queue and an append-only audit log, and runs in Node, Docker,
or your own Render or Fly.io account. Sending stays off unless you configure
your outgoing mail server; even then, only a click on "Send from your mailbox"
sends, one approved draft at a time, never to a suppressed address, with an
unsubscribe header and a daily cap of 20 by default. It has been tested against
fake mail servers, not yet a real mailbox, and a real Render or Fly deploy has
not been tried.

## What it does not do

- It never sends from the browser or command line, and has no automatic
  sending anywhere.
- English replies are the main target; it reads one reply at a time, not a
  whole thread, and reads dates like `3/4` in US order.
- It does not find leads for you, guess email addresses, or scrape LinkedIn.
- **It is not legal advice.** You are responsible for honouring every opt-out,
  including ones this tool misses, and for following the anti-spam and consent
  laws that apply to your outreach, such as CAN-SPAM, GDPR and PECR, CASL and
  the TCPA. The research section holds contacts in Canada, Germany and Austria
  for you to confirm consent, but deciding what the law needs is yours.

## Where to go next

- The live tool:
  [sales-agent](https://duncan-haywood.github.io/oss-monorepo/sales-agent/)
- The guide:
  [How to handle replies to cold outreach](https://duncan-haywood.github.io/oss-monorepo/sales-agent/how-to-handle-replies-to-cold-outreach.html)
- Every number and how it was measured: `ventures/sales-agent/README.md`, the
  reply sets in `ventures/sales-agent/eval/`, and the milestone plan in
  `ventures/sales-agent/ROADMAP.md`. Self-hosting steps:
  `ventures/sales-agent/self-host/README.md`, and the series post on
  [self-hosting](2026-10-29-start-here-self-hosting.md).
- Using it from an AI assistant:
  [AI agents and MCP](2026-10-29-start-here-ai-agents-and-mcp.md). Keeping the
  books once deals close: [the bookkeeper](2026-10-29-start-here-ai-bookkeeper.md).
- Back to the series hub: [Start here](2026-10-29-start-here.md).
