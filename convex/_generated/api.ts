import { anyApi, type AnyApi } from "convex/server";

// Hand-maintained stand-in for `npx convex codegen`'s generated api.ts (this
// repo has no Convex CLI codegen step in its build — see AGENT_PROTOCOL).
// db.ts deliberately does NOT import this: it keeps its own plain-string
// "leads:list"-style API map (ConvexHttpClient accepts a bare string function
// name, see convex/browser's getFunctionAddress). This file exists only for
// convex/*.ts's own inter-function imports and for convex-test, both of which
// need real FunctionReference values (resolved via the `functionName`/
// `toReferencePath` symbols convex/server's getFunctionAddress reads) rather
// than untyped path strings — anyApi is convex/server's own runtime
// implementation of exactly that proxy, so this stays byte-correct with real
// codegen output without hand-maintaining the proxy logic.
export const api: AnyApi = anyApi;
export const internal: AnyApi = anyApi;
