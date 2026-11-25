# Security invariants of the static-site module, against a mocked AWS
# provider (no account, no credentials):
#
#   cd platform/aws/modules/static-site && tofu init -backend=false && tofu test

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "111111111111"
    }
  }
  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::example-site-111111111111"
    }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn            = "arn:aws:cloudfront::111111111111:distribution/E2EXAMPLE"
      domain_name    = "d111111abcdef8.cloudfront.net"
      hosted_zone_id = "Z2FDTNDATAQYW2"
    }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = {
      arn = "arn:aws:wafv2:us-east-1:111111111111:global/webacl/example-site/abc"
    }
  }
}

variables {
  name        = "example"
  domain_name = "example.org"
  host_redirects = {
    "www.example.org"    = ""
    "grants.example.org" = "/grants"
  }
}

run "bucket_is_private_and_encrypted" {
  command = apply

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.site.block_public_acls,
      aws_s3_bucket_public_access_block.site.block_public_policy,
      aws_s3_bucket_public_access_block.site.ignore_public_acls,
      aws_s3_bucket_public_access_block.site.restrict_public_buckets,
    ])
    error_message = "Every Block Public Access setting must be on."
  }

  assert {
    condition     = one(aws_s3_bucket_ownership_controls.site.rule).object_ownership == "BucketOwnerEnforced"
    error_message = "ACLs must be disabled."
  }

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.site.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256"
    error_message = "Default encryption must be on."
  }

  assert {
    condition     = one(aws_s3_bucket_versioning.site.versioning_configuration).status == "Enabled"
    error_message = "Versioning must be on so a bad deploy can be rolled back."
  }
}

run "bucket_policy_grants_only_this_distribution" {
  command = apply

  assert {
    condition = alltrue([
      for s in jsondecode(aws_s3_bucket_policy.site.policy).Statement :
      s.Effect == "Deny" || (
        s.Principal == { Service = "cloudfront.amazonaws.com" } &&
        s.Action == "s3:GetObject" &&
        s.Condition.StringEquals["AWS:SourceArn"] == aws_cloudfront_distribution.site.arn
      )
    ])
    error_message = "The only Allow must be s3:GetObject for this distribution via OAC."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_s3_bucket_policy.site.policy).Statement :
      s.Effect == "Deny" && s.Condition.Bool["aws:SecureTransport"] == "false"
    ])
    error_message = "Plain-HTTP access to the bucket must be denied."
  }
}

run "distribution_is_https_waf_and_headers" {
  command = apply

  assert {
    condition     = one(aws_cloudfront_distribution.site.default_cache_behavior).viewer_protocol_policy == "redirect-to-https"
    error_message = "Viewers must be sent to HTTPS."
  }

  assert {
    condition     = aws_cloudfront_distribution.site.web_acl_id == aws_wafv2_web_acl.site.arn
    error_message = "The WAF web ACL must be attached."
  }

  assert {
    condition     = length([for o in aws_cloudfront_distribution.site.origin : o if o.origin_access_control_id != ""]) == 1
    error_message = "The bucket origin must use Origin Access Control."
  }

  assert {
    condition     = one(aws_cloudfront_distribution.site.default_cache_behavior).response_headers_policy_id == aws_cloudfront_response_headers_policy.security.id
    error_message = "The security-headers policy must be on the default behaviour."
  }

  assert {
    condition     = one(one(one(aws_cloudfront_response_headers_policy.security.security_headers_config).strict_transport_security)).access_control_max_age_sec == 31536000
    error_message = "HSTS must match security-headers.mjs (max-age=31536000)."
  }

  assert {
    condition     = length(aws_wafv2_web_acl.site.rule) == 4 && aws_wafv2_web_acl.site.scope == "CLOUDFRONT"
    error_message = "The CloudFront WAF must carry the three managed groups and the rate rule."
  }

  assert {
    condition     = aws_wafv2_web_acl_logging_configuration.site.resource_arn == aws_wafv2_web_acl.site.arn
    error_message = "WAF logging must be on."
  }

  assert {
    condition     = length(aws_cloudfront_distribution.site.aliases) == 0 && length(aws_acm_certificate.site) == 0
    error_message = "Without enable_custom_domains the distribution serves only its cloudfront.net address."
  }

  assert {
    condition     = strcontains(aws_cloudfront_function.viewer_request.code, "\"grants.example.org\":\"/grants\"") && !strcontains(aws_cloudfront_function.viewer_request.code, "$${config_json}")
    error_message = "The viewer-request function must carry the host redirects."
  }
}

run "custom_domains_use_tls12_and_aliases" {
  command = apply

  variables {
    enable_custom_domains = true
    route53_zone_id       = "Z0000000EXAMPLE"
  }

  override_resource {
    target = aws_acm_certificate.site
    values = {
      arn = "arn:aws:acm:us-east-1:111111111111:certificate/abc"
      domain_validation_options = [
        { domain_name = "example.org", resource_record_name = "_a.example.org.", resource_record_type = "CNAME", resource_record_value = "_a.acm-validations.aws." },
        { domain_name = "www.example.org", resource_record_name = "_b.www.example.org.", resource_record_type = "CNAME", resource_record_value = "_b.acm-validations.aws." },
        { domain_name = "grants.example.org", resource_record_name = "_c.grants.example.org.", resource_record_type = "CNAME", resource_record_value = "_c.acm-validations.aws." },
      ]
    }
  }

  override_resource {
    target = aws_acm_certificate_validation.site
    values = {
      certificate_arn = "arn:aws:acm:us-east-1:111111111111:certificate/abc"
    }
  }

  assert {
    condition     = toset(aws_cloudfront_distribution.site.aliases) == toset(["example.org", "www.example.org", "grants.example.org"])
    error_message = "The apex and every redirect host must be aliases."
  }

  assert {
    condition     = one(aws_cloudfront_distribution.site.viewer_certificate).minimum_protocol_version == "TLSv1.2_2021"
    error_message = "Custom domains must require TLS 1.2 or later."
  }

  assert {
    condition     = length(aws_route53_record.validation) == 3 && length(aws_route53_record.alias_a) == 3 && length(aws_route53_record.alias_aaaa) == 3
    error_message = "Validation and A/AAAA alias records for each host."
  }
}

run "publisher_role_is_least_privilege" {
  command = apply

  variables {
    publisher = {
      role_name         = "gha-oss-monorepo-site-publish"
      oidc_provider_arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com"
      subject           = "repo:Duncan-Haywood/oss-monorepo:environment:aws-prod"
    }
  }

  assert {
    condition = alltrue(flatten([
      for s in jsondecode(aws_iam_role_policy.publisher[0].policy).Statement : [
        for a in (can(tolist(s.Action)) ? tolist(s.Action) : [s.Action]) : !strcontains(a, "*")
      ]
    ]))
    error_message = "The publisher policy must name every action (no wildcards)."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.publisher[0].policy).Statement :
      s.Resource != "*" && startswith(s.Resource, aws_s3_bucket.site.arn) || s.Resource == aws_cloudfront_distribution.site.arn
    ])
    error_message = "The publisher may touch only this bucket and this distribution."
  }

  assert {
    condition     = jsondecode(aws_iam_role.publisher[0].assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:Duncan-Haywood/oss-monorepo:environment:aws-prod"
    error_message = "The trust policy must pin the exact repository and environment."
  }
}

run "wildcard_subject_is_rejected" {
  command = plan

  variables {
    publisher = {
      role_name         = "x"
      oidc_provider_arn = "arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com"
      subject           = "repo:Duncan-Haywood/oss-monorepo:*"
    }
  }

  expect_failures = [var.publisher]
}
