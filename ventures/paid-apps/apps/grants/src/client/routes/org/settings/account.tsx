// /orgs/$orgId/settings/account — MY account (not the org's): profile name, password, sessions,
// account deletion. Uses Better Auth (update-user, change-password, list-accounts) and /api/me/*.
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  ErrorMessage,
  Field,
  Input,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
  toast,
} from "@client/components/ui";
import { ApiError, api } from "@client/lib/api";
import { authClient } from "@client/lib/auth-client";
import { refreshMe, signOut, useMe } from "@client/lib/session";
import { PasswordInput } from "@client/routes/public/auth-shared";
import { MIN_PASSWORD_LENGTH } from "@client/routes/public/signup";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { SettingsNav } from "./settings-nav";
import { useOrgId } from "./use-org";

/** Row of GET /api/me/sessions. */
interface SessionItem {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  device: string;
  ip: string | null;
  current: boolean;
}

const sessionsKey = ["me", "sessions"] as const;

const formatDateTime = (d: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

/** Whether this account can sign in with a password (vs Google only). */
function useHasPassword() {
  return useQuery({
    queryKey: ["me", "auth-accounts"],
    queryFn: async () => {
      const res = await authClient.listAccounts();
      if (res.error) throw new Error(res.error.message ?? "Couldn't load sign-in methods");
      return (res.data ?? []).some((a) => a.providerId === "credential");
    },
  });
}

export function AccountSettingsPage() {
  const me = useMe();
  const hasPassword = useHasPassword();
  const orgId = useOrgId();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Your account"
        description="These settings apply to you across every organization you belong to."
      />
      {orgId && <SettingsNav orgId={orgId} active="account" />}
      <div className="max-w-3xl space-y-6">
        {me.isPending ? (
          <Spinner label="Loading your account" />
        ) : me.isError ? (
          <ErrorMessage error={me.error} />
        ) : !me.data ? (
          <Alert tone="warning">You're signed out. Sign in again to manage your account.</Alert>
        ) : (
          <>
            <ProfileCard name={me.data.user.name} email={me.data.user.email} />
            {hasPassword.data !== false && <PasswordCard />}
            <SessionsCard />
            <DeleteAccountCard hasPassword={hasPassword.data !== false} />
          </>
        )}
      </div>
    </div>
  );
}

