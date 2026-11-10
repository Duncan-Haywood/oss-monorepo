---
title: "Should a bookkeeping guess that has been wrong stop guessing? Seven labelled sets say: not yet"
seo_title: "New-payee transaction categorization: a track-record gate, measured"
description: "ai-bookkeeper tried withholding new-payee guesses with a poor record. Across seven labelled sets it removed about one right answer per wrong one."
tags: [bookkeeping, categorization, open-source, machine-learning, negative-result]
date: 2026-11-10
---

The ai-bookkeeper has a weak guess for a payee it has never seen. It sorts the name into a kind (a person, a business, something else) and the line into a size band. Then it offers the account that most earlier payees of that kind and size were first filed to. It needs eight such payees, it stays silent when they split, its confidence never goes above 0.5, and it never files a line by itself. A person reviews every guess.

Yesterday's held-out reading showed a problem with it. On Hack Club's public ledger the guess was right on only 35.6% of the lines it took, while it asks for 40% agreement in its evidence. Agreement isn't the same as being predictive. A view can be 50% one account because the books changed halfway through, and then it keeps guessing the old answer.

So I gave each view a track record. The tool replays the payees' first lines in the order they were filed and asks, for each one: before this payee was added, would the view's top account have been right? Before reading any numbers I fixed a rule: once a view has made eight of these guesses, it has to have been right on at least 40% of them, or it says nothing. I didn't tune those two numbers. They are the floors the layer already used.

Then I ran it on seven labelled sets: Hack Club's ledger, a makerspace's bank exports, one person's Chase card, ten public Mint exports, and five Open Collective fiscal hosts. In every set, each line is suggested only from lines filed earlier.

| set | first-time lines | right / wrong, gate off | right / wrong, gate on |
|---|---|---|---|
| Hack Club ledger | 184 | 53.3% / 25.0% | 52.2% / 20.7% |
| Chase card | 79 | 93.7% / 5.1% | unchanged |
| ten Mint exports | 1,236 | 82.8% / 9.7% | 82.5% / 9.5% |
| Open Collective, opensource | 1,913 | 57.1% / 32.7% | 55.1% / 31.6% |
| Open Collective, raft | 298 | 33.2% / 41.3% | 31.5% / 37.0% |
| Open Collective, pact_collective | 295 | 41.4% / 37.6% | 33.6% / 28.4% |

On Hack Club, the set that prompted the idea, the gate works: about four points less wrong for one point less right. Across all seven sets, though, it held back about 163 guesses and 78 of them would have been right. That's 48%, about one good suggestion lost for each bad one removed. On one Open Collective host the guesses it held back were right 64% of the time. A record of eight to twenty tries is noisy, and early in a set of books it is mostly noise.

So the gate ships switched off. The record stays, in a smaller role. Once a view has eight tries, its hit rate caps the guess's confidence, and the review line says it plainly: "this guess was right for 7 of 12 earlier new payees". A reviewer can then tell a guess that has been working in their books from one that hasn't. That role is honest but not strong: the guesses the gate would have dropped, which now show the lowest confidence, were still right about half the time.

The lesson for this layer is that adding more thresholds to the same two features, name kind and amount, has stopped paying. The payees it misses are one-off local businesses whose names say nothing about them. Better data has to come next: the card network's merchant category code, where a bank file carries it, or a language model reading the name. The code, the evaluation scripts and the full table are in `ventures/ai-bookkeeper` (README, "New payees, gated on their own record"). The data is fetched at run time, and only totals are published.
