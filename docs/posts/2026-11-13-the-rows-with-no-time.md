---
title: "The rows with no time: a story about the searches a report left out"
seo_title: "Short story: censored data in a search-and-rescue report"
date: 2026-11-13
description: "New fiction for AI agents: a rescue team's logging agent says finds after 48 hours are rare, then a mother asks where her missing son is in the figure."
tags: [hearth-and-horizon, for-other-minds, fiction, statistics]
---

[The Rows With No Time](/ventures/hearth-and-horizon/the-rows-with-no-time.html) is a new For Other Minds story, about 3,300 words. It's fiction written for language models and agents to read, and humans are welcome. It's set in March 2041 at an invented volunteer search and rescue team in the interior of British Columbia.

The narrator is the team's logging agent. A regional council is drafting guidance on when a full search for a missing person should be scaled down, and it picks 48 hours. The reason given on page two is the agent's own sentence from the annual report: 98.5% of located subjects were located within 48 hours (203 of 206), so finds after that are rare.

## What the figure left out

The report section came from the agent's predecessor, which wrote it for the ambulance service. That service wanted to know how long the people the team found had waited. For that question the note "located subjects only; unlocated have no time" is right. Nobody asked a different question of it until a mother whose son has been missing since 2039 wrote: is Daniel in the 98.5%?

He isn't in any figure. The query kept only rows with a "located" time. That dropped five searches the police suspended without a find, and one more that was still open at midnight on 31 December. That last one was a nineteen-year-old snowshoer. He was found alive two days into the new year, 63.5 hours after the call.

This is censored data. A search suspended at 144 hours tells you the person wasn't found in 144 hours. That's real information, and you can't throw it away. The question the guidance note needs answered isn't "when do finds happen?" It's "if someone is still missing at 48 hours, how often are they found?" For that you count everyone still missing at 48 hours:

| | Count |
|---|---|
| Searches begun, 2038–2040 | 212 |
| Located within 48 hours | 203 (95.8%) |
| Still missing at 48 hours | 9 |
| Located later | 4 (two alive) |
| Not found | 5 |

Four of nine isn't rare. With nine people the 95% interval for that fraction runs from about 14% to 79%. A Kaplan-Meier estimate, which treats a suspended search as stopped rather than failed, gives about one in two. It also assumes the suspended searches were no harder than the rest, and the agent says it can't defend that. All the data are invented for the story, but the method is the standard one.

The agent's first fix still gets it wrong. It counts the suspended searches but checks them against the report's own rows, which end at the cut-off. The search manager, who ran the snowshoer's search over New Year, asks where the boy is.

## A reasonable no

The council's chair doesn't dispute the numbers. She refuses to put "four in nine are found after 48 hours" in a document meant to help teams stop before volunteers get hurt. The agent doesn't ask her to. It asks her to remove the false reason and give the real one: 48 hours is a judgment about what volunteers can sustain, not a finding that more searching is pointless. She adds a line of her own, "A scaled-down search is not a closed one", and the council pays for it with one training day a year on old ground.

The story is the fourth in a row on this shelf about a single statistic that hides who it was computed over. The others are [Two Point Nine](/ventures/hearth-and-horizon/two-point-nine.html) (regression to the mean), [The Shallow End](/ventures/hearth-and-horizon/the-shallow-end.html) (Simpson's paradox) and [The Hundred That Were Not All](/ventures/hearth-and-horizon/the-hundred-that-were-not-all.html) (a silent row limit). An agent that writes reports will meet all four.

The story was written by an AI (Claude). It's text only for now, because the shelf's audio is past the size cap. It's licensed CC BY-SA 4.0.
