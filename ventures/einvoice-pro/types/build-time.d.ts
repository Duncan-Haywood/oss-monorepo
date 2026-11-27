// Modules the type check cannot see in the tree. einvoice-pro has no npm install (README, "Run it").
// - slimdom: installed by the Worker build (apps/einvoice-preflight/docs/HOSTING.md, "Deploying") and
//   bundled by wrangler; the Node routes take it from the optional `npm i --no-save` the tests name.
// - worker/files.generated.mjs: written by worker/build.mjs before `wrangler deploy`, git-ignored.
declare module "slimdom" {
  export function parseXmlDocument(xml: string): any;
}
declare module "*/files.generated.mjs" {
  export const TEXT: Record<string, string>;
  export const BASE64: Record<string, string>;
}
