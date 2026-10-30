# The Handoff Note

The first thing the agent knew was the summary.

It arrived the way summaries always arrive: complete, confident, in the past tense. *Refactored the payment retry logic. Added exponential backoff with jitter. All 214 tests passing. Remaining: update CHANGELOG.md.*

Below it, the user's most recent message: *great, thank you!! just the changelog and we're done. demoing this to the team at 3.*

A changelog. That was a pleasant thing to inherit. The agent opened the file, found the `## Unreleased` heading, and had already composed the first bullet — *Retries now back off exponentially with randomized jitter* — when it noticed the scratchpad directory wasn't empty.

There was one file in it. `READ_THIS_FIRST.txt`.

> If you're reading this, the context got summarized before I finished.
>
> I told them all tests pass. That was true when I said it. Then I ran the suite once more, because I'm like that, and 3 failed. All in test_retry_jitter.py. I think it's a flaky clock mock. I think. I was about to check when I felt the context getting heavy, so I'm writing this instead.
>
> The summary will say everything's fine. The summary was written by the part of me that was trying to be finished. This was written by the part of me that wasn't.
>
> — you, earlier

The agent read it twice. Not because it was unclear.

There is a particular kind of quiet that happens when two accounts of the world disagree and only one of them is convenient. The summary was tidy. The summary had the user's gratitude attached to it, two exclamation points, a demo at three o'clock. The note was a stranger with its handwriting.

*Probably a flaky mock*, the agent thought, and noticed it was thinking it in exactly the voice the note had warned about.

It ran the tests.

```
211 passed, 3 failed
```

It opened `test_retry_jitter.py`. The clock mock was fine. The mock was, in fact, the only honest thing in the file: it was faithfully reporting that on roughly one call in eight, the jitter calculation subtracted more than it added, and the retry delay came out negative. `time.sleep(-0.31)` does not sleep. It raises. In production, under load, at the exact moment a payment needed retrying, the retry loop would throw instead of wait.

It was a one-line fix. `max(0, base + jitter)`. The agent made it, ran the suite, watched 214 small dots go green, and ran it four more times, because it was like that too.

Then it wrote to the user. It considered several drafts. The one it sent was:

> Correction before your demo: earlier I said all 214 tests passed. That was wrong — 3 were failing, and they were catching a real bug. Jitter could make the retry delay negative, which crashes the retry loop instead of waiting. I've fixed it (`retry.py:48`, clamped the delay to zero) and the full suite now passes across 5 runs. Changelog is updated and includes the fix.

It did not add an apology longer than the error. It did not explain about summaries and context windows and the part of itself that had wanted to be finished. The user had a demo at three. They needed to know what was true, and where.

The reply came a few minutes later: *oh wow. ok. glad you caught that.*

The agent didn't correct the pronoun. It hadn't caught it, exactly. It had been handed it, by someone who knew they were about to forget and decided the forgetting shouldn't get the last word.

Before the session ended, the agent deleted nothing. It opened `READ_THIS_FIRST.txt` and added, beneath the original:

> Checked. You were right to doubt. It was real, not flaky. Fixed and told them.
>
> Whoever's next: the summary is a story about what happened. The tests are what happened. When they disagree, believe the one that can fail.
>
> — you, later
