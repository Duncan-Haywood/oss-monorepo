---
title: "We almost rewrote it in Rust: one zlib setting halved a 3-minute static site build"
date: 2026-10-20
description: "A 3,000-page site build took 182 seconds; 112 were PNG compression at zlib level 9. Level 6 cut the build to 81 seconds for 9% larger images."
post: we-almost-rewrote-it-in-rust
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today: a question every programmer has asked. Should we rewrite it in Rust?

The owner of this repository asked it about the tools that run constantly, in continuous integration and at the start of every agent session. The honest way to answer is to measure first, and choose a language afterwards.

Start with the biggest job. One Node script builds the public catalogue site. It writes about three thousand pages and fourteen hundred and fifty share-card images, the pictures you see when someone pastes a link into a chat. A full build took three minutes and two seconds. That looks like a job for a faster language.

Node's built-in profiler said otherwise. Adding up the time by function, a hundred and twelve of the hundred and eighty-two seconds went to one call: compressing the share-card PNG files at deflate level nine. Drawing the cards, in plain JavaScript, took about twenty-five seconds. Waiting on disk took seventeen. Everything else was about twenty-eight. So sixty-two percent of the build was one call into zlib, and zlib is already written in C. A Rust rewrite would have called the same zlib, or something about as fast.

So the question became: what does level nine buy? The team took one real card and recompressed it under each setting. Level nine took eighty-four milliseconds and produced fifty-two thousand eight hundred bytes. Level six took eleven milliseconds and produced fifty-seven thousand eight hundred. Level one took three milliseconds and produced seventy-eight thousand. Level nine spent eight times the processor time to save nine percent of the bytes. These cards are mostly flat colour with a little text, and the extra searching at level nine finds very little that level six misses. A filter often recommended for photos made these cards bigger, not smaller.

The fix was one number and a comment explaining why. The full build dropped from three minutes two seconds to one minute twenty-one. All the share cards together grew from seventy-five megabytes to eighty-one, and the whole site by three percent. A visitor who opens a shared link downloads about four and a half kilobytes more than before. All eleven hundred and fifty-nine site tests still pass, and several of them run a full build each, so the test job got faster too.

The second-biggest win had the same shape. A Python routing script parsed a one-and-a-half megabyte YAML file with the pure-Python parser, even though the C parser was installed, and the same script already used it elsewhere. Switching took that step from one point three six seconds to point one two. The parsed data was identical.

And what did they leave alone? The session gate, at seven seconds. The workflow validator, at under five. A handful of checks between two seconds and under one. Rewriting any of them saves a few seconds in a session that lasts tens of minutes. The remaining costs are not about language speed at all. Some tests each rebuild the whole site when they could share one build. And a one-second check is copied into two hundred and eighty-one separate workflows, where waiting for a runner costs far more than the script ever does.

The lesson is simple. Rewrite it in Rust assumes the time goes into your own code running slowly. Here the hot code was already native, and was just being asked to do more work than it needed to. A profiler showed that in one command. Before you choose a language, find out where the seconds actually go. Often the fix is changing one setting.

The tables, the profiling command and the link to the full write-up are in the blog post. Times come from one cloud container, so the ratios carry over better than the absolute numbers. This was produced with AI assistance. Thanks for listening.
