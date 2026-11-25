mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
}

variables {
  deploy_role_arn             = "arn:aws:iam::111111111111:role/gha-oss-monorepo-spend-guards-plan"
  kill_switch_lambda_role_arn = "arn:aws:iam::000000000000:role/spend-guards-kill-switch-lambda"
}

run "trusts_only_the_lambda_role" {
  command = plan

  assert {
    condition     = jsondecode(aws_iam_role.kill_switch.assume_role_policy).Statement[0].Principal == { AWS = "arn:aws:iam::000000000000:role/spend-guards-kill-switch-lambda" }
    error_message = "Only the kill-switch Lambda's role may assume this role."
  }
  assert {
    condition     = aws_iam_role.kill_switch.name == "spend-kill-switch"
    error_message = "The name must match the SCP exemption."
  }
}

run "least_privilege" {
  command = plan

  assert {
    condition     = alltrue([for s in jsondecode(aws_iam_role_policy.kill_switch.policy).Statement : s.Effect == "Allow" && !contains(flatten([s.Action]), "*")])
    error_message = "No wildcard actions."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.kill_switch.policy).Statement :
    alltrue([for a in flatten([s.Action]) : can(regex("^[a-z0-9-]+:(Describe|List)", a))]) if s.Resource == "*"])
    error_message = "Resource * is allowed only for list and describe calls."
  }
  assert {
    condition = length([for a in flatten([for s in jsondecode(aws_iam_role_policy.kill_switch.policy).Statement : s.Action]) :
    a if can(regex("(Terminate|Delete(DB|Service|Function$|AutoScalingGroup|Endpoint|Bucket|Object)|iam:|s3:|Get(Object|SecretValue))", a))]) == 0
    error_message = "The role must not be able to delete, terminate, read data or change IAM."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.kill_switch.policy).Statement :
    alltrue([for r in flatten([s.Resource]) : strcontains(r, ":111111111111:")]) if s.Resource != "*"])
    error_message = "Every mutation must be scoped to this account's ARNs."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.kill_switch.policy).Statement[2].Condition["ForAllValues:StringEquals"]["aws:TagKeys"] == ["spend_guard_prev"]
    error_message = "EC2 tagging must be limited to the bookkeeping tag."
  }
}
