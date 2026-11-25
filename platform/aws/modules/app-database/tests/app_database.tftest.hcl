mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      resource_id        = "db-ABCDEFG"
      address            = "saas.example.us-east-1.rds.amazonaws.com"
      port               = 5432
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:us-east-1:111111111111:secret:rds!db-abc-123456", kms_key_id = "k", secret_status = "active" }]
    }
  }
  mock_resource "aws_db_proxy_default_target_group" {
    defaults = { name = "default" }
  }
  mock_resource "aws_db_proxy" {
    defaults = { arn = "arn:aws:rds:us-east-1:111111111111:db-proxy:prx-0123456789abcdef", endpoint = "saas.proxy-x.us-east-1.rds.amazonaws.com" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/mock" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:111111111111:log-group:mock" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111111111111:key/mock" }
  }
  mock_resource "aws_lambda_function" {
    defaults = { arn = "arn:aws:lambda:us-east-1:111111111111:function:mock", invoke_arn = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:111111111111:function:mock/invocations" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock-bucket" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:111111111111:mock", url = "https://sqs.us-east-1.amazonaws.com/111111111111/mock" }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = { execution_arn = "arn:aws:execute-api:us-east-1:111111111111:abc123" }
  }
  mock_resource "aws_cognito_user_pool" {
    defaults = { arn = "arn:aws:cognito-idp:us-east-1:111111111111:userpool/us-east-1_mock" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:us-east-1:111111111111:cluster/mock" }
  }
}
mock_provider "archive" {}

variables {
  name                  = "saas"
  subnet_ids            = ["subnet-a", "subnet-b"]
  db_security_group_id  = "sg-db"
  app_security_group_id = "sg-app"
  kms_key_arn           = "arn:aws:kms:us-east-1:111111111111:key/k"
  admin_source_dir      = "./tests"
}

run "encrypted_private_iam_auth_tls" {
  command = apply
  assert {
    condition     = aws_db_instance.this.storage_encrypted && aws_db_instance.this.kms_key_id == var.kms_key_arn
    error_message = "storage encrypted with the platform key"
  }
  assert {
    condition     = !aws_db_instance.this.publicly_accessible
    error_message = "never public"
  }
  assert {
    condition     = aws_db_instance.this.iam_database_authentication_enabled && aws_db_instance.this.manage_master_user_password
    error_message = "IAM auth on; master password managed by RDS in Secrets Manager"
  }
  assert {
    condition     = one([for p in aws_db_parameter_group.this.parameter : p.value if p.name == "rds.force_ssl"]) == "1"
    error_message = "TLS forced"
  }
  assert {
    condition     = aws_db_instance.this.deletion_protection && !aws_db_instance.this.skip_final_snapshot && aws_db_instance.this.backup_retention_period >= 7
    error_message = "deletion protection, final snapshot, 7-day backups"
  }
  assert {
    condition     = aws_db_instance.this.instance_class == "db.t4g.micro" && !aws_db_instance.this.multi_az
    error_message = "cheapest default"
  }
  assert {
    condition     = output.connect_arn_prefix == "arn:aws:rds-db:us-east-1:111111111111:dbuser:db-ABCDEFG"
    error_message = "connect ARN uses the instance resource id"
  }
}

run "db_admin_reads_only_the_master_secret" {
  command = apply
  assert {
    condition     = jsondecode(aws_iam_role_policy.admin.policy).Statement[1].Resource == "arn:aws:secretsmanager:us-east-1:111111111111:secret:rds!db-abc-123456"
    error_message = "db-admin may read only the master secret"
  }
  assert {
    condition     = aws_lambda_function.admin.reserved_concurrent_executions == 1
    error_message = "db-admin runs one at a time"
  }
}

run "proxy_switches_connect_arn" {
  command = apply
  variables {
    enable_proxy = true
  }
  assert {
    condition     = output.connect_arn_prefix == "arn:aws:rds-db:us-east-1:111111111111:dbuser:prx-0123456789abcdef" && output.host == "saas.proxy-x.us-east-1.rds.amazonaws.com"
    error_message = "through the proxy, apps connect to the proxy and IAM names its id"
  }
  assert {
    condition     = aws_db_proxy.this[0].require_tls && aws_db_proxy.this[0].default_auth_scheme == "IAM_AUTH"
    error_message = "proxy: TLS and IAM end to end"
  }
}
