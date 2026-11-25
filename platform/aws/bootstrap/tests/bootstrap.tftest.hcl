# Security invariants of the state bucket, checked against a mocked AWS
# provider (no account, no credentials): `tofu test` from this directory.

mock_provider "aws" {
  override_data {
    target = data.aws_caller_identity.current
    values = { account_id = "111111111111" }
  }
  override_data {
    target = data.aws_partition.current
    values = { partition = "aws" }
  }
}

variables {
  organization_id = "o-exampleorg1"
}

run "state_bucket_is_private_encrypted_and_locked" {
  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "All four Block Public Access settings must be on."
  }

  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.state.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms"
    error_message = "State must be encrypted with KMS."
  }

  assert {
    condition     = aws_kms_key.state.enable_key_rotation
    error_message = "The state key must rotate."
  }

  assert {
    condition     = aws_s3_bucket.state.object_lock_enabled && one(aws_s3_bucket_versioning.state.versioning_configuration).status == "Enabled"
    error_message = "Versioning and object lock must be on."
  }

  assert {
    condition     = one(aws_s3_bucket_object_lock_configuration.state.rule).default_retention[0].mode == "GOVERNANCE"
    error_message = "Default retention must be GOVERNANCE mode."
  }

  assert {
    condition     = one(aws_s3_bucket_ownership_controls.state.rule).object_ownership == "BucketOwnerEnforced"
    error_message = "ACLs must be disabled."
  }

  assert {
    condition     = aws_s3_bucket.state.bucket == "oss-monorepo-tfstate-111111111111-us-east-1"
    error_message = "Bucket name must carry account and region."
  }
}

run "bucket_policy_denies_plain_http_and_grants_only_scoped_roles" {
  assert {
    condition = anytrue([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s.Effect == "Deny" && try(s.Condition.Bool["aws:SecureTransport"], "") == "false"
    ])
    error_message = "The bucket policy must deny non-TLS requests."
  }

  assert {
    condition     = length([for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement : s if s.Effect == "Allow"]) > 0
    error_message = "With an organization ID, CI roles get scoped grants."
  }

  # Every Allow is scoped to this organization and to a gha-<repo>-<stack>-* role.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      try(s.Condition.StringEquals["aws:PrincipalOrgID"], "") == "o-exampleorg1" &&
      alltrue([for a in flatten([try(s.Condition.ArnLike["aws:PrincipalArn"], "none")]) : can(regex("^arn:aws:iam::\\*:role/gha-(oss|private)-monorepo-[a-z-]+-(plan|apply)$", a))])
      if s.Effect == "Allow"
    ])
    error_message = "Every Allow must be limited to the organization and to named CI roles."
  }

  # Plan roles never get write access.
  assert {
    condition = alltrue(flatten([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement : [
        for a in flatten([try(s.Condition.ArnLike["aws:PrincipalArn"], "none")]) : endswith(a, "-apply")
      ] if s.Effect == "Allow" && contains(flatten([s.Action]), "s3:PutObject")
    ]))
    error_message = "Only apply roles may write state."
  }

  # The public repository's roles never reach the payments state.
  assert {
    condition = !anytrue(flatten([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement : [
        for a in flatten([try(s.Condition.ArnLike["aws:PrincipalArn"], "none")]) : strcontains(a, "gha-oss-monorepo-payments-")
      ] if s.Effect == "Allow"
    ]))
    error_message = "No oss-monorepo role may reach payments state."
  }
}

run "first_apply_has_no_cross_account_grants" {
  variables {
    organization_id = null
  }

  assert {
    condition     = alltrue([for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement : s.Effect == "Deny"])
    error_message = "Before the organization exists, the bucket policy only denies."
  }

  assert {
    condition     = length(jsondecode(aws_kms_key.state.policy).Statement) == 1
    error_message = "Before the organization exists, only the account administers the key."
  }
}

run "payments_state_cannot_be_handed_to_the_public_repo" {
  command = plan

  variables {
    stacks = { payments = "oss-monorepo" }
  }

  expect_failures = [var.stacks]
}
