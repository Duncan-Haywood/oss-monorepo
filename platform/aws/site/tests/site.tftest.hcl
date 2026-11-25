# The site stack wires the module the way the cutover expects:
#
#   cd platform/aws/site && tofu init -backend=false && tofu test

mock_provider "aws" {
  mock_data "aws_route53_zone" {
    defaults = {
      zone_id = "Z0000000EXAMPLE"
    }
  }
}

variables {
  deploy_role_arn          = "arn:aws:iam::111111111111:role/gha-oss-monorepo-site-plan"
  github_oidc_provider_arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com"
}

run "phase_one_serves_cloudfront_address_only" {
  command = plan

  assert {
    condition     = length(data.aws_route53_zone.site) == 0
    error_message = "Phase 1 must not need the hosted zone."
  }
}

run "publisher_role_is_created_with_custom_domains" {
  command = apply

  variables {
    enable_custom_domains = true
  }

  override_resource {
    target = module.site.aws_acm_certificate_validation.site
    values = {
      certificate_arn = "arn:aws:acm:us-east-1:111111111111:certificate/abc"
    }
  }

  assert {
    condition     = module.site.publisher_role_arn != null
    error_message = "With an OIDC provider the publisher role must exist."
  }

  assert {
    condition     = length(data.aws_route53_zone.site) == 1
    error_message = "Phase 2 looks the zone up by name."
  }
}
