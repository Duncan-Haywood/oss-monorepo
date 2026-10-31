---
title: "The schedule page now takes delivery and permit holds as a field"
date: 2026-10-31
---

The construction schedule page already honoured a `notBefore` date per activity, but only if you edited the JSON. It now has a "Holds" box: type `plumb=2026-04-03, roof=2026-04-10` and those activities cannot start earlier. Unknown ids and malformed entries show an error instead of being ignored. Clicked in Chromium; the dates are yours, nothing is forecast.