function ProfileCard({ name: initial, email }: { name: string; email: string }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setName(initial), [initial]);
  const save = useMutation({
    mutationFn: async (next: string) => {
      const res = await authClient.updateUser({ name: next });
      if (res.error) throw new Error(res.error.message ?? "Couldn't save your name");
    },
    onSuccess: async () => {
      toast.success("Name saved");
      await refreshMe();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError("Please enter your name.");
    if (trimmed.length > 100) return setError("Please use 100 characters or fewer.");
    save.mutate(trimmed);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your name appears to teammates and on review history.</CardDescription>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Name" htmlFor="account-name" error={error ?? undefined}>
            <Input
              id="account-name"
              autoComplete="name"
              value={name}
              maxLength={100}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "account-name-error" : undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="account-email" hint="Contact support to change your email.">
            <Input id="account-email" value={email} disabled readOnly />
          </Field>
          <Button type="submit" loading={save.isPending} disabled={name.trim() === initial}>
            Save name
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordCard() {
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: async () => {
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (res.error) {
        const code = res.error.code ?? "";
        throw new Error(
          code.includes("INVALID_PASSWORD")
            ? "Your current password is incorrect."
            : code.includes("PASSWORD_TOO_SHORT")
              ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
              : (res.error.message ?? "Couldn't change your password"),
        );
      }
    },
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast.success("Password changed", "Your other sessions were signed out.");
      void qc.invalidateQueries({ queryKey: sessionsKey });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!current) return setError("Enter your current password.");
    if (next.length < MIN_PASSWORD_LENGTH)
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.`);
    change.mutate();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing your password signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Current password" htmlFor="account-current-password">
            <PasswordInput
              id="account-current-password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field
            label="New password"
            htmlFor="account-new-password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          >
            <PasswordInput
              id="account-new-password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="account-new-password-hint"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function SessionsCard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sessions = useQuery({
    queryKey: sessionsKey,
    queryFn: () => api<{ items: SessionItem[] }>("/api/me/sessions"),
  });
  const revoke = useMutation({
    mutationFn: (s: SessionItem) =>
      api(`/api/me/sessions/${encodeURIComponent(s.id)}`, { method: "DELETE" }),
    onSuccess: async (_d, s) => {
      if (s.current) {
        await signOut().catch(() => undefined);
        await navigate({ to: "/login" });
        return;
      }
      toast.success("Session signed out");
      await qc.invalidateQueries({ queryKey: sessionsKey });
    },
    onError: (e) => toast.error("Couldn't sign out that session", e),
  });
  const revokeOthers = useMutation({
    mutationFn: () =>
      api<{ revoked: number }>("/api/me/sessions/revoke-others", { method: "POST" }),
    onSuccess: async ({ revoked }) => {
      toast.success(
        revoked === 1 ? "Signed out 1 other session" : `Signed out ${revoked} other sessions`,
      );
      await qc.invalidateQueries({ queryKey: sessionsKey });
    },
    onError: (e) => toast.error("Couldn't sign out other sessions", e),
  });
  const items = sessions.data?.items ?? [];
  const others = items.filter((s) => !s.current).length;
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Where you're signed in</CardTitle>
          <CardDescription>
            Sign out any session you don't recognize, then change your password.
          </CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={others === 0}
          loading={revokeOthers.isPending}
          onClick={() => revokeOthers.mutate()}
        >
          Sign out other sessions
        </Button>
      </CardHeader>
      <CardBody>
        {sessions.isPending ? (
          <Spinner label="Loading sessions" />
        ) : sessions.isError ? (
          <ErrorMessage error={sessions.error} />
        ) : items.length === 0 ? (
          <p className="text-sm text-neutral-500">No active sessions.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Device</Th>
                <Th>Network</Th>
                <Th>Signed in</Th>
                <Th>Last active</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <span className="font-medium text-neutral-900">{s.device}</span>
                    {s.current && (
                      <Badge tone="success" className="ml-2">
                        This device
                      </Badge>
                    )}
                  </Td>
                  <Td className="font-mono text-xs">{s.ip ?? "—"}</Td>
                  <Td>{formatDateTime(s.createdAt)}</Td>
                  <Td>{formatDateTime(s.lastActiveAt)}</Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={revoke.isPending && revoke.variables?.id === s.id}
                      onClick={() => revoke.mutate(s)}
                    >
                      Sign out
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

interface LastOwnerDetails {
  orgs?: { orgId: string; orgName: string }[];
}

function DeleteAccountCard({ hasPassword }: { hasPassword: boolean }) {
  const navigate = useNavigate();
  const orgId = useOrgId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blockingOrgs, setBlockingOrgs] = useState<{ orgId: string; orgName: string }[]>([]);

  const remove = useMutation({
    mutationFn: () =>
      api<{ deleted: true }>("/api/me", {
        method: "DELETE",
        body: hasPassword ? { password } : {},
      }),
    onSuccess: async () => {
      setOpen(false);
      await signOut().catch(() => undefined);
      toast.success("Your account was deleted");
      await navigate({ to: "/" });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "last_owner") {
        setOpen(false);
        setBlockingOrgs((e.details as LastOwnerDetails | undefined)?.orgs ?? []);
        setError(e.message);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <Card className="border-danger-200">
      <CardHeader>
        <CardTitle>Delete your account</CardTitle>
        <CardDescription>
          Permanently deletes your login and removes you from every organization. Organizations and
          their data are not deleted. If you're the only owner of an organization, make someone else
          an owner (or delete the organization) first.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-4">
        {error && !open && (
          <Alert tone="danger" title="Your account wasn't deleted">
            {error}
            {blockingOrgs.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {blockingOrgs.map((o) => (
                  <li key={o.orgId}>
                    <Link
                      to="/orgs/$orgId/settings/members"
                      params={{ orgId: o.orgId }}
                      className="font-medium underline"
                    >
                      {o.orgName}: manage members
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <Button
          variant="danger"
          onClick={() => {
            setError(null);
            setBlockingOrgs([]);
            setPassword("");
            setOpen(true);
          }}
        >
          Delete my account
        </Button>
      </CardBody>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setError(null);
          if (hasPassword && !password) {
            setError("Enter your password to confirm.");
            return;
          }
          remove.mutate();
        }}
        title="Delete your account?"
        description="This can't be undone."
        confirmLabel="Delete account"
        tone="danger"
        loading={remove.isPending}
      >
        <div className="space-y-3">
          {error && open && <Alert tone="danger">{error}</Alert>}
          {hasPassword ? (
            <Field label="Your password" htmlFor="delete-account-password">
              <PasswordInput
                id="delete-account-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          ) : (
            <p className="text-sm text-neutral-600">
              You sign in with Google. For your security, this only works within 10 minutes of
              signing in.
            </p>
          )}
          {orgId && (
            <p className="text-xs text-neutral-500">
              You'll lose access to this organization and every other one you belong to.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </Card>
  );
}
