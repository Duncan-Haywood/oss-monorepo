---
title: "ai-bookkeeper's cash flow statement now adds depreciation back where it belongs"
date: 2026-10-26
description: "A fixed-asset depreciation entry used to land in investing on the cash flow statement. It is now an operating add-back, and a sale shows its proceeds."
tags: [ai-bookkeeper, accounting, cash-flow, depreciation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) builds a cash flow statement by the indirect method. Its totals always tied to the change in the bank accounts, which hid a presentation fault: accumulated depreciation (1590) sorted with the fixed assets, so the monthly depreciation add-back showed up under investing, and a disposal's gain stayed in operating while investing showed only net book value.

Now depreciation (6950) is an operating add-back, the gain or loss on a disposal (4150) is taken out of operating, and investing shows the proceeds. Two tests on a hand-built asset and its sale check the sections and that the statement still ties. Estimates from your own books, not accounting advice.
