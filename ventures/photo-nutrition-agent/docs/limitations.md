# Limitations and open questions

## Not yet verified

- **The iOS code has never been compiled.** The build container has no Swift or Xcode. Expect small compile fixes on first build: API signature drift, `Sendable` warnings under Swift 6, the exact Vision taxonomy names. The logic, file layout and permission keys are complete.
- **The live model call is untested.** The request shape is pinned by a test against a fake `fetch`. The default model name (`gpt-5-mini`) is configurable through `NUTRITION_MODEL`; set it to whatever vision-capable model your account offers.
- **ChatGPT Plus eligibility for MCP write tools is unresolved** (`platform-research.md` §4). If developer mode on your plan only allows read tools, use the Custom GPT Actions path in `install.md`. It reaches the same tools.
- **App Intent background time** is undocumented. The intent budgets 25 s and leaves the rest queued.

## Platform limits (not fixable in code)

- **No instant trigger.** iOS does not wake apps for new photos. Photos taken without leaving the Camera through a path that fires the automation (for example, the lock-screen camera, then locking the phone) wait for the next wake.
- **Full photo library access is required.** Limited access hides new photos.
- **HealthKit is unavailable while the phone is locked.** Writes made by locked background wakes are deferred until a later unlocked wake.
- **Corrections reach Health on the next wake**, not instantly (no push yet).
- **Shortcuts automations can misfire.** Users report "is Closed" firing on the App Switcher. Harmless here: a run with nothing new costs a second.

## Estimation quality

- Visual portion estimates are often 20%+ off per meal, and the error does not average out if the model is biased (for example, if it always under-counts cooking oil). The energy range and `source` field are there so nobody mistakes an estimate for a measurement. Weighed foods and labels should be preferred where it matters.
- There is no accuracy evaluation yet. Next step: 50 meals with weighed ground truth, to measure bias and spread per food type (plan, P1).
- The classifier's food label set is a starting guess; tune it on your own library. False negatives are the costly error (a missed meal), so the threshold starts low (0.15) and the server's second stage removes false positives.

## Design gaps (on the plan)

- No silent push for corrections, no USDA FDC lookup, no food correlation in HealthKit (samples are individual, tied by `PNAMealID` metadata).
- Single user. Multi-user would need per-user auth and storage.
- Images at rest are not encrypted by the app (they live for 3 days by default); use an encrypted disk/volume.
- The iOS 26.1+ background upload extension is researched but not used (ADR, "Revisit when").
