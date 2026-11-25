# The site stack wires the module the way the cutover expects:
#
#   cd platform/aws/stacks/site && tofu init -backend=false && tofu test

mock_provider "aws" {
  mock_data "aws_route53_zone" {
    defaults = {
      zone_id = "Z0000000EXAMPLE"
    }
  }
}

variables {
  deploy_role_arn = "arn:aws:iam::111111111111:role/gha-oss-monorepo-site-plan"
}

run "phase_one_serves_cloudfront_address_only" {
  command = plan

  assert {
    condition     = length(data.aws_route53_zone.site) == 0
    error_message = "Phase 1 must not need the hosted zone."
  }
}

run "oidc_provider_is_created_only_when_none_is_given" {
  command = plan

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 1
    error_message = "Without an ARN the stack creates the provider in shared-infra."
  }
}

run "existing_oidc_provider_is_reused" {
  command = plan

  variables {
    github_oidc_provider_arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com"
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0
    error_message = "A given provider ARN must not create a second provider."
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
    error_message = "The publisher role must exist."
  }

  assert {
    condition     = length(data.aws_route53_zone.site) == 1
    error_message = "Phase 2 looks the zone up by name."
  }
}
