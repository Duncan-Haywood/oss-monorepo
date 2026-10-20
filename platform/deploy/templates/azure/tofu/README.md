# Azure Storage static website module (OpenTofu)

A StorageV2 account with the static-website feature on, holding the site in
`../app`, served over HTTPS from the account's web endpoint
(`https://<account>.z13.web.core.windows.net/`). It creates its own resource
group, so destroying it removes everything it made.

Run it from your own machine instead of GitHub Actions:

```
export ARM_CLIENT_ID=... ARM_CLIENT_SECRET=... ARM_TENANT_ID=... ARM_SUBSCRIPTION_ID=...
export TF_ENCRYPTION="$(sed 's/__PASSPHRASE__/choose-a-long-passphrase/' encryption.hcl.tmpl)"
tofu init
tofu apply -var name=my-site -state=../state/terraform.tfstate
# optional: -var budget_email=you@example.com -var budget_amount=10   (a monthly budget alert, see budget.tf)
tofu destroy -var name=my-site -state=../state/terraform.tfstate   # tear down
```

Needs OpenTofu 1.8.5 and a service principal with the Contributor role on the
subscription (or on a resource group you pre-create). Make one with
`az ad sp create-for-rbac --role Contributor --scopes /subscriptions/<id>`.
The state file is encrypted with the passphrase above; keep the passphrase, or
you cannot destroy what you created.
