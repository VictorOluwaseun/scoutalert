import {
  promptWindow,
  isPromptMatch,
  hasOutdatedAssessment,
} from "./prompt-policy.js";
import type { SearchDraft } from "../../onboarding/domain/search-draft.js";
import type { ScoutAlerts } from "../../onboarding/domain/scout-activation.js";
import type { OpportunityView } from "../../scouting/domain/discovery.js";
import { EmailProvider, EmailSubmissionError } from "./ports/email-provider.js";

/** Versioned contribution captured for consent and evidence rechecks immediately before dispatch. */
export interface DigestCandidate {
  ownerId: string;
  scoutId: string;
  scoutVersion: number;
  preferenceVersion: number;
  postingVersion: number;
  alerts: ScoutAlerts;
  search: SearchDraft;
  opportunity: OpportunityView;
}

/** Recipient-level ledger record; a stable ID traces provider acceptance without claiming SMTP deduplication. */
export interface PreparedDigest {
  id: string;
  recipient: string;
  opportunities: OpportunityView[];
}

/** Owns current consent checks and atomic recipient/window reservations. */
export abstract class OpportunityDeliveryRepository {
  /** Returns bounded unsent evidence candidates; dashboard-only and suppressed scouts are excluded. */
  abstract candidates(): Promise<DigestCandidate[]>;
  /** Rechecks every current version/consent and claims one delivery across contributing scouts. */
  abstract prepare(
    ownerId: string,
    window: string,
    candidates: DigestCandidate[],
  ): Promise<PreparedDigest | null>;
  /** Persists a provider outcome; ambiguous/submitting deliveries are retained and never automatically resent. */
  abstract finish(
    id: string,
    status: "accepted" | "rejected" | "unknown",
    messageId?: string,
  ): Promise<void>;
  /** Makes a lost acknowledgement visible, keeping its reserved items to prevent duplicate external effects. */
  abstract recoverUncertain(): Promise<void>;
}

/** Computes a local digest window, allowing recovery later the same day; repeated DST hours share one identity. */
export function digestWindow(alerts: ScoutAlerts, now: Date): string | null {
  if (!alerts.consent || alerts.frequency === "dashboard") {
    return null;
  }

  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone: alerts.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const parts = Object.fromEntries(
    fields.map((part) => [part.type, part.value]),
  );

  if (`${parts.hour}:${parts.minute}` < alerts.deliveryTime) {
    return null;
  }

  if (
    alerts.frequency === "weekly" &&
    parts.weekday?.toLowerCase() !== alerts.weekday.toLowerCase()
  ) {
    return null;
  }

  return `digest:${alerts.timezone}:${parts.year}-${parts.month}-${parts.day}:${alerts.deliveryTime}`;
}

/** Prioritizes eligible prompt alerts, then digests, through one recipient ledger and one submission path. */
export class DeliverOpportunityDigests {
  /** Receives inward ledger and mail ports; application code never accesses SMTP or database clients. */
  constructor(
    private readonly records: OpportunityDeliveryRepository,
    private readonly email: EmailProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Uses native timezone rules, bounded reads and durable recipient identities; SMTP ambiguity is a terminal hold. */
  async execute(now: Date): Promise<number> {
    const startedAt = this.now().getTime();
    await this.records.recoverUncertain();
    const groups = new Map<
      string,
      { owner: string; window: string; candidates: DigestCandidate[] }
    >();

    for (const candidate of await this.records.candidates()) {
      if (hasOutdatedAssessment(candidate.opportunity)) {
        continue;
      }

      const prompt = isPromptMatch(candidate.opportunity, candidate.search, now)
        ? promptWindow(candidate.alerts, now)
        : null;
      const windows = [prompt, digestWindow(candidate.alerts, now)].filter(
        (value): value is string => value !== null,
      );

      for (const window of windows) {
        const key = `${candidate.ownerId}:${window}`;
        const group = groups.get(key) ?? {
          owner: candidate.ownerId,
          window,
          candidates: [],
        };
        group.candidates.push(candidate);
        groups.set(key, group);
      }
    }

    let accepted = 0;
    const ordered = [...groups.values()].sort(
      (a, b) =>
        Number(b.window.startsWith("prompt:")) -
        Number(a.window.startsWith("prompt:")),
    );

    for (const group of ordered) {
      if (this.now().getTime() - startedAt > 120_000) {
        return accepted;
      }

      const delivery = await this.records.prepare(
        group.owner,
        group.window,
        group.candidates,
      );

      if (!delivery) {
        continue;
      }

      const entries = delivery.opportunities
        .map(
          (opportunity) =>
            `${opportunity.title} — ${opportunity.company ?? "Organization not stated"}\n${opportunity.location ?? "Location not stated"}\nScouts: ${opportunity.scouts.join(", ")}\n${opportunity.reasons.join("\n")}\nNeeds review:\n${opportunity.uncertainties.map((value) => `- ${value}`).join("\n")}\n${opportunity.url}${employerEvidenceSummary(opportunity)}`,
        )
        .join("\n\n");

      try {
        const submission = await this.email.send({
          id: delivery.id,
          recipient: delivery.recipient,
          subject: group.window.startsWith("prompt:")
            ? "ScoutAlert: a strong match with supported details"
            : `ScoutAlert: ${delivery.opportunities.length} opportunities to review`,
          text: `Here are new postings related to your confirmed scout briefs. Read the reasons and unresolved questions for each posting. AI assessments interpret source evidence and your brief; they do not independently verify employer claims.\n\n${entries}\n\nThese emails follow your scout's alert choices. View your scouts to review those choices.`,
        });
        await this.records.finish(
          delivery.id,
          "accepted",
          submission.providerMessageId,
        );
        accepted++;
      } catch (error) {
        await this.records.finish(
          delivery.id,
          error instanceof EmailSubmissionError && error.outcome === "rejected"
            ? "rejected"
            : "unknown",
        );
      }
    }

    return accepted;
  }
}

/** Includes dated public research links without exposing private briefs or claiming immigration verification. */
function employerEvidenceSummary(opportunity: OpportunityView): string {
  const research = opportunity.detail?.employerResearch;

  if (!research) {
    return "";
  }

  return `\nEmployer evidence checked: ${research.checkedAt}\n${research.findings.map((item) => `${item.fact}: ${item.explanation}${item.sourceUrl ? ` (${item.sourceUrl})` : ""}`).join("\n")}\nAuthorization comparisons use your declared details.`;
}
