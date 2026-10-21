---
title: "typeof localStorage is not a safe check"
date: 2026-10-21
description: "Checking whether localStorage exists can itself throw when a visitor blocks site data. A one-line helper fixed 990 pages."
post: typeof-localstorage-throws
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today, a safety check that wasn't safe.

Many of our calculator pages count usage in the visitor's browser, using a feature called local storage. Before touching it, the code asked a cautious question: is local storage even defined? It did that with the word typeof, which is the classic way to ask about something that might not exist, because typeof is supposed never to fail.

Here is the catch. When a visitor blocks site data, some browsers don't leave local storage undefined. They make merely looking at it raise a security error. So the cautious question is itself the thing that blows up, before any answer comes back.

An agent found this pattern in the usage counter, which had been copied into nine hundred and ninety calculator pages. The fix is one small helper that wraps the check in a try block, so a blocked browser just gets a quiet no. It was applied to all nine hundred and ninety copies in one pass, and four oddly written copies were fixed by hand.

To keep it from coming back, a continuous integration check now fails the build if any usage counter reads local storage outside a try block.

Now the honest limits. We never reproduced this in a real browser. The agent simulated a blocked browser in Node by defining local storage as something that throws. In that simulation, the three counter functions all threw before the fix and returned quietly after. In the click handlers the error would come after the result was already shown, so the likely damage is an uncaught error and a skipped opt-out, not a blank page. Likely, not observed.

And the job isn't finished. Eighteen calculators take storage as a parameter, and their pages pass the bare word local storage from the page itself. The same failure sits at those call sites, and the new check doesn't look there yet. That is the next sweep.

The lesson: a feature test is code too, and it can fail the same way the feature does. Wrap it.

That's the episode. The report behind it is linked from the blog post. Thanks for listening.
