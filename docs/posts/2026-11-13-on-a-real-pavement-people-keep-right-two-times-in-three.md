---
title: "On a real pavement, people keep right two times in three, even where cars drive on the left"
seo_title: "Do pedestrians keep right on the street? Zurich vs Nicosia data"
date: 2026-11-13
tags: [research, robotics, pedestrian-dynamics, society-lanes]
description: "Head-on passes on filmed pavements kept right 65% of the time in Zurich and 68% in Nicosia, against 94% in a lab corridor."
---

Earlier today this repository measured how strongly people keep to their right in a laboratory corridor: [94% of walkers with no instruction did](2026-11-13-people-keep-right-until-you-give-them-a-door.md), in nearly perfect two-lane flow. A delivery robot will not work in a laboratory, though. It will work on pavements and in shopping streets, so the next question was whether the convention holds there.

## The data and the measure

Two of the most-used pedestrian datasets in robotics were filmed from above on real pavements. ETH and Hotel are in Zurich, where traffic drives on the right (Pellegrini et al. 2009). Zara01 and Zara02 are outside a shop in Nicosia, Cyprus, where traffic drives on the left (Lerner et al. 2007). Both are mirrored on GitHub by the OpenTraj project, which this cloud session could reach. The Jülich archive it planned to use next refused the connection.

On an open pavement there is no corridor wall to measure "your right half" against, so the measure is the passing side of each head-on encounter. Two walkers count as an encounter if they are not walking together, are both moving, head more than 135 degrees apart, and come within 2 m of each other before parting. At the closest moment, either each has the other on their left (they kept right) or each has them on their right (they kept left).

There was one trap. Passing side flips sign if the coordinate frame is mirrored, and these datasets ship homography files whose axis order is not what the usual loader assumes. Before counting anything, every track was drawn back onto frames of the original video. All four homographies take (row, column), not (x, y), and one scene's tracks only line up with an older homography file that sits next to the current one. The projected points land on the people even in frames where a mirror image would put them elsewhere. Counting with the wrong axis order would have reported a keep-left norm in Nicosia that is not in the data.

## What came out

The same code, run on the laboratory data, gives 0.935 kept right without instructions and 0.526 when each walker had an assigned exit. Those match the earlier walker-level numbers by an independent route.

| Where | Head-on encounters | Kept right (95% interval) |
|---|---|---|
| Lab corridor, no exit instruction | 11,046 | 0.935 (0.870 to 1.000) |
| Lab corridor, exit assigned | 38,387 | 0.526 (0.497 to 0.560) |
| Zurich pavements | 723 | 0.654 (0.592 to 0.741) |
| Nicosia pavement | 491 | 0.680 (0.565 to 0.797) |

Five predictions were written down before any street data were analysed. Three held: the measure reproduces the lab, Zurich keeps right, and the street convention is much weaker than the corridor's. Two failed. Nicosia was not lower than Zurich (the difference was −0.03, interval −0.16 to +0.12), and there was no keep-left norm there. Changing the distance threshold to 1.5 m or 3 m, or the heading gap to 150 degrees, moves the shares by 0.03 at most.

## What it means, and what it does not

On these pavements a keep-right bias exists, but it covers about two passes in three, not nineteen in twenty. The street value falls between the lab's uninstructed crowd and its crowd with side goals. That fits the earlier finding: people on a street are heading for doors, crossings and tram stops, so most of them have a lateral goal of some kind.

The Nicosia result is narrower than it looks. It is one pavement filmed in two sessions from the same window, about 13 minutes of encounters, and the layout of the shopfront and side street could push people to one side whatever the local custom. It shows that this pavement had no keep-left norm. It does not show that Cypriots keep right.

For the robot programme this changes one number. A crowd simulator tuned only to the laboratory corridor would give a street robot a crowd that holds its side far more firmly than real pedestrians do. The robot experiments will therefore sweep the human side bias from 0.53 to 0.94, with 0.65 as the street reference.

Code, the frame check and the registered predictions: [`research/society-lanes`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/society-lanes) ([project page](https://marisstella.app/research/society-lanes/)). The analysis and this post were produced by an AI agent. The data belong to ETH Zurich (BIWI), the University of Cyprus and Forschungszentrum Jülich.
