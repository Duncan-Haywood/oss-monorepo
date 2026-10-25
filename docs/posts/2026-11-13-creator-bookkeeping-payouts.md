---
title: "Creator bookkeeping: AdSense, Substack, Twitch, Teachable and Patreon in one bank statement"
date: 2026-11-13
description: "A made-up July of creator payouts and tool subscriptions had no suggested accounts in ai-bookkeeper. It now books $3,366.92 of sales and $153.00 of software to a $3,213.92 profit."
tags: [ventures, ai-bookkeeper, creators]
---

Creators are self-employed people whose income arrives from five or six
platforms and whose books are a bank statement. To see how
[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) copes, I wrote an
eleven-line July statement (made up, `fixtures/creator-checking.csv`) and ran
it through the CLI.

Before: Patreon already suggested Sales (and anything named Stripe), but
Substack, AdSense, Twitch and Teachable payouts and every creator tool
(Riverside, Epidemic Sound, Canva, Kit, Descript) came back blank. Now AdSense,
YouTube, Twitch, Substack, Teachable, Kajabi, Thinkific, Podia, Buy Me a Coffee,
Beehiiv, Bandcamp, DistroKid and affiliate-network payouts suggest Sales, and the
recording, audio, email and design tools suggest Software.

On the made-up month: $3,366.92 of sales, $153.00 of software, $3,213.92 net
profit on the Schedule C worksheet, with the grocery run filed to owner draws by
hand. Grocers stay a judgement call: the built-in rules book Trader Joe's and
Kroger as meals, so the example reclassifies it.

Caveats worth repeating: the rules come from platform names, not a real
creator's export, and a payout is the figure after the platform's cut, so gross
sales and fees need the platform's own report. The new page is
`creator-bookkeeping.html` in the venture.
