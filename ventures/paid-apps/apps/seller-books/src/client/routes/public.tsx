// Sign in / sign up, org picker, invitation acceptance.
import type { LegalStatusDto } from "@shared/legal";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ApiError, api } from "../lib/api";
import { ResendVerification, rememberNext } from "./account";
import { LegalFooter, LegalGate, LegalLinks } from "./legal";

export interface Me {
  user: { id: string; email: string; name: string };
  memberships: { orgId: string; orgName: string; role: string }[];
  /** Whether this user accepted the current Terms, Privacy, Refund and Acceptable Use documents. */
  legal: LegalStatusDto;
}

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<Me>("/api/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="mt-2 text-sm text-red-700">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <p className="mb-6 text-lg font-semibold text-brand-700">Seller Books</p>
      <div className="card">
        <h1 className="mb-4 text-xl font-semibold">{title}</h1>
        {children}
      </div>
      <LegalFooter />
    </div>
  );
}

function useAfterAuth() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.invalidateQueries({ queryKey: ["me"] });
    const next = new URLSearchParams(window.location.search).get("next");
    await navigate({ to: next?.startsWith("/") ? next : "/orgs" });
  };
}

const nextParam = () => new URLSearchParams(window.location.search).get("next");

export function LoginPage() {
  const after = useAfterAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => api("/api/auth/sign-in/email", { method: "POST", body: { email, password } }),
    onSuccess: after,
  });
  // Sign-in is refused until the address is confirmed (production and HTTPS deploys).
  const unverified = m.error instanceof ApiError && m.error.code === "EMAIL_NOT_VERIFIED";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  return (
    <AuthShell title="Sign in">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={m.isPending}>
          Sign in
        </button>
        {unverified ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-700">
              Confirm your email first: open the link we sent when you signed up.
            </p>
            <ResendVerification initialEmail={email} />
          </div>
        ) : (
          <ErrorText error={m.error} />
        )}
      </form>
      <p className="mt-4 flex justify-between text-sm">
        <span>
          New here?{" "}
          <a
            href={nextParam() ? `/signup?next=${encodeURIComponent(nextParam() ?? "")}` : "/signup"}
            className="text-brand-700 underline"
          >
            Create an account
          </a>
        </span>
        <Link to="/forgot-password" className="text-brand-700 underline">
          Forgot password?
        </Link>
      </p>
    </AuthShell>
  );
}

export function SignupPage() {
  const after = useAfterAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set after a sign-up that needs the emailed confirmation link before the first sign-in.
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => {
      // The confirmation link may open in another tab: keep where this sign-up was headed.
      rememberNext(nextParam());
      return api<{ token?: string | null }>("/api/auth/sign-up/email", {
        method: "POST",
        body: { name, email, password },
      });
    },
    onSuccess: (res) => {
      // With email verification on, sign-up answers without a session token.
      if (!res?.token) {
        setCheckInbox(email.trim());
        return;
      }
      return after();
    },
  });
  if (checkInbox) {
    return (
      <AuthShell title="Check your email">
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            We sent a confirmation link to {checkInbox}. Open it to finish creating your account.
            The link expires in 24 hours.
          </p>
          <ResendVerification initialEmail={checkInbox} />
          <Link to="/login" className="text-sm text-brand-700 underline">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Create your account">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="label">Your name</span>
          <input
            className="input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Password (10+ characters)</span>
          <input
            className="input"
            type="password"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p className="text-xs text-stone-600">
          By creating an account you agree to the <LegalLinks />.
        </p>
        <button className="btn" type="submit" disabled={m.isPending}>
          Create account
        </button>
        <ErrorText error={m.error} />
      </form>
      <p className="mt-4 text-sm">
        Have an account?{" "}
        <Link to="/login" className="text-brand-700 underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export function OrgsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api<{ orgId: string }>("/api/orgs", { method: "POST", body: { name } }),
    onSuccess: async ({ orgId }) => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/o/$orgId", params: { orgId } });
    },
  });
  if (me.isLoading) return null;
  if (!me.data) {
    void navigate({ to: "/login" });
    return null;
  }
  // A user who has not accepted the current documents sees the notice instead of their shops.
  if (!me.data.legal.acceptedAt) return <LegalGate>{null}</LegalGate>;
  return (
    <AuthShell title="Your shops">
      <ul className="mb-4 space-y-2">
        {me.data.memberships.map((m) => (
          <li key={m.orgId}>
            <Link to="/o/$orgId" params={{ orgId: m.orgId }} className="text-brand-700 underline">
              {m.orgName}
            </Link>{" "}
            <span className="text-xs text-stone-500">({m.role})</span>
          </li>
        ))}
        {me.data.memberships.length === 0 && (
          <li className="text-sm text-stone-600">No shops yet.</li>
        )}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="flex gap-2"
      >
        <input
          className="input"
          placeholder="New shop name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" type="submit" disabled={create.isPending}>
          Create
        </button>
      </form>
      <ErrorText error={create.error} />
    </AuthShell>
  );
}

export function InvitePage() {
  const me = useMe();
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const accept = useMutation({
    mutationFn: () =>
      api<{ orgId: string }>("/api/invitations/accept", { method: "POST", body: { token } }),
    onSuccess: ({ orgId }) => navigate({ to: "/o/$orgId", params: { orgId } }),
  });
  if (me.isLoading) return null;
  if (!me.data) {
    const next = encodeURIComponent(`/invite?token=${token}`);
    return (
      <AuthShell title="You're invited">
        <p className="text-sm">
          <a className="text-brand-700 underline" href={`/login?next=${next}`}>
            Sign in
          </a>{" "}
          or{" "}
          <a className="text-brand-700 underline" href={`/signup?next=${next}`}>
            create an account
          </a>{" "}
          with the email address the invitation was sent to.
        </p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Join this shop">
      <p className="mb-3 text-sm">Signed in as {me.data.user.email}.</p>
      <button
        className="btn"
        type="button"
        onClick={() => accept.mutate()}
        disabled={accept.isPending}
      >
        Accept invitation
      </button>
      <ErrorText error={accept.error} />
    </AuthShell>
  );
}
