output "state_bucket_name" {
  description = "Put this in every stack's backend.hcl as bucket."
  value       = aws_s3_bucket.state.bucket
}

output "state_bucket_arn" {
  description = "ARN of the state bucket (github-oidc grants roles access to stacks/<stack>/ under it)."
  value       = aws_s3_bucket.state.arn
}

output "state_kms_key_arn" {
  description = "Put this in every stack's backend.hcl as kms_key_id."
  value       = aws_kms_key.state.arn
}

output "state_region" {
  description = "Region of the state bucket (backend.hcl region)."
  value       = var.region
}
