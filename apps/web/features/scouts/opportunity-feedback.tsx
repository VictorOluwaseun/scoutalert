"use client";

import { useRouter } from "next/navigation";
import { buttonVariants } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import type { Opportunity } from "./scout-contracts";
import { useScoutMutation } from "./use-scout-mutation";

/** Makes recipient-level relevance choices explicit and reversible; compact listing controls use the same revision-fenced mutations. */
export function OpportunityFeedbackControls({
  opportunity,
  compact = false,
}: {
  opportunity: Opportunity;
  compact?: boolean;
}) {
  const router = useRouter();
  const mutation = useScoutMutation();
  const feedback = opportunity.feedback ?? { value: "none", version: 0 };
  const hidden = feedback.value === "hidden";

  /** Uses the displayed feedback revision and refreshes the private feed after persistence. */
  async function choose(value: "relevant" | "hidden" | "none"): Promise<void> {
    const result = await mutation.submit("/api/scouts/feedback", {
      postingId: opportunity.id,
      version: feedback.version,
      value,
    });

    if (result) {
      router.refresh();
    }
  }

  return (
    <div
      className={
        compact
          ? "workspace-feedback workspace-feedback-compact"
          : "workspace-feedback"
      }
      role="group"
      aria-label={`Relevance for ${opportunity.title}`}
    >
      {(!compact || hidden) && (
        <p>
          {hidden
            ? "Hidden across your scouts. We won’t include it in new alerts."
            : "Is this opportunity relevant to you?"}
        </p>
      )}
      <div className="workspace-control-buttons">
        {hidden ? (
          <button
            type="button"
            className={buttonVariants({ variant: "secondary" })}
            disabled={mutation.busy}
            onClick={() => choose("none")}
          >
            Undo hide
          </button>
        ) : (
          <>
            <button
              type="button"
              className={buttonVariants({ variant: "secondary" })}
              aria-pressed={feedback.value === "relevant"}
              disabled={mutation.busy}
              onClick={() =>
                choose(feedback.value === "relevant" ? "none" : "relevant")
              }
            >
              <Icon name="check" size={18} />
              {feedback.value === "relevant" ? "Marked relevant" : "Relevant"}
            </button>
            <button
              type="button"
              className={buttonVariants({ variant: "secondary" })}
              disabled={mutation.busy}
              onClick={() => choose("hidden")}
            >
              Hide opportunity
            </button>
          </>
        )}
      </div>
      <span role="status">
        {mutation.busy
          ? "Saving your choice…"
          : feedback.value === "relevant"
            ? "Your feedback is saved. Similar work gets a small boost on your next search. Your requirements stay as you set them."
            : ""}
      </span>
      {mutation.error && (
        <p role="alert">
          {mutation.error.message}{" "}
          <button
            type="button"
            className="workspace-text-button"
            onClick={() => router.refresh()}
          >
            Refresh
          </button>
        </p>
      )}
    </div>
  );
}
