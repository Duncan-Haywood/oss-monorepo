# Retail Pilot Intel's docs (ventures/retail-pilot-intel/apps/docs, a Vite SPA with HashRouter) on the AWS SaaS starter:
# the built dist/ served by the starter's site app (runtime/src/site.mjs) through one app-service call. Replaces the
# static-assets Worker retail-pilot-intel-docs (apps/docs/wrangler.toml). The docs keep their own client passcode
# (VITE_DOCS_PASSCODE at build); allowed_emails adds the server-side gate DEPLOY.md asked Cloudflare Access for.
# Static: no data to migrate.

locals {
  stack     = "retail-pilot-intel" # every IAM name this stack creates starts with it (stacks/github-oidc)
  build_dir = coalesce(var.build_dir, "${path.module}/../saas-starter/runtime/dist/app-rpi_docs")
  platform = merge(data.terraform_remote_state.saas_starter.outputs.platform, {
    name_prefix              = local.stack
    permissions_boundary_arn = var.permissions_boundary_arn
  })
  app_vars = {
    GATE_EMAILS = join(",", [for e in var.allowed_emails : lower(e)])
    ROBOTS      = "noindex, nofollow, noarchive" # as apps/docs/public/_headers
  }
}

module "docs" {
  source     = "../../modules/app-service"
  name       = "rpi_docs" # database rpi_docs (holds only the gate's session key)
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
