# ai-bookkeeper: Firefly III config probe (2026-10-24)

For the next run on the bank readers (flagship `ai-bookkeeper`, item 2).

- `ventures/ai-bookkeeper/eval/firefly-probe.mjs DIR` reads a directory of
  `default.json` files from firefly-iii/import-configurations (MIT). Fetch with
  `https://raw.githubusercontent.com/firefly-iii/import-configurations/main/<cc>/<bank>/default.json`;
  there is no listing reachable (codeload and the GitHub API are blocked), so guess
  `country/bank` paths. 42 existed out of ~230 guesses.
- Result: 41 layouts, all read right after two fixes (`bank.mjs`). The Wells Fargo
  config's `m#d#Y` is escape notation; ignore its failure.
- The configs do not hold header text. Next: find real header rows for the banks in
  `bank2ynab.conf` (`Header Rows = 1`) or any bank's own help page.
