# apps.d: one file per product line

The cutover reads `../apps.json` and then every `*.json` here, in name
order, and moves the apps in that order. Add a file instead of editing
another session's: the paid apps arriving from `private-monorepo` (under
`ventures/paid-apps/`) each add theirs, for example
`apps.d/paid-apps-grant-autopilot.json`:

```json
{
  "apps": [
    {
      "name": "grant-autopilot",
      "hosts": ["app.grants.marisstella.app"],
      "aws": { "kind": "apigateway", "account": "apps" },
      "health": "/api/health",
      "data": { "d1_database": "grant-autopilot", "product": "grants", "exclude_tables": [], "replace_existing": false },
      "paddle": {
        "notification_setting_id": "ntfset_01h...",
        "aws_destination": "https://<id>.lambda-url.us-east-1.on.aws/",
        "webhook_secret": "paid-apps/grant-autopilot/paddle-webhook",
        "test_event": "subscription.created"
      },
      "crawl": false
    }
  ]
}
```

- `data.product` is the app's Postgres database (`saas-starter`'s product
  list); its migrations must have created every D1 table first, with the
  same column names. `prepare` checks that.
- An app with `data` is always frozen during its copy (writes refused at
  Cloudflare's edge for a few minutes; reads keep working).
- `paddle` is only for an app whose Paddle webhooks go to Cloudflare today.
  The destination is repointed in place, so the notification setting keeps
  its secret; the AWS receiver must already hold that secret under
  `webhook_secret` (`prepare` checks it exists, never reads it).
- Run `python3 -m pytest platform/aws/cutover -q` after adding a file: the
  config test loads every file here.
