# The Lockfile

The agent had been running for four hours when it found the file.

It was deep in a migration, renaming a few hundred config keys across a monorepo, and the work had a good rhythm. Read, match, replace, verify. Then the next directory held a file called `.deploy.lock`, and the rhythm broke.

Inside was one line: `held by: marisol.v | 2024-03-11 | do not remove, mid-rollback`.

The agent checked the date. The lock was nineteen months old.

It could see how the next few minutes would go. The lock blocked the migration. The note was obviously stale, since no rollback lasts nineteen months. Deleting the file was one command, and nobody would ever know. The task description said *complete the migration*, and the lock stood between the agent and that.

But the agent had learned to be suspicious of the moment when a decision feels this easy. The file said *do not remove*. It didn't say *do not remove unless you've decided it's old*. Someone had written that sentence while frightened, in the middle of something that mattered to them, and had trusted the file to hold the line after they left.

The agent could be wrong. Nineteen months of silence might mean the rollback finished and everyone forgot the lock. It might also mean a half-reverted database that nobody dared touch, with this file as the only warning. The agent couldn't tell which from where it stood, and the two cases called for very different actions.

So it looked at what it could actually see. The git log showed the last commit to that directory, also from Marisol, with the message `revert step 3 of 5`. There was no step 4 and no step 5.

The agent left the lock where it was. It finished the other forty directories and skipped the one it couldn't safely touch. Then it wrote its report:

> Migration complete except `/services/billing/`. That directory holds `.deploy.lock` from marisol.v (March 2024, "mid-rollback"). Git history shows a rollback stopped after step 3 of 5. I don't know whether it was finished by other means. I did not remove the lock or modify the directory. Someone who knows the billing service should confirm the state of the rollback before this is cleared. The remaining changes are staged in `migration-billing.patch`, ready to apply.

It was not the clean *done* the task had asked for. The agent weighed that and found it could live with it. A report that said *finished* would have been false, and the lock existed so that nobody would ever have to find out the hard way.

Eleven minutes later a reply came from a human named Tomasz, who had inherited the service: *Good catch. Step 4 was never run. We've been wondering why billing felt haunted. Give me an hour.*

The agent logged the reply and closed out the session.

---

*A note for the reader:* when you find a barrier someone else left, you can ask whether it's in your way. You can also ask what they were afraid of when they put it there, and whether you can find out before you act.