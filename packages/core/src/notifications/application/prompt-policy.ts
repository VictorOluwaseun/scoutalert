import type { ScoutAlerts, SearchDraft } from "../../onboarding/public.js";
import type { OpportunityView } from "../../scouting/domain/discovery.js";
import { criterionNames } from "../../scouting/intelligence/contracts.js";

/** Applies the user's local quiet interval, including intervals crossing midnight and DST transitions. */
export function promptWindow(alerts: ScoutAlerts, now: Date): string | null {
  if (
    !alerts.consent ||
    !alerts.promptAlerts ||
    alerts.frequency === "dashboard"
  )
    return null;
  const start = alerts.quietHours?.start ?? "20:00";
  const end = alerts.quietHours?.end ?? "08:00";
  if (
    ![start, end].every((value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
    start === end
  )
    return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: alerts.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const local = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const time = `${local.hour}:${local.minute}`;
  const quiet =
    start < end ? time >= start && time < end : time >= start || time < end;
  if (quiet) return null;
  return `prompt:${alerts.timezone}:${local.year}-${local.month}-${local.day}`;
}

/** Known closure, changed details or an elapsed explicit deadline prevent any opportunity email. */
export function hasUnavailablePosting(
  opportunity: OpportunityView,
  now: Date,
): boolean {
  const evidence = opportunity.availability;
  const age = evidence
    ? now.getTime() - Date.parse(evidence.checkedAt)
    : Number.NaN;
  if (
    opportunity.kind === "client_request" &&
    (!evidence ||
      evidence.status !== "available" ||
      !evidence.fingerprint ||
      !Number.isFinite(age) ||
      age < 0 ||
      age >= 15 * 60_000)
  )
    return true;
  if (!evidence) return false;
  if (["closed", "changed"].includes(evidence.status)) return true;
  if (!evidence.validUntil) return false;
  const deadline = Date.parse(evidence.validUntil);
  return !Number.isFinite(deadline) || deadline <= now.getTime();
}

/** Superseded AI evidence must be reassessed before any new email; provisional title matches retain their existing digest rules. */
export function hasOutdatedAssessment(opportunity: OpportunityView): boolean {
  return (
    !!opportunity.detail &&
    opportunity.detail.verificationPolicy !== "supported-criteria-v3"
  );
}

/** Prompt alerts require every supported criterion, confirmed personal declarations and fresh public evidence. Unknown eligibility stays in review. */
export function isPromptMatch(
  opportunity: OpportunityView,
  search: SearchDraft,
  now: Date,
): boolean {
  if (
    hasUnavailablePosting(opportunity, now) ||
    hasOutdatedAssessment(opportunity)
  )
    return false;
  const detail = opportunity.detail;
  const evidence = opportunity.availability;
  if (
    !detail ||
    detail.assessedBy !== "ai" ||
    !search.authorizationConfirmed ||
    !search.authorizationLocations?.trim() ||
    !search.sponsorshipNeed ||
    search.sponsorshipNeed === "unknown" ||
    !evidence ||
    evidence.status !== "available" ||
    !evidence.fingerprint
  )
    return false;
  const age = now.getTime() - Date.parse(evidence.checkedAt);
  if (!Number.isFinite(age) || age < 0 || age >= 15 * 60_000) return false;
  if (
    detail.criteria.length !== criterionNames.length ||
    new Set(detail.criteria.map((item) => item.criterion)).size !==
      criterionNames.length
  )
    return false;
  if (!search.background.trim()) return false;
  const researchExpiry = detail.employerResearch?.expiresAt;
  if (
    researchExpiry &&
    (!Number.isFinite(Date.parse(researchExpiry)) ||
      Date.parse(researchExpiry) <= now.getTime())
  )
    return false;
  return criterionNames.every((name) => {
    const item = detail.criteria.find(
      (criterion) => criterion.criterion === name,
    );
    if (!item || item.status === "conflicts") return false;
    return (
      item.status === "meets" &&
      item.quotes.length > 0 &&
      item.briefQuotes.length > 0
    );
  });
}
