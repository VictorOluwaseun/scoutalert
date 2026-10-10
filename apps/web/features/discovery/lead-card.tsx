import { sourceAccessMessage } from "./source-access-message";
import { Icon } from "@repo/ui/components/icon";
import { buttonVariants } from "@repo/ui/components/button";
import type { WebDiscoveryLead } from "./discovery-contracts";
import { discoveryTimestamp } from "./discovery-presentation";
import { NativePostContext } from "./native-post-context";

const reviewLabels: Record<string, string> = {
  job_opening: "Job or contract",
  client_request: "Client request",
  service_offer: "Service offer",
  discussion: "Discussion",
  directory: "Directory",
  closed: "Closed posting",
  unclear: "Needs investigation",
};

const contentLabels: Record<string, string> = {
  fetched: "Source captured",
  unfetched: "Source not checked",
  access_limited: "Source access limited",
  unavailable: "Source unavailable",
  blocked: "Source couldn’t be opened safely",
};

const factLabels: Record<string, string> = {
  role: "Role or work",
  arrangement: "Work arrangement",
  category: "Type of work",
  location: "Location eligibility",
  requirements: "Requirements",
  authorization: "Work authorization",
  sponsorship: "Sponsorship",
  compensation: "Compensation",
};

/** Shows only short, stated source facts in the scan row; excerpts and conflicting facts remain in the evidence details. */
function LeadFacts({ lead }: { lead: WebDiscoveryLead }) {
  const facts = lead.review?.scope === "source" ? lead.review.facts : {};
  const visible = ["arrangement", "location", "compensation"].filter(
    (name) =>
      facts[name]?.status === "stated" && facts[name].value.length <= 100,
  );

  if (visible.length === 0) {
    return null;
  }

  return (
    <dl className="web-lead-key-facts">
      {visible.map((name) => (
        <div key={name}>
          <dt>{factLabels[name]}</dt>
          <dd>{facts[name]!.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Gives each lead a listing-style summary and retains full provenance without implying personal fit or a verified excerpt. */
export function LeadCard({ lead }: { lead: WebDiscoveryLead }) {
  const title =
    lead.title ||
    (lead.nativePost
      ? lead.review?.facts.role?.value || "Public post on X"
      : "Untitled source result");
  const summary = lead.review?.explanation || lead.snippet;
  const sourceReviewed = lead.review?.scope === "source";

  return (
    <article className="web-lead">
      <div className="web-lead-heading">
        <span className="web-lead-source-icon">
          <Icon
            name={lead.review?.label === "job_opening" ? "briefcase" : "globe"}
            size={23}
          />
        </span>
        <div className="web-lead-title">
          <p className="web-lead-source">
            {lead.nativePost ? "X · Original post" : lead.source}
          </p>
          <h3>
            <a href={lead.url} target="_blank" rel="noopener noreferrer">
              {title}
            </a>
          </h3>
        </div>
        <span className="web-lead-label">
          {lead.review ? reviewLabels[lead.review.label] : "Awaiting review"}
        </span>
      </div>
      <LeadFacts lead={lead} />
      {summary && <p className="web-lead-summary">{summary}</p>}
      <p className="web-lead-scouts">
        <Icon name="compass" size={16} />
        Found for {lead.scouts.join(", ")}
      </p>
      <div className="web-lead-footer">
        <span className="web-lead-check" data-reviewed={sourceReviewed}>
          <Icon name={sourceReviewed ? "check" : "clock"} size={16} />
          {sourceReviewed
            ? lead.review?.label === "directory"
              ? "Source reviewed · Links need checking"
              : "Source reviewed · Fit needs checking"
            : lead.review
              ? "Excerpt review · Source unverified"
              : (contentLabels[lead.contentStatus] ?? "Source status unknown")}
        </span>
        <a
          className={`${buttonVariants({ variant: "secondary" })} web-source-link`}
          href={lead.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View source for ${title}`}
        >
          View source <Icon name="arrowRight" size={16} />
        </a>
      </div>
      <details className="web-lead-details">
        <summary>
          Review details <Icon name="chevronDown" size={17} />
        </summary>
        <div className="web-lead-detail-content">
          {lead.nativePost && (
            <section>
              <h4>Original X post</h4>
              <p>
                Posted {discoveryTimestamp(lead.nativePost.publishedAt)}.
                Retrieved directly from X.
              </p>
              <a
                href={`https://x.com/i/status/${lead.nativePost.conversationId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View conversation on X
              </a>
            </section>
          )}
          <NativePostContext lead={lead} />
          {lead.review && (
            <section className="web-lead-review">
              <h4>
                {sourceReviewed ? "Source review" : "Tentative excerpt review"}
              </h4>
              <p>{lead.review.explanation}</p>
              {lead.review.quotes.map((quote, index) => (
                <blockquote key={index}>{quote}</blockquote>
              ))}
              {sourceReviewed && (
                <dl className="web-lead-facts">
                  {Object.entries(lead.review.facts).map(([name, fact]) => (
                    <div key={name}>
                      <dt>{factLabels[name] ?? name}</dt>
                      <dd>
                        {fact.status === "unknown"
                          ? "Not stated in the source"
                          : `${fact.status === "conflicting" ? "Conflicting information: " : ""}${fact.value}`}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <p>
                {lead.postingId
                  ? "Source evidence is ready for personal matching. Your fit still needs assessment."
                  : "This lead has not entered personal matching."}
              </p>
            </section>
          )}
          {lead.snippet && (
            <section className="web-lead-snippet">
              <h4>Search result excerpt</h4>
              <p>{lead.snippet}</p>
            </section>
          )}
          <p>
            {contentLabels[lead.contentStatus] ?? "Source status unavailable"}.
            A search result alone does not confirm that this opportunity fits
            your brief.
          </p>
          {sourceAccessMessage(lead.contentReason) && (
            <p>{sourceAccessMessage(lead.contentReason)}</p>
          )}
          <p className="web-lead-date">
            Seen {discoveryTimestamp(lead.lastSeenAt)}
            {lead.checkedAt && (
              <span>Source checked {discoveryTimestamp(lead.checkedAt)}</span>
            )}
          </p>
          {lead.content && (
            <details className="web-source-evidence">
              <summary>
                Captured source text <Icon name="chevronDown" size={17} />
              </summary>
              <p className="web-lead-evidence">{lead.content}</p>
              <p>Read the original source for full, current details.</p>
            </details>
          )}
        </div>
      </details>
    </article>
  );
}
