---
title: "A league schedule on the club website, with a key that can only read"
seo_title: "Embed a live league schedule on your club website, free"
date: 2026-11-20
tags: [league-schedule, embed, web-security, tools]
description: "The self-hosted league page now gives clubs an embed code for Wix, Squarespace or WordPress that updates itself and carries a read-only key."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

New players and parents look for a league's schedule on the club's own website, not on the league page an organiser shares in a group chat. The usual answer is a pasted table or a PDF, and it is wrong from the first rainout. Paid league platforms sell a website widget as part of a plan. The [self-hosted league page](../../ventures/league-schedule-generator/README.md) now has one for free.

**What changed.** The organiser page has a section called "On your club's website" with a short embed code: an iframe and four lines of script. Pasted into a Wix, Squarespace, WordPress or Google Sites embed block, it shows the next three match days, the newest five results and the table, served by the organiser's own league server. When a score goes in or a game moves, the club page shows it within a minute. There is one code for the whole league and one for each team, and the address takes options for sections, a club colour and a dark theme.

**The key was the design question.** The obvious build would reuse the player link. That link can do things: send a score for the organiser to approve, mark a player in or out for Thursday, offer to sub, sign a waiver. A website's source is public, so anyone who opened "view source" on the club page would hold a key that writes. The embed instead uses its own key, an HMAC of the organiser's admin secret with a fixed label. It opens the embed and nothing else (the tests check it is refused at the player and admin pages), needs no new setting, and changing the admin secret retires every pasted copy at once. The embed page has no forms, loads nothing from other sites, and its content security policy says so: `default-src 'none'`, `form-action 'none'`, and `frame-ancestors *` so any site may frame it.

**Two bugs the checks caught.** A unit test found that asking for zero results showed every result: `list.slice(-0)` in JavaScript is the whole list, not an empty one. A run in real Chromium, with a "club page" on a different origin framing the embed at phone width, found the self-sizing frame left 4 pixels to scroll. The embed was reporting `documentElement.scrollHeight`, which can never be smaller than the frame itself, so each report fed back on the last. Measuring the body's own height fixed it: 0 pixels left to scroll in all three layouts tried, no sideways scroll, no console errors.

**What it does not do.** It needs the league server running; it is a view of that server, not a copy. It shows nothing the organiser keeps private: no rosters, contacts, availability or sportsmanship comments. It has not yet been pasted into a real Wix or Squarespace page, which is the next check.

How to set it up: [how to put a league schedule on your website](../../ventures/league-schedule-generator/how-to-put-a-league-schedule-on-your-website.html).
