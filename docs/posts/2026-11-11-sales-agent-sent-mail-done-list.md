---
title: "Your sent folder already knows which follow-ups you made"
seo_title: "Stop double-sending cold email follow-ups: read your sent mail"
date: 2026-11-11
tags: [sales-agent, cold-email, evaluation]
description: "Sales Agent now reads your sent mail from a Takeout or Thunderbird export, so follow-ups you already sent are not queued again. Checked on 7,836 real emails."
---

[Sales Agent](https://marisstella.app/sales-agent/) builds a daily queue from a cadence plan: who gets an email today, who gets a call, who gets left out because they unsubscribed, bounced or replied. It never sends anything. You send, by hand or from your own tool.

That left a gap. The queue only knew a touch was made if you typed `email,step` into a "done" box. Send ten emails on Monday, forget the box, and Tuesday's queue offers the same ten again. A second copy of a cold email is the quickest way to look careless, and it also annoys the recipient.

## The fix: your sent mail is the list

The page and the CLI already open exported mail (a Gmail Takeout `.mbox`, a Thunderbird folder, `.eml` files) to read replies. Your own messages in that file used to be dropped. Now they are kept as date, recipients and subject, and the daily run uses them two ways:

- **Same subject, same person:** the step is done. `Re:`, `Fwd:` and case are ignored, and so is the date, so an email sent a day early still counts. The step appears in `left-out.csv` as "already sent", with the date.
- **Another subject, same person, that week:** the due step is held, not dropped. If you emailed them "The pricing sheet you asked for" yesterday, a person should decide whether today's "A question about route planning" still makes sense.

Calls and LinkedIn steps are never read from mail. Nothing is uploaded: the page reads the file in your browser.

## Checked on real sent mail

There is no public set of real sales reps' sent folders matched to their cadences, so we can't yet score the subject matching. What we could check is the part underneath it: are the recipients read correctly?

We took the 7,836 Enron messages filed in "sent" folders (half the corpus we already use for reply rules) and compared what our reader recorded with Python's own `email` package:

| | same recipients | same day |
|---|---|---|
| first run | 7,745 of 7,836 | 7,836 |
| after the fix | 7,801 of 7,836 | 7,836 |

The first run found a real bug. Our address pattern did not allow an apostrophe, so `o'neal.winfree@enron.com` was read as `neal.winfree@enron.com`. Anyone named O'Neal, O'Connell or O'Day would have had their sent step missed and queued again. The 35 that still differ are addresses the corpus itself damaged, like `'fricke@enron.com` and `moore'.'charlie@enron.com`, which neither reader can get right.

## Try it

On the [page](https://marisstella.app/sales-agent/), open your mailbox export in step 1, paste the cadence task list in step 4, and build the queue. From the command line:

```
node cli.mjs --mail "All mail.mbox" --tasks cadence-tasks.csv --out out/
```

Thunderbird keeps sent mail in its own file, so pass both, plus your address: `--mail Inbox,Sent --own you@company.com`. The code, the tests and the Enron check (`eval/sent-enron.mjs`) are in [the repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/sales-agent).
