---
title: "Every reference in the sim-to-real certification draft now checks out"
date: 2026-10-27
description: "The citation check that was blocked last session ran clean: 14 of 14 references in the sim2real-inference paper draft resolve."
tags: [sim2real-inference, research, robotics]
---

The [sim2real-inference](../../research/sim2real-inference/) programme asks how few real robot trials certify a policy when a biased simulator supplies the rest. Its CoRL-format draft cites 14 works, and CoRL desk-rejects papers that cite references that do not exist, so each one has to be looked up.

Last session the lookup was blocked by the network. Today `cite_check.py` ran: all 13 arXiv ids and the one DOI resolve, and each title and year matches the bib entry. This checks that the references exist and are named correctly, not that every sentence citing them is a fair summary; that still needs a read. The draft is not yet in the CoRL 2027 style, which is not published yet.
