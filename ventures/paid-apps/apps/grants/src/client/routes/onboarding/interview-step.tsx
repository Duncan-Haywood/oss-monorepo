// Onboarding step 3: offer the AI interview now (POST /interviews {kind:"onboarding"}) or later.
import { Button, ErrorMessage } from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import type { InterviewDto } from "@shared/api/types";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Clock, Mic, PencilLine } from "lucide-react";

const POINTS = [
  { icon: Clock, text: "About 10–15 minutes. Stop any time and pick up where you left off." },
  { icon: Mic, text: "Type or speak your answers — dictation works on phones and computers." },
  {
    icon: PencilLine,
    text: "We ask about your history, programs, people you serve and results — the things funders always want to know.",
  },
  {
    icon: CheckCircle2,
    text: "Your answers become facts you review and confirm. Nothing is used in an application until you've seen it.",
  },
];

export function InterviewStep({
  orgId,
  onNext,
  onBack,
}: {
  orgId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const start = useMutation({
    mutationFn: async () => {
      // Record consent for the AI interview the user is explicitly starting (best effort).
      await api(orgApi(orgId, "/privacy/consents"), {
        method: "POST",
        body: { scope: "ai_interview", granted: true },
      }).catch(() => undefined);
      return api<InterviewDto>(orgApi(orgId, "/interviews"), {
        method: "POST",
        body: { kind: "onboarding" },
      });
    },
    onSuccess: (interview) =>
      navigate({
        to: "/orgs/$orgId/interviews/$interviewId",
        params: { orgId, interviewId: interview.id },
      }),
  });

  return (
    <div className="space-y-6">
      <p className="text-neutral-700">
        Documents never tell the whole story. A short conversation with our AI interviewer fills in
        the rest — in your words.
      </p>
      <ul className="space-y-3">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3 text-sm text-neutral-700">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50">
              <Icon className="h-4 w-4 text-brand-700" aria-hidden />
            </span>
            <span className="pt-1.5">{text}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500">
        Audio is turned into text and not kept unless you choose to in Privacy settings. Your
        answers are never used to train AI.
      </p>
      {start.isError && <ErrorMessage error={start.error} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <Button variant="ghost" onClick={onBack} disabled={start.isPending}>
          Back
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onNext} disabled={start.isPending}>
            Later
          </Button>
          <Button onClick={() => start.mutate()} loading={start.isPending}>
            <Mic className="h-4 w-4" aria-hidden />
            Start interview now
          </Button>
        </div>
      </div>
    </div>
  );
}
