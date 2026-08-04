export const ALLOWED_EMAIL = "duncan.andrew.haywood@gmail.com";

export const AUTH_COOKIE_NAME = "bir_session";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === ALLOWED_EMAIL.toLowerCase();
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      return "dev-only-secret-change-in-production";
    }
    throw new Error("AUTH_SECRET environment variable is required");
  }
  return secret;
}

export function getGoogleClientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID;
}

export function getGoogleClientSecret(): string | undefined {
  return process.env.GOOGLE_CLIENT_SECRET;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

export function isCloudflareAccessEnabled(): boolean {
  return (
    process.env.CLOUDFLARE_ACCESS_ENABLED === "true" ||
    Boolean(getCloudflareAccessTeamDomain() && getCloudflareAccessAudience())
  );
}

export function getCloudflareAccessTeamDomain(): string | undefined {
  return (
    process.env.TEAM_DOMAIN ?? process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN
  );
}

export function getCloudflareAccessAudience(): string | undefined {
  return process.env.POLICY_AUD ?? process.env.CLOUDFLARE_ACCESS_AUDIENCE;
}

export function normalizeTeamDomain(teamDomain: string): string {
  return teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
