# `modules/static-site`

A static site on a private S3 bucket behind CloudFront, with Origin Access
Control, WAF (AWS managed rules and a per-IP rate rule, logged), a
response-headers policy, two CloudFront Functions for routing, an optional
ACM certificate with Route 53 validation and aliases, optional app origins
for paths an application serves, and an optional GitHub OIDC publisher role
that may only sync the bucket and invalidate the distribution.

Used by [`../../site/`](../../site/README.md), which explains the layout the
functions expect (served-form keys and directory stubs written by
`site/deploy/publish.mjs`). Every resource is in the provider's region, which
must be us-east-1 (CloudFront certificates and WAF).

Inputs: `variables.tf`. Outputs: `outputs.tf`. Tests:

```sh
node --test functions/functions.test.mjs
tofu init -backend=false && tofu test    # mock provider, no AWS account
```

`functions/viewer-request.js` is a `templatefile()`: its one placeholder is
the JSON config, and the file must not contain another `${` or `%{`
(`functions.test.mjs` checks).
