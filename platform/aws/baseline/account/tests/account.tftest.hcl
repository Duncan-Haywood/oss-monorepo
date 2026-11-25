mock_provider "aws" {
  override_data {
    target = module.baseline.data.aws_caller_identity.current
    values = { account_id = "333333333333" }
  }
  override_data {
    target = module.baseline.data.aws_region.current
    values = { region = "us-west-2" }
  }
}

variables {
  account_name       = "apps"
  account_id         = "333333333333"
  config_bucket_name = "oss-monorepo-logs-444444444444-us-east-1"
  config_kms_key_arn = "arn:aws:kms:us-east-1:444444444444:key/11111111-2222-3333-4444-555555555555"
}

run "west_is_regional_only" {
  command = plan

  variables {
    region = "us-west-2"
  }

  assert {
    condition     = length(module.baseline.config_recorder_name) > 0
    error_message = "A Config recorder in every region."
  }
}

run "unapproved_region_refused" {
  command = plan

  variables {
    region = "eu-west-1"
  }

  expect_failures = [var.region]
}
