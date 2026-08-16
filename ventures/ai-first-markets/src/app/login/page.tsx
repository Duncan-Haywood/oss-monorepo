import { isGoogleAuthConfigured } from "@/lib/auth";
import { sanitizeRedirectPath } from "@/lib/redirect";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirect = sanitizeRedirectPath(params.redirect);
  const error = params.error;
  const googleConfigured = isGoogleAuthConfigured();

  const googleAuthUrl = googleConfigured
    ? buildGoogleAuthUrl(redirect)
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
            AI-First Markets
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-50">
            Sign in to continue
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Access is restricted to authorized users only.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {errorMessage(error)}
          </div>
        )}

        {googleAuthUrl ? (
          <a
            href={googleAuthUrl}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
          >
            <GoogleIcon />
            Continue with Google
          </a>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Google OAuth is not configured. In production, use Cloudflare
            Access with email whitelist.
          </div>
        )}

        {/*
          The allowlist itself is deliberately not printed here. This page is
          reachable without a session, so naming the addresses would publish
          them to anyone who loads it, and rendering a configured value into
          the markup is how a server variable ends up in the HTML.
        */}
        <p className="mt-6 text-center text-xs text-zinc-400">
          Only addresses on this deployment&apos;s allowlist can sign in.
        </p>

        <p className="mt-4 text-center text-xs text-zinc-600">
          Deployed on Cloudflare with Access policy enforcement.
        </p>
      </div>
    </div>
  );
}

function buildGoogleAuthUrl(redirect: string): string {
  return `/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
}

function errorMessage(error: string): string {
  switch (error) {
    case "csrf_mismatch":
      return "Security validation failed. Please try signing in again.";
    case "oauth_not_configured":
      return "OAuth is not configured on this deployment.";
    case "token_exchange_failed":
      return "Failed to complete sign-in. Please try again.";
    case "no_access_token":
      return "No access token received from Google.";
    case "userinfo_failed":
      return "Could not retrieve your Google profile.";
    case "no_code":
      return "No authorization code received.";
    default:
      return `Sign-in error: ${error}`;
  }
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
