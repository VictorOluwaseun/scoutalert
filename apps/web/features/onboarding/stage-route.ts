import type { Stage } from "./types";

const stages: readonly Stage[] = [
  "goal",
  "focus",
  "preferences",
  "review",
  "explore",
  "alerts",
  "email",
  "verify",
  "ready",
];

/** Resolves only known onboarding steps from an untrusted URL parameter. */
export function stageFromRoute(value: string | null): Stage | null {
  if (value === null) {
    return "goal";
  }

  return stages.includes(value as Stage) ? (value as Stage) : null;
}

/** Builds a same-origin URL for a known onboarding step. */
export function routeForStage(stage: Stage, scoutId?: string): string {
  if (stage === "ready" && scoutId) {
    return `/onboarding?step=ready&scout=${encodeURIComponent(scoutId)}`;
  }

  return stage === "goal" ? "/onboarding" : `/onboarding?step=${stage}`;
}

/** Limits URL navigation to steps supported by the current answers and review check. */
export function accessibleStage(
  draft: { goal: string; target: string },
  stage: Stage,
  reviewed: boolean,
  contact: { challenge: boolean; saved: boolean } = {
    challenge: false,
    saved: false,
  },
): Stage {
  if (stage === "ready" && contact.saved) {
    return "ready";
  }

  if (!draft.goal.trim()) {
    return "goal";
  }

  if (stage === "goal" || stage === "focus") {
    return stage;
  }

  if (!draft.target.trim()) {
    return "focus";
  }

  if (stage === "verify" && reviewed && !contact.challenge) {
    return "email";
  }

  if (stage === "ready" && reviewed) {
    return "email";
  }

  if (stage === "preferences" || reviewed) {
    return stage;
  }

  return "preferences";
}
