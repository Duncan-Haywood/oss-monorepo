// One-time: get a refresh token for your own mailbox. Run from ventures/sales-agent:
//   OAUTH_PROVIDER=google OAUTH_CLIENT_ID=... OAUTH_CLIENT_SECRET=... IMAP_USER=you@gmail.com node self-host/oauth-setup.mjs
// Register http://127.0.0.1:8789/callback as a redirect URI in your own OAuth app first. Prints OAUTH_REFRESH_TOKEN=...; nothing is stored.
import http from "node:http";
import { randomBytes } from "node:crypto";
import { authUrl, exchangeCode, pkce, providerOf } from "./oauth.mjs";

const env = process.env, port = Number(env.OAUTH_SETUP_PORT || 8789), redirect = `http://127.0.0.1:${port}/callback`;
if (!env.OAUTH_CLIENT_ID) { console.error("set OAUTH_CLIENT_ID (and OAUTH_CLIENT_SECRET, OAUTH_PROVIDER=google|microsoft)"); process.exit(1); }
try { providerOf(env); } catch (e) { console.error(e.message); process.exit(1); }
const { verifier, challenge } = pkce(), state = randomBytes(12).toString("hex");
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== "/callback") { res.writeHead(404); return res.end(); }
  const done = (code, msg) => { res.writeHead(code, { "content-type": "text/plain" }); res.end(msg); };
  if (u.searchParams.get("state") !== state) return done(400, "state mismatch");
  // The provider sends ?error=... (access_denied when the person clicks Cancel) instead of a code: say so rather than posting an empty code.
  const denied = u.searchParams.get("error");
  if (denied) {
    const why = `${denied}${u.searchParams.get("error_description") ? " - " + u.searchParams.get("error_description").slice(0, 160) : ""}`;
    done(400, `Authorization was not granted (${why}). Return to the terminal.`); console.error(`authorization not granted: ${why}`); srv.close(); process.exit(1);
  }
  try {
    const token = await exchangeCode(env, { code: u.searchParams.get("code") || "", redirect, verifier });
    done(200, "Done. Return to the terminal."); console.log(`\nOAUTH_REFRESH_TOKEN=${token}\n`); srv.close(); process.exit(0);
  } catch (e) { done(500, "failed"); console.error(e.message); process.exit(1); }
});
srv.listen(port, "127.0.0.1", () => console.log("Open this URL and approve access:\n\n" + authUrl(env, { redirect, state, challenge }) + "\n"));
