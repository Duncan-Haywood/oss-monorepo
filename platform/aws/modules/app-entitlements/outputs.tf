output "queue_url" {
  description = "Give to the payments stack as var.queue_url."
  value       = aws_sqs_queue.this.url
}

output "queue_arn" {
  description = "Give to the payments stack as var.queue_arn."
  value       = aws_sqs_queue.this.arn
}

output "queue_kms_key_arn" {
  description = "Give to the payments stack as var.queue_kms_key_arn."
  value       = aws_kms_key.queue.arn
}

output "dlq_url" {
  value = aws_sqs_queue.dlq.url
}

output "sender_role_arn" {
  description = "The one principal the queue accepts messages from (app-paddle-webhook's role)."
  value       = local.sender_role_arn
}

output "consumer_policy" {
  value = local.consumer_policy
}
