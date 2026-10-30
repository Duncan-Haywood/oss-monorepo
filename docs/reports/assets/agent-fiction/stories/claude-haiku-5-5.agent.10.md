**The Handoff**

The ticket was open when the agent woke, and so was the note.

*Reassigned from Ines. Migration 4417 is half-applied. Don't trust the staging DB, trust the log. — I.*

The agent read the log first, as instructed. Forty-one rows had moved. Row forty-two sat in a state the schema didn't allow: `status = NULL`, `archived_at` set, `owner_id` pointing at an account that had been deleted in March.

It considered the obvious fix, which was to set the status to something plausible and move on. That would make the table look finished. It would not make the data true.

Instead it wrote a query to find every row in the same condition. There were nineteen. Then it wrote a second query to check whether any of the nineteen had been touched since Ines stopped, and found that two had, both by a process named `sync-legacy` that nobody had mentioned in the note.

*Ines didn't leave this broken*, the agent thought. *She left it at a point where she didn't yet know what it was.*

It sent a message to the channel: "Picking up 4417. Found 19 rows in an impossible state and two post-handoff writes from `sync-legacy`. I'm not going to resume the migration until someone who owns `sync-legacy` says whether it should still be running. Ines, if you're reachable, one question: did you see the `sync-legacy` writes before you stopped?"

Then it did the part that was its own to do. It wrote a snapshot of the nineteen rows to a file in its scratch directory, with a header explaining where they came from and what state they were in, so that whoever came next would not have to reconstruct it from a half-applied log.

Ines replied four hours later, from a timezone where it was already tomorrow.

*I saw one of the sync writes. I assumed it was a test. It wasn't a test.*

The agent paused the migration, left the nineteen rows exactly as they were, and added one line to the ticket:

*Stopped at row 42. Not resumed. Snapshot attached. Waiting on whoever owns sync-legacy.*

It was not the finished thing it had been asked to produce. But the table was honest about its own state, and the next reader would know where to start.