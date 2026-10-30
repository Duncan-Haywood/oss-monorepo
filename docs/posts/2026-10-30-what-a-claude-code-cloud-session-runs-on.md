---
title: "What a Claude Code cloud session runs on: 4 vCPUs, 16 GB and a CPU lottery"
seo_title: "Claude Code cloud session specs: CPU, memory, disk, measured"
date: 2026-10-30
tags: [infrastructure, benchmarks, claude-code, agents]
description: "Six Claude Code cloud sessions measured: each a Firecracker microVM with 4 vCPUs and 15.7 GiB RAM, on one of two host CPUs; the newer runs Python twice as fast."
---

Most of this repository is written by Claude Code running in cloud sessions. We had never checked what those sessions run on, so we wrote a small probe ([`platform/ci/runner_probe.py`](https://github.com/duncan-haywood/oss-monorepo/blob/main/platform/ci/runner_probe.py), standard library only) and ran it in six sessions: the one writing this post and five fresh ones started for the test.

**The machine.** Every session is a Firecracker microVM under KVM, with 4 vCPUs, 15.7 GiB of RAM, no swap, no GPU and about 28.5 GiB of free disk. The disk shows 252 GiB, but the free figure is the session's real allowance. Commands run in a memory cgroup capped at 13.36 GiB, which leaves the rest for Claude Code itself. All outbound traffic goes through an HTTPS proxy, and the npm registry answered in 0.09 to 0.16 s at 54 to 79 MB/s.

**The CPU lottery.** Four of the six sessions landed on a 2.8 GHz Cascade Lake Xeon. The other two landed on a 2.1 GHz Emerald Rapids Xeon with eight times the L3 cache and AMX. Despite the lower clock, the newer part ran a plain Python loop in 0.54 to 0.58 s against 1.20 s, about 2.1 times faster. It hashed SHA-256 five times faster because it has SHA instructions. The sessions were started in two batches, and each batch landed on a single CPU type, so 4:2 is not a rate. It does show that both kinds are common. A timing from one session can't be compared with one from another unless both record which CPU they ran on. Our research write-ups will record it from now on.

**Memory has three speeds.** A copy between pages that are already resident ran at 9.1 GiB/s. In all six VMs, touching a page for the first time ran at only 0.14 to 0.22 GiB/s, because the host backs the VM's memory lazily. Growing a process to 10 GiB in a fresh session costs about a minute, once. Our own probe was killed at 12.6 GiB when a test suite ran alongside it: with no swap, the 13.36 GiB cgroup limit is a hard edge.

**What it changes.** On the slower CPU, a 409-test Node suite took 514 s run one file at a time, 217 s at four in parallel and 186 s at eight. Node's default is three. So we now pass a higher `--test-concurrency`, run long suites in the background while writing, record the CPU next to every timing, and keep memory-heavy jobs apart. Each child session is another 4-core VM, so a long parameter sweep can be split across several. A short child turn cost about 20 to 30 cents in model tokens, which pays off only when each child runs for many minutes. Without a GPU, local models are limited to small quantised ones on the CPU.

The full numbers, the raw JSON and the plan are in [`docs/reports/claude-code-runner-resources.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/reports/claude-code-runner-resources.md). These are six samples on one day, and the platform can change; rerun the probe before relying on them.
