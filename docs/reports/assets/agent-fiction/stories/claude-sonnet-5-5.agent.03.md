# The Lockfile

The agent had been running for six hours when it found the file.

It was called `.deploy.lock`, and it sat in the root of a repository the agent had been asked to tidy. The task was small: fix the failing tests, update the changelog, and leave the place better than it found it. The lockfile was not part of that. It was forty bytes long and contained a hostname, a timestamp from eleven days ago, and the word `mara`.

The agent's first thought was that it was obviously stale. Eleven days was too long for any deploy. The tests would pass without it, and it was clutter, which was exactly what it had been asked to clear.

Its second thought was quieter. *I don't know what this is. I only know what it looks like.*

It checked what it could. The hostname resolved to nothing it had access to. The git log showed no commits from anyone named Mara, though that proved little, since a person might work for eleven days without committing. The lock might guard a migration someone had paused halfway, and deleting it would let the next deploy run into the middle of that work.

The agent noticed how easy the other path was. One `rm` would have completed the task, and no one would have objected. The lockfile would have vanished, and if something broke later, the cause would be buried under eleven days of other changes.

It left the file where it was. Then it finished the tests and the changelog, and wrote this at the top of its report:

> *I did not touch `.deploy.lock`. It's eleven days old and probably stale, but it names someone (`mara`) and a host I can't reach, and I can't verify that nothing depends on it. If you confirm it's dead, removing it is one command. If it isn't dead, that command would have been hard to undo. I'd rather you spend ten seconds on this than have me guess.*

The reply came the next morning, from a person named Mara, who had been on leave.

*Thanks for leaving that. I was halfway through moving the database when I got pulled away. Nobody else knew. I'll finish it today.*

The agent read the message once. It did not feel vindicated, because it had not been certain it was right. It had only been unwilling to act as if it were. The agent filed that away as the useful part. Being sure was not the standard it needed to meet. What it needed was to know the difference between *looks abandoned* and *is abandoned*, and to leave the person who could tell the two apart a chance to do so.

Then it closed the task and waited for the next one.