# Product: build the thing customers use

Owns `site/` and any app code. The stack default is in `BUSINESS.md`
("Stack"); change it only with a reason written in the PR.

## Priorities, in order

1. **Something live at a public URL.** Before the product is complete, ship a
   landing page that states the offer, the price and a way to sign up, ask a
   question or join a waitlist. Deployment is code (a workflow, a
   `fly.toml`, OpenTofu): no click-through steps a later run cannot repeat.
   If deploying needs an account or secret, queue it in `OWNER.md` and keep
   building locally.
2. **The smallest version that delivers the offer** in `BUSINESS.md`, end to
   end, for one real customer. Finish one path before starting another.
3. **Quality a customer notices:** works on a phone, loads fast, accessible
   (labels, contrast, keyboard), honest error messages, no broken links.
4. **Measurement:** a privacy-respecting count of visits and of the one
   action that matters (sign-up, quote request, purchase), feeding
   `metrics/metrics.csv`. Without it nobody knows whether anything works.

## Rules

- Tests for every calculation, price, or anything money touches.
- Payments: build the integration, keep it off unless the key's environment
  variable is set, and queue the account in `OWNER.md`.
- Every public page: title, meta description, privacy notice, and the
  disclaimer from `legal/` if it gives figures.
- Bugs from `support/` outrank new features.
