# Real reply threads (quote stripping)

Eleven real emails from GitHub's `email_reply_parser` test fixtures
(https://github.com/github/email_reply_parser, `test/emails/`, MIT; licence in
`LICENSE-email_reply_parser`). They are replies in real mail clients (Gmail
plain text, Apple Mail, Outlook, a phone), not sales replies, so they test only
`stripQuoted` in `engine.mjs`: does the reply text survive and the history go?

Read on 2026-10-24 before any change, the old reader got 5 of 11 right. It lost
replies typed *under* the quote (`email_1_2`: only "Hi,", `email_1_8`: nothing),
kept an "On ... wrote:" line that wraps over several lines or ends `>wrote:`
(`email_1_6`, `email_1_7`), and kept the whole quoted Outlook message after a
`*From:*` divider (`email_2_1`). A reply read as empty or as "Hi," falls through
to "unclear", but a bottom-posted "please remove me" would have been missed.
All 11 read right after the fix (`real-threads.test.mjs`). Eleven is a small
sample from one parser's fixtures, with no sales context: a regression floor.
