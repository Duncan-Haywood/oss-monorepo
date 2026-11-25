# AI-First Markets (ventures/ai-first-markets, NOT-A-VENTURE: the owner's market notes) on the AWS SaaS starter. Every
# page is static data, so aws/build.mjs writes a Next.js static export and the starter's site app
# (runtime/src/site.mjs) serves it behind its sign-in gate for allowed_emails. The gate replaces what the Worker ran
# with OpenNext: middleware.ts, the Google OAuth and session API routes, AUTH_SECRET and ALLOWED_EMAIL. Replaces the
# Worker `ai-first-markets` (wrangler.jsonc, priv-ai-first-markets-deploy.yml). No D1, KV or R2: nothing to migrate.

locals {
  stack     = "ai-first-markets" # every IAM name this stack creates starts with it (stacks/github-oidc)
  build_dir = coalesce(var.build_dir, "${path.module}/../saas-starter/runtime/dist/app-ai_first_markets")
  platform = merge(data.terraform_remote_state.saas_starter.outputs.platform, {
    name_prefix              = local.stack
    permissions_boundary_arn = var.permissions_boundary_arn
  })
  app_vars = {
    GATE_EMAILS = join(",", [for e in var.allowed_emails : lower(e)])
    ROBOTS      = "noindex"
  }
}

module "site" {
  source     = "../../modules/app-service"
  name       = "ai_first_markets" # database ai_first_markets (holds only the gate's session key)
  source_dir = local.build_dir
  platform   = local.platform
  auth = {
    domain_prefix     = var.auth_domain_prefix
    web_callback_urls = ["https://${var.site_domain}/auth/login"]
    self_sign_up      = false # accounts only for allowed_emails (stacks/listing-lens README, step 3)
    mfa               = "ON"
  }
  vars                 = local.app_vars
  private_route_keys   = ["POST /api/session"]
  custom_domain        = var.certificate_arn == null ? null : { name = var.site_domain, certificate_arn = var.certificate_arn }
  reserved_concurrency = 5
  memory_mb            = 256
  timeout_seconds      = 10
}
