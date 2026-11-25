# modules/account-baseline

Every account, every allowed region: account-level S3 Block Public Access
(home region only, it is account-wide), default EBS encryption under the
account's own rotating KMS key (`alias/account-default`), and an AWS Config
recorder (all resource types; global types once, from the home region) that
delivers to the log archive.

Used by `platform/aws/baseline/account` for the seven core accounts and,
unchanged, by `client-accounts` for every vended client account.

Inputs: `account_name`, `manage_global_resources` (true in us-east-1 only),
`config_bucket_name` and `config_kms_key_arn` (outputs of `baseline`),
`create_config_service_linked_role`. Outputs: `kms_key_arn`,
`config_recorder_name`.

GuardDuty and Security Hub are not here: the security account auto-enables
them organization-wide.
