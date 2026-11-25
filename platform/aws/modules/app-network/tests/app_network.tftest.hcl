mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-east-1a", "us-east-1b", "us-east-1c"] }
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

variables {
  name        = "saas"
  kms_key_arn = "arn:aws:kms:us-east-1:111111111111:key/k"
}

run "private_only_with_flow_logs" {
  command = apply
  assert {
    condition     = alltrue([for s in aws_subnet.private : !s.map_public_ip_on_launch])
    error_message = "no public IPs"
  }
  assert {
    condition     = aws_flow_log.this.traffic_type == "ALL" && aws_cloudwatch_log_group.flow.kms_key_id == var.kms_key_arn
    error_message = "flow logs on, encrypted"
  }
  assert {
    condition     = length(aws_default_security_group.this.ingress) == 0 && length(aws_default_security_group.this.egress) == 0
    error_message = "default security group allows nothing"
  }
  assert {
    condition     = aws_vpc_security_group_ingress_rule.db_from_app.referenced_security_group_id == aws_security_group.app.id && aws_vpc_security_group_ingress_rule.db_from_app.from_port == 5432
    error_message = "database reachable only from the app group on 5432"
  }
  assert {
    condition     = length(aws_vpc_endpoint.interface) == 2 && alltrue([for e in aws_vpc_endpoint.interface : length(e.subnet_ids) == 1])
    error_message = "two interface endpoints in one AZ by default"
  }
}

run "rejects_single_az" {
  command = plan
  variables {
    az_count = 1
  }
  expect_failures = [var.az_count]
}

run "no_internet_route_unless_asked" {
  command = apply
  assert {
    condition     = length(aws_internet_gateway.this) == 0 && length(aws_nat_gateway.this) == 0 && length(aws_route.private_nat) == 0
    error_message = "no internet gateway or NAT by default"
  }
}

run "nat_allows_only_https_out" {
  command = apply
  variables {
    enable_nat = true
  }
  assert {
    condition     = aws_vpc_security_group_egress_rule.app_to_internet[0].from_port == 443 && aws_vpc_security_group_egress_rule.app_to_internet[0].to_port == 443
    error_message = "only HTTPS leaves through the NAT"
  }
  assert {
    condition     = !aws_subnet.public[0].map_public_ip_on_launch
    error_message = "nothing gets a public IP except the NAT's EIP"
  }
}
