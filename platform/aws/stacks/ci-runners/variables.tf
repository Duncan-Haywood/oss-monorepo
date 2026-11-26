variable "region" {
  description = "Home region."
  type        = string
  default     = "us-east-2"

  validation {
    condition     = contains(["us-east-2", "us-east-1", "us-west-2"], var.region)
    error_message = "Only the allowed regions: us-east-2, us-east-1, us-west-2."
  }
}

variable "state_bucket" {
  description = "The bootstrap state bucket, to read the org stack's outputs."
  type        = string
}

variable "deploy_role_arn" {
  description = "Role OpenTofu assumes in the shared-infra account. Null = the organisation member role."
  type        = string
  default     = null

  validation {
    condition     = var.deploy_role_arn == null || can(regex("^arn:aws:iam::[0-9]{12}:role/", var.deploy_role_arn))
    error_message = "deploy_role_arn must be an IAM role ARN."
  }
}

variable "member_role_name" {
  description = "The organisation's member-account role, used when deploy_role_arn is null."
  type        = string
  default     = "OrganizationAccountAccessRole"
}

variable "permissions_boundary_arn" {
  description = "The account's workload-boundary policy (github-oidc stack), attached to the role this stack creates. Null until that stack exists."
  type        = string
  default     = null
}

variable "github_repository" {
  description = "The private repository whose GitHub Actions jobs these runners take, as owner/name. Never a public repository: a fork PR could run its code on a self-hosted runner."
  type        = string
  default     = "Duncan-Haywood/private-monorepo"

  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.github_repository)) && var.github_repository != "Duncan-Haywood/oss-monorepo"
    error_message = "github_repository must be owner/name, and not the public oss-monorepo."
  }
}

variable "project_name" {
  description = "CodeBuild project name. Workflows select it with runs-on: codebuild-<project_name>-<run_id>-<run_attempt>."
  type        = string
  default     = "private-monorepo-ci"
}

variable "connection_ready" {
  description = "Set true once the owner has completed the GitHub connection handshake in the AWS console (AWS requires that one click). Until then no webhook is created, so the first apply cannot fail on a pending connection."
  type        = bool
  default     = false
}

variable "compute_type" {
  description = "CodeBuild compute size per job."
  type        = string
  default     = "BUILD_GENERAL1_MEDIUM"

  validation {
    condition     = contains(["BUILD_GENERAL1_SMALL", "BUILD_GENERAL1_MEDIUM", "BUILD_GENERAL1_LARGE"], var.compute_type)
    error_message = "compute_type must be SMALL, MEDIUM or LARGE (no 2XLARGE or GPU without a deliberate change)."
  }
}

variable "image" {
  description = "CodeBuild-managed build image (Ubuntu; actions/setup-node and Playwright's --with-deps work on it)."
  type        = string
  default     = "aws/codebuild/standard:7.0"
}

variable "concurrent_build_limit" {
  description = "Most jobs running at once. With build_timeout this bounds spend: limit x timeout x per-minute price."
  type        = number
  default     = 4

  validation {
    condition     = var.concurrent_build_limit >= 1 && var.concurrent_build_limit <= 10
    error_message = "concurrent_build_limit must be 1 to 10."
  }
}

variable "build_timeout_minutes" {
  description = "Hard cap on one job's runtime."
  type        = number
  default     = 60

  validation {
    condition     = var.build_timeout_minutes >= 5 && var.build_timeout_minutes <= 120
    error_message = "build_timeout_minutes must be 5 to 120."
  }
}

variable "log_retention_days" {
  description = "How long job logs are kept."
  type        = number
  default     = 30
}

variable "docker_runner" {
  description = "Also create <project_name>-docker, a privileged (Docker-capable) runner for jobs with service containers. Each build is still a fresh machine discarded after one job."
  type        = bool
  default     = true
}

variable "account_mode" {
  description = "organization or single (stacks/org's variable of the same name). In single mode with no deploy_role_arn the provider uses the caller's own credentials, and the role carries stacks/org's workload-boundary."
  type        = string
  default     = "organization"

  validation {
    condition     = contains(["organization", "single"], var.account_mode)
    error_message = "account_mode must be organization or single."
  }
}
