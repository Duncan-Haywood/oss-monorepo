# Shift Roster Builder's hosted team hub on the AWS SaaS starter: one app-service module call over the shared platform.
# The handler is ventures/shift-roster-builder/aws/app.mjs (the self-hosted hub.mjs, many teams, Postgres row locks);
# the self-hosted paths (server.mjs, hub-worker.mjs on the user's own Cloudflare) are unchanged.

locals {
  app_vars  = { FREE_TEAMS = tostring(var.free_teams) }
  stack     = "shift-roster" # every IAM name this stack creates starts with it (stacks/github-oidc)
  build_dir = coalesce(var.build_dir, "${path.module}/../saas-starter/runtime/dist/app-roster_hub")
  # The starter's platform with this stack's own IAM prefix and boundary.
  platform = merge(data.terraform_remote_state.saas_starter.outputs.platform, {
    name_prefix              = local.stack
    permissions_boundary_arn = var.permissions_boundary_arn
  })
}

module "hub" {
  source     = "../../modules/app-service"
  name       = "roster_hub" # database roster_hub, role app_roster_hub, Paddle customData.product
  source_dir = local.build_dir
  platform   = local.platform
  auth = {
    domain_prefix     = var.auth_domain_prefix
    web_callback_urls = var.web_callback_urls
  }
  vars                 = local.app_vars
  custom_domain        = var.custom_domain
  reserved_concurrency = var.reserved_concurrency
  # The roster search runs in the manager's browser (as on the Worker); the function only checks and prices it.
  memory_mb       = 512
  timeout_seconds = 10
}
