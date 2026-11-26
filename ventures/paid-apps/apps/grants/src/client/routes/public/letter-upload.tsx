// /letters/$token — public page where a partner uploads their signed letter of support. No login:
// the link itself is the credential (single purpose, expires after 30 days). Shows only the org
// name, the grant title and the due date (GET /api/letters/:token).
import { Alert, Button, Card, CardBody, Checkbox, Label, Spinner } from "@client/components/ui";
import { ApiError, api, formatDate } from "@client/lib/api";
import type { PublicLetterInfoDto } from "@shared/api/attachments";
import { LETTER_MAX_BYTES } from "@shared/api/attachments";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { CheckCircle2, FileUp } from "lucide-react";
import * as React from "react";

const ALLOWED = /\.(pdf|docx)$/i;

export function letterLinkError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404)
      return "We couldn't find this link. Check that you copied the whole link from the email.";
    if (e.status === 410) return e.message;
    if (e.status === 429) return "Too many attempts. Please wait a minute and try again.";
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

/** Client-side check (the server checks again, including the file's contents). */
export function letterFileProblem(file: File | null): string | null {
  if (!file) return "Choose the signed letter to upload.";
  if (!ALLOWED.test(file.name)) return "Please choose a PDF or Word (.docx) file.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > LETTER_MAX_BYTES)
    return "This file is larger than 10 MB. Please upload a smaller copy.";
  return null;
}

export function LetterUploadPage() {
  const { token = "" } = useParams({ strict: false }) as { token?: string };
  const path = `/api/letters/${encodeURIComponent(token)}`;
  const info = useQuery({
    queryKey: ["letters", token],
    queryFn: () => api<PublicLetterInfoDto>(path),
    retry: false,
    enabled: !!token,
  });
  const [file, setFile] = React.useState<File | null>(null);
  const [consent, setConsent] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      if (file) form.set("file", file);
      form.set("consent", consent ? "true" : "false");
      return api<{ received: true }>(`${path}/upload`, { method: "POST", body: form });
    },
  });
  const problem = letterFileProblem(file);

  return (
    <main className="mx-auto max-w-xl px-4 py-10" aria-labelledby="letter-upload-heading">
      <h1 id="letter-upload-heading" className="mb-2 text-2xl font-semibold text-neutral-900">
        Upload a letter of support
      </h1>
      {info.isLoading && <Spinner label="Checking your link" />}
      {info.error && (
        <Alert tone="danger" title="This link can't be used">
          {letterLinkError(info.error)}
        </Alert>
      )}
      {info.data && upload.isSuccess && (
        <Alert tone="success" title="Thank you!">
          Your letter was sent to {info.data.orgName}. You can close this page.
        </Alert>
      )}
      {info.data && !upload.isSuccess && (
        <Card>
          <CardBody className="space-y-5">
            <p className="text-neutral-700">
              <strong>{info.data.orgName}</strong> asked {info.data.partnerName} for a letter of
              support for their application to <strong>{info.data.grantTitle}</strong>
              {info.data.dueAt ? (
                <>
                  , due <strong>{formatDate(info.data.dueAt)}</strong>
                </>
              ) : null}
              .
            </p>
            <section aria-labelledby="what-to-upload" className="space-y-2">
              <h2 id="what-to-upload" className="font-semibold text-neutral-900">
                What to upload
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
                <li>The letter on your organization's letterhead, signed and dated.</li>
                <li>
                  In your own words: how you work with {info.data.orgName}, and any commitment you
                  are actually able to make. Please don't include anything you are not committing
                  to.
                </li>
                <li>One PDF or Word (.docx) file, up to 10 MB. No account needed.</li>
              </ul>
            </section>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (!problem && consent) upload.mutate();
              }}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="letter-file">Signed letter (PDF or Word)</Label>
                <input
                  id="letter-file"
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  aria-describedby="letter-file-help"
                  aria-invalid={touched && !!problem}
                  className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p id="letter-file-help" className="text-sm text-neutral-500">
                  {file ? `Selected: ${file.name}` : "Up to 10 MB."}
                </p>
                {touched && problem && (
                  <p className="text-sm text-danger-700" role="alert">
                    {problem}
                  </p>
                )}
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="letter-consent"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <Label htmlFor="letter-consent" className="font-normal">
                  I am allowed to share this letter with {info.data.orgName}, who may include it in
                  grant applications.
                </Label>
              </div>
              {touched && !consent && (
                <p className="text-sm text-danger-700" role="alert">
                  Please confirm you can share this letter.
                </p>
              )}
              {upload.error && <Alert tone="danger">{letterLinkError(upload.error)}</Alert>}
              <Button type="submit" loading={upload.isPending}>
                <FileUp aria-hidden /> Upload letter
              </Button>
            </form>
          </CardBody>
        </Card>
      )}
      {upload.isSuccess && (
        <p className="mt-4 flex items-center gap-2 text-sm text-neutral-600">
          <CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden /> Received. This link has
          now been used and no longer accepts uploads.
        </p>
      )}
    </main>
  );
}
