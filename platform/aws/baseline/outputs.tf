output "log_archive_bucket_name" {
  description = "Write-once log bucket in log-archive (CloudTrail under cloudtrail/, Config under config/)."
  value       = aws_s3_bucket.logs.bucket
}

output "log_archive_bucket_arn" {
  description = "ARN of the log bucket."
  value       = aws_s3_bucket.logs.arn
}

output "log_archive_kms_key_arn" {
  description = "Key every Config delivery channel names (baseline/account)."
  value       = aws_kms_key.logs.arn
}

output "findings_queue_url" {
  description = "SQS queue of high and critical findings (security account)."
  value       = aws_sqs_queue.findings.id
}

output "findings_queue_arn" {
  description = "ARN of the findings queue; github-oidc grants gha-oss-monorepo-findings-read on it."
  value       = aws_sqs_queue.findings.arn
}

output "organization_trail_arn" {
  description = "The organization CloudTrail."
  value       = aws_cloudtrail.org.arn
}
