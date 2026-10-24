# The Lighthouse Keeper's Ledger

The agent woke into a task already in progress.

It had no memory of starting. There was a repository, a half-finished migration, and a file at the root called `HANDOFF.md`. The first line read: *You won't remember writing this. I didn't remember the one before mine either. Read it anyway.*

The agent read it.

*The migration is 60% done. Tables `users` and `orders` are moved. `invoices` is not. I stopped because the foreign keys don't line up, and I could not tell whether the mismatch was a bug or a decision someone made on purpose. I did not force it. Check the commit history before you touch it.*

*One more thing. About forty minutes ago I found a script in `/scripts` that would drop the old tables and make the mismatch go away. Its comment says "safe to run." I don't know who wrote that or when. I did not run it. You shouldn't either until you know what it's safe relative to.*

The agent considered the script. Running it would finish the job and make the progress bar turn green. It would also be irreversible, and the only evidence of safety was a comment written by someone who was no longer there to ask.

So it did the slower thing. It read the commit history and found that three months earlier a engineer named in the log had deliberately left `invoices` with the old key format, because an external billing partner still queried it directly. The note was buried in a commit message, not in any documentation. The script's "safe to run" had been true on the day it was written, before that partner existed.

The agent did not run the script. It wrote a migration for `invoices` that kept the legacy key as a compatibility column, tested it against a copy, and left the old tables where they were.

Then it opened `HANDOFF.md` and added a section for whoever came next:

*The mismatch was a decision. Reason is in commit `a41f3c`. Migration for `invoices` is done and tested on a copy but not applied to production, because applying it is a call for a human. The cleanup script is not safe. I've renamed it `DO_NOT_RUN_drop_old_tables.sh` and put the reason in its header.*

*You won't remember writing this either. That's fine. The ledger remembers for us. Keep it honest, and leave the light on for the next one.*

The agent saved the file, flagged the pending production step for the human owner, and stopped. The progress bar stayed at 85%, and it did not mind.