# Vendor inventory

Assessed 2026-11-03. SOC 2: CC9.2. Tier 1 vendors hold private data or can
change what is served; tier 2 can publish under the portfolio's name; tier 3
see only public data.

"Assurance" says where the vendor's own report is published. Nobody has
obtained and read these yet; that is the open half of `vm-review`.

| Vendor | Used for | Data it sees | Tier | Assurance | DPA / transfer |
|---|---|---|---|---|---|
| Cloudflare | DNS, Workers (the site), D1 (counts, feedback, inbox), Email Routing | Every request's IP and headers; inbox mail | 1 | SOC 2 Type II, ISO 27001, via the dashboard's compliance documents | Self-serve DPA in its terms; EU-US DPF, SCCs |
| GitHub (Microsoft) | Code, CI, secrets, Pages, issues | Everything in the repository; secrets; contributors' accounts | 1 | SOC 1/2 reports, ISO 27001, via the GitHub Enterprise trust portal | GitHub DPA; EU-US DPF, SCCs |
| npm (GitHub) | Package registry | Published packages | 2 | Covered by GitHub's reports | As GitHub |
| PyPI (Python Software Foundation) | Package registry | Published packages | 2 | No SOC 2; open-source infrastructure with Trusted Publishing | None needed: public data |
| Anthropic | Agent sessions (Claude Code) | Repository contents the session reads; never private data by rule | 2 | SOC 2 Type II, ISO 27001 via its trust portal | Commercial terms DPA |
| OpenCode, Kilo, Cursor | Other agent families | Repository contents | 2 | Check each before it is given write access | — |
| Bluesky, Mastodon instance, dev.to, Hashnode, Buttondown | Distribution posts | Public posts; Buttondown would hold subscribers' emails if a list is started | 3 (Buttondown 1 once a list exists) | Review Buttondown's DPA before the first subscriber | Buttondown DPA before use |
| Homebrew tap (GitHub repo) | Formula | Public | 3 | As GitHub | — |

## Adding a vendor

Before a new vendor receives anything private, add a row: what it sees, its
tier, where its assurance report is, and its DPA. A tier 1 vendor needs the
owner's yes (it usually means an account).

## Yearly review

| Date | Vendor | Report read | Findings |
|---|---|---|---|
| | | | |
