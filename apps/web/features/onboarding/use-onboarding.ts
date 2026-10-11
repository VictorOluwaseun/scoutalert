"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadDraft, saveDraft } from "./draft-storage";
import { createDraft, type ScoutDraft, type Stage } from "./types";
import { exampleDetails } from "./fixtures";
import { accessibleStage, routeForStage, stageFromRoute } from "./stage-route";
import { reviewSearch } from "./search-review";

const searchFields = new Set<keyof ScoutDraft>([
  "goal",
  "category",
  "target",
  "arrangement",
  "arrangementRequired",
  "residence",
  "workLocations",
  "background",
  "authorizationLocations",
  "authorizationConfirmed",
  "sponsorshipNeed",
  "minimumPay",
  "currency",
  "payPeriod",
  "unknownEligibility",
  "undisclosedPay",
]);

/** Coordinates URL history and browser draft recovery without granting approval from saved data. */
export function useOnboarding(contact: {
  loaded: boolean;
  challenge: boolean;
  saved: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStage = stageFromRoute(searchParams.get("step"));
  const stage = requestedStage ?? "goal";
  const initialRequestedStage = useRef(requestedStage);
  const initialHasStep = useRef(searchParams.has("step"));
  const initialScoutId = useRef(searchParams.get("scout") ?? undefined);
  const freshStart = useRef(searchParams.get("new") === "1");
  const [searchReviewed, setSearchReviewed] = useState(false);
  const hasPushedStep = useRef(false);
  const [pendingResume, setPendingResume] = useState<Stage | null>(null);
  const [draft, setDraft] = useState(createDraft);
  const [loaded, setLoaded] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadDraft(freshStart.current).then(async (restored) => {
      const review =
        restored.draft.goal.trim() && restored.draft.target.trim()
          ? await reviewSearch(restored.draft)
          : null;

      if (cancelled) {
        return;
      }

      setSearchReviewed(review?.ready === true);
      setDraft(restored.draft);
      setStorageAvailable(restored.available);
      setLoaded(true);
      const initial = initialHasStep.current
        ? (initialRequestedStage.current ?? "goal")
        : restored.stage;
      // Identity restoration may still be pending; the later effect enforces contact access.
      const safeStage = accessibleStage(
        restored.draft,
        initial,
        review?.ready === true,
        {
          challenge: true,
          saved: initial === "ready" && Boolean(initialScoutId.current),
        },
      );
      const safeRoute = routeForStage(safeStage, initialScoutId.current);

      if (safeRoute !== window.location.pathname + window.location.search) {
        setPendingResume(safeStage);
        router.replace(safeRoute, { scroll: false });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!loaded || !contact.loaded) {
      return;
    }

    if (pendingResume !== null && pendingResume !== stage) {
      return;
    }

    if (requestedStage === null) {
      router.replace(routeForStage("goal"), { scroll: false });

      return;
    }

    const safeStage = accessibleStage(draft, stage, searchReviewed, {
      challenge: contact.challenge,
      saved: contact.saved,
    });

    if (safeStage === stage) {
      return;
    }

    router.replace(routeForStage(safeStage), { scroll: false });
  }, [
    draft,
    loaded,
    contact.loaded,
    contact.challenge,
    contact.saved,
    requestedStage,
    router,
    stage,
    pendingResume,
    searchReviewed,
  ]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    if (pendingResume !== null && pendingResume !== stage) {
      return;
    }

    if (
      accessibleStage(draft, stage, searchReviewed, {
        challenge: contact.challenge,
        saved: contact.saved,
      }) !== stage
    ) {
      return;
    }

    let cancelled = false;
    void saveDraft(draft, stage).then((available) => {
      if (!cancelled) {
        setStorageAvailable(available);
        setPendingResume(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    draft,
    stage,
    loaded,
    contact.challenge,
    contact.saved,
    pendingResume,
    searchReviewed,
  ]);

  /** Applies user edits locally, preserving unrelated answers and clearing obsolete validation messages. */
  function update(patch: Partial<ScoutDraft>) {
    if (
      Object.keys(patch).some((field) =>
        searchFields.has(field as keyof ScoutDraft),
      )
    ) {
      setSearchReviewed(false);
    }

    setDraft((previous) => ({ ...previous, ...patch }));
    setError("");
  }

  /** Adds a same-origin history entry so browser Back and Forward follow the flow. */
  function navigate(next: Stage, scoutId?: string) {
    hasPushedStep.current = true;
    setPendingResume(null);
    router.push(routeForStage(next, scoutId), { scroll: false });
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  /** Uses actual browser history after in-flow navigation, with a logical fallback for direct links. */
  function goBack(fallback: Stage) {
    setPendingResume(null);
    if (hasPushedStep.current) {
      router.back();

      return;
    }

    router.replace(routeForStage(fallback), { scroll: false });
  }

  /** Trusts only the current session's successful server review for later screens. */
  function markSearchReviewed() {
    setSearchReviewed(true);
  }

  /** Validates an opening request and seeds only known example text; this is not AI interpretation. */
  function start() {
    if (!draft.goal.trim()) {
      setError("Tell your scout a little about what you're looking for.");

      return;
    }

    if (draft.goal.length > 4000) {
      setError("Keep your brief to 4,000 characters or fewer.");

      return;
    }

    update(exampleDetails(draft.goal));
    navigate("focus");
  }

  /** Resets the local draft after confirmation; persistence removes the empty snapshot. */
  function discard() {
    const empty = createDraft();
    empty.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    setSearchReviewed(false);
    setPendingResume(null);
    hasPushedStep.current = false;
    setDraft(empty);
    router.replace(routeForStage("goal"), { scroll: false });
    setError("");
  }

  const routeReady =
    loaded &&
    contact.loaded &&
    requestedStage !== null &&
    (pendingResume === null || pendingResume === stage) &&
    accessibleStage(draft, stage, searchReviewed, contact) === stage;

  return {
    draft,
    stage,
    loaded,
    routeReady,
    storageAvailable,
    error,
    setError,
    update,
    navigate,
    goBack,
    markSearchReviewed,
    start,
    discard,
  };
}
