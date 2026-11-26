// OWNER: shell agent — /invite/$invitationId. Signed out → /login?next=/invite/<id>. Signed in → show the
// pending invitation (GET /api/me/invitations), accept (POST /api/me/invitations/:id/accept) → /orgs/<orgId>.
import { HrefLink, loginHref } from "@client/components/layout/href-link";
import { Alert, Badge, Button, buttonClass, Spinner, toast } from "@client/components/ui";
import { ApiError, api, formatDate } from "@client/lib/api";
import { type Membership, refreshMe, signOut, useMe } from "@client/lib/session";
import type { MemberRole } from "@shared/enums";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Building2, MailOpen } from "lucide-react";
import * as React from "react";
import { AuthCard } from "./auth-shared";

/** Row shape of GET /api/me/invitations (invitation joined with the org name). */
interface MyInvitation {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
  role: MemberRole;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export function inviteErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403)
      return "This invitation was sent to a different email address. Sign in with the address it was sent to.";
    if (e.status === 409) return "This invitation has already been used or was revoked.";
    if (e.status === 410) return "This invitation has expired. Ask an admin to send you a new one.";
    if (e.status === 404) return "We couldn't find this invitation. Check the link and try again.";
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

export function AcceptInvitePage() {
  const { invitationId = "" } = useParams({ strict: false }) as { invitationId?: string };
  const me = useMe();
  const navigate = useNavigate();
  const here = `/invite/${encodeURIComponent(invitationId)}`;
  const signedOut = me.isSuccess && me.data === null;

  React.useEffect(() => {
    if (signedOut) void navigate({ href: loginHref(here), replace: true });
  }, [signedOut, here, navigate]);

  const invites = useQuery({
    queryKey: ["my-invitations"],
    queryFn: () => api<{ items: MyInvitation[] }>("/api/me/invitations"),
    enabled: Boolean(me.data),
  });
  const invite = invites.data?.items.find((i) => i.id === invitationId) ?? null;

  const accept = useMutation({
    mutationFn: () =>
      api<Membership>(`/api/me/invitations/${encodeURIComponent(invitationId)}/accept`, {
        method: "POST",
      }),
    onSuccess: async (membership) => {
      await refreshMe().catch(() => null);
      toast.success("Invitation accepted", `Welcome to ${membership.orgName}.`);
      await navigate({ to: `/orgs/${encodeURIComponent(membership.orgId)}`, replace: true });
    },
  });

  if (me.isPending || signedOut || (me.data && invites.isPending)) {
    return (
      <AuthCard title="Accept invitation">
        <Spinner label={signedOut ? "Redirecting to sign in" : "Checking your invitation"} />
      </AuthCard>
    );
  }

  if (me.isError) {
    return (
      <AuthCard title="Accept invitation">
        <Alert tone="danger">We couldn't check your account. Please refresh and try again.</Alert>
      </AuthCard>
    );
  }

  const email = me.data?.user.email ?? "";
  const switchAccount = async () => {
    await signOut().catch(() => undefined);
    await navigate({ href: loginHref(here), replace: true });
  };

  return (
    <AuthCard
      title={invite ? `Join ${invite.orgName}` : "Accept invitation"}
      description={
        <>
          Signed in as <strong className="font-medium text-neutral-900">{email}</strong>
        </>
      }
      footer={
        <>
          Not you?{" "}
          <button
            type="button"
            className="font-medium text-brand-700 hover:underline"
            onClick={() => void switchAccount()}
          >
            Sign in with another account
          </button>
        </>
      }
    >
      {invite ? (
        <div className="mb-5 rounded-lg border border-brand-100 bg-brand-50/70 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 shadow-card">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-neutral-900">{invite.orgName}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-neutral-600">
                Role{" "}
                <Badge tone="brand" className="capitalize">
                  {invite.role}
                </Badge>
              </p>
              <p className="mt-1 text-neutral-500">Expires {formatDate(invite.expiresAt)}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-5">
          <Alert tone="warning" title="No pending invitation found for this account">
            It may have been sent to a different email address, already used, or expired. You can
            still try to accept it below, or sign in with the invited email.
          </Alert>
        </div>
      )}
      {!invite && invites.isError && (
        <div className="mb-4">
          <Alert tone="danger">{inviteErrorMessage(invites.error)}</Alert>
        </div>
      )}
      {accept.isError && (
        <div className="mb-4">
          <Alert tone="danger">{inviteErrorMessage(accept.error)}</Alert>
        </div>
      )}
      <div className="flex items-start gap-3 text-sm text-neutral-600">
        <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        <p>
          Accepting gives you access to this organization's documents, fact base and applications
          with the role shown.
        </p>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <Button
          className="w-full"
          variant={invite ? "primary" : "secondary"}
          loading={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {invite ? "Accept invitation" : "Try to accept anyway"}
        </Button>
        {!invite && (
          <HrefLink href="/" className={buttonClass({ variant: "ghost", className: "w-full" })}>
            Back to home
          </HrefLink>
        )}
      </div>
    </AuthCard>
  );
}
