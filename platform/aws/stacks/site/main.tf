# The public site, marisstella.app, on S3 + CloudFront in the shared-infra
# account. One distribution replaces the two Cloudflare Workers (site +
# shard): S3 has no 20,000-file limit, so nothing is split or packed.
# Apply order and cutover: README.md.

# The zone comes from the dns stack (platform/aws/stacks/dns), applied first, in
# the same account. Looked up by name so the two stacks share no state.
data "aws_route53_zone" "site" {
  count        = var.enable_custom_domains ? 1 : 0
  name         = var.domain_name
  private_zone = false
}

# The publisher role trusts GitHub's OIDC issuer in this (shared-infra)
# account. stacks/github-oidc creates that provider in every workload
# account; create_github_oidc_provider exists only for an account it has not
# reached (one provider per URL per account).
data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  github_oidc_provider_arn = (
    var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn :
    coalesce(var.github_oidc_provider_arn, "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com")
  )
}

module "site" {
  source = "../../modules/static-site"

  name                     = "marisstella"
  domain_name              = var.domain_name
  host_redirects           = var.host_redirects
  enable_custom_domains    = var.enable_custom_domains
  route53_zone_id          = var.enable_custom_domains ? data.aws_route53_zone.site[0].zone_id : null
  app_origins              = var.app_origins
  access_log_bucket_domain = var.access_log_bucket_domain
  logs_kms_key_arn         = var.logs_kms_key_arn
  edge_origin              = var.edge_origin
  edge_origin_verify_value = var.edge_origin_verify_value

  publisher = {
    # IAM names in a stack start with the stack's name (stacks/github-oidc
    # limits each stack's apply role to "<stack>-*").
    role_name                = "site-publish"
    oidc_provider_arn        = local.github_oidc_provider_arn
    subject                  = "repo:${var.github_repository}:environment:${var.publish_environment}"
    permissions_boundary_arn = var.permissions_boundary_arn
  }
}
