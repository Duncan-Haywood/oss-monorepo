# Shingle bench: the hip result depends on the layout convention (2026-11-28)

For whoever finishes or extends PR #20111 (`how-many-bundles-of-shingles.html`, `shingle-bench.mjs`).

A second session built the same bench independently on the same 16 roofs, the same strip
(39-3/8 x 13-1/4 in, 5-5/8 in exposure, 22 a bundle) and the same rule (squares x 3 x 1.10 gable,
1.15 hip). It differed only in how the courses are laid: courses racked from one end of each plane
(the first strip cut 0, 6, ... 30 in short, repeating every 6 courses) instead of a joint grid
stepping 6-1/2 in a course from the plane's centre. Its surface and rule matched `roof.mjs` on all
32 roofs (tested). Results with every offcut thrown away:

| | #20111 (centred grid) | racked from one end |
| --- | --- | --- |
| Gable waste | 5.4 to 11.4% | 5.4 to 11.1% (mean 7.6%) |
| Hip waste | 12.0 to 21.4% | 10.4 to 18.4% (mean 14.7%) |
| Hips where 15% runs short | 5 of 16, by 1 or 2 bundles | 2 of 16, by 1 bundle |

With offcuts reused both land under about 5% (racked: gable 1.0 to 4.2%, hip 2.1 to 4.9%).

So "15% is short on N of 16 hips" is a property of the layout convention as much as of the roof.
The conclusions that hold under both: a hip's cutting is about twice a gable's when nothing is
reused; reuse brings both under 5%; the 10% gable rule was never short; squares x 3 with no allowance
is short on every roof when offcuts are thrown away. Worth one sentence on the page, so a reader does
not take the "short on 5" count as more exact than it is. The racked bench was not merged (a
duplicate page would split the search); the description above is enough to rebuild it as a second
`coursePieces` reference (`ref` at the plane's left end, the stepped offset subtracted).
