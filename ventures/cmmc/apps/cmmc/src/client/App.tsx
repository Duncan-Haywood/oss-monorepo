import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "./lib/api";
import { authModeFromLocation } from "./lib/auth-mode";
import type { Me, OrgInfo } from "./lib/types";
import { btnCls, btnGhostCls, Card, Disclaimer, ErrorText, Field, inputCls } from "./ui";
import { AccountPageView, accountPageFromPath, ResendVerification } from "./views/Account";
import { AffirmationsView } from "./views/Affirmations";
import { AssetsView } from "./views/Assets";
import { AuditsView } from "./views/Audits";
import { BillingView } from "./views/Billing";
import { ControlsView } from "./views/Controls";
import { Dashboard } from "./views/Dashboard";
import { DocumentsView } from "./views/Documents";
import { AcceptLegal, LegalFooter, LegalLinks, LegalPage, legalKeyFromPath } from "./views/Legal";
import { PeopleView } from "./views/People";
import { PoamView } from "./views/Poam";
import { PoliciesView } from "./views/Policies";
import { ProvidersView } from "./views/Providers";
import { QualityView } from "./views/Quality";
import { SettingsView } from "./views/Settings";
import { SspView } from "./views/Ssp";
import { SuppliersView } from "./views/Suppliers";
import { isUnsubscribePath, UnsubscribePage } from "./views/Unsubscribe";

type Tab =
  | "dashboard"
  | "controls"
  | "poam"
  | "assets"
  | "providers"
  | "people"
  | "suppliers"
  | "policies"
  | "ssp"
  | "affirmations"
  | "quality"
  | "documents"
  | "audits"
  | "settings"
  | "billing";
const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "controls", label: "Controls" },
  { key: "poam", label: "POA&M" },
  { key: "assets", label: "Assets" },
  { key: "providers", label: "Providers" },
  { key: "people", label: "People" },
  { key: "suppliers", label: "Suppliers" },
  { key: "policies", label: "Policies" },
  { key: "ssp", label: "SSP" },
  { key: "affirmations", label: "Affirmations" },
  { key: "quality", label: "ISO 9001" },
  { key: "documents", label: "Documents" },
  { key: "audits", label: "Audits" },
  { key: "settings", label: "Settings" },
  { key: "billing", label: "Billing" },
];

/** Checkout and the billing portal return to /?tab=billing. */
const initialTab = (): Tab => {
  const t = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((x) => x.key === t) ? (t as Tab) : "dashboard";
};

export function App() {
  // /legal/:key is public and readable before signing up (the SPA shell serves every path).
  const legalKey = legalKeyFromPath(window.location.pathname);
  if (legalKey !== null) return <LegalPage docKey={legalKey} />;
  // Pages reached from account emails (verify, reset) and "Forgot password?".
  const accountPage = accountPageFromPath(window.location.pathname);
  if (accountPage !== null) return <AccountPageView page={accountPage} />;
  // The reminder email's signed stop link works without signing in.
  if (isUnsubscribePath(window.location.pathname)) return <UnsubscribePage />;
  return <SignedInOrAuth />;
}

function SignedInOrAuth() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<Me>("/api/me").catch((e) =>
        e instanceof ApiError && e.status === 401 ? null : Promise.reject(e),
      ),
  });
  if (me.isLoading) return <p className="p-6 text-sm text-stone-600">Loading…</p>;
  if (me.error)
    return (
      <div className="p-6">
        <ErrorText error={me.error} />
      </div>
    );
  if (!me.data) return <AuthScreen />;
  return <Workspace me={me.data} />;
}

