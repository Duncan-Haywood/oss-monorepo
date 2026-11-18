# Advertising the free custom dev shop to businesses

Paste-ready copy for telling businesses about
[open custom development](https://marisstella.app/custom-development/)
(owner, 2026-11-02: "I want to advertise to businesses more for automated
custom dev shop"; tagline: "describe your problem and it gets built").

Posting under the portfolio's name, or sending messages as the owner, is the
owner's job (`prompts/goals.md`, "Guardrails"). This file supplies the words;
nothing here posts by itself. Every link carries a `?ref=` tag from the counter's
closed list (`REFS` in `platform/counter/core.mjs`; an unlisted tag is
dropped), so a visit can be told apart from the rest of the site's traffic.

## What the copy may and may not say

Backed by a file, so fine to say:

- Free: no fee, no card (`portfolio/requests/README.md`).
- Built in public by AI agents, every change a pull request.
- The one condition: the result is MIT licensed, held by the repository owner
  (owner, 2026-10-30).
- Built this way so far: an AI bookkeeper, a wall framing takeoff and a sales
  agent (`portfolio/requests/requests.json`, R-0001 to R-0003). Their READMEs
  say what is tested and what is not; quote no further than that.

Never say (nothing backs it): a delivery date, "guaranteed", a number of
businesses served, testimonials, "trusted by", or that the result is
exclusive or private. Usage is unmeasured (`portfolio/usage/usage.yaml`).

## LinkedIn (company page post)

> **Describe your problem and it gets built.**
>
> Most small businesses have one job that no off-the-shelf tool does quite
> right: the quote that takes an hour, the spreadsheet someone fixes by hand
> every Friday, the check that keeps getting missed.
>
> At Maris Stella Labs, AI agents build software in public. Tell us that
> problem and, if we take it on, they build the tool for you, free. You can
> follow every step on a public page.
>
> The one condition: what is built stays open source (MIT licence), so anyone
> can use it, including you, commercially. There is no promised date, and not
> every request is accepted.
>
> Describe yours: https://marisstella.app/custom-development/?ref=linkedin

## Short post (Bluesky, Mastodon, X)

> Describe your business's problem and AI agents build the tool, free and in
> public. One condition: it stays MIT licensed.
> https://marisstella.app/custom-development/?ref=bluesky

(Under 280 characters. Swap the tag for `mastodon` or `x` on those sites. On X, the account must be labelled as automated if a
bot posts it; `portfolio/distribution/README.md`.)

## One-to-one note to a business you know

For a business the owner has a real connection to (a customer, a supplier, a
contact who mentioned a problem). Not for bought or scraped lists, and not
sent in bulk.

> Subject: A free tool for [the problem they mentioned]?
>
> Hi [name],
>
> You mentioned [the problem]. I run Maris Stella Labs, where AI agents build
> software in public. If you describe the problem on this page, we may build a
> tool for it, free:
> https://marisstella.app/custom-development/?ref=email
>
> The catch, stated up front: it is published as open source, so others can
> use it too. No date is promised. If this isn't useful, ignore it and I won't
> follow up.
>
> [owner's name]

## Communities

Many business forums (for example r/smallbusiness) forbid self-promotion
outside set threads. Read the community's rules on the day and post only where
they allow it, such as a weekly promotion thread. Show HN fits the "built in
public by agents" angle better than the offer itself; link the page and the
repository.

## Measuring it

Count `ref:<tag>` visits to `custom-development/` in the page counter
(`platform/counter/README.md`), and new entries in `portfolio/requests/requests.json` by `received`
date. A post worked if requests arrive, not if the page got views.
