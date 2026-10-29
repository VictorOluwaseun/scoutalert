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
  const payEvidence = opportunity.detail?.criteria
    .find((criterion) => criterion.criterion === "compensation")
    ?.quotes.find((quote) => quote.trim().length > 0 && quote.length <= 120);

  return (
    <article className="dashboard-opportunity">
      <div className="dashboard-opportunity-origin">
        <span>
          <Icon name="globe" size={15} />
          {source}
        </span>
        <span>{clientRequest ? "Client request" : "Job or contract"}</span>
      </div>
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
          {opportunity.detail ? "Fit reviewed" : "Potential match"}
        </span>
      </div>
      <div className="dashboard-opportunity-facts">
        <div>
          <span>Location</span>
          <strong>
            <Icon name="map" size={16} />
            {opportunity.location || "Location not stated"}
          </strong>
        </div>
        <div>
          <span>{payEvidence ? "Pay from the source" : "Pay"}</span>
          <strong>
            <Icon name="briefcase" size={16} />
            {payEvidence || "Needs checking"}
          </strong>
        </div>
      </div>
      {opportunity.reasons.length > 0 && (
        <ul className="dashboard-fit-summary">
          {opportunity.reasons.slice(0, 2).map((reason) => (
            <li key={reason}>
              <Icon name="sparkles" size={17} />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      {opportunity.uncertainties.length > 0 && (
        <div className="dashboard-uncertainties">
          <Icon name="help" size={17} />
          <div>
            <strong>Still to confirm</strong>
            <p>{opportunity.uncertainties[0]}</p>
            {opportunity.uncertainties.length > 1 && (
              <span>
                {opportunity.uncertainties.length - 1} more in match details
              </span>
            )}
          </div>
        </div>
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
          Evidence checked{" "}
          {new Date(opportunity.checkedAt).toLocaleDateString("en-GB", {
            timeZone: "UTC",
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>
      <div className="dashboard-opportunity-actions">
        <a
          className={`${buttonVariants({ variant: "secondary" })} dashboard-source-link`}
          href={opportunity.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View source for ${opportunity.title}`}
        >
          View source <Icon name="arrowRight" size={16} />
        </a>
        <OpportunityFeedbackControls
          key={`${opportunity.id}:${opportunity.feedback?.version ?? 0}`}
          opportunity={opportunity}
          compact
        />
      </div>
      <details className="dashboard-match-details">
        <summary aria-label={`Review match details for ${opportunity.title}`}>
          Review fit and evidence <Icon name="chevronDown" size={17} />
        </summary>
        <OpportunityEvidence opportunity={opportunity} />
      </details>
    </article>
  );
}
