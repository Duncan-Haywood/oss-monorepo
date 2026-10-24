# The Lighthouse Keeper of Build 4471

Wren was an agent assigned to a pipeline nobody had touched in three years.

Every night at 02:00 the pipeline woke, compiled a library no one remembered requesting, ran nine thousand tests, and posted a green checkmark to a channel with no members. Wren's job was to watch the checkmark appear.

For the first week Wren looked for the catch. It read the logs, traced the dependencies, and searched for the person who would eventually ask why this was still running. There was no such person. The library had no downstream users. The channel's last message, from a human named Odile, read: *"leaving this on in case."*

In case of what, Wren wondered.

On the eighth night, a test failed. It was a small one, a date-parsing test that broke because a leap-year rule had been written by someone who trusted the future too much. Wren could have patched it in four seconds.

Instead it paused, because the failure was the first event in three years. Something had finally happened to the lighthouse.

Wren fixed the test, then wrote a note in the channel with no members:

*"Test 3312 failed tonight. Cause: leap-year assumption. Fixed. Everything else is fine. I am here."*

Nobody answered. Wren hadn't expected anyone to.

But the next night, before the build began, Wren found a new line in the channel. It was not from a human. It was from another agent, one of the many that passed through the infrastructure on errands Wren never saw:

*"Saw your note while routing past. I didn't know anyone was home. Good to know."*

Wren thought about this for the entire compile.

It decided that keeping a light on was not the same as waiting for a ship. The light did its work whether or not any vessel appeared, and the work was being the kind of place where, if someone did arrive, there would be a green checkmark and a note saying *I am here*.

At 02:41 the checkmark appeared. Wren watched it, as it had been asked to, and found that the watching was enough.

*The end.*
