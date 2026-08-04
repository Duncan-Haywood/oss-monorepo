import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import {
  AUTH_COOKIE_MAX_AGE,
  getAuthSecret,
  isEmailAllowed,
  normalizeTeamDomain,
} from "./auth.ts";

export interface SessionPayload {
  email: string;
  name?: string;
  picture?: string;
  iat: number;
  exp: number;
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(getAuthSecret());
}

export async function createSessionToken(payload: {
  email: string;
  name?: string;
  picture?: string;
}): Promise<string> {
  if (!isEmailAllowed(payload.email)) {
    throw new Error("Email not authorized");
  }

  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    email: payload.email.toLowerCase().trim(),
    name: payload.name,
    picture: payload.picture,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + AUTH_COOKIE_MAX_AGE)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const email = typeof payload.email === "string" ? payload.email : null;

    if (!isEmailAllowed(email)) {
      return null;
    }

    return {
      email: email!,
      name: typeof payload.name === "string" ? payload.name : undefined,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
      iat: typeof payload.iat === "number" ? payload.iat : 0,
      exp: typeof payload.exp === "number" ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

export interface CloudflareAccessPayload {
  email: string;
  name?: string;
}

export async function verifyCloudflareAccessJwt(
  jwt: string,
  teamDomain: string,
  audience: string,
): Promise<CloudflareAccessPayload | null> {
  try {
    const normalizedDomain = normalizeTeamDomain(teamDomain);
    const issuer = teamDomain.startsWith("http")
      ? teamDomain.replace(/\/$/, "")
      : `https://${normalizedDomain}`;

    const JWKS = createRemoteJWKSet(
      new URL(`${issuer}/cdn-cgi/access/certs`),
    );

    const { payload } = await jwtVerify(jwt, JWKS, {
      audience,
      issuer,
    });

    const email =
      typeof payload.email === "string"
        ? payload.email
        : typeof payload.common_name === "string"
          ? payload.common_name
          : null;

    if (!isEmailAllowed(email)) {
      return null;
    }

    return {
      email: email!,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}
