"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import type { ManagedScout } from "./scout-contracts";
import { useScoutMutation } from "./use-scout-mutation";

/** Exposes reversible search controls without conflating a pause with withdrawing saved email preferences. */
export function ScoutControls({ scout }: { scout: ManagedScout }) {
  const router = useRouter();
  const mutation = useScoutMutation();
  const paused = scout.status === "paused";

  /** Changes status against the displayed revision; the server fences work already in flight. */
  async function toggle(): Promise<void> {
    const result = await mutation.submit(`/api/scouts/${scout.id}/change`, {
      version: scout.version,
      action: paused ? "resume" : "pause",
    });

    if (result) {
      router.refresh();
    }
  }

  return (
    <div className="workspace-controls">
      <div className="workspace-control-buttons">
        <Link
          className={buttonVariants({ variant: "secondary" })}
          href={`/dashboard/scouts/${scout.id}`}
        >
          <Icon name="pencil" size={18} />
          Edit scout
        </Link>
        <button
          className={buttonVariants({ variant: "secondary" })}
          type="button"
          onClick={toggle}
          disabled={mutation.busy}
        >
          {mutation.busy ? "Saving…" : paused ? "Resume scout" : "Pause scout"}
        </button>
      </div>
      {paused && (
        <p>Searching and new alerts are paused. Resume when you’re ready.</p>
      )}
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
