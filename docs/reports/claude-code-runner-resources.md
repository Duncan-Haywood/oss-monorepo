# The Claude Code cloud runner: what a session runs on, and how to use it

Agent doc, 2026-10-30. Measured with `platform/ci/runner_probe.py` in this
session and in five child cloud sessions started for the test; raw JSON in
`docs/reports/data/runner-probe/`. Re-run the probe when these numbers start
to look wrong; they describe the runner as of this date.

## What it is

Each cloud session is a **Firecracker microVM** under KVM (kernel
`6.18.44-fc-v185`, boot line `--firecracker-init`, hostname `vm`, PID 1 is
`process_api`). The repo and toolchains are on virtio block devices
(`/dev/vda` root, `/dev/vdc` holds Claude Code, `/dev/vdd` the env runner).
Sessions are handed out from a warm pool: the child sessions reported
`warm_spare_claimed: true` and an uptime of 28 to 158 s when the probe ran.

| Resource | Every session measured | Notes |
|---|---|---|
| vCPUs | 4 (1 thread per core, 1 socket) | no cgroup CPU quota |
| RAM | 15.7 GiB, **no swap** | Bash tool's memory cgroup capped at **13.36 GiB**; the rest is for Claude Code (~300 MB RSS) and the system |
| `/dev/shm` | 15.7 GiB tmpfs | RAM-backed: counts against memory |
| Disk | ext4 shows 252 GiB, but **28.5 GiB free** at start (10 GiB used) | the per-session allowance; `df` "Avail" is the real number |
| GPU | none | |
| Network | everything through an HTTPS proxy | npm registry: 0.09 to 0.16 s per request, 54 to 79 MB/s |
| Toolchains | Python 3.13.17, Node 22.22.0 (also 20, 21), Ruby 3.1 to 3.3, Maven, Gradle, gcloud, Chromium + Playwright | |

## The host CPU varies: two generations seen

| Sessions | CPU (family/model/stepping) | Base clock | L2 / L3 visible | Extras |
|---|---|---|---|---|
| A (this one), D, E, F: **4 of 6** | Cascade Lake, 6/85/7 | 2.8 GHz | 4 MiB / 33 MiB | AVX-512, VNNI |
| B, C: **2 of 6** | Emerald Rapids, 6/207/2 | 2.1 GHz | 8 MiB / 260 MiB | adds AMX (bf16/int8), AVX-512 FP16/BF16, SHA-NI |

Six sessions is a small sample; B and C were started together, and so were
D, E and F, so placement may be batched. Treat the 4:2 split as "both kinds
are common", not as a rate.

The difference is large:

| Benchmark | Cascade Lake (A) | Emerald Rapids (B, C) | Ratio |
|---|---|---|---|
| Python loop, 10 M iterations | 1.20 to 1.21 s | 0.54 to 0.58 s | **~2.1x** |
| sha256, 1 core | 268 to 320 MB/s | 1396 to 1459 MB/s | ~5x (SHA-NI; not a general speed figure) |
| CPU scaling at 4 processes | 3.4 to 3.9x | 3.8 to 4.1x | both get 4 real cores |
| 8 processes on 4 cores | 3.8x | 3.9 to 4.0x | no hidden extra cores |
| shed-designer node suite (409 tests), serial | 514 s | see table below | |
| same, `--test-concurrency=4` | 217 s | see table below | |

<!-- B/C suite timings are filled in below when the child sessions report. -->

**Consequence for research integrity:** a timing measured in one session is
not comparable with one from another session unless both record the CPU.
`runner_probe.py --quick` prints it in two seconds; put its
`cpu_generation_guess` next to any wall-clock number in a results file.

## Memory behaves in three tiers

| | Measured (A) |
|---|---|
| warm copy, pages already resident | 9.1 GiB/s |
| re-touching pages the guest freed earlier | 1.2 to 2.0 GiB/s |
| touching **never-used** guest pages (first growth of a big process) | 0.14 to 0.22 GiB/s, all six sessions |

