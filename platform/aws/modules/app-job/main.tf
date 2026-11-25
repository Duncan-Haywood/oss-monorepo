# Long jobs (beyond Lambda's 15 minutes or API Gateway's 30 s): a Fargate task definition run on
# demand with ecs:RunTask (no always-on service, so it costs nothing while idle). The image must
# be pinned by digest. Needs interface endpoints ecr.api, ecr.dkr and logs in the network module.
#
# A product's Lambda starts one with RunTask using output run_task_network; grant it with the
# output invoke_policy_statements.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
}

resource "aws_ecs_cluster" "this" {
  #checkov:skip=CKV_AWS_65:Container Insights is var.container_insights (off by default: per-task metric cost; task logs always go to CloudWatch)
  name = var.name
  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

resource "aws_iam_role" "execution" {
  name = "${var.name}-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  count = length(var.secrets) == 0 ? 0 : 1
  name  = "secrets"
  role  = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "secretsmanager:GetSecretValue", Resource = [for n in values(var.secrets) : "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${n}-??????"] },
      { Effect = "Allow", Action = "kms:Decrypt", Resource = var.kms_key_arn },
    ]
  })
}

resource "aws_iam_role" "task" {
  name = "${var.name}-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "task" {
  count  = var.task_policy_json == null ? 0 : 1
  name   = "task"
  role   = aws_iam_role.task.id
  policy = var.task_policy_json
}

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name                   = "job"
    image                  = var.image
    essential              = true
    readonlyRootFilesystem = true
    user                   = "1000:1000"
    environment            = [for k, v in var.environment : { name = k, value = v }]
    secrets                = [for k, n in var.secrets : { name = k, valueFrom = "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${n}" }]
    linuxParameters        = { initProcessEnabled = true }
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp", readOnly = false }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "job"
      }
    }
  }])
  volume {
    name = "tmp"
  }
}
