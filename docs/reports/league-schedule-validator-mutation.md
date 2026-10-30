# league-schedule-generator: validator mutation check (2026-10-29)

`ventures/league-schedule-generator/eval/mutate-validator.mjs` plants 17 single faults into valid random schedules and requires `validateSchedule` to flag each. Seeds 3 to 5: ~15,000 mutants, 0 missed. `flipHome` on a single round robin is an equivalent mutant (inside the +-1 tolerance), counted apart; `allHomeForTeam` is the stronger home/away mutant. Not covered: mutants on divisions (`validateDivisions`), officials, withdrawals. Flagship `next:` unchanged (still a real league's travel times).
