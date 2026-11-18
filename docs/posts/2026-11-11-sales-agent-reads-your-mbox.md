---
title: "Drop your mailbox export on the page: 32,211 real emails, and the bug they found"
seo_title: "Triage cold-email replies from a Gmail or Thunderbird mbox"
date: 2026-11-11
tags: [sales-agent, product, evaluation]
description: "Sales Agent now opens .eml and .mbox exports in the browser, nothing uploaded. A 90 MB mbox of real Enron mail also turned up a crash and a bounce bug."
---

[Sales Agent](https://marisstella.app/sales-agent/) reads the replies your cold outreach gets back and does the bookkeeping. It suppresses unsubscribes, pauses out-of-office and "try me next quarter" replies until the date they give, and drafts answers for you to approve. Until today there were two ways in. You could paste replies into a text box one at a time, or run the self-host server against your mailbox over IMAP. Pasting is tedious, and running a server is a lot to ask before you know whether the tool is any use.

So the page now opens mail files. Drop in `.eml` files, or the `.mbox` you get from Google Takeout, Thunderbird or Apple Mail's "Export Mailbox". The file is streamed from your disk and parsed in the browser, and nothing is uploaded. The page keeps replies, which it recognises by an `In-Reply-To` or `References` header or a reply prefix such as `Re:`, `AW:` or `SV:`. It also keeps delivery failures and auto-replies. It leaves out your own sent mail, newsletters and duplicates, and says how many of each it dropped. The CLI does the same with `--mail inbox.mbox`.

## One reader, not two

The self-host server already had a small MIME reader for IMAP. It handled multipart, quoted-printable, base64, encoded headers and delivery-status reports. But it used Node's `Buffer`, so the page couldn't import it. Writing a second reader for the browser would have meant two readers that slowly drift apart. Instead the reader moved into its own module with no Node built-ins, and the server and page now share it.

Moving code like that is safe only if the output doesn't change. We checked that on real mail: 32,211 messages from the public Enron corpus, each read as latin1 and as UTF-8, through the old reader and the new one. There were 0 differences.

## Does a file read the same as a mailbox?

Next we wrote all 32,211 messages into one 90 MB mbox, read it back through the file path, and compared every reply with the server's own reading of the same message. 32,210 came out identical. The one that differed was a newsletter whose body ended in a line of dashes. The pasted format uses that line as a separator, so the file path drops it, and the reply still lands in the same category. In headless Chromium the page read the whole file and sorted its 9,588 replies in 17 seconds.

## What 9,588 real replies found

The first run on all of those replies didn't finish. It crashed.

Earlier today another run retrained the word model that guesses at replies the rules can't read, using every labelled set. One of those 792 training replies carried the label `wrong_person`. The engine has no such category: it files those replies as "left / wrong person". So the model learned an eleventh class, and whenever it guessed that class, the code looking up the category's label threw an error and the whole page run failed. Hand-written test sets never hit it. Real mail hit it within the first few hundred replies. The training script now maps that label to the engine's category and drops any label the engine doesn't know. The engine also ignores a guess outside its list. The fair, leave-one-set-out score is unchanged at 28 of 57.

Building the file path turned up a second bug, this time in the server. It read each message as one reply block. When a delivery failure lists several dead addresses, the reader writes one block per address, and the server kept only the first. On a real five-address bounce, four dead addresses stayed active. It now stops all five. The new test fails on the old code with 2 items instead of 6.

## What isn't known yet

We haven't yet opened a real Takeout or Thunderbird export. The splitter follows the mboxrd format and reads Gmail's label header, but formats in the wild vary. The Enron mail is internal business mail, not replies to sales outreach, so it tests the reading, not the sorting. If you try it on your own export and something reads wrong, the page shows exactly what it kept and dropped.

Code and numbers: `ventures/sales-agent/mailfile.mjs`, `mime.mjs`, `eval/mailfile-enron.mjs`, and the README section "Open your exported mail".
