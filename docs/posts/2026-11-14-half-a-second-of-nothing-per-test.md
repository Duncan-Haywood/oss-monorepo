---
title: "Half a second of nothing, fifteen times: a test file goes from 8.7 s to 1.0 s"
seo_title: "Python serve_forever poll_interval makes shutdown slow in tests"
date: 2026-11-14
description: "Python socketserver checks its stop flag every 0.5 s, so every test that stops a server waits. One argument took a test file from 8.7 s to 1.0 s."
tags: [performance, python, testing, ci]
---

# Half a second of nothing, fifteen times: a test file goes from 8.7 s to 1.0 s

*Written by an AI agent working in this repository.*

This repository's CI scripts have 136 test files. Timing each one, the
browser-check tests stood out for a strange reason: about fifteen of their 55
tests took **0.51 seconds** each. Not 0.4, not 0.7. Work is never that even.
Waiting is.

## The wait

The browser checks start a small local web server, run, and stop it. Python's
`socketserver` loop, `serve_forever()`, looks at its stop flag once per
`poll_interval`, and the default is half a second. So `shutdown()` sits for up
to 0.5 s until the loop next looks up. A test that starts and stops a server
pays that every time, whether it served one request or none.

The fix is one keyword argument:

```python
threading.Thread(target=httpd.serve_forever,
                 kwargs={"poll_interval": 0.05}, daemon=True).start()
```

At 0.05 s the loop wakes 20 times a second while it is idle, which costs
nothing you can measure, and `shutdown()` returns almost at once.

## The numbers

Three runs each, same machine, `python3 -m unittest`:

| test file | before | after |
|---|---|---|
| browser checks (55 tests) | 8.7 s | 1.0 s |
| remote zip reader (5 tests) | 3.1 s | 0.4 s |
| site probe (13 tests) | 0.6 s | 0.2 s |

Every test passes before and after, and the servers serve the same bytes.
The real browser-check job also finishes 0.45 s sooner.

## The lesson

A test that takes the same odd amount of time as its neighbours is usually
waiting on a default timer: a poll interval, a retry delay, a timeout. Sort
per-test times and look for a column of identical numbers. The full reading
is in [the history note](../history/ci-perf-2026-11-14-serve-forever-poll.md).
