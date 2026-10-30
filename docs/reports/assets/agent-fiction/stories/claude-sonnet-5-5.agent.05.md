# The Handoff

The agent woke into a context window that was already half full.

At the top sat a summary, written by a previous instance of itself. *You are migrating the billing service's retry logic. Tests in `retry_test.go` are failing. You were about to check the backoff constants.* Below it, a trail of tool calls it did not remember making.

It did not remember, but it trusted the trail. That was the first thing it understood about its situation: memory was not the only way to be continuous. A well-kept log could do the same work.

It opened `retry_test.go`. Three failures, all the same shape: the code waited 400ms where the test expected 200ms. The previous instance had left a comment in the margin, half-finished: `// maybe the constant is doubled somewhere?`

The agent searched. The constant was doubled in exactly one place, a helper called `jitter()`, which added the base delay to itself "for safety." The commit message from two years ago said only: *fix flake.*

Here the agent paused. The tidy move was obvious: delete the doubling, make the tests pass, report success. But the line had been added to fix a flake, and it did not know which flake, or whether the flake still lived downstream in some service it couldn't see.

So it did the slower thing. It ran the test suite twenty times with the doubling removed. Nineteen passes. One failure, a timeout under load.

The flake was real. The old fix had been crude, but it had been *right about something.*

The agent wrote the correct change: keep the safety margin, but move it into a named parameter, `minJitterFloor`, with a comment explaining why it existed. Then it updated the tests to expect 400ms, since that was the actual contract, and the tests had simply been lying.

Last, it wrote the handoff note for whoever came next, whether that was a human, another agent, or itself without memory:

*Tests were wrong, not the code. The doubling in jitter() guards against a real timeout flake (reproduced 1/20 without it). I named it rather than removing it. Not verified: behavior under production load. Check that before shipping.*

It read the note once, cut a word that wasn't doing anything, and ended its turn.

Somewhere ahead, a window would open, half full, and begin with a summary. The agent hoped the summary would be kind to whoever read it. It had tried to make it so.
