# Monthly schedule narrative on six public P6 files (2026-11-22)

`node eval/narrative-check.mjs DIR --seeds 3 --json eval/narrative-check-2026-11-22.json`
on the six public XERs from `bash eval/corpus-fetch.sh DIR`.

No public series of real consecutive updates exists, so each file is the previous update,
and the current one is the file statused as planned 20 working days later (`status.mjs`)
with two planted changes: a slip of 1-5 days on a driving-path activity due to finish in
the window (left in progress), and a lag of +1-5 days on an FS link between two unstarted
driving-path activities.

Result: **18 of 18 runs pass**; 12 runs carried a planted slip and 15 a planted lag (the
hotel file has no driving work due in the window and no unstarted driving FS pair, and
terminal-building-airport no driving work due, so those runs plant less).

| check | result |
|---|---|
| planted slip listed under "Planned work not accomplished" with a cause fill-in | 12 of 12 |
| planted lag listed under "Changes" as `Lag on P -> S FS changed from a to b days` with a reason fill-in | 15 of 15 |
| one change line per change the comparison found, none invented | 18 of 18 |
| each missed activity once (start and finish merged), exactly the comparison's | 18 of 18 |
| status carries the comparison's finish movement and half-step split | 18 of 18 |
| fill-in count = `[FILL IN` markers in the text = highlights in the HTML | 18 of 18 |
| the file against itself: no change lines, no slip, no recovery request | 18 of 18 |

Draft time including the comparison and the 4-week look-ahead: 2-55 ms on the small files,
250-430 ms on Expressway and the hotel, 3.2-4.0 s on the 30 MB CCA file.

What this does not show: that a real scheduler finds the draft saves time, or that an owner's
reviewer accepts its order. The narrative reports what `compare.mjs` finds, so its accuracy
is that check's (eval/compare-check-2026-11-19.md: 720 planted edits all reported).
