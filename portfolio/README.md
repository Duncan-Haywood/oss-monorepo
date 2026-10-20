# portfolio: how effort is steered across the products

This directory is the management layer for the products in
[`ventures/`](../ventures/README.md): what to build next, what each product has
cost, what usage it gets, and how it reaches people. Nothing here is a product
itself; the tools are at
**[duncan-haywood.github.io/monorepo-projects](https://duncan-haywood.github.io/monorepo-projects/)**.

Start with [`DIRECTION.md`](DIRECTION.md), the strategy reference (long: read
the sections your task touches; [`prompts/goals.md`](../prompts/goals.md) wins
where they differ).

| Directory | What it holds |
|---|---|
| [`router/`](router/README.md) | Decides which product gets the next unit of agent effort, from each `VENTURE.yaml` and the ledger. |
| [`scoring/`](scoring/README.md) | Merit scores for the products the portfolio owns, on the same six dimensions used for candidate ideas. |
| [`pipeline/`](pipeline/README.md) | Businesses researched and scored but not yet started, and how one graduates into `ventures/`. |
| [`usage/`](usage/README.md) | Usage readings per product: the signal steered by while everything is free. Events, never people. |
| [`ledger/`](ledger/README.md) | Append-only record of what was spent on each product and what happened, plus the session gate and decision queue. |
| [`distribution/`](distribution/README.md) | Automated, unpaid, terms-compliant distribution: which registries, stores and directories count, and the owner gate. |
| [`hosting/`](hosting/README.md) | Where products are served (GitHub Pages for static tools) and the rules for choosing a host. |
| [`sales-tools/`](sales-tools/README.md) | Sales, marketing and business tools that use AI on the person's own key. |
| [`research/`](research/README.md) | Internal measurements behind portfolio decisions, each with the script and raw results. The public research portfolio is [`research/`](../research/README.md) at the repository root. |
