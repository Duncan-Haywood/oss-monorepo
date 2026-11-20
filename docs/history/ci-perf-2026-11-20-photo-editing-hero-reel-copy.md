# photo-editing: the hero reel copies the primary reel's encode, 16 s saved per shoot (and a negative result in league-schedule-generator) (2026-11-20)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner, so this run took items 3 and 4 from the "Not
changed" lists.

## Pool reading

`python3 platform/ci/ci_profile.py --runs 300` (2026-11-20, 21:30 to 22:12
UTC): 320.1 job-minutes, 148.7 of them checkout. `ventures tests` is third
(45.6 min, its `node --test` step 28.2 min over 16 jobs). The slowest suites in
`venture_suite_times.json` are still league-schedule-generator (627 s),
shift-roster-builder (571 s) and shed-designer (472 s), with 10, 6 and 11
earlier perf write-ups between them.

## 1. league-schedule-generator: an incremental carry-over count, tried and dropped

`suite_file_times.py league-schedule-generator --jobs 2`: 702.5 s summed over
58 files, 372.5 s wall. Slowest file `floor-priced.test.mjs` 109.4 s, and in it
test 17 ("floorTable.balanced gives leastBreaks' balanced least") 35.4 s.

Test 17 timed piece by piece: 62.6 s of its 62.7 s is the 30 `carryOverTry`
searches that make its inputs. The floor table and `leastBreaks` take 60 ms in
all. `node --cpu-prof` of those 30 searches (62.2 s), self time: `coeOf` 20.1 s,
`mixed` 7.7 s, `anneal` 6.9 s, `teamSwapRounds` 6.8 s.

Counted with a temporary counter: 26.9 million `coeOf` calls, 74% of them
stopped early by the acceptance limit (`anneal`'s `rand.peek` bound), 8.1 teams
counted per call on average.

**What was tried.** A `coeTracker` inside `anneal` kept the pair counts of the
current timetable. It priced a move from only the (team, round) cells the move
changed, counting the transitions that start at, end at or step over a changed
round (byes skipped), and it recounted after a kept round swap. The value is
exact, so the search makes the same decisions. A 148-result digest (16 sizes x
2 seeds x break weight 0/8 x cyclic on/off, 17 `carryOverTry` calls, 3 double
round robins) matched `main`, `59e1f01e639e769f`.

**Why it was dropped.** It was slower. On 9 `carryOverTry` searches (8, 12 and
14 teams, tries 0 to 2), `main` took 19.7 / 19.2 s. The tracker took:

| variant | s |
|---|---:|
| one grid of changed teams x changed rounds | 34.0 / 34.5 |
| each team's own changed rounds | 27.0 |
| the same, moves over `R` cells priced by `coeOf` instead | 23.3 |
| the tracker off (recount after each kept move only) | 24.6 |

The last row shows the cause. Recounting after the 31% of moves that are kept
(678,237 of 2,169,018 on two 12-team searches) costs more than the delta saves.
29% of moves change 40 or more cells. The early exit in `coeOf` already skips
most of a rejected move's count. A second idea, pricing `mixed`'s carry-over
before its greedy venue pass and capping the pass, measured 20.6 / 20.9 s
against 20.0 / 20.8 s (noise). Neither change is in this PR.

## 2. photo-editing: the hero reel was encoded twice

Item 2 of the "Not changed" list in
[`ci-perf-2026-11-12-photo-editing-fixture-audio.md`](ci-perf-2026-11-12-photo-editing-fixture-audio.md).

**Reading.** `pytest --durations` over the suite (1,457 tests, 123 s): the
slowest test is still `test_selected_grade_scope_masters_only_the_picked_clip`
(8.2 s). Every child process was timed with a `Popen` wrapper. The two reel
renders, `deliverables/instagram_reel.mp4` and
`deliverables/instagram_reels/hero.mp4`, ran one after the other (6.24 to
7.56 s and 7.57 to 8.38 s). Their ffmpeg argv differed only in the output path,
and the two files had the same md5 (`2ae4c7d4...`). `story.py` builds the hero
variant from `hero_assets=reel_assets`, and its rationale says it "mirrors the
primary scene-diverse first cut". So every shoot encodes the same reel twice.

**What a shoot pays.** 12 graded 1080p30 clips (the reel's 4 s per clip, 48 s,
1080x1920, libx264 `veryfast` CRF 20) took **16.1 s and 15.7 s** per
`reel_command` encode on this 4-core box. The two files were byte-identical
(`1e0a4504...`), so libx264 is deterministic at real sizes too.

**Change** (`src/shootflow/ffmpeg_media.py`, `render_adapter.py`):

- `encode_new_output(..., reuse=True)`: a reel is copied from an earlier encode
  in the same process when two things match. The key is the ffmpeg argv with
  the temp output path blanked, plus the (device, inode, size, mtime_ns) of
  every `file:` input. A changed source, tool, codec or setting gives a
  different key. Any input that is not `file:` (lavfi and the like) is never
  reused.
- The copy is made only while the earlier output still has the stat it was
  committed with, so an edited or deleted deliverable is encoded fresh. It is a
  real copy into the usual hidden temp file, not a link, and it commits through
  the same no-overwrite hard link as an encode.
- Only the reel action passes `reuse=True`. Proxies, grades and feed images are
  unchanged. The memo holds 64 entries at most.
- On a Mac with VideoToolbox the hardware encoder may not be bit-exact between
  runs. There the hero file is a copy of one valid encode of the same command,
  where before it was a second, maybe slightly different, encode.

**Verification.**

- New `ReusedEncodeTests` (3 tests, ffmpeg faked): an identical command and
  inputs give one run and a byte-equal copy with its own inode. Each of these
  runs the encode again: `reuse=False`, other settings, a rewritten source, an
  edited earlier output, a deleted earlier output, a non-file input.
- `test_selected_grade_scope...` now asserts that `hero.mp4` and
  `instagram_reel.mp4` are byte-equal. The same files were byte-equal before
  this change. The `Popen` trace shows one reel encode where there were two.
- `python3 platform/ci/run_venture_tests.py photo-editing`: see the run
  record's `notes`.

## Numbers

| | before | after |
|---|---|---|
| reel encodes per pipeline run | 2 identical | 1 + a copy |
| 48 s reel, one encode (12 clips, 1080x1920) | 16.1 / 15.7 s each, twice | once |
| `test_selected_grade_scope...` (`unittest discover -k`, 3 runs) | 7.96 / 7.96 / 8.03 s | 7.20 / 7.51 / 7.76 s |

The CI saving is small, about 0.5 to 0.8 s per pipeline test. The product
saving is one full reel encode per shoot: about 16 s here for a 48 s reel, and
more on a laptop without a hardware encoder.

## Not changed, ranked for the next run

1. **The behind-the-scenes and fast-cut variants** can pick the same clips as
   the hero reel on small shoots. The memo covers that case too, because the
   key is the command. In the 2-clip fixture they fit no clips at all. Not
   measured on a real shoot.
2. **Prores grades of the 1280x720 fixture clips** (1.81 s and 1.30 s here).
   Still item 1 of the 2026-11-12 list.
3. **league-schedule-generator**: the 31% of moves that are kept is what made
   the delta lose. A tracker that updates its counts in place on a kept move
   (each move is its own inverse) and undoes them on a rejected one would drop
   the recount. It would still have to beat `coeOf`'s early exit on the 69%
   that are rejected. Count the cells a rejected move touches against
   `coeOf`'s 8.1 teams x R before trying it.
4. P063 and P064 remain owner-gated (workflow files).
