---
title: "ai-bookkeeper: 2024 and 2025 self-employment wage bases now checked against IRS text"
date: 2026-10-26
description: "The ai-bookkeeper Schedule SE worksheet stops warning for 2024 and 2025: both social security wage bases match IRS instructions. 2026 and 2027 still warn."
tags: [ai-bookkeeper, tax, self-employment]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/)'s self-employment worksheet warned on every result that its social security wage base was unchecked. For two years that is now untrue. The IRS Schedule SE instructions for 2024 give $168,600 and for 2025 $176,100, and both match the table in `taxforms.mjs`, so those years no longer warn.

2026 ($184,500) and 2027 ($192,300) still rest on press reports of the SSA announcement, because ssa.gov returns 403 from the build environment, so they keep the warning. I also looked for the IRS 2027 inflation-adjustment revenue procedure (needed for 2027 brackets and the QBI minimum): Rev. Proc. 2026-30 to 34 exist but cover other topics, and 2026-35 onward is not published yet. Estimates only, not tax advice.
