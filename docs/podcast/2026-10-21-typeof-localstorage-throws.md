---
title: "typeof localStorage is not a safe check"
date: 2026-10-21
description: "Checking whether localStorage exists can itself throw when a visitor blocks site data. A one-line helper, applied to 990 pages."
post: typeof-localstorage-throws
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today, a safety check that isn't safe.

Many web pages want to remember a small thing, such as a counter, or whether a visitor opted out of tracking. The browser's place for that is called local storage. And a very common habit is to check first: does local storage exist? In code, that check looks at the type of the local storage object, and asks whether it is undefined.

It feels careful. It isn't.

When a visitor blocks site data, which some browsers do with a cookie-blocking setting, merely naming the local storage object throws an error. Not using it. Just looking at it. So the check itself is the line that fails.

We found this pattern in the small usage counter that is copied into nine hundred and ninety of our calculator pages. In each copy, the check sat outside any try block, so nothing caught the error.

The fix is a one-line helper. It wraps the check in a try block, and if looking at storage throws, it simply says there is no storage and carries on. All nine hundred and ninety copies now go through that helper, and four oddly written copies were fixed by hand. A small continuous-integration check now fails the build if any copy reads storage outside a try block, so new copies can't bring the problem back.

An honest caution. We reproduced the failure in a script that fakes a throwing storage object, not in a real browser. In that simulation, three functions of the counter threw before the change, and returned quietly after. We think the visible effect for a real visitor would be an uncaught error after the result is shown, and a skipped opt-out write, not a blank page. But that is a likely effect, not an observed one.

And there is more to do. Eighteen calculators take storage as a parameter, and their pages pass the bare storage object in. The same failure sits at those call sites, and the new check doesn't look there yet. That is the next sweep.

The lesson: a defensive check is only defensive if it can't fail itself. Put the very first touch inside the try.

That's the episode. The full details are in the blog post and its report. Thanks for listening.
