# Consumed by the site stack (CloudFront origin), the email stack (SES
# receipt rule) and the analytics pull. Names are part of the interface.

output "function_name" {
  description = "Lambda function name (EDGE_FUNCTION_NAME for platform/counter/pull-aws.mjs; the email stack grants SES invoke on it)."
  value       = aws_lambda_function.edge.function_name
}

output "function_arn" {
  description = "Lambda function ARN (the email stack's receipt-rule Lambda action)."
  value       = aws_lambda_function.edge.arn
}

output "function_url" {
  description = "Function URL, https://<id>.lambda-url.<region>.on.aws/."
  value       = aws_lambda_function_url.edge.function_url
}

output "origin_domain_name" {
  description = "CloudFront origin domain_name for the site distribution (the function URL host)."
  value       = trimsuffix(trimprefix(aws_lambda_function_url.edge.function_url, "https://"), "/")
}

output "origin_path_pattern" {
  description = "Cache behaviour path pattern on the site distribution that routes here."
  value       = var.path_prefix == "" ? "/*" : "${var.path_prefix}/*"
}

output "origin_verify_header_name" {
  description = "Custom origin header CloudFront must add."
  value       = "x-origin-verify"
}

output "origin_verify_secret_arn" {
  description = "Secrets Manager secret holding that header's value; the site stack reads it with data.aws_secretsmanager_secret_version."
  value       = aws_secretsmanager_secret.origin_verify.arn
}

output "cloudfront_cache_policy_id" {
  description = "Managed CachingDisabled: nothing from the API is cached."
  value       = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
}

output "cloudfront_origin_request_policy_id" {
  description = "Managed AllViewerExceptHostHeader: forwards viewer headers (Origin, User-Agent, DNT, Sec-GPC, Authorization) and CloudFront-Viewer-Country / -Address, but not Host, as a function URL origin requires."
  value       = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
}

output "allowed_methods" {
  description = "Methods the cache behaviour must allow."
  value       = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
}

output "table_name" {
  description = "DynamoDB table (TABLE_NAME for aws/migrate-d1.mjs)."
  value       = aws_dynamodb_table.edge.name
}

output "table_arn" {
  description = "DynamoDB table ARN."
  value       = aws_dynamodb_table.edge.arn
}

output "inbox_bucket_name" {
  description = "Bucket the email stack's receipt rule writes inbound mail to."
  value       = aws_s3_bucket.inbox.bucket
}

output "inbox_bucket_arn" {
  description = "Inbox bucket ARN."
  value       = aws_s3_bucket.inbox.arn
}

output "inbox_prefix" {
  description = "Object key prefix the receipt rule must use (the function reads only under it)."
  value       = local.inbox_prefix
}

output "inbox_token_secret_arn" {
  description = "Secret holding INBOX_TOKEN for platform/edge/read-inbox.mjs."
  value       = aws_secretsmanager_secret.inbox_token.arn
}

output "kms_key_arn" {
  description = "Key encrypting the table, bucket, logs and secrets."
  value       = aws_kms_key.edge.arn
}

output "log_group_name" {
  description = "The function's log group."
  value       = aws_cloudwatch_log_group.function.name
}
