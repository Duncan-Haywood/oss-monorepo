# AWS static hosting module (OpenTofu)

S3 (private) + CloudFront (HTTPS) for the static site in `../app`.

Run it from your own machine instead of GitHub Actions:

```
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1
export TF_ENCRYPTION="$(sed 's/__PASSPHRASE__/choose-a-long-passphrase/' encryption.hcl.tmpl)"
tofu init
tofu apply -var name=my-site -state=../state/terraform.tfstate
tofu destroy -var name=my-site -state=../state/terraform.tfstate   # tear down
```

Needs OpenTofu 1.8.5. The state file is encrypted with the passphrase above;
keep the passphrase, or you cannot destroy what you created.
