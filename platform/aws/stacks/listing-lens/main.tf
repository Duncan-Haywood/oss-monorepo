# Listing Lens (ventures/real-estate-agent-photo-app) private docs on the AWS SaaS starter: the Next.js static export
# served by the starter's site app (runtime/src/site.mjs) through one app-service call, behind a sign-in gate for
# allowed_emails. Replaces Cloudflare Pages project listing-lens-docs and its Cloudflare Access policy
# (docs-site/infra/access-policy.json: one allowed address, 24 h sessions). Static: no data to migrate.

locals {
  stack     = "listing-lens" # every IAM name this stack creates starts with it (stacks/github-oidc)
  build_dir = coalesce(var.build_dir, "${path.module}/../saas-starter/runtime/dist/app-listing_docs")
  platform = merge(data.terraform_remote_state.saas_starter.outputs.platform, {
    name_prefix              = local.stack
    permissions_boundary_arn = var.permissions_boundary_arn
  })
  app_vars = {
    GATE_EMAILS = join(",", [for e in var.allowed_emails : lower(e)])
    ROBOTS      = "noindex" # as the Pages site's _headers file
  }
}

module "docs" {
  source     = "../../modules/app-service"
  name       = "listing_docs" # database listing_docs (holds only the gate's session key)
  source_dir = local.build_dir
  platform   = local.platform
  auth = {
    domain_prefix     = var.auth_domain_prefix
    web_callback_urls = ["https://${var.site_domain}/auth/login"]
    self_sign_up      = false # accounts are made for the allowed addresses only (README, "Sign-in accounts")
    mfa               = "ON"
  }
  vars                 = local.app_vars
  private_route_keys   = ["POST /api/session"]
  custom_domain        = var.certificate_arn == null ? null : { name = var.site_domain, certificate_arn = var.certificate_arn }
  reserved_concurrency = 5
  memory_mb            = 256
  timeout_seconds      = 10
}
