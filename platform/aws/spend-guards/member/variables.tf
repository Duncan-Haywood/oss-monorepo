variable "deploy_role_arn" {
  description = "Apply role in the member account this copy targets (one state per account)."
  type        = string
}

variable "kill_switch_lambda_role_arn" {
  description = "Output kill_switch_lambda_role_arn of the spend-guards stack: the only principal trusted."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:iam::[0-9]{12}:role/", var.kill_switch_lambda_role_arn))
    error_message = "Must be an IAM role ARN."
  }
}

variable "role_name" {
  description = "Must match kill_switch_role_name in the spend-guards stack (and the SCP's exemption)."
  type        = string
  default     = "spend-kill-switch"
}

variable "allowed_regions" {
  description = "Regions the role may act in."
  type        = list(string)
  default     = ["us-east-1", "us-west-2"]
}
