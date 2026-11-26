// One draft section: read view (claims + citations + gaps + word count), edit mode (one textarea per
// paragraph → PATCH /sections/:key → new version) and "Regenerate section".
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { Button, Dialog, Field, Textarea, toast } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { DraftSection, RequirementSection } from "@shared/content";
import { HelpCircle, Pencil, Plus, RefreshCw } from "lucide-react";
import * as React from "react";
import { type CitationContext, ParagraphView } from "./claims";
import { paragraphsFromDrafts } from "./edit-model";
import { countWords, paragraphText, sectionWordCount } from "./model";
import { useEditSection, useRegenerate } from "./queries";

export function WordCount({
  words,
  chars,
  requirement,
  className,
}: {
  words: number;
  chars?: number;
  requirement?: RequirementSection;
  className?: string;
}) {
  const wordLimit = requirement?.wordLimit ?? null;
  const charLimit = requirement?.charLimit ?? null;
  const overWords = wordLimit !== null && words > wordLimit;
  const overChars = charLimit !== null && chars !== undefined && chars > charLimit;
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        overWords || overChars ? "font-semibold text-danger-700" : "text-neutral-500",
        className,
      )}
      data-over-limit={overWords || overChars || undefined}
    >
      {wordLimit !== null ? `${words} / ${wordLimit} words` : `${words} words`}
      {charLimit !== null && chars !== undefined && ` · ${chars} / ${charLimit} characters`}
      {(overWords || overChars) && " · over limit"}
    </span>
  );
}

export function SectionCard({
  section,
  requirement,
  ctx,
  applicationId,
  canEdit,
}: {
  section: DraftSection;
  requirement?: RequirementSection;
  ctx: CitationContext;
  applicationId: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [regenOpen, setRegenOpen] = React.useState(false);
  const headingId = `section-${section.key}-heading`;
  const text = section.paragraphs.map(paragraphText).join("\n\n");

  return (
    <section
      id={`section-${section.key}`}
      aria-labelledby={headingId}
      tabIndex={-1}
      className="scroll-mt-24 rounded-xl border border-neutral-200 bg-white p-5 shadow-card outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="text-base font-semibold tracking-tight text-neutral-900">
            {section.title}
          </h3>
          <WordCount
            words={sectionWordCount(section)}
            chars={text.length}
            requirement={requirement}
          />
        </div>
        {canEdit && !editing && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil aria-hidden /> Edit<span className="sr-only"> {section.title}</span>
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setRegenOpen(true)}>
              <RefreshCw aria-hidden /> Regenerate section
              <span className="sr-only"> {section.title}</span>
            </Button>
          </div>
        )}
      </header>
      {requirement?.prompt && (
        <p className="mb-3 text-sm text-neutral-500">
          <span className="font-medium text-neutral-600">Funder asks: </span>
          {requirement.prompt}
        </p>
      )}

      {editing ? (
        <SectionEditor
          section={section}
          requirement={requirement}
          applicationId={applicationId}
          orgId={ctx.orgId}
          onDone={() => setEditing(false)}
        />
      ) : section.paragraphs.length === 0 ? (
        <p className="text-sm italic text-neutral-500">No text drafted for this section yet.</p>
      ) : (
        <div className="space-y-3">
          {section.paragraphs.map((p) => (
            <ParagraphView key={p.id} paragraph={p} ctx={ctx} />
          ))}
        </div>
      )}

      {section.gaps.length > 0 && (
        <ul className="mt-4 space-y-2">
          {section.gaps.map((g) => (
            <li
              key={g.question}
              className="flex gap-2 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-950 ring-1 ring-warning-200 ring-inset"
            >
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-hidden />
              <div>
                <p>
                  <span className="font-semibold">Needs your input: </span>
                  {g.question}
                </p>
                {g.why && <p className="text-xs text-warning-800">{g.why}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <RegenerateDialog
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        orgId={ctx.orgId}
        applicationId={applicationId}
        sectionKey={section.key}
        sectionTitle={section.title}
      />
    </section>
  );
}

function SectionEditor({
  section,
  requirement,
  applicationId,
  orgId,
  onDone,
}: {
  section: DraftSection;
  requirement?: RequirementSection;
  applicationId: string;
  orgId: string;
  onDone: () => void;
}) {
  const [drafts, setDrafts] = React.useState(() => section.paragraphs.map(paragraphText));
  const save = useEditSection(orgId, applicationId);
  const baseId = React.useId();
  const words = drafts.reduce((n, d) => n + countWords(d), 0);
  const firstRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => firstRef.current?.focus(), []);

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const paragraphs = paragraphsFromDrafts(section.paragraphs, drafts, section.key);
    save.mutate(
      { sectionKey: section.key, paragraphs },
      {
        onSuccess: () => {
          toast.success(
            "Saved as a new version",
            "Every claim is being re-checked against your facts.",
          );
          onDone();
        },
      },
    );
  };

  return (
    <form onSubmit={onSave} className="space-y-3" aria-label={`Edit ${section.title}`}>
      <p className="text-xs text-neutral-500">
        Edit the text freely. Sentences you change keep the citations of the sentence they replace,
        and the fact-checker re-verifies every claim when you save. New numbers or names must come
        from your fact base or they will be flagged.
      </p>
      {drafts.map((d, i) => {
        const id = `${baseId}-p${i}`;
        return (
          <Field key={id} label={`Paragraph ${i + 1}`} htmlFor={id}>
            <Textarea
              id={id}
              ref={i === 0 ? firstRef : undefined}
              value={d}
              rows={Math.min(12, Math.max(3, Math.ceil(d.length / 90)))}
              onChange={(e) => {
                const next = [...drafts];
                next[i] = e.target.value;
                setDrafts(next);
              }}
            />
          </Field>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="xs" variant="ghost" onClick={() => setDrafts([...drafts, ""])}>
          <Plus aria-hidden /> Add paragraph
        </Button>
        <WordCount words={words} requirement={requirement} />
      </div>
      <ApiErrorAlert error={save.error} title="Couldn't save this section" />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save section
        </Button>
      </div>
    </form>
  );
}

function RegenerateDialog({
  open,
  onClose,
  orgId,
  applicationId,
  sectionKey,
  sectionTitle,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  applicationId: string;
  sectionKey: string;
  sectionTitle: string;
}) {
  const [instructions, setInstructions] = React.useState("");
  const regen = useRegenerate(orgId, applicationId);
  const id = React.useId();
  const close = () => {
    if (regen.isPending) return;
    regen.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!regen.isPending}
      title={`Regenerate "${sectionTitle}"`}
      description="The drafter rewrites this section from your fact base only, then the fact-checker verifies it again. This creates a new version."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={regen.isPending}>
            Cancel
          </Button>
          <Button
            loading={regen.isPending}
            onClick={() =>
              regen.mutate(
                { sectionKey, instructions: instructions.trim() || undefined },
                {
                  onSuccess: () => {
                    toast.success("Section regenerated", "A new version is being fact-checked.");
                    setInstructions("");
                    onClose();
                  },
                },
              )
            }
          >
            <RefreshCw aria-hidden /> Regenerate section
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field
          label="Instructions (optional)"
          htmlFor={id}
          hint="For example: shorter, lead with outcomes, mention the partnership with the school district."
        >
          <Textarea
            id={id}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={5000}
          />
        </Field>
        <ApiErrorAlert error={regen.error} title="Couldn't regenerate this section" />
      </div>
    </Dialog>
  );
}
