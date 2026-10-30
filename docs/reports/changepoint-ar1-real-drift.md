# changepoint-detector: --ar1 on real drifting series (2026-10-29)

Ran `eval/drift-warning-real-ar1.mjs` (output committed, pinned by `drift-warning-real-ar1.test.mjs`). With `--trend bend --ar1`: airline warns, Nottingham silent, UK gas loses the warning (6-7 steps to 1), UK driver deaths raw loses it, log keeps it, J&J never warned. Next run: try a noise-scale widening that does not swallow short quarterly shapes (e.g. rho estimated after steps are removed). `next:` in flagships.yaml updated.
