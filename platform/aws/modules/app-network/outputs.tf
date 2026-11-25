output "vpc_id" {
  value = aws_vpc.this.id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "app_security_group_id" {
  description = "Attach to every Lambda function and Fargate task that needs the database or AWS APIs."
  value       = aws_security_group.app.id
}

output "db_security_group_id" {
  value = aws_security_group.db.id
}
