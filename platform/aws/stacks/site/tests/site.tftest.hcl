# The site stack wires the module the way the cutover expects:
#
#   cd platform/aws/stacks/site && tofu init -backend=false && tofu test

mock_provider "aws" {
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:111111111111:log-group:mock"
    }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = {
      arn = "arn:aws:wafv2:us-east-1:111111111111:global/webacl/mock/00000000-0000-0000-0000-000000000000"
    }
  }
  mock_resource "aws_cloudfront_function" {
    defaults = {
      arn = "arn:aws:cloudfront::111111111111:function/mock"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::111111111111:role/site-publish"
    }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com"
    }
  }
  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::example-site-111111111111"
    }
  }
  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-0000-0000-000000000000"
    }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn            = "arn:aws:cloudfront::111111111111:distribution/E2EXAMPLE"
      domain_name    = "d111111abcdef8.cloudfront.net"
      hosted_zone_id = "Z2FDTNDATAQYW2"
    }
  }
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "222222222222"
    }
  }
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

run "oidc_provider_comes_from_github_oidc_stack_by_default" {
  command = plan

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0
    error_message = "By default the provider is stacks/github-oidc's, not a second one."
  }

  assert {
    condition     = local.github_oidc_provider_arn == "arn:aws:iam::222222222222:oidc-provider/token.actions.githubusercontent.com"
    error_message = "The default provider ARN is this account's GitHub provider."
  }
}

run "oidc_provider_created_only_on_request" {
  command = plan

  variables {
    create_github_oidc_provider = true
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 1
    error_message = "create_github_oidc_provider creates exactly one provider."
  }
}

run "publisher_role_is_created_with_custom_domains" {
  command = apply

  variables {
    enable_custom_domains    = true
    permissions_boundary_arn = "arn:aws:iam::222222222222:policy/workload-boundary"
  }


  assert {
    condition     = module.site.publisher_role_arn != null
    error_message = "The publisher role must exist."
  }

  assert {
    condition     = endswith(module.site.publisher_role_arn, ":role/site-publish")
    error_message = "The publisher role is named site-*."
  }

  assert {
    condition     = length(data.aws_route53_zone.site) == 1
    error_message = "Phase 2 looks the zone up by name."
  }
}
