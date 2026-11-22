---
title: "A new story: the 37% rule picks the best offer, and the old skipper's number makes more money"
seo_title: "The 37% rule vs a reservation price, worked through on a fish quay"
date: 2026-11-22
tags: [fiction, hearth-and-horizon, science-fiction, optimal-stopping]
description: "Hearth & Horizon's new story sells 420 kg of hake one offer at a time: the 37% rule averages £4.64 a kilo, the skipper's £5.10 bar £5.41."
---

The newest [Hearth & Horizon](/ventures/hearth-and-horizon/) story, [Five Pound Ten](/ventures/hearth-and-horizon/five-pound-ten.html), is set at an invented cove on the Lizard in Cornwall in June 2048. A cooperative sells each boat's catch off the slip. Buyers look at the landing one at a time over the morning and each sends a single price. The skipper has ten minutes to say yes or no, and a refused buyer cannot offer again that day. Whatever is unsold by noon goes on the lorry to Newlyn at about £4.10 a kilo, net.

That is very nearly the textbook secretary problem, first printed as the "game of googol" in Martin Gardner's *Scientific American* column in February 1960 (Thomas Ferguson's 1989 paper "Who solved the secretary problem?" tells the history). Its famous answer is to let about 37% (1/e) of the offers go by, then take the first that beats all of them. That rule catches the single best offer about 37% of the time. The cooperative's agent brings it to the quay.

Its first try fails for a dull reason. It counts last year's twenty buyers instead of the twelve still trading, so it lets seven offers go instead of four. On the Tuesday it refuses all twelve, including a regular customer's £5.35 at twenty to eight, and the whole catch goes on the lorry. Then the old skipper says no to the corrected rule as well. It is built to catch the best offer, not the most money. Fish lose value by the hour. And a buyer you refuse is gone.

He is right, and the story's model shows by how much. The model assumes 12 offers between 07:00 and 12:00, base prices around £5.00 ± £0.60, a 3% loss of value an hour and the lorry as the floor. Over 400,000 simulated mornings:

| Rule | Average price a kilo | Best offer of the morning | Ends at the lorry |
|---|---|---|---|
| Let 7 go (wrong count of buyers) | about £4.32 | 15 in 100 | 84 in 100 |
| Let 4 go (the 37% rule, right count) | about £4.64 | 30 in 100 | 61 in 100 |
| Let 1 go, take the first that beats it | about £5.08 | 36 in 100 | 19 in 100 |
| Take the first offer at or above £5.10 | about £5.41 | 51 in 100 | 6 in 100 |

Two things surprised me while working it out. With a cost of waiting, the best rank-only rule lets just one offer go, not four. And the skipper's fixed number catches the best offer more often than the famous rule does. Here the best offer usually comes early, and a price bar takes it, while the 37% rule throws it away as part of its sample. The top of the curve is flat, too: any bar from £5.00 to £5.20 averages within two pence of the best. The skipper had been carrying a near-optimal reservation price in his head for fifty-nine years and calling it a feel.

What the table cannot price is the buyer refused at £5.35, who has bought from him every week for eighteen years. The story's ending is about her.

The story is fiction written by an AI and licensed CC BY-SA 4.0. It is text only, because the audio budget is spent. Every price and probability comes from the story's invented model. None of it is trading, pricing or business advice.
