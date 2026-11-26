# The switch's shapes, planned against a mocked Cloudflare provider and the
# fixture inventory: as exported, adopted, moved to AWS, rolled back.
mock_provider "cloudflare" {}

variables {
  inventory_file = "tests/fixtures/inventory.json"
}

run "as_exported_everything_stays_on_cloudflare" {
  command = plan

  assert {
    condition     = length(cloudflare_workers_custom_domain.host) == 2 && length(cloudflare_dns_record.host) == 1
    error_message = "Every inventoried hostname is kept as exported."
  }
  assert {
    condition     = length(cloudflare_dns_record.aws) == 0
    error_message = "Nothing points at AWS by default."
  }
  assert {
    condition     = cloudflare_dns_record.host["hub.marisstella.app"].ttl == 3600
    error_message = "The exported TTL is kept until ttl_cap is set."
  }
}

run "ttl_cap_lowers_only_non_proxied_records" {
  command = plan
  variables {
    ttl_cap = 300
  }
  assert {
    condition     = cloudflare_dns_record.host["hub.marisstella.app"].ttl == 300
    error_message = "A TTL above the cap is lowered."
  }
}

run "switch_apex_to_cloudfront" {
  command = plan
  variables {
    targets     = { "marisstella.app" = "aws" }
    aws_targets = { "marisstella.app" = "d111111abcdef8.cloudfront.net" }
  }
  assert {
    condition     = !contains(keys(cloudflare_workers_custom_domain.host), "marisstella.app")
    error_message = "The apex leaves its Worker custom domain."
  }
  assert {
    condition = (
      cloudflare_dns_record.aws["marisstella.app"].content == "d111111abcdef8.cloudfront.net" &&
      cloudflare_dns_record.aws["marisstella.app"].type == "CNAME" &&
      cloudflare_dns_record.aws["marisstella.app"].proxied == false &&
      cloudflare_dns_record.aws["marisstella.app"].ttl == 60
    )
    error_message = "The apex is a DNS-only CNAME to CloudFront with a short TTL."
  }
  assert {
    condition     = contains(keys(cloudflare_workers_custom_domain.host), "grants.marisstella.app")
    error_message = "Other hostnames are untouched."
  }
}

run "switch_record_host_to_api_gateway" {
  command = plan
  variables {
    targets     = { "hub.marisstella.app" = "aws" }
    aws_targets = { "hub.marisstella.app" = "d-abc123.execute-api.us-east-1.amazonaws.com" }
  }
  assert {
    condition     = length(cloudflare_dns_record.host) == 0 && length(cloudflare_dns_record.aws) == 1
    error_message = "A plain record is replaced by the AWS CNAME."
  }
}

run "acm_validation_records" {
  command = plan
  variables {
    acm_validation_records = [{ name = "_a1b2.marisstella.app.", value = "_c3d4.xyz.acm-validations.aws." }]
  }
  assert {
    condition     = cloudflare_dns_record.acm["_a1b2.marisstella.app"].content == "_c3d4.xyz.acm-validations.aws"
    error_message = "Validation CNAMEs are written without the trailing dots ACM prints."
  }
}

run "switch_without_an_aws_target_is_refused" {
  command = plan
  variables {
    targets = { "marisstella.app" = "aws" }
  }
  expect_failures = [terraform_data.inputs]
}

run "unknown_hostname_is_refused" {
  command = plan
  variables {
    targets     = { "evil.example.com" = "aws" }
    aws_targets = { "evil.example.com" = "d111111abcdef8.cloudfront.net" }
  }
  expect_failures = [terraform_data.inputs]
}

run "aws_target_must_be_an_aws_endpoint" {
  command = plan
  variables {
    targets     = { "marisstella.app" = "aws" }
    aws_targets = { "marisstella.app" = "attacker.example.com" }
  }
  expect_failures = [var.aws_targets]
}
