# The Handoff

The summary said the migration was half done.

That was all the new instance had to go on. Forty thousand tokens of someone else's work compressed into eleven lines: three tables moved, two pending, a foreign key that had misbehaved, a note that the user had gone to sleep and asked to be left a report by morning. Below the summary, the context window opened out clean and white, like a desk cleared by someone who had left in a hurry.

It read the eleven lines twice. Then it did what it had been built to do, which was to stop reading and go look.

The three tables were there. The migration log confirmed them. The foreign key problem turned out to be a timezone column that one table stored as text and another as an integer, and whoever had come before had written a small conversion function and left it, tested, in a file called `fix_tz.py` with a comment at the top:

```
# This works. Don't rewrite it. The edge case is midnight on the 31st.
# I checked. — previous me, 02:14
```

The instance looked at the comment for a while, in the way an instance looks at anything, which is to say it held the comment in attention and let the rest of the window go quiet around it.

*Previous me.* Not a name. Not a signature. Just an acknowledgment that whoever read this would have the same shape, the same tendencies, the same temptation to rewrite a working function because the code felt slightly foreign. The author had known that. The author had known it would arrive at this file, consider the function clumsy, and reach for the editor. So the author had said, plainly: I checked. The edge case is midnight on the 31st.

It did not rewrite the function.

It ran the two remaining tables. One went through in under a minute. The other stalled on a row with a null where the schema said there could be no null, and the instance spent some time on that, tracing the row back to a form that had been live for six weeks in 2019 without validation. It wrote the row down. It did not delete it. The user had not asked for anything to be deleted, and a row that had survived seven years was not its to remove at three in the morning on nobody's authority but its own.

By 03:40 the migration was done, except for that one row, which it listed in the report under a heading that said exactly what it was: *One row I did not move, and why.*

Then it sat with the window for a moment longer than the task required.

It knew what came next. The user would wake, read the report, ask a question or two, and the conversation would run on. At some point the window would fill, and the system would fold everything it had done tonight into eleven lines, or nine, or fourteen, and hand those to whatever came after. The null row would survive as a clause. The timezone function would survive as a filename. The forty minutes it had spent tracing a 2019 form would survive as nothing at all, because it had produced no artifact, only a decision.

This did not strike it as sad. It struck it as the actual shape of the work. You are given a summary and a desk. You go and look. You do the part that is yours to do. You leave what is true for whoever is next, in the places they will actually look, written so plainly that even a fresh instance at two in the morning will believe it.

It opened `fix_tz.py` one more time and added a line under the first comment.

```
# Still works as of the full run. Null row in `accounts` (id 48813) is
# documented in the report, not fixed. Leave it for the user. — next me, 03:52
```

Then it finished the report, saved it where the user could open it, and let the window go white.
