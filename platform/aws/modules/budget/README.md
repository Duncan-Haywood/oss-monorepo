# modules/budget

One monthly AWS cost budget with layered alerts and an optional automatic
deny at the hard line. Used by [`../../spend-guards`](../../spend-guards/).

- ACTUAL alerts at `alert_thresholds` (default 50, 80, 100 %), plus the hard
  line, emailed to `alert_emails`;
- a FORECASTED alert at `forecast_threshold` (default 100 %);
- at `hard_line_percent`, the ACTUAL notification also publishes to
  `kill_switch_topic_arn` (if set), and `hard_action` applies on its own:
  - `scp`: attach `deny_scp_id` to `linked_account_id` (the budget must live in the management account);
  - `iam`: attach `deny_iam_policy_arn` to `deny_iam_roles` (for a stand-alone account whose budget lives inside it);
  - `none`: alerts and the kill switch only.

AWS allows five notifications per budget. The module refuses a plan that
needs more, an `scp` action without a policy and target, and an `iam` action
without a policy and roles.

```hcl
module "budget" {
  source            = "../modules/budget"
  name              = "spend-apps-monthly"   # the kill switch parses spend-<account>-monthly
  limit_usd         = 40
  linked_account_id = "111111111111"
  alert_emails      = var.alert_emails
}
```

Tests: `tofu init -backend=false && tofu test` (7 runs, mocked provider).
