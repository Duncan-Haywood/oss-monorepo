// Tiny client for your own backend. Zero dependencies; Node 18+ or any runtime with fetch.
//   import { createKeeper } from "./sdk.mjs";
//   const keeper = createKeeper({ url: "https://errors.example.com", key: process.env.INGEST_KEY, release: "1.4.2" });
//   keeper.install();                 // also catches uncaughtException / unhandledRejection
//   keeper.capture(err, { user: "acct_42", tags: { route: "/checkout" } });
// Never throws and never blocks a request.
export function createKeeper({ url, key, project = "default", release, environment = "production", fetchImpl = fetch, onError = () => {} }) {
  const endpoint = `${url.replace(/\/$/, "")}/v1/events`;
  const keeper = {
    capture(err, extra = {}) {
      const e = err instanceof Error ? err : new Error(String(err));
      const body = { id: extra.id, project, release, environment, type: e.name, message: e.message, stack: e.stack, user: extra.user, tags: extra.tags, fingerprint: extra.fingerprint };
      return fetchImpl(endpoint, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) })
        .then((r) => { if (!r.ok) onError(new Error(`error-keeper ${r.status}`)); }).catch(onError);
    },
    /** Express/Connect error middleware: app.use(keeper.middleware()) after your routes. Passes the error on. */
    middleware() { return (err, req, _res, next) => { keeper.capture(err, { tags: { route: String(req.path || "").slice(0, 80), method: req.method } }); next(err); }; },
    /** Report crashes, then let the process die as it would have: a process in an unknown state should not keep serving. */
    install(proc = process) {
      proc.on("unhandledRejection", (r) => { keeper.capture(r); });
      proc.on("uncaughtException", (e) => { keeper.capture(e).finally(() => proc.exit(1)); });
      return keeper;
    },
  };
  return keeper;
}
