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
  const freshStart = useRef(searchParams.get("new") === "1");
  const searchReviewed = useRef(false);
  const hasPushedStep = useRef(false);
  const pendingResume = useRef<Stage | null>(null);
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

      searchReviewed.current = review?.ready === true;
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
        searchReviewed.current,
        {
          challenge: true,
          saved: initial === "ready" && Boolean(searchParams.get("scout")),
        },
      );
      const safeRoute = routeForStage(
        safeStage,
        searchParams.get("scout") ?? undefined,
      );

      if (safeRoute !== window.location.pathname + window.location.search) {
        pendingResume.current = safeStage;
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

    if (requestedStage === null) {
      router.replace(routeForStage("goal"), { scroll: false });

      return;
    }

    const safeStage = accessibleStage(
      draft,
      stage,
      searchReviewed.current,
      contact,
    );

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
  ]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    if (pendingResume.current !== null && pendingResume.current !== stage) {
      return;
    }

    pendingResume.current = null;

    if (
      accessibleStage(draft, stage, searchReviewed.current, contact) !== stage
    ) {
      return;
    }

    let cancelled = false;
    void saveDraft(draft, stage).then((available) => {
      if (!cancelled) {
        setStorageAvailable(available);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [draft, stage, loaded, contact.challenge, contact.saved]);

  /** Applies user edits locally, preserving unrelated answers and clearing obsolete validation messages. */
  function update(patch: Partial<ScoutDraft>) {
    if (
      Object.keys(patch).some((field) =>
        searchFields.has(field as keyof ScoutDraft),
      )
    ) {
      searchReviewed.current = false;
    }

    setDraft((previous) => ({ ...previous, ...patch }));
    setError("");
  }

  /** Adds a same-origin history entry so browser Back and Forward follow the flow. */
  function navigate(next: Stage, scoutId?: string) {
    hasPushedStep.current = true;
    router.push(routeForStage(next, scoutId), { scroll: false });
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  /** Uses actual browser history after in-flow navigation, with a logical fallback for direct links. */
  function goBack(fallback: Stage) {
    if (hasPushedStep.current) {
      router.back();

      return;
    }

    router.replace(routeForStage(fallback), { scroll: false });
  }

  /** Trusts only the current session's successful server review for later screens. */
  function markSearchReviewed() {
    searchReviewed.current = true;
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
    searchReviewed.current = false;
    hasPushedStep.current = false;
    setDraft(empty);
    router.replace(routeForStage("goal"), { scroll: false });
    setError("");
  }

  const routeReady =
    loaded &&
    contact.loaded &&
    requestedStage !== null &&
    (pendingResume.current === null || pendingResume.current === stage) &&
    accessibleStage(draft, stage, searchReviewed.current, contact) === stage;

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
