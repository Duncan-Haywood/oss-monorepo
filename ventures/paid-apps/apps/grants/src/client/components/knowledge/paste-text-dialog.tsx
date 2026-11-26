// "Paste text" dialog -> POST /documents/text { title, kind, text }.

import { friendlyError } from "@client/components/grants/api-errors";
import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  toast,
} from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import { appPath } from "@client/lib/base-path";
import type { DocumentDto } from "@shared/api/types";
import { DOCUMENT_KINDS, type DocumentKind } from "@shared/enums";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { DOCUMENT_KIND_INFO } from "./labels";
import { useInvalidateKnowledge } from "./queries";

/** POST /documents/text: 409 duplicate_document, 400 validation_error / consent_required. */
const MAX_TEXT_CHARS = 2_000_000;
const PASTE_ERRORS = {
  duplicate_document: "You've already added this exact text. Find it in your documents list.",
  validation_error: "Check the title and text, then try again.",
};

export function PasteTextDialog({
  orgId,
  open,
  onClose,
  onCreated,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (doc: DocumentDto) => void;
}) {
  const uid = useId();
  const invalidate = useInvalidateKnowledge();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocumentKind>("program_description");
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; text?: string; consent?: string }>({});

  const create = useMutation({
    mutationFn: () =>
      api<DocumentDto>(orgApi(orgId, "/documents/text"), {
        method: "POST",
        body: { title: title.trim(), kind, text, consent: true },
      }),
    onSuccess: (doc) => {
      void invalidate(orgId);
      setTitle("");
      setText("");
      setErrors({});
      toast.success("Text saved", "We're reading it now and will propose facts to review.");
      onCreated?.(doc);
      onClose();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!title.trim()) errs.title = "Give this text a title.";
    if (text.trim().length < 20) errs.text = "Paste at least a sentence or two.";
    else if (text.length > MAX_TEXT_CHARS)
      errs.text = "That's too much text for one paste. Split it or upload the file instead.";
    if (!consent) errs.consent = "Please confirm consent before saving.";
    setErrors(errs);
    if (Object.keys(errs).length === 0) create.mutate();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      dismissible={!create.isPending}
      title="Paste text"
      description="Paste text from an email, website or notes. We'll read it like an uploaded document."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Title" htmlFor={`${uid}-title`} error={errors.title}>
          <Input
            id={`${uid}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Trades program overview"
          />
        </Field>
        <Field label="Kind" htmlFor={`${uid}-kind`} hint={DOCUMENT_KIND_INFO[kind].help}>
          <Select
            id={`${uid}-kind`}
            value={kind}
            onChange={(e) => setKind(e.target.value as DocumentKind)}
          >
            {DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOCUMENT_KIND_INFO[k].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Text" htmlFor={`${uid}-text`} error={errors.text}>
          <Textarea
            id={`${uid}-text`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-48"
          />
        </Field>
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <input
              id={`${uid}-consent`}
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300"
            />
            <label htmlFor={`${uid}-consent`} className="text-sm text-neutral-700">
              I have the right to share this text and agree it may be processed as described in the{" "}
              <a
                href={appPath("/legal/data-use")}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-700 underline underline-offset-2"
              >
                data use policy
              </a>
              .
            </label>
          </div>
          {errors.consent && (
            <p className="text-sm text-danger-600" role="alert">
              {errors.consent}
            </p>
          )}
        </div>
        {create.isError && (
          <Alert tone="danger" title="Could not save">
            {friendlyError(create.error, PASTE_ERRORS)}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Save text
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
