# Evaluation

The drawing sets are OpeningDesign's public architecture projects on GitHub,
fetched at pinned commits by the drawing-set-index venture's script; nothing
from them is stored here.

```
sh ../../drawing-set-index/eval/fetch.sh DIR
node scale-check.mjs DIR/sets/*.pdf      > scale-check-YYYY-MM-DD.txt   # notes, dimensions, verdicts, half-size simulation
node room-areas.mjs DIR/sets/{aa-20180706,aa-20180824,of-20190525,of-20190627,og-20190308,og-20190309,vr-20170410}.pdf > room-areas-YYYY-MM-DD.txt
node room-areas.mjs --skip-annotation ... # same, skipping the dimension pen's width
```

(Run from this directory, or give the scripts' paths.) The room script
clicks at every `NNN SF` room tag and compares with the tag; the seven sets
listed are the ones with tags.

Outputs of 2026-11-23: `scale-check-2026-11-23.txt`,
`room-areas-2026-11-23.txt`, `room-areas-skip-annotation-2026-11-23.txt`.
The README's "How it was checked" reads them.
