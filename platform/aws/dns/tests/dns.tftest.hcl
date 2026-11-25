# cd platform/aws/dns && tofu init -backend=false && tofu test
# Plan-only: the zone has prevent_destroy, which an apply-and-destroy test
# run would trip.

mock_provider "aws" {}

variables {
  deploy_role_arn = "arn:aws:iam::111111111111:role/gha-oss-monorepo-dns-plan"
}

run "seed_is_refused_without_the_override" {
  command         = plan
  expect_failures = [aws_route53_zone.this]
}

run "seed_with_override_plans_planned_records_only" {
  command = plan

  variables {
    allow_unverified_records = true
  }

  assert {
    condition     = toset(keys(aws_route53_record.this)) == toset(["@ CAA", "@ MX", "@ TXT", "_dmarc TXT"])
    error_message = "Proxied seed records are replaced by the site stack; only planned records remain."
  }

  assert {
    condition     = aws_route53_record.this["_dmarc TXT"].records == toset(["v=DMARC1; p=reject"])
    error_message = "DMARC must reject."
  }

  assert {
    condition     = aws_route53_record.this["@ MX"].records == toset(["0 ."])
    error_message = "With no exported MX the null MX applies."
  }

  assert {
    condition     = aws_route53_query_log.this.cloudwatch_log_group_arn != null
    error_message = "Query logging must be on."
  }
}

run "extra_mx_replaces_the_null_mx" {
  command = plan

  variables {
    allow_unverified_records = true
    extra_records = [
      { name = "@", type = "MX", ttl = 300, values = ["10 inbound-smtp.us-east-1.amazonaws.com"] },
      { name = "@", type = "TXT", ttl = 300, values = ["google-site-verification=abc"] },
    ]
  }

  assert {
    condition     = aws_route53_record.this["@ MX"].records == toset(["10 inbound-smtp.us-east-1.amazonaws.com"])
    error_message = "A null MX must not sit beside a real MX."
  }

  assert {
    condition     = length(aws_route53_record.this["@ TXT"].records) == 2 && aws_route53_record.this["@ TXT"].ttl == 300
    error_message = "Apex TXT values from several sources merge into one record set at the lowest TTL."
  }
}

run "long_txt_is_split" {
  command = plan

  variables {
    allow_unverified_records = true
    extra_records = [
      { name = "k._domainkey", type = "TXT", ttl = 300, values = ["v=DKIM1; p=${join("", [for i in range(300) : "A"])}"] },
    ]
  }

  assert {
    condition     = strcontains(one(aws_route53_record.this["k._domainkey TXT"].records), "\"\"")
    error_message = "TXT values over 255 characters must be split for Route 53."
  }
}
