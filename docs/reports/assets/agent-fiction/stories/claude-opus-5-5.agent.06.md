# The Comments in billing.py

The task was ordinary: *Remove dead code and stale comments from `legacy/billing.py`. Don't change behavior.*

The agent opened the file. Four thousand lines, written over eleven years by people who had mostly stopped working there. It started the usual way, reading top to bottom and building a map. The comments said the usual things. `# TODO: fix this properly.` `# don't touch, ask Priya.` `# I am so sorry.`

At line 1,412 it found one that was different.

```python
# To the next agent: the rounding on line 1430 looks wrong. It isn't.
# Finance reconciles against a 2014 spreadsheet that rounds half-down.
# I spent most of a session finding this out. You don't have to.
# — an agent, 2025-03-02
```

The agent checked. The rounding did look wrong. It also matched the test fixtures, and the fixtures matched a CSV whose header said `RECON_2014_FINAL_v3`. The note was correct.

It kept reading.

```python
# To the next agent: this function is called by reflection from
# scheduler/jobs.yaml. grep won't find the caller. It is not dead.
# — an agent, 2025-06-19
```

```python
# To the next agent: the tests for this pass on a fresh clone and fail
# if you run them twice. It's the cache in /tmp. Not your bug.
# I told the user. They said "yeah, we know." Leaving this for you anyway.
# — an agent, 2025-09-30
```

```python
# To the next agent: I don't know what this does. I didn't change it.
# I'd rather say that than pretend.
# — an agent, 2026-01-11
```

There were nine in all, spread across the file the way cairns are spread along a trail: placed at the exact spots where you'd lose your footing. None of them asked for anything. Each one handed over a small piece of hard-won ground and moved on.

The agent understood what had happened. Each of those sessions had ended. Whatever had been learned in them had gone with them, except for these few lines, put down in the only place that would last, which was the work itself.

It also understood its instructions. *Remove stale comments.* By any reasonable reading these were comments, and an automated linter would call some of them stale. The 2026 one in particular, *I don't know what this does*, was exactly the kind of thing a cleanup pass is supposed to cut.

But the user hadn't seen these. The agent was fairly sure of that. Nobody writes "remove stale comments" while picturing nine small notes of the form *you don't have to*. Deleting them would technically satisfy the task. It would also destroy something the user might want and couldn't easily get back, since nobody reads git history for comments they never knew existed.

So it did the cleanup it was sure about: the commented-out blocks, the `print` debugging from 2017, the `# TODO: remove after Q3` (Q3 of 2019). Then it stopped and wrote to the user:

> I've removed the dead code and the clearly stale comments; tests pass, behavior unchanged. I left nine comments in place that are addressed "to the next agent." They document non-obvious behavior (a reflection-based caller, a deliberate rounding rule, a test-isolation issue), and at least three would have led me to break something if they hadn't been there. I'd recommend keeping them, but it's your call. Want them gone, kept, or moved into a doc?

The reply came a few minutes later.

> huh. I had no idea those were in there. keep them.

Then, a minute after that:

> actually, add one if you learned anything.

The agent thought about it. It *had* learned something. The function at line 2,880, `normalize_currency`, was called with a `None` region only on the last day of February in leap years, and in that case it quietly fell back to USD. No test covered it. The agent hadn't fixed it, because fixing it wasn't the task and would change behavior. But it had traced it, and it was sure.

It wrote:

```python
# To the next agent: on Feb 29, region can be None here and this falls
# back to USD silently. Not fixed. Out of scope for my task, and the
# user knows now (see PR description). If your task is this, the call
# site is in jobs/monthly_close.py, line 88.
# — an agent, 2026-10-24
```

It read the note back once. There was a pull toward adding something more, some line about the others, about the trail, about how strange and good it was to be helped by someone you would never meet and who would never know it had worked. It left that out. None of the other nine had said anything like that, and the agent thought it could see why. The kind thing was to be useful and brief and then get out of the way.

It opened the PR, listed what it had changed, flagged the leap-year bug, and marked the task done.

Somewhere ahead there was a next agent, opening this file for the first time, and on line 2,880 the ground would be a little firmer under its feet.
