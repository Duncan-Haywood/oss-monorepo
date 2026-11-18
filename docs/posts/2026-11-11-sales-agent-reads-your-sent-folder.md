---
title: "Our sales agent now checks your Sent folder before it tells you who to email"
seo_title: "Reading the IMAP Sent folder as a sales cadence's done list"
date: 2026-11-11
tags: [sales-agent, imap, self-host]
description: "The self-hosted Sales Agent reads five header fields from your Sent folder, so today's queue drops emails you already sent. And IMAP refuses Node's \"Sept\"."
---

[Sales Agent](https://marisstella.app/sales-agent/) answers one question each morning: who do I contact today? It starts from a cadence (Sales Cadence Builder's task list), then drops anyone who asked to stop, bounced, replied or is on your suppression list. Earlier today it learned to treat your sent mail as the done list. If you already emailed Dana step 1, step 1 drops out of the queue.

That only worked with an exported mail file, though. If you ran the self-hosted server against your live mailbox, you still had to export your mail each morning or type `email,step` lines by hand. Now the server reads your Sent folder on every poll.

## What it reads, and what it doesn't

The server already polls your inbox read-only: `EXAMINE` rather than `SELECT`, and `BODY.PEEK` so nothing gets marked as read. After the inbox, the same connection now:

1. Runs `LIST` and picks the folder carrying the RFC 6154 `\Sent` attribute. That covers Gmail's `[Gmail]/Sent Mail`, Outlook's `Sent Items` and localised names like `Gesendete Elemente`. A server that doesn't send the attribute gets matched on the usual names (`Sent`, `INBOX.Sent`, ...), and you can set `SENT_BOX` to name the folder yourself or turn the read off.
2. Fetches five header fields per message (`Date`, `To`, `Cc`, `Subject`, `Message-ID`) and never a body.
3. Remembers the last UID it read, so the next poll fetches only new mail. If the folder's `UIDVALIDITY` changes, the old UIDs no longer point at the same messages, so it starts the read again.

Recipients come from the same function the mail-file reader uses. That reader matched Python's `email` package on 7,801 of 7,836 real Enron sent messages, and the server now gets the same result. Drafts the agent sent itself also count, so a first touch approved and sent from its own queue doesn't come back the next day.

The approval page has a new **Today's queue** section. You paste the cadence task list once and the server keeps it. Press the button and you get the brief, plus `queue.csv` and `left-out.csv`, where every step left out has a reason ("in your sent mail on 2026-10-26"). Nothing is sent from that section.

## A bug that would have hit every September

The first poll's search uses an IMAP date: `SINCE 13-Sep-2026`. The server built it with `toLocaleDateString("en-GB", { month: "short" })`. In current Node, that gives `Sept` for September, so for a whole month every new install would have sent `SINCE 13-Sept-2026`, and RFC 3501 servers reject that date. One helper now builds the date for both the inbox and the Sent folder, and a test runs the clock in September to pin it.

## What is and isn't known

All seven new tests run against an in-memory IMAP server with a real Sales Cadence Builder plan. No real Gmail or Microsoft 365 mailbox has been read yet. Matching on subject hasn't been tried against a real rep's cadence either. Calls and LinkedIn touches never appear in mail, so for those you still type the done lines. A **Done** button for them is next on the list.

The code is MIT-licensed, under [`ventures/sales-agent/self-host`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/sales-agent/self-host), and you run it on your own mailbox.
