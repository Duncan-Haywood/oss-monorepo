// Sign in / sign up, then create or pick an organization.

import type { MyInvitationDto } from "@shared/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorText } from "../components/error";
import { meQuery } from "../components/layout";
import { ApiError, api } from "../lib/api";
import { initialAuthMode } from "../lib/auth-mode";
import { ResendVerification } from "./account";
import { LegalLinks } from "./legal";

/** Invitations to my verified address: accept (then open the company) or decline. */
function MyInvitations() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ["my-invitations"],
    queryFn: () => api<{ items: MyInvitationDto[] }>("/api/me/invitations"),
  });
  const accept = useMutation({
    mutationFn: (id: string) =>
      api<{ orgId: string }>(`/api/me/invitations/${encodeURIComponent(id)}/accept`, {
        method: "POST",
      }),
    onSuccess: async ({ orgId }) => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["my-invitations"] });
      await navigate({ to: "/orgs/$orgId", params: { orgId } });
    },
  });
  const decline = useMutation({
    mutationFn: (id: string) =>
      api(`/api/me/invitations/${encodeURIComponent(id)}/decline`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-invitations"] }),
  });
  if (!list.data?.items.length) return <ErrorText error={list.error} />;
  return (
    <div className="card">
      <h2 className="mb-2 font-semibold">Invitations</h2>
      <ul className="space-y-3">
        {list.data.items.map((i) => (
          <li key={i.id} className="space-y-1">
            <p className="text-sm">
              {i.inviterName ? `${i.inviterName} invited you` : "You're invited"} to join{" "}
              <strong>{i.orgName}</strong> as {i.role}.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="btn"
                disabled={accept.isPending}
                onClick={() => accept.mutate(i.id)}
              >
                Accept
              </button>
              <button
                type="button"
                className="text-sm underline"
                disabled={decline.isPending}
                onClick={() => decline.mutate(i.id)}
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
      <ErrorText error={accept.error ?? decline.error} />
    </div>
  );
}

function AuthForm() {
  const qc = useQueryClient();
  // `/?signup` (the "Start free" links on the marketing site and the free guides) opens sign-up.
  const [mode, setMode] = useState<"sign-in" | "sign-up">(() =>
    initialAuthMode(typeof window === "undefined" ? "" : window.location.search),
  );
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  // Set after a sign-up that needs the emailed confirmation link before the first sign-in.
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () =>
      api<{ token?: string | null }>(`/api/auth/${mode}/email`, {
        method: "POST",
        body: mode === "sign-up" ? form : { email: form.email, password: form.password },
      }),
    onSuccess: (res) => {
      // With email verification on, sign-up answers without a session token.
      if (mode === "sign-up" && !res?.token) setCheckInbox(form.email.trim());
      return qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const unverified = submit.error instanceof ApiError && submit.error.code === "EMAIL_NOT_VERIFIED";
  if (checkInbox) {
    return (
      <div className="card mx-auto max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-slate-600">
          We sent a confirmation link to {checkInbox}. Open it to finish creating your account. The
          link expires in 24 hours.
        </p>
        <ResendVerification initialEmail={checkInbox} />
        <button
          type="button"
          className="text-sm text-slate-600 underline"
          onClick={() => {
            setCheckInbox(null);
            setMode("sign-in");
            submit.reset();
          }}
        >
          Back to sign in
        </button>
      </div>
    );
  }
  return (
    <form
      className="card mx-auto max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <h1 className="text-xl font-semibold">
        {mode === "sign-in" ? "Sign in" : "Create an account"}
      </h1>
      <p className="text-sm text-slate-600">
        Pay applications for specialty subcontractors: schedule of values, change orders, retainage,
        and an application summary with continuation sheet as PDF and CSV.
      </p>
      {window.location.pathname === "/invitations" && (
        <p role="status" className="text-sm font-medium text-slate-800">
          You've been invited to a company. Sign in, or create an account, with the email address
          the invitation was sent to.
        </p>
      )}
      {mode === "sign-up" && (
        <input
          className="input"
          placeholder="Your name"
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      )}
      <input
        className="input"
        type="email"
        placeholder="Email"
        autoComplete="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
      />
      <input
        className="input"
        type="password"
        placeholder="Password (10+ characters)"
        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
        minLength={10}
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        required
      />
      {unverified ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-red-700">
            Confirm your email first: open the link we sent when you signed up.
          </p>
          <ResendVerification initialEmail={form.email} />
        </div>
      ) : (
        <ErrorText error={submit.error} />
      )}
      {mode === "sign-up" && (
        <p className="text-xs text-slate-600">
          You'll be asked to agree to our <LegalLinks /> before you start.
        </p>
      )}
      <button className="btn w-full justify-center" disabled={submit.isPending} type="submit">
        {mode === "sign-in" ? "Sign in" : "Sign up"}
      </button>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <button
          type="button"
          className="underline"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            submit.reset();
          }}
        >
          {mode === "sign-in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
        {mode === "sign-in" && (
          <Link to="/forgot-password" className="underline">
            Forgot password?
          </Link>
        )}
      </div>
    </form>
  );
}

export function HomePage() {
  const me = useQuery(meQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api<{ orgId: string }>("/api/orgs", { method: "POST", body: { name } }),
    onSuccess: async ({ orgId }) => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/orgs/$orgId", params: { orgId } });
    },
  });
  if (me.isLoading) return <p>Loading…</p>;
  if (!me.data) return <AuthForm />;
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <MyInvitations />
      {me.data.memberships.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Your companies</h2>
          <ul className="space-y-1">
            {me.data.memberships.map((m) => (
              <li key={m.orgId}>
                <Link to="/orgs/$orgId" params={{ orgId: m.orgId }} className="underline">
                  {m.orgName}
                </Link>{" "}
                <span className="text-xs text-slate-500">({m.role})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        className="card space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        {me.data.memberships.length > 0 ? (
          <>
            <h2 className="font-semibold">Add another company</h2>
            <p className="text-sm text-slate-600">
              Only for a second business you bill under: each company has its own jobs, people and
              plan. Your jobs are inside the company above.
            </p>
          </>
        ) : (
          <h2 className="font-semibold">Add your company</h2>
        )}
        <input
          className="input"
          placeholder="Company name (shown as the contractor on pay apps)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <ErrorText error={create.error} />
        <button className="btn" type="submit" disabled={create.isPending}>
          Create
        </button>
      </form>
    </div>
  );
}
