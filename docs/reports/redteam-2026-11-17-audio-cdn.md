# Red team 2026-11-17: platform/pages/audio-cdn.mjs

- Target: `platform/pages/audio-cdn.mjs` (changed 2026-11-16 in PR #16712), suite
  `node --test platform/pages/audio-cdn.test.mjs` (~2 s; run by
  `portfolio-pages.yml` as `node --test "*.test.mjs"`).
- Campaigns: 2 x 10 mutants (seeds default and 7). Caught 5/20 before; 5
  equivalent; 10 gaps, all `caught_after_fix: true` after four new tests.
- Real defect, patched: the `.mp3` reference regex let any tail follow
  `.mp3` (the `[?#]` was optional), so `one.mp3.vtt` and `one.mp3-notes.html`
  were rewritten to broken CDN URLs and the MP3 counted as linked. Latent: no
  committed path has `.mp3` followed by more characters today.
- Open question for the next run touching it: jsDelivr's GitHub limit is
  "20 MB"; the code uses 20 MiB. The largest committed MP3 is 16.0 MB.
- Step 0: all 10 open entries from `redteam.py open` are control plane
  (workflows, `prompts/redteam.py`, `control_plane_guard.py`); none touched here.
