import { Icon } from "@repo/ui/components/icon";
import { buttonVariants } from "@repo/ui/components/button";
import { OpportunityEvidence } from "./opportunity-evidence";
import { OpportunityFeedbackControls } from "./opportunity-feedback";
import type { Opportunity } from "./scout-contracts";

const availabilityLabels = {
  available: "Posting available when checked",
  closed: "Posting closed or unavailable",
  changed: "Posting changed · Assessment needs updating",
  unresolved: "Current availability needs confirmation",
};

/** Summarizes a real opportunity as a listing, keeping fit uncertainty visible and complete source evidence available on expansion. */
export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const source = new URL(opportunity.url).hostname.replace(/^www\./, "");
  const clientRequest = opportunity.kind === "client_request";

  return (
    <article className="dashboard-opportunity">
      <div className="dashboard-opportunity-heading">
        <span className="dashboard-company-mark">
          <Icon name={clientRequest ? "globe" : "briefcase"} size={23} />
        </span>
        <div className="dashboard-opportunity-title">
          <p>{opportunity.company || "Organization not stated"}</p>
          <h3>
            <a href={opportunity.url} target="_blank" rel="noopener noreferrer">
              {opportunity.title}
            </a>
          </h3>
        </div>
        <span
          className="dashboard-review-label"
          data-assessed={!!opportunity.detail}
        >
          {opportunity.detail ? "AI assessed" : "Potential match"}
        </span>
      </div>
      <div className="dashboard-opportunity-facts">
        <span>
          <Icon name="map" size={16} />
          {opportunity.location || "Location not stated"}
        </span>
        <span>{clientRequest ? "Client request" : "Job or contract"}</span>
      </div>
      {opportunity.reasons.length > 0 && (
        <ul className="dashboard-fit-summary">
          {opportunity.reasons.slice(0, 2).map((reason) => (
            <li key={reason}>
              <Icon name="check" size={17} />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="dashboard-found-for">
        <Icon name="compass" size={16} />
        Found for {opportunity.scouts.join(", ")}
      </p>
      {opportunity.availability &&
        opportunity.availability.status !== "available" && (
          <p
            className="dashboard-availability-note"
            data-status={opportunity.availability.status}
          >
            <Icon name="help" size={16} />
            {availabilityLabels[opportunity.availability.status]}
          </p>
        )}
      <div className="dashboard-opportunity-meta">
        <span>
          <Icon name="globe" size={15} />
          {source}
        </span>
        <span>
          Evidence checked{" "}
          {new Date(opportunity.checkedAt).toLocaleDateString("en-GB", {
            timeZone: "UTC",
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        {opportunity.uncertainties.length > 0 && (
          <span className="dashboard-confirmation-note">
            {opportunity.uncertainties.length}{" "}
            {opportunity.uncertainties.length === 1 ? "detail" : "details"} to
            confirm
          </span>
        )}
      </div>
      <div className="dashboard-opportunity-actions">
        <OpportunityFeedbackControls
          key={`${opportunity.id}:${opportunity.feedback?.version ?? 0}`}
          opportunity={opportunity}
          compact
        />
        <a
          className={`${buttonVariants({ variant: "secondary" })} dashboard-source-link`}
          href={opportunity.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View source for ${opportunity.title}`}
        >
          View source <Icon name="arrowRight" size={16} />
        </a>
      </div>
      <details className="dashboard-match-details">
        <summary>
          Review match details <Icon name="chevronDown" size={17} />
        </summary>
        <OpportunityEvidence opportunity={opportunity} />
      </details>
    </article>
  );
}
