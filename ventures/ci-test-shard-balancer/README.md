# CI Test Shard Balancer

A free, offline tool that reads the JUnit XML your test runner already writes
and answers one question: **how do I split this suite into N CI shards that
finish at the same time, and how many shards are worth paying for?**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ci-test-shard-balancer/

After using this, you can put an evenly timed set of test files on each CI
shard and know which shard count to pay for, in a few minutes with no signup
and no timing data sent anywhere, which used to mean guessing at a split,
re-running CI to see which job came last, or paying for a test-splitting
service.

- **Reads** JUnit XML from pytest (`--junitxml`), Jest (`jest-junit`), Go
  (`gotestsum --junitfile`), Maven Surefire / Gradle and RSpec
  (`rspec_junit_formatter`). The dialect is detected; `--format` forces it.
- **Balances** with multiway number partitioning: longest-first (LPT) greedy,
  then pairwise move/swap local search, then an exact branch-and-bound for small
  suites. It reports whether the result is proven optimal for the timings it saw.
- **Shows** the current split next to the balanced one: slowest-shard time,
  projected CI wall-clock (slowest shard plus the setup seconds you enter), billed
  minutes, and the saving per run (and per month with `--runs-per-month`).
  "Current" is an equal-count split in name order, or, with
  `--current-from-reports`, one report file per shard you run today.
- **Sweeps** shard counts and suggests the cheapest N that meets a
  `--target-seconds` wall-clock, using billed minutes = N x (slowest shard + setup).
- **Flags the indivisible bottleneck**: any file or test longer than the ideal
  shard sets a floor no number of shards can beat. It says when `--group test`
  would split it.
- **Emits** ready-to-paste shard commands (pytest node ids or files, Jest and
  RSpec file lists, `go test -run`, `mvn -Dtest` and Gradle `--tests`) and a
  GitHub Actions matrix (`--matrix`).
- **Groups** by file, class or single test.
- **Gates**: `--max-imbalance-pct P` exits 1 when your current split's slowest
  shard is more than P percent over an even share, so a pipeline notices when
  adding tests has unbalanced it.

**What it is not:** a live test-splitting service. It computes a fixed split from
the timings you give it and keeps no history, so it cannot react to variation
inside a run. See [the comparison page](vs-knapsack-pro.html).

## Use it

Open `index.html` and paste a report, or:

```
node cli.mjs split junit.xml --shards 4 --setup-seconds 60
node cli.mjs split shard-1.xml shard-2.xml shard-3.xml --current-from-reports
node cli.mjs split junit.xml --shards 6 --group test --matrix
node cli.mjs split junit.xml --shards 4 --target-seconds 300 --runs-per-month 400
node cli.mjs split junit.xml --shards 4 --max-imbalance-pct 20
node cli.mjs split junit.xml --shards 4 --json
```

Exit codes: `0` ok, `1` the imbalance gate was exceeded, `2` the file or an
option could not be used. Node 18+, no dependencies, no network call, no model,
no randomness: the same input always gives the same split.

Duplicate test ids (a retry, or one report passed twice) count once at their
longest time. Go subtests collapse into their top-level test, because the
parent's time already includes them. Maven `Class#method` units merge
parameterised runs.

## Tests

```
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

The engine tests check the balanced split against a brute-force optimum on
small cases, LPT against Graham's 4/3 bound, every JUnit dialect, and the
indivisible-test flag.

## Limits

It is a heuristic over the timings in the reports you give it. Test timings
vary from run to run and with the machine, so real shards will not match the
prediction exactly, and nothing here is a guarantee of a wall-clock or billing
figure. Billed minutes use the conservative model N x (slowest shard + setup);
providers that bill each job separately, or round up to a whole minute, will
differ. The shard commands were written from general knowledge of each runner's
flags and not executed against a live pipeline from this repository; check them
before relying on them.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not engineering, financial or other
professional advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**, and
for meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising
from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this as
a system of record. If a tool needs to survive, export your inputs and run it
yourself.

**Privacy.** Everything runs in your browser or on your machine. Your reports
are never uploaded, and there are no accounts, tracking cookies, or analytics
vendor. The page counts anonymous feature events in local storage only and
honours Do Not Track; the button in its footer turns counting off.

Not affiliated with Knapsack Pro, Buildkite or CircleCI. MIT licence. Support is
optional: <https://github.com/sponsors/Duncan-Haywood>.
