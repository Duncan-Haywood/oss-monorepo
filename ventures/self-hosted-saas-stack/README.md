# Self-Hosted SaaS Stack

A directory of the 27 open-source, self-hosted tools in this repository that
replace small-SaaS subscriptions: booking pages (Calendly alternative), help
center (Help Scout Docs alternative), error tracking (Sentry alternative),
feature flags (LaunchDarkly alternative), cookie-free analytics (Plausible
alternative), lifecycle email, referral programs, Stripe revenue metrics,
e-signature and more. Each is MIT licensed, a zero-dependency Node server, and
deploys to your own cloud.

Live page: https://duncan-haywood.github.io/monorepo-projects/self-hosted-saas-stack/

- `stack.mjs` - the catalogue: one row per tool, grouped by job, with the paid
  products people compare it with.
- `build.mjs` - writes `index.html` from the catalogue (`node build.mjs`), or
  checks it is current (`node build.mjs --check`).
- `page.test.mjs` - every listed tool exists and is linked, every `*-keeper`
  venture is listed, the page is current, and the disclaimers are present.

Add a tool by adding a row to `stack.mjs` and running `node build.mjs`.

**No warranty.** Free and as-is; product names are used only to say what each
tool is compared with. MIT licence, see `LICENSE`.
