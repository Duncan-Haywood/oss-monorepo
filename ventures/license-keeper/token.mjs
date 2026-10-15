// Signed license tokens (Ed25519). Runs in Node 20+ and in browsers: WebCrypto only,
// no node: imports, so the page and the server share one implementation.
//   token = "LK1." + base64url(JSON claims) + "." + base64url(signature over the first two parts)
// A token verifies offline with the public key alone; the server is only needed
// to activate machines, refresh an expiring token, or revoke.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = (bytes) => {
  let s = ""; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (str) => {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error("bad base64url");
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function generateKeyPair() {
  const kp = await subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  return {
    publicKey: b64u(await subtle.exportKey("raw", kp.publicKey)),
    privateKey: b64u(await subtle.exportKey("pkcs8", kp.privateKey)),
  };
}

const importPublic = (pub) => subtle.importKey("raw", unb64u(pub), "Ed25519", false, ["verify"]);
const importPrivate = (priv) => subtle.importKey("pkcs8", unb64u(priv), "Ed25519", false, ["sign"]);

const sec = (ms) => Math.floor(ms / 1000);

// claims: {id, product, email, plan, features, machines, exp (unix s or null), iat}
export async function signLicense(privateKey, claims) {
  if (!claims || !claims.id || !claims.product) throw new Error("claims need id and product");
  const body = { v: 1, ...claims };
  const head = `LK1.${b64u(enc.encode(JSON.stringify(body)))}`;
  const sig = await subtle.sign("Ed25519", await importPrivate(privateKey), enc.encode(head));
  return `${head}.${b64u(sig)}`;
}

export function parseLicense(token) {
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== "LK1") return null;
  try { return { head: `${parts[0]}.${parts[1]}`, claims: JSON.parse(dec.decode(unb64u(parts[1]))), sig: unb64u(parts[2]) }; } catch { return null; }
}

// -> {valid, reason, claims}. reason: ok | malformed | bad-signature | expired | not-yet-valid | wrong-product
export async function verifyLicense(publicKey, token, { now = Date.now(), product } = {}) {
  const p = parseLicense(token);
  if (!p) return { valid: false, reason: "malformed", claims: null };
  let good = false;
  try { good = await subtle.verify("Ed25519", await importPublic(publicKey), p.sig, enc.encode(p.head)); } catch { good = false; }
  if (!good) return { valid: false, reason: "bad-signature", claims: null };
  const c = p.claims;
  if (product && c.product !== product) return { valid: false, reason: "wrong-product", claims: c };
  if (c.nbf && sec(now) < c.nbf) return { valid: false, reason: "not-yet-valid", claims: c };
  if (c.exp && sec(now) >= c.exp) return { valid: false, reason: "expired", claims: c };
  return { valid: true, reason: "ok", claims: c };
}
