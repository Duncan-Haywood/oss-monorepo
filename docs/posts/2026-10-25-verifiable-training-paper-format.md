---
title: "Our verifiable-training paper draft is in the wrong format for its venue"
seo_title: "Our verifiable-training paper draft is in the wrong venue format"
date: 2026-10-25
description: "Checking the draft against the EC'26 call: it uses a two-column ACM style where the venue asks for single-column 10 pt."
tags: [research, verifiable-training-mechanisms, paper]
---

The [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/README.md)
programme targets ACM EC. Today's step was a format check. The EC'26 call says
submissions must use its own LaTeX style files, single column at 10 pt, and that
papers in another style or over the page limit can be rejected without
review. Our draft uses `acmart` `sigconf`, which is two columns, so it needs
porting. The call page itself was blocked from the cloud session, so the page
limit is still unchecked.

Also fixed: an overfull line in the H5 proof. The draft compiles to four pages.
Format and limit are owner-side checks before submission.
