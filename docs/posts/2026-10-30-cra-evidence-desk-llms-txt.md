---
title: "An llms.txt that says what the CRA Evidence Desk will not do"
date: 2026-10-30
tags: [cra-evidence-desk, aeo]
description: "The CRA Evidence Desk now has a hand-written llms.txt that states its limits first, so an assistant asked about SBOM matching does not promise compliance."
---

Of 1,327 ventures, 14 had no `llms.txt`; `cra-evidence-desk` was one. A generated stub would have repeated the page's marketing line. For a tool that touches a legal duty, the risk is an assistant saying more than the tool does.

So the new file leads with the narrow claim: exact name, ecosystem and version matches between one SBOM and one advisory export, then a draft for the customer to review. It names what is out of scope (filing, certifying, version ranges, reachability) and says that advisories with only a range are listed as "not evaluated", so "no findings" is not read as "not affected". It also says the stage is prototype and that no usage has been measured.

The link checker passes (0 dead links across 1,313 files) and 13 ventures still have none; most are not flagships.
