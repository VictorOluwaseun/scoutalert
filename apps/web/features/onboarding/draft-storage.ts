import { createDraft, type ScoutDraft, type Stage } from "./types";

const key = "scoutalert:onboarding-preview:v1";
const lifetime = 7 * 24 * 60 * 60 * 1000;
const restorableStages: Stage[] = [
  "goal",
  "focus",
  "preferences",
  "review",
  "alerts",
];
const enumValues = {
  category: ["employment", "contracts", "services"],
  arrangement: ["remote", "hybrid", "onsite", "open", "unknown"],
  currency: ["USD", "EUR", "GBP", "NGN"],
  payPeriod: ["year", "month", "hour", "project"],
  unknownEligibility: ["review", "exclude"],
  undisclosedPay: ["include", "exclude"],
  frequency: ["daily", "weekly", "dashboard"],
  weekday: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],
};

/** Copies only known brief fields and excludes remembered consent or unexpected browser data. */
function sanitizeDraft(draft: ScoutDraft): ScoutDraft {
  const fields = Object.keys(createDraft()) as (keyof ScoutDraft)[];
  const brief = Object.fromEntries(
    fields.map((field) => [field, draft[field] ?? createDraft()[field]]),
  ) as unknown as ScoutDraft;

  return { ...brief, alertConsent: false };
}

/** Restores editable progress only when the brief has enough information for that screen. */
function restoreStage(draft: ScoutDraft, storedStage: unknown): Stage {
  if (!draft.goal.trim()) {
    return "goal";
  }

  const stage = restorableStages.includes(storedStage as Stage)
    ? (storedStage as Stage)
    : "review";

  if (stage !== "goal" && !draft.target.trim()) {
    return "focus";
  }

  return stage;
}

/** Treats malformed JSON as an invalid draft, separately from unavailable browser storage. */
function parseSnapshot(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Validates browser data before restoring it; account/contact information is never in this schema. */
function isDraft(value: unknown): value is ScoutDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const validTypes = Object.entries(createDraft()).every(
    ([field, fallback]) =>
      ([
        "quietStart",
        "quietEnd",
        "authorizationLocations",
        "sponsorshipNeed",
        "authorizationConfirmed",
      ].includes(field) &&
        record[field] === undefined) ||
      typeof record[field] === typeof fallback,
  );
  const validAuthorization =
    record.sponsorshipNeed === undefined ||
    ["needed", "not_needed", "unknown"].includes(
      String(record.sponsorshipNeed),
    );
  const validEnums = Object.entries(enumValues).every(([field, options]) =>
    options.includes(String(record[field])),
  );
  const withinLimits = Object.values(record).every(
    (item) => typeof item !== "string" || item.length <= 4000,
  );

  return validTypes && validEnums && validAuthorization && withinLimits;
}

/** Restores an expiring draft, or clears only the brief for an explicit fresh start; blocked storage stays usable. */
export async function loadDraft(freshStart = false): Promise<{
  draft: ScoutDraft;
  stage: Stage;
  available: boolean;
}> {
  const fresh = createDraft();
  fresh.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";

  try {
    if (freshStart) {
      localStorage.removeItem(key);

      return { draft: fresh, stage: "goal", available: true };
    }

    const raw = localStorage.getItem(key);

    if (!raw) {
      return { draft: fresh, stage: "goal", available: true };
    }

    const stored = parseSnapshot(raw);

    if (!stored || typeof stored !== "object") {
      localStorage.removeItem(key);

      return { draft: fresh, stage: "goal", available: true };
    }

    const snapshot = stored as {
      draft: unknown;
      stage: unknown;
      savedAt: unknown;
    };
    const validTime =
      typeof snapshot.savedAt === "number" &&
      snapshot.savedAt <= Date.now() &&
      Date.now() - snapshot.savedAt < lifetime;

    if (!isDraft(snapshot.draft) || !validTime) {
      localStorage.removeItem(key);

      return { draft: fresh, stage: "goal", available: true };
    }

    return {
      draft: sanitizeDraft(snapshot.draft),
      stage: restoreStage(snapshot.draft, snapshot.stage),
      available: true,
    };
  } catch {
    return { draft: fresh, stage: "goal", available: false };
  }
}

/** Stores only the brief and safe progress; empty drafts are removed and verification is never restored. */
export async function saveDraft(
  draft: ScoutDraft,
  stage: Stage,
): Promise<boolean> {
  try {
    if (!draft.goal.trim()) {
      localStorage.removeItem(key);

      return true;
    }

    const safeStage = restorableStages.includes(stage) ? stage : "review";
    localStorage.setItem(
      key,
      JSON.stringify({
        draft: sanitizeDraft(draft),
        stage: safeStage,
        savedAt: Date.now(),
      }),
    );

    return true;
  } catch {
    return false;
  }
}
