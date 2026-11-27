output "project_name" {
  description = "Set the private repository's Actions variable CODEBUILD_RUNNER to this; workflows then run on these runners. Null until connection_ready."
  value       = try(aws_codebuild_project.ci[var.project_name].name, null)
}

output "docker_project_name" {
  description = "Set CODEBUILD_RUNNER_DOCKER to this (jobs with service containers); null when docker_runner is false or before connection_ready."
  value       = try(aws_codebuild_project.ci["${var.project_name}-docker"].name, null)
}

output "connection_arn" {
  description = "The GitHub connection the owner completes once in the AWS console (status starts PENDING)."
  value       = aws_codeconnections_connection.github.arn
}

output "webhook_enabled" {
  description = "False until var.connection_ready is set after the connection handshake."
  value       = var.connection_ready
}

# The connection's live status (PENDING until the owner's one console click,
# then AVAILABLE). An agent reads it from the apply summary and sets
# connection_ready = true in a PR; the owner only clicks.
# Unverified until the first apply: that the codestar-connections data source
# accepts the codeconnections ARN (AWS documents the two namespaces as the same
# service after the 2024 rename).
data "aws_codestarconnections_connection" "github" {
  arn = aws_codeconnections_connection.github.arn
}

output "connection_status" {
  description = "PENDING until the GitHub handshake is done in the console; AVAILABLE after."
  value       = data.aws_codestarconnections_connection.github.connection_status
}
