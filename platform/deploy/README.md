# One-click self-deploy

The shared "Deploy your own copy" feature (`PRODUCT_PLAYBOOK.md` §2): one static
page for every static app in `ventures/`, not a button per venture.

**Alternatives a user has today:** copying a folder by hand, or forking a repo
and enabling Pages by hand. This does it in one form, and drops the operator
notice and donate links into the copy.

## How it works

1. `build.mjs` writes `dist/` (`index.html`, `core.mjs`, `catalog.json`). The
   app list comes from `discoverSurfaces()` in `platform/pages/build.mjs`.
2. In the visitor's browser, `core.mjs` reads the app's files from the source
   repository (anonymous requests, so the token never reaches it), creates a
   public repository in the visitor's account with their token, commits the
   files plus an operator README, and enables GitHub Pages.
3. The token goes only to `api.github.com`, is never stored, and passes through
   nothing we run. Tests pin both properties (`core.test.mjs`).

Needs the source repository to be readable without a login. Until the owner
makes it public, source reads fail with a clear 404 message; point
`SOURCE_DEFAULT` in `core.mjs` at any public mirror to use it earlier.

## Run

```
node platform/deploy/build.mjs        # writes platform/deploy/dist
node --test platform/deploy/*.test.mjs
```

## Not done yet

- Publishing `dist/` at `<site>/deploy/` and linking it from each tool page
  (`?app=<slug>` preselects an app). Needs a hub/sitemap pass in
  `platform/pages/build.mjs`.
- Cloud targets (AWS S3 + CloudFront, GCS, Azure, DigitalOcean) as OpenTofu
  modules with sealed-box secrets, and a VM target for apps with a server.
  The GitHub Pages target needs no cloud credentials, so it ships first.
- Apps with a server or a build step (the catalogue lists static apps only).
