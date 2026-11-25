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
# account. One provider per account and URL: if another stack already made
# it here, pass its ARN instead.
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.github_oidc_provider_arn == null ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  github_oidc_provider_arn = coalesce(var.github_oidc_provider_arn, try(aws_iam_openid_connect_provider.github[0].arn, null))
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

  publisher = {
    role_name         = "gha-oss-monorepo-site-publish"
    oidc_provider_arn = local.github_oidc_provider_arn
    subject           = "repo:${var.github_repository}:environment:${var.publish_environment}"
  }
}