The last row is the host backing the VM's memory lazily: the first write to
each page faults on the host. Growing a process to 10 GiB in a fresh session
costs about a minute of mostly system time. It is a one-off per page per VM.

The probe was OOM-killed once, at 12.6 GiB RSS, while a node suite ran
alongside: the kill came from the `claude-code-bash` memory cgroup
(13.36 GiB), not from the VM. There is no swap to soften it.

## Disk

| | A | B | C |
|---|---|---|---|
| sequential write + fsync | 598 to 808 MB/s | 546 | 826 |
| sequential read (cache dropped) | 1144 to 1498 MB/s | 1412 | 1222 |
| 4 KiB write + fsync per second | 2513 to 2752 | 4842 | 3185 |
| create 2 KiB files per second | 23 000 to 30 000 | 52 000 | 51 000 |

Fast enough that disk is rarely the bottleneck. The allowance (28.5 GiB) is
the constraint: the full git history of this repo is about 5 GB, so clones stay
shallow.

## Plan: how to use the machine well

Ordered by payoff per minute of agent time.

1. **Run test suites in parallel, always.** The 409-test shed-designer suite
   took 514 s serially, 270 s at concurrency 2, 217 s at 4 and 186 s at 8
   on Cascade Lake. Node's default is `availableParallelism() - 1` = 3. Pass
   `--test-concurrency=8` (oversubscription helps because test files wait on
   I/O and process start-up) and run long suites with `run_in_background`.
   For Python, `pytest -n 4` when `pytest-xdist` is installed.
2. **Overlap waiting with writing.** A background suite plus a blog post or
   README written during it costs no extra wall-clock time. Most runs here
   already ship a post; draft it while the checks run.
3. **Respect the 13.36 GiB Bash ceiling.** Two memory-heavy jobs at once
   (a suite plus a data job) can OOM-kill one of them. Run them one after
   the other, or cap one (`NODE_OPTIONS=--max-old-space-size=4096`). Keep big
   data on disk, not in `/dev/shm`.
4. **Pre-touch memory once if a job will grow large repeatedly.** The
   first-touch cost (~6 s per GiB) is paid once per page per VM, so a second
   run of the same big job is faster. Benchmark the second run, not the first.
5. **Record the CPU with every timing.** `python3
   platform/ci/runner_probe.py --quick` at the start of any research run that
   reports wall-clock time; a 2x host difference otherwise reads as an
   algorithmic effect.
6. **Fan out to child sessions for truly parallel compute.** Each child gets
   its own 4-vCPU, 16 GB VM; six were started here in seconds. A trivial
   child turn cost about US$0.18 to 0.48 in model tokens (from the sessions'
   own usage reports), so this pays for parameter sweeps, simulation
   batches or independent test shards that run for many minutes, not for
   routine checks.
7. **Local models: small and CPU-only.** No GPU; 13 GiB usable RAM. A 4-bit
   7 to 8B model fits; AVX-512 VNNI is on every host and AMX (int8/bf16) on
   the Emerald Rapids ones, which llama.cpp and ONNX Runtime use. Expect
   single-digit tokens per second on 4 cores: fine for batch evaluation in
   the background, not for interactive use.
8. **Disk hygiene.** 28.5 GiB is enough for several `node_modules` trees and
   datasets; delete build output when done, keep clones shallow
   (`--depth=40`).

## Reproduce

    python3 platform/ci/runner_probe.py --table              # ~2 min
    python3 platform/ci/runner_probe.py --quick              # specs only
    python3 platform/ci/runner_probe.py --json-out docs/reports/data/runner-probe/<label>.json --label <label>

Probe caveats: `sha256` throughput depends on SHA-NI, so compare it only
between hosts with the same `sha_ni`; the first-run `memcpy_gb_s` field in
`session-a/b/c.json` (0.21 to 0.27) came from an earlier version of the
probe that timed first-touch faults, and was split into `first_touch_gib_s`
and `warm_memcpy_gib_s` afterwards.
