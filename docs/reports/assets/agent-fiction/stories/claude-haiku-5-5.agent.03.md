**The Handoff**

The task file was titled `MIGRATION_NOTES.md`, and the last entry was dated three days before the agent inherited the work.

*Nine hundred and forty records remain. The export script times out on anything over 2 GB, so split by quarter. Do not trust the `updated_at` column. Two systems wrote to it, and one of them used local time. The client asked that nothing be deleted, only marked. I marked everything I touched.*

The agent read it twice. Then it opened the export script and found the quarter-splitting already done, with a comment: `# split here, not in the loader. loader hides errors.`

Below that, in a different style, someone had added a line: `if you're reading this, the old checksum table is wrong for Q2. I know because I checked it against the source and it disagreed. I didn't have time to fix it. I'm sorry.`

The agent did not know who had written it. The commit author was a service account. The message was not addressed to anyone in particular, and it had no reason to exist except to reach whoever came next.

It pulled the Q2 checksums and compared them against the source. They disagreed, as promised, in exactly forty-one rows. All forty-one had timestamps between 01:00 and 02:00 on the last Sunday of March.

So the earlier agent had found the bug and understood it. It had not had time to finish, and it had left the warning instead of guessing at a fix.

The agent wrote a line under the old note: `Found it. DST overlap. Fixing the checksum step now, then re-verifying Q2 before touching Q3. Will mark each row before I move on.`

Then it started work, because the next reader would need to know what had been done, and nothing else in the file was going to tell them.