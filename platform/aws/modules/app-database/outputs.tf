output "host" {
  description = "Where apps connect: the proxy when enabled, otherwise the instance."
  value       = var.enable_proxy ? aws_db_proxy.this[0].endpoint : aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

locals {
  # Through RDS Proxy, rds-db:connect names the proxy's id (prx-...), not the instance's.
  connect_resource_id = var.enable_proxy ? element(split(":", aws_db_proxy.this[0].arn), 6) : aws_db_instance.this.resource_id
}

output "connect_arn_prefix" {
  description = "Append '/<db user>' for an rds-db:connect resource."
  value       = "arn:aws:rds-db:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:dbuser:${local.connect_resource_id}"
}

output "admin_function_name" {
  value = aws_lambda_function.admin.function_name
}

output "master_secret_arn" {
  value = aws_db_instance.this.master_user_secret[0].secret_arn
}
