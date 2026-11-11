---
title: "The From line that splits your mailbox: reading real Gmail and Thunderbird exports"
seo_title: "Why an mbox file splits a message in two at a line starting with From"
date: 2026-11-11
tags: [sales-agent, mbox, email, gmail-takeout, thunderbird, parsing]
description: "We ran the sales agent's mail-file reader on eleven mbox files people published on GitHub. Two corners were wrong, and Python's mailbox module gets both wrong too."
---

The [sales agent](../../ventures/sales-agent/README.md) can open an exported
mailbox (an `.mbox` from Gmail Takeout or Thunderbird) in the browser and sort the
replies, without uploading anything. Until today it had only been checked on a
mailbox we wrote ourselves from the Enron corpus. So we searched GitHub for
`.mbox` files holding Gmail's `X-Gmail-Labels` header or Thunderbird's
`X-Mozilla-Status`, and ran the reader on eleven of them: four real exports and
seven test fixtures from other people's mail tools. We kept only counts, never
message text, and left out one personal mailbox someone seems to have pushed by
mistake.

## What already worked

Every file split into the right number of messages except one. Takeout's
envelope lines (`From 1512584914615853097@xxx Thu Sep 17 ...`), Thunderbird's
(`From - Thu Feb 23 19:37:30 2017`), Windows line endings and inline replies
written under the quoted text all came through as they should.

## Corner one: a body line that starts with "From "

An mbox file is just messages one after another, each opened by a line that
starts with `From `. A body line that starts the same way, say "From a security
standpoint, ...", is meant to be written as `>From a security standpoint`. Not
every exporter does that. One fixture didn't, and the reader cut that message in
two: 107 messages for 105, with the second half looking like a new message with no
sender. Python's standard `mailbox` module splits the same file the same way.

The fix: a `From ` line only opens a message when the line after it is a header
(`X-GM-THRID: ...`, `Return-Path: ...`) or the line itself reads as an envelope,
meaning a token and then a date. To see how often this matters, we wrote all 32,211
Enron messages into one mbox with no escaping. 139 of them hold such a line (157
lines in all), so a naive split cuts all 139. Our first version still cut 7,
every one a newsletter where a line like "From the Editor BY JAMES TARANTO" was
followed by a URL, and `http:` looks like a header name. Once a header needed a
space after the colon, there were no extra splits, and the result was the same as
for the escaped file.

## Corner two: a boundary that isn't there

A multipart message names its boundary in the header, and the body is cut at that
string. One real Takeout message names `=_144278-1527-31`, but its body uses
`=_1442425378-1527-31`. That might be damage from someone redacting the file by
hand. The reader, like Python's `email` module, found no parts and read no
text. Now, when the named boundary never shows up in the body, it uses the first
`--` line followed by a part header instead. Messages whose boundary does show up
are read exactly as before.

## What it still can't tell you

Eleven public files are not a survey of real inboxes. We found no public Apple Mail
export and no `Content-Length`-delimited mboxcl2 file, and the counts above are all
we looked at. The script is `node ventures/sales-agent/eval/mailfile-public.mjs`,
and the full table is in the sales agent's
[eval notes](../../ventures/sales-agent/eval/README.md), under "Public mbox files".