function AuthScreen() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"in" | "up">(() =>
    authModeFromLocation(window.location.pathname, window.location.search),
  );
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  // Set after a sign-up that needs the emailed confirmation link before the first sign-in.
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () =>
      mode === "up"
        ? api<{ token?: string | null }>("/api/auth/sign-up/email", { method: "POST", json: form })
        : api<{ token?: string | null }>("/api/auth/sign-in/email", {
            method: "POST",
            json: { email: form.email, password: form.password },
          }),
    onSuccess: (res) => {
      // With email verification on, sign-up answers without a session token.
      if (mode === "up" && !res?.token) {
        setCheckInbox(form.email.trim());
        return;
      }
      return qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const unverified = submit.error instanceof ApiError && submit.error.code === "EMAIL_NOT_VERIFIED";
  if (checkInbox) {
    return (
      <main className="mx-auto mt-16 max-w-sm space-y-4 px-4">
        <h1 className="text-2xl font-semibold text-brand-700">CMMC Workspace</h1>
        <Card title="Check your email">
          <div className="space-y-3">
            <p className="text-sm text-stone-700">
              We sent a confirmation link to {checkInbox}. Open it to finish creating your account.
              The link expires in 24 hours.
            </p>
            <ResendVerification initialEmail={checkInbox} />
          </div>
        </Card>
        <Disclaimer />
        <LegalFooter />
      </main>
    );
  }
  return (
    <main className="mx-auto mt-16 max-w-sm space-y-4 px-4">
      <h1 className="text-2xl font-semibold text-brand-700">CMMC Workspace</h1>
      <p className="text-sm text-stone-600">
        Prepare your CMMC Level 1 or Level 2 self-assessment: control status, evidence, SSP, POA&M
        and your SPRS score.
      </p>
      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          {mode === "up" && (
            <Field label="Name">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
          )}
          <Field label="Email">
            <input
              className={inputCls}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Password" hint={mode === "up" ? "At least 12 characters." : undefined}>
            <input
              className={inputCls}
              type="password"
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              minLength={mode === "up" ? 12 : undefined}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </Field>
          {unverified ? (
            <p role="alert" className="text-sm text-red-700">
              Confirm your email address first: open the link we emailed you, or send a new one
              below.
            </p>
          ) : (
            <ErrorText error={submit.error} />
          )}
          {mode === "in" && (
            <p className="text-sm">
              <a href="/forgot-password" className="text-brand-600 underline">
                Forgot password?
              </a>
            </p>
          )}
          {mode === "up" && (
            <p className="text-xs text-stone-600">
              By creating an account you agree to the <LegalLinks />.
            </p>
          )}
          <div className="flex items-center justify-between">
            <button type="submit" className={btnCls} disabled={submit.isPending}>
              {mode === "up" ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="text-sm text-brand-600 underline"
              onClick={() => setMode(mode === "up" ? "in" : "up")}
            >
              {mode === "up" ? "I have an account" : "Create an account"}
            </button>
          </div>
        </form>
        {unverified && (
          <div className="mt-4 border-t border-stone-200 pt-4">
            <ResendVerification initialEmail={form.email} />
          </div>
        )}
      </Card>
      <Disclaimer />
      <LegalFooter />
    </main>
  );
}

function CreateOrg() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [level, setLevel] = useState<1 | 2>(2);
  const create = useMutation({
    mutationFn: () =>
      api<{ orgId: string }>("/api/orgs", { method: "POST", json: { name, targetLevel: level } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  return (
    <Card title="Create your organization">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Company name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field
          label="CMMC level you are preparing for"
          hint="Level 1: FCI only (15 requirements). Level 2: CUI (110 requirements)."
        >
          <select
            className={inputCls}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value) as 1 | 2)}
          >
            <option value={1}>Level 1 (FAR 52.204-21)</option>
            <option value={2}>Level 2 (NIST SP 800-171 Rev. 2)</option>
          </select>
        </Field>
        <ErrorText error={create.error} />
        <button type="submit" className={btnCls} disabled={create.isPending}>
          Create
        </button>
      </form>
    </Card>
  );
}

function Workspace({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState<string | null>(me.memberships[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>(initialTab);
  // A new account, or anyone after the documents change, accepts them before the workspace opens.
  const accepted = !!me.legal.acceptedAt;
  useEffect(() => {
    if (!orgId && me.memberships[0]) setOrgId(me.memberships[0].id);
  }, [orgId, me.memberships]);
  const org = useQuery({
    queryKey: ["org", orgId],
    queryFn: () => api<OrgInfo>(`/api/orgs/${orgId}`),
    enabled: !!orgId,
  });
  const signOut = useMutation({
    mutationFn: () => api("/api/auth/sign-out", { method: "POST", json: {} }),
    onSuccess: () => qc.clear(),
    onSettled: () => window.location.reload(),
  });
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="font-semibold text-brand-700">CMMC Workspace</span>
          {me.memberships.length > 1 && (
            <select
              className="rounded border border-stone-300 px-2 py-1 text-sm"
              value={orgId ?? ""}
              onChange={(e) => {
                // Take the id from the memberships the server sent, not the DOM value, so only a
                // real organization id ever reaches the API paths built from it.
                const picked = me.memberships.find((m) => m.id === e.target.value);
                if (picked) setOrgId(picked.id);
              }}
              aria-label="Organization"
            >
              {me.memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {accepted && orgId && (
            <nav className="flex flex-wrap gap-1" aria-label="Sections">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`rounded px-3 py-1.5 text-sm ${tab === t.key ? "bg-brand-50 font-medium text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          )}
          <span className="ml-auto text-sm text-stone-600">{me.user.email}</span>
          <button type="button" className={btnGhostCls} onClick={() => signOut.mutate()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {!accepted && <AcceptLegal legal={me.legal} />}
        {accepted && !orgId && <CreateOrg />}
        {accepted && org.error && <ErrorText error={org.error} />}
        {accepted && orgId && org.data && (
          <>
            {tab === "dashboard" && (
              <Dashboard
                orgId={orgId}
                info={org.data}
                onOpenControls={() => setTab("controls")}
                onOpenAffirmations={() => setTab("affirmations")}
                onOpenQuality={() => setTab("quality")}
                onOpenPolicies={() => setTab("policies")}
                onOpenPeople={() => setTab("people")}
                onOpenSuppliers={() => setTab("suppliers")}
                onOpenDocuments={() => setTab("documents")}
                onOpenAudits={() => setTab("audits")}
              />
            )}
            {tab === "controls" && (
              <ControlsView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "affirmations" && (
              <AffirmationsView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "quality" && (
              <QualityView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "documents" && (
              <DocumentsView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "audits" && (
              <AuditsView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "poam" && <PoamView orgId={orgId} info={org.data} />}
            {tab === "people" && (
              <PeopleView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "assets" && (
              <AssetsView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "providers" && (
              <ProvidersView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "suppliers" && (
              <SuppliersView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "policies" && (
              <PoliciesView orgId={orgId} info={org.data} onUpgrade={() => setTab("billing")} />
            )}
            {tab === "ssp" && <SspView orgId={orgId} info={org.data} />}
            {tab === "settings" && <SettingsView orgId={orgId} info={org.data} />}
            {tab === "billing" && <BillingView orgId={orgId} info={org.data} />}
          </>
        )}
        <Disclaimer />
      </main>
      <LegalFooter />
    </div>
  );
}
