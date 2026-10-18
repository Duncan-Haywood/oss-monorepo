// Expiry probes for status-keeper (Node only; the browser page never imports this).
//   checkTls:    connects to host:port, reads the certificate the server presents.
//   checkDomain: asks RDAP (the registries' JSON successor to WHOIS) when the registration expires.
// Both take their I/O as a parameter so tests never touch the network.
import tls from "node:tls";
import { X509Certificate } from "node:crypto";

const errText = (e) => String(e?.code || e?.message || e).slice(0, 200);

export function connectTls({ host, port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      const out = { validTo: cert?.valid_to ? Date.parse(cert.valid_to) : NaN, authorized: socket.authorized, authError: socket.authorizationError ? String(socket.authorizationError) : null, subjectAltName: cert?.subjectaltname || "" };
      socket.end();
      resolve(out);
    });
    socket.on("timeout", () => { socket.destroy(); reject(Object.assign(new Error(`timed out after ${timeoutMs}ms`), { name: "TimeoutError" })); });
    socket.on("error", reject);
  });
}

// def: {host, port?, timeoutMs, strict?}. Returns {ok, ms, error?, expiresAt?}.
// ok is false when the certificate is expired, does not match the name, or is not trusted
// (strict, the default); a still-valid certificate with few days left is ok: the caller warns.
export async function checkTls(def, connect = connectTls, now = Date.now()) {
  const started = Date.now();
  try {
    const r = await connect({ host: def.host, port: def.port || 443, timeoutMs: def.timeoutMs });
    const ms = Date.now() - started;
    if (!Number.isFinite(r.validTo)) return { ok: false, ms, error: "server presented no certificate" };
    if (r.validTo <= now) return { ok: false, ms, error: `certificate expired ${new Date(r.validTo).toISOString().slice(0, 10)}`, expiresAt: r.validTo };
    if (def.strict !== false && !r.authorized) return { ok: false, ms, error: `certificate not trusted: ${r.authError || "unknown reason"}`, expiresAt: r.validTo };
    return { ok: true, ms, expiresAt: r.validTo };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: e.name === "TimeoutError" ? e.message : errText(e) };
  }
}

// Registration expiry from an RDAP domain object, or null.
export function rdapExpiry(body) {
  const ev = (body?.events || []).find((e) => e.eventAction === "expiration");
  const t = ev ? Date.parse(ev.eventDate) : NaN;
  return Number.isFinite(t) ? t : null;
}

export async function checkDomain(def, doFetch = fetch, now = Date.now()) {
  const started = Date.now();
  try {
    const res = await doFetch(`https://rdap.org/domain/${encodeURIComponent(def.domain)}`, { headers: { accept: "application/rdap+json", "user-agent": "status-keeper/1" }, signal: AbortSignal.timeout(def.timeoutMs) });
    const ms = Date.now() - started;
    if (res.status === 404) return { ok: false, ms, error: "domain not found in RDAP (not registered, or its registry has no RDAP service)" };
    if (!res.ok) return { ok: false, ms, error: `RDAP HTTP ${res.status}` };
    const expiresAt = rdapExpiry(await res.json());
    if (expiresAt === null) return { ok: false, ms, error: "RDAP answer had no expiration date" };
    if (expiresAt <= now) return { ok: false, ms, error: `registration expired ${new Date(expiresAt).toISOString().slice(0, 10)}`, expiresAt };
    return { ok: true, ms, expiresAt };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: String(e.name === "TimeoutError" ? `timed out after ${def.timeoutMs}ms` : e.cause?.code || e.message || e).slice(0, 200) };
  }
}

// Parse a PEM file the operator has on disk (for `certs.mjs --pem`-style one-offs and tests).
export const pemExpiry = (pem) => Date.parse(new X509Certificate(pem).validTo);
