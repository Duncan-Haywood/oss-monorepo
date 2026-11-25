mock_provider "aws" {
  mock_data "aws_secretsmanager_secret_version" {
    defaults = { secret_string = "{\"key_id\":\"KEY123\",\"team_id\":\"TEAM123\",\"bundle_id\":\"app.example.hello\",\"signing_key\":\"not-a-real-key\"}" }
  }
  mock_resource "aws_sns_platform_application" {
    defaults = { arn = "arn:aws:sns:us-east-1:111111111111:app/APNS/mock" }
  }
}

variables {
  name = "app-hello"
}

run "nothing_without_credentials" {
  command = apply
  assert {
    condition     = length(output.platform_apps) == 0
    error_message = "no secret names, no platform apps"
  }
}

run "apns_token_auth_from_secrets_manager" {
  command = apply
  variables {
    apns_secret_name = "hello/apns"
    apns_sandbox     = true
  }
  assert {
    condition     = aws_sns_platform_application.apns[0].platform == "APNS_SANDBOX" && aws_sns_platform_application.apns[0].platform_principal == "KEY123" && aws_sns_platform_application.apns[0].apple_platform_team_id == "TEAM123"
    error_message = "APNs token auth wired from the secret"
  }
  assert {
    condition     = keys(output.platform_apps) == ["apns_sandbox"]
    error_message = "runtime key matches the platform"
  }
}
