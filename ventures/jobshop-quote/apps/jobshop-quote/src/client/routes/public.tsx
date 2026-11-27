// Sign in / sign up, shop onboarding, invitation accept, and the "/" redirect.
import type { LegalStatusDto } from "@shared/legal";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button, Card, ErrorText, Field, Input } from "../components/ui";
import { ApiError, api, queryClient } from "../lib/api";
import { Centered, ResendVerification } from "./account";
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

export function HomePage() {
  const me = useMe();
  if (me.isLoading) return null;
  if (!me.data) return <Navigate to="/sign-in" />;
  const first = me.data.memberships[0];
  if (!first) return <Navigate to="/onboarding" />;
  return <Navigate to="/app/$orgId" params={{ orgId: first.orgId }} />;
}

export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  // Set after a sign-up that needs the emailed confirmation link before the first sign-in.
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () =>
      api<{ token?: string | null }>(
        `/api/auth/${mode === "sign-in" ? "sign-in" : "sign-up"}/email`,
        {
          method: "POST",
          body: mode === "sign-in" ? { email: form.email, password: form.password } : form,
        },
      ),
    onSuccess: async (res) => {
      // With email verification on, sign-up answers without a session token.
      if (mode === "sign-up" && !res?.token) {
        setCheckInbox(form.email.trim());
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      const next = new URLSearchParams(window.location.search).get("next");
      await navigate({ to: next?.startsWith("/") ? next : "/" });
    },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };
  const unverified = submit.error instanceof ApiError && submit.error.code === "EMAIL_NOT_VERIFIED";
  if (checkInbox) {
    const invited = new URLSearchParams(window.location.search).get("next")?.startsWith("/invite/");
    return (
      <Centered>
        <Card title="Check your email">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-stone-700">
              We sent a confirmation link to {checkInbox}. Open it to finish creating your account.
              The link expires in 24 hours.
              {invited && " Then open your invitation link again to join the shop."}
            </p>
            <ResendVerification initialEmail={checkInbox} />
          </div>
        </Card>
        <p className="text-center text-sm">
          <Link to="/sign-in" className="text-sky-800 underline">
            Back to sign in
          </Link>
        </p>
      </Centered>
    );
  }
  return (
    <Centered>
      <Card title={mode === "sign-in" ? "Sign in" : "Create your account"}>
        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          {mode === "sign-up" && (
            <Field label="Name">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
          )}
          <Field label="Email">
            <Input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Password" hint={mode === "sign-up" ? "At least 10 characters" : undefined}>
            <Input
              type="password"
              required
              minLength={mode === "sign-up" ? 10 : undefined}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          {unverified ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-sm text-red-700">
                Confirm your email first: open the link we sent when you signed up.
              </p>
              <ResendVerification initialEmail={form.email} />
            </div>
          ) : (
            <ErrorText error={submit.error} />
          )}
          {mode === "sign-up" && (
            <p className="text-xs text-stone-600">
              By creating an account you agree to the <LegalLinks />.
            </p>
          )}
          <Button type="submit" disabled={submit.isPending}>
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm">
        {mode === "sign-in" ? (
          <span className="flex justify-center gap-4">
            <Link to="/sign-up" className="text-sky-800 underline">
              Create an account
            </Link>
            <Link to="/forgot-password" className="text-sky-800 underline">
              Forgot password?
            </Link>
          </span>
        ) : (
          <Link to="/sign-in" className="text-sky-800 underline">
            I already have an account
          </Link>
        )}
      </p>
      <LegalFooter />
    </Centered>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api<{ orgId: string }>("/api/orgs", { method: "POST", body: { name } }),
    onSuccess: async ({ orgId }) => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/app/$orgId/rate-card", params: { orgId } });
    },
  });
  return (
    <Centered>
      <LegalGate>
        <Card title="Set up your shop">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Shop name" hint="Printed on your quotes. You can change it later.">
              <Input
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <ErrorText error={create.error} />
            <Button type="submit" disabled={create.isPending}>
              Create shop
            </Button>
          </form>
        </Card>
      </LegalGate>
    </Centered>
  );
}

export function InvitePage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const me = useMe();
  const navigate = useNavigate();
  const accept = useMutation({
    mutationFn: () =>
      api<{ orgId: string }>(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
      }),
    onSuccess: async ({ orgId }) => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/app/$orgId", params: { orgId } });
    },
  });
  if (me.isLoading) return null;
  if (!me.data) {
    const next = encodeURIComponent(`/invite/${token}`);
    return (
      <Centered>
        <Card title="You're invited">
          <p className="mb-3 text-sm">
            Sign in or create an account with the address the invitation was sent to.
          </p>
          <div className="flex gap-2">
            <a className="text-sky-800 underline" href={`/sign-in?next=${next}`}>
              Sign in
            </a>
            <a className="text-sky-800 underline" href={`/sign-up?next=${next}`}>
              Create account
            </a>
          </div>
        </Card>
      </Centered>
    );
  }
  return (
    <Centered>
      <Card title="Join the shop">
        <p className="mb-3 text-sm">Signed in as {me.data.user.email}.</p>
        <ErrorText error={accept.error} />
        <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
          Accept invitation
        </Button>
      </Card>
    </Centered>
  );
}
