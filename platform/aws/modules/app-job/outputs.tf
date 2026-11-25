output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.this.arn
}

output "run_task_network" {
  description = "networkConfiguration for ecs:RunTask (private subnets, no public IP)."
  value = {
    awsvpcConfiguration = {
      subnets        = var.subnet_ids
      securityGroups = [var.security_group_id]
      assignPublicIp = "DISABLED"
    }
  }
}

output "invoke_policy_statements" {
  description = "Statements to add to the caller's role so it can start this job and nothing else."
  value = [
    {
      Effect    = "Allow", Action = "ecs:RunTask",
      Resource  = "arn:aws:ecs:${local.region}:${local.account_id}:task-definition/${var.name}:*",
      Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.this.arn } }
    },
    { Effect = "Allow", Action = "iam:PassRole", Resource = [aws_iam_role.execution.arn, aws_iam_role.task.arn] },
  ]
}
