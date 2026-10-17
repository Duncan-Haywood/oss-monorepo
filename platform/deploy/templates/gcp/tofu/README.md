# Google Cloud Storage hosting module (OpenTofu)

A public Cloud Storage bucket holding the static site in `../app`, served over
HTTPS from `https://storage.googleapis.com/<bucket>/index.html`.

Run it from your own machine instead of GitHub Actions:

```
export GOOGLE_CREDENTIALS="$(cat service-account-key.json)"
export TF_ENCRYPTION="$(sed 's/__PASSPHRASE__/choose-a-long-passphrase/' encryption.hcl.tmpl)"
tofu init
tofu apply -var name=my-site -var project=my-gcp-project -state=../state/terraform.tfstate
# optional: -var billing_account=XXXXXX-XXXXXX-XXXXXX -var budget_amount=10   (a monthly budget alert, see budget.tf)
tofu destroy -var name=my-site -var project=my-gcp-project -state=../state/terraform.tfstate   # tear down
```

Needs OpenTofu 1.8.5 and a service account with Storage Admin on the project.
If your organization enforces "public access prevention", the bucket cannot be
public and the apply fails; use another provider or relax that policy.
The state file is encrypted with the passphrase above; keep the passphrase, or
you cannot destroy what you created.
