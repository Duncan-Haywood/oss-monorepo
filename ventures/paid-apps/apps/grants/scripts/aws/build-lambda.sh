#!/usr/bin/env bash
# Builds the grants Lambda bundle for the AWS SaaS starter (docs/AWS.md):
#   dist-aws/app-grants/index.mjs      the starter's Lambda entry + src/worker/aws/lambda-app.ts
#   dist-aws/app-grants/migrations/    migrations-pg/ (applied by the module's __migrate invocation)
#   dist-aws/app-grants/assets/        the built SPA (dist/client), served by the Lambda
# STARTER_RUNTIME = oss-monorepo platform/aws/stacks/saas-starter/runtime at the commit infra/aws
# pins, after `npm ci` there. BASE_PATH as for the Worker build (default /grants).
set -euo pipefail
: "${STARTER_RUNTIME:?set STARTER_RUNTIME to the starter runtime directory (npm ci done)}"
app="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$app"
BASE_PATH="${BASE_PATH-/grants}" pnpm build
node "$STARTER_RUNTIME/build.mjs" product grants "$app/src/worker/aws/lambda-app.ts" "$app/migrations-pg"
rm -rf dist-aws
mkdir -p dist-aws
cp -R "$STARTER_RUNTIME/dist/app-grants" dist-aws/app-grants
cp -R dist/client dist-aws/app-grants/assets
echo "built $(du -sh dist-aws/app-grants | cut -f1) in dist-aws/app-grants"
