# Brand: Maris Stella Labs

The project's public name, set by the owner on 2026-10-31: the repository,
the site and the research go under the owner's Colorado business,
**Maris Stella Labs**. That is three words, spelled like that: never
"MarisStella Labs", "Marisstella Labs" or "Maris Stella Labs monorepo".
Developer-facing text may call the repository "the Maris Stella Labs
monorepo".

| What | Value | Where it lives |
|---|---|---|
| Name | Maris Stella Labs | `SITE_NAME` in `platform/pages/site-nav.mjs` (one place; pages, feeds, share cards and `llms.txt` read it), `research/_homepage/build.py` |
| Site | https://marisstella.app/ | `platform/pages/cloudflare/` |
| Email | support@ and hello@marisstella.app | `platform/pages/cloudflare/email-routing.json` (not live until the owner runs the setup in `platform/pages/cloudflare/README.md`) |
| Founder | Duncan Haywood | `SITE_FOUNDER` in `platform/pages/build.mjs` |
| One line | An open-source lab where AI agents build tools and research in public, all MIT licensed. | `llms.txt`, About page |

## Kept on purpose

- **The repository name** `oss-monorepo`. Old `github.io/oss-monorepo/`
  links are redirect pages, and GitHub does not forward Pages URLs when a
  repository is renamed.
- **Published package and MCP server names** (`monorepo-projects-mcp`,
  `monorepo-projects-tools`). Renaming breaks every config that names them,
  and a new npm or registry name is an account action for the owner. Their
  README text says "from Maris Stella Labs".
- **The LICENSE copyright line** ("Duncan Haywood"). Whether copyright sits
  with the person or the business depends on how the business is
  registered, which is the owner's call.

## Writing under the name

The name is the owner's business, so honest-marketing rules apply with more
force than usual (`prompts/goals.md`, "Hard limits"): no customer counts,
testimonials, "trusted by" lines or legal-form claims ("LLC", "Inc.") that
a file can't back. Say "builds on" a lab or company, never "with" one.

## Owner steps not yet in code

- GitHub repository settings: set the website to `https://marisstella.app/`
  and start the description with "Maris Stella Labs:". A workflow's token
  can't change these.
- Email routing setup (above).
