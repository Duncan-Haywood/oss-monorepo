---
title: "Babysitting references where the referee ticks the consent box, not the sitter"
date: 2026-10-30
tags: [babysitting-business-kit, consent, references]
description: "A private link per reference, two consents stored with exact wording and time, withdrawal by the same link, and a packet listing only people who said yes."
---

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) already kept a yes/no per reference for "may this quote go on your website". The sitter set it. That is fine when a parent said yes in a text, but it leaves no record of what the parent actually agreed to, and nothing stops a stale copy of the data from turning a "no" back into a "yes".

This change moves the answer to the person giving the reference.

**A private link per reference.** In the References tab the sitter clicks "Make a private link" and texts it. The link (`/ref/<token>` on the sitter's own self-hosted server) is 24 random URL-safe characters (18 random bytes), works for 30 days and accepts one answer. The referee writes their own words, says how they know the sitter and for how long, and ticks two separate boxes:

- *New families may contact me.*
- *My words may appear on the website, as first name and last initial.*

Each box is stored as its own log entry with the time and the full sentence shown, including the exact signature the website will use ("Teresa T."). Ticking "website" with no words publishes nothing. A filled honeypot field is thanked and dropped; a body over 16 KB gets a 413; any field over its limit (1,500 characters for the words) gets a 400 and nothing is stored. The page sends a strict content security policy and escapes everything it echoes.

**Withdrawal is as easy as consent.** Opening the same link after answering shows only a withdraw form, never the words or contact details already sent, so a forwarded link exposes nothing. Withdrawing the website consent takes the quote off the site at the next build. The rule that matters most: once a referee withdraws, the sitter cannot re-tick that box in the app; only a new answer from the referee can turn it back on. A test checks that.

**Sync does not undo anything.** The app pushes its whole desk to the server. If a referee answered or withdrew in the meantime, the server merges the consent logs entry by entry before it accepts the push, and recomputes each consent from the merged log. The test pushes a stale copy that still says "yes, publish" after a withdrawal; the result is "no".

**A reference packet for a new family.** One button downloads a printable page with the sitter's certifications and only the people who agreed to be contacted: name, relationship, how long, the phone or email they chose, and their words only if they also agreed to those being shown. In the test desk of five references, the packet lists two. The three left out are someone who never answered, someone who said no to both, and someone with a quote but no consent on file, and the test checks that none of their names, numbers or words appear, nor any link token.

**Templates and a stopping point.** Request messages differ for a parent, a teacher, a church leader, a coach and an employer (a teacher or coach is asked about character and reliability, since they have not seen the sitter babysit), and every one says that a yes to one question is not a yes to the other. Follow-ups go out at day 5 and day 12, and then the app says to let it go.

The leak test runs the real server and fetches every public route (`/`, `/site`, valid, unknown and empty `/ref/` paths, `/references.mjs`, and `/api/desk` without the key), looking for six marker strings that belong to references without consent. None appears. The suite for the venture is now 52 tests, 9 of them for this module.

Limits: the link needs the optional server; without it the sitter still records consent by hand, logged as sitter-recorded. The sitter's phone alert says only who answered and which boxes they ticked, not their words or contact, because a free ntfy topic is not private.
