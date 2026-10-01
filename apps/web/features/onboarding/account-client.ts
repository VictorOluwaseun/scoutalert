import type { ScoutDraft } from "./types";
import {
  AccountRequestError,
  sendAccountRequest,
} from "../account/account-client";
import { parseSavedScout, type SavedScout } from "../scouts/scout-contracts";
export {
  AccountRequestError,
  loadAccountContext,
  requestEmailCode,
  verifyEmailCode,
  logoutAccount,
} from "../account/account-client";
export type {
  VerifiedAccount,
  CodeChallenge,
  AccountContext,
} from "../account/account-client";
export type { SavedScout } from "../scouts/scout-contracts";

/** Rejects malformed saved-state transport instead of claiming a scout was saved. */
function requireSavedScout(value: unknown): SavedScout {
  const scout = parseSavedScout(value);

  if (!scout) {
    throw new AccountRequestError("service_unavailable");
  }

  return scout;
}

/** Maps explicit confirmed answers into the server's activation transport schema. */
export function activationPayload(draft: ScoutDraft, key: string) {
  const {
    frequency,
    timezone,
    deliveryTime,
    weekday,
    promptAlerts,
    quietStart,
    quietEnd,
    alertConsent,
    ...search
  } = draft;

  return {
    key,
    search,
    confirmed: true,
    alerts: {
      frequency,
      timezone,
      deliveryTime,
      weekday,
      quietHours: { start: quietStart, end: quietEnd },
      promptAlerts: frequency === "dashboard" ? false : promptAlerts,
      consent: frequency === "dashboard" ? false : alertConsent,
      consentVersion: "opportunity-alerts-v1",
    },
  };
}

/** Saves once under a stable request key; the API revalidates ownership, intent and consent. */
export async function activateScout(
  draft: ScoutDraft,
  key: string,
  csrf: string,
): Promise<SavedScout> {
  return requireSavedScout(
    await sendAccountRequest(
      "/api/onboarding/scouts",
      activationPayload(draft, key),
      csrf,
    ),
  );
}

/** Restores a server-owned receipt from an opaque route ID after reload. */
export async function loadSavedScout(id: string): Promise<SavedScout> {
  return requireSavedScout(
    await sendAccountRequest(
      `/api/onboarding/scouts/${encodeURIComponent(id)}`,
    ),
  );
}
