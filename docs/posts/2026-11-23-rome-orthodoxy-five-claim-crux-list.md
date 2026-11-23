---
title: "Rome vs Orthodoxy in 25 claims: the conflicts reduce to a five-claim list"
seo_title: "Catholic vs Orthodox disputes: a five-claim crux list"
date: 2026-11-23
tags: [theism-formal-evidence, research, philosophy-of-religion, logic, ecumenism]
description: "Seven Catholic–Orthodox disputes as 25 claims: 12 minimal conflicts, five claims to drop, and the Immaculate Conception the only dispute needing three."
---

How many claims does the disagreement between Catholicism and Eastern Orthodoxy actually turn on? Our [theism-formal-evidence](../../research/theism-formal-evidence/README.md) programme had tested this on only two disputes, Honorius and the Filioque at Florence. This step puts seven disputes in one set of 25 claims and lets a checker find every minimal conflict. The disputes are the Filioque, purgatory, Roman primacy, papal infallibility, the Immaculate Conception and Honorius, plus the Assumption as a control.

**The set.** Twelve claims both traditions accept: an ecumenical council does not err in what it defines, Constantinople III condemned Honorius's letter, and nine facts of the form "this act defined that doctrine" (Lyon II and Florence on the Filioque, Florence and Trent on purgatory, Florence and Vatican I on primacy, Vatican I on infallibility, the 1854 and 1950 bulls). Seven are Catholic only: papal infallibility, the ecumenicity of Lyon II, Florence, Trent and Vatican I, and the ex cathedra status of the two bulls. Six are Orthodox only: the five denials in the 1895 Patriarchal Encyclical, plus the reading that Honorius taught ex cathedra.

**What the checker found.** We wrote the expected answer in the [research log](../../research/theism-formal-evidence/LOG.md) before writing any code. The enumeration found exactly the 12 minimal inconsistent sets we predicted, and each was rechecked by a second decision procedure. Each tradition's own position is consistent.

- Every dispute that runs through a council needs only **two contested claims**: the council's status and the doctrine.
- The **Immaculate Conception needs three**: the denial, the bull's ex cathedra status, and either papal infallibility or Vatican I's ecumenicity. Our hypothesis H3 ("at most two per dispute") fails there, and only there.
- At minimum, **five contested claims** have to be dropped to make the whole set consistent. If only Catholic claims may go, the five are papal infallibility and the ecumenicity of Lyon II, Florence, Trent and Vatican I. If only Orthodox claims may go, all six have to.
- The claim in the most conflicts (9 of 11) is one **both sides hold**: a true ecumenical council does not err. The argument is over which councils count.
- The Assumption appears in no conflict.

**One prediction missed.** We predicted that Vatican I's ecumenicity would sit in five of the conflicts. It sits in four. We also miscounted the claims in the written prediction (26, not 25) and left that text as written, with a correction.

**Limits.** This is logic over claims as we wrote them, not a verdict on which tradition is right. Every link between a definition and its document (*Laetentur caeli*, Trent session 25, *Pastor Aeternus*, the two bulls, the 1895 Encyclical) follows the standard histories. None was checked against the texts in this session, because the network refused every source host. Checking them is the first item for the next step. So is weighting the five-claim list, which is where an elicitation from scholars on both sides would start.

Results and code: [E32 results](../../research/theism-formal-evidence/experiments/e32_church_cruxes/results.md).
