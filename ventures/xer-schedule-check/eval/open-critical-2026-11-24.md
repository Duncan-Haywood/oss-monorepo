# Make open-ended activities critical, on six public XERs (2026-11-24)

`node eval/open-critical.mjs DIR/xer --json eval/open-critical-2026-11-24.json`
(the six files from `bash eval/corpus-fetch.sh DIR`).

P6's schedule option "Make open-ended activities critical" (`sched_open_critical_flag`)
sets the late finish of an activity with no successor to its early finish. Before
2026-11-24 `cpm.mjs` read the flag and did nothing with it. None of the six public
files sets it (all store `N`), so the check turns it on in a copy of each file.

| file | open | open ends | lose float | become critical | critical off -> on | early dates moved | float grew | off = as file |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| CCA_R03_dt_24Oct11SC | 14,270 | 10 | 13,721 | 99 | 544 -> 643 | 0 | 0 | yes |
| Expressway_Project | 823 | 65 | 320 | 229 | 33 -> 262 | 0 | 0 | yes |
| example_xer_file | 404 | 34 | 404 | 235 | 0 -> 235 | 0 | 0 | yes |
| hotel-project | 4,236 | 26 | 31 | 30 | 197 -> 227 | 0 | 0 | yes |
| sample | 42 | 1 | 0 | 0 | 42 -> 42 | 0 | 0 | yes |
| terminal-building-airport | 66 | 1 | 65 | 35 | 1 -> 36 | 0 | 0 | yes |
| **total** | **19,841** | **137** | **14,541** | **628** | **817 -> 1,445** | **0** | **0** | |

"Critical" is total float at or under the project's critical threshold
(`critical_drtn_hr_cnt`, 0 on these files). "Off = as file": with the flag forced
to `N` every open activity's early finish, late finish and total float equal the
run on the file as stored, so the change cannot touch a file that leaves the
option off. `node eval/cpm-vs-p6.mjs` still gives 19,820 of 19,822 against P6's
stored values.

What the numbers say:

- The option is safe in the sense that matters: it only takes float away, and
  only from open ends and the chains that feed them. No early date moved on any
  of 19,841 activities.
- On CCA, 10 open ends take float from 13,721 activities but only 99 reach
  zero: the file has a must-finish date well past its early finish, so most
  float shrinks without vanishing. Expressway's 65 open ends make 229 more
  activities critical, 8 times the critical count with the option off. On the
  `example_xer_file`, every one of its 404 open activities sits behind one of 34
  open ends, and 235 become critical from none.
- So a file's critical count depends on this setting as much as on its logic.
  A reviewer comparing two contractors' critical counts, or a DCMA point 1/2
  reading, should know which way the flag was set. The checker now gives P6's
  count either way.

Not checked: a P6 run on a file with the option on (no public file has it). The
rule itself is P6's documented behaviour (late finish = early finish for
activities without successors), and the planted case in `open-critical.test.mjs`
pins it; a P6-scheduled file with the flag `Y` would confirm it on real data.
Project XML: `<MultipleCriticalPaths>` is read as the same flag and written from
it, and carried to P6 by the Project-to-XER converter (test); not opened in
Project itself.
