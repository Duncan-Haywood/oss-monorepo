# Owner checklist

The only things {{BUSINESS_NAME}} needs from its owner: the steps that involve
money, identity, signatures or accounts, which no run may take
(`GUARDRAILS.md`). Runs prepare each one so it takes minutes, keep the most
valuable first, and never add a duplicate. Tick a box when it is done, and
put anything a run needs (a public URL, an account name, never a secret) on
the line below it.

Format, one item per entry:

```
- [ ] **item-id** What to do. Why: what it unblocks. Steps: where to go, what to paste. (~N min)
```

Secrets (API keys, tokens) go in the repository's or host's secret settings,
never in this file.

## Open

- [ ] **automation** Connect this repository to scheduled Claude Code runs. Why: nothing happens without it. Steps: `SETUP.md`. (~10 min)
{{OWNER_ITEMS}}

## Done

