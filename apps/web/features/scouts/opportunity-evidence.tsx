import { Icon } from "@repo/ui/components/icon";
import type { Opportunity } from "./scout-contracts";

const criterionLabels: Record<string, string> = {
  role: "Role",
  category: "Type of work",
  arrangement: "Work arrangement",
  location: "Applicant location",
  experience: "Experience",
  authorization: "Work authorization",
  compensation: "Pay",
  sponsorship: "Sponsorship",
  requirements: "Requirements",
  deadline: "Application deadline",
};
const statusLabels = {
  meets: "Matches your brief",
  conflicts: "Doesn’t match",
  unknown: "Needs confirmation",
};

/** Retains the complete assessment, source quotes and dated availability observations behind the listing summary. */
export function OpportunityEvidence({
  opportunity,
}: {
  opportunity: Opportunity;
}) {
  return (
    <div className="dashboard-evidence">
      {opportunity.detail && (
        <section className="dashboard-assessment">
          <h4>How it compares with your brief</h4>
          <p>
            AI assessment for{" "}
            {opportunity.assessmentScout || opportunity.scouts[0]}. These
            conclusions use the posting, any cited employer policies and your
            confirmed brief. Authorization details are user-declared.
          </p>
          {opportunity.detail.employerResearch && (
            <section className="workspace-criterion">
              <h4>Employer policy research</h4>
              <p>
                Checked{" "}
                {new Date(
                  opportunity.detail.employerResearch.checkedAt,
                ).toLocaleString("en-GB", { timeZone: "UTC" })}{" "}
                UTC. Rechecked when the evidence expires.
              </p>
              {opportunity.detail.employerResearch.findings.map((finding) => (
                <div key={finding.fact}>
                  <strong>
                    {criterionLabels[finding.fact] ?? finding.fact} ·{" "}
                    {finding.status === "resolved"
                      ? "Evidence found"
                      : finding.status === "conflicting"
                        ? "Conflicting evidence"
                        : "Still unclear"}
                  </strong>
                  <p>{finding.explanation}</p>
                  {finding.quotes.map((quote) => (
                    <blockquote key={quote}>{quote}</blockquote>
                  ))}
                  {finding.sourceUrl && (
                    <a
                      href={finding.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read employer source <Icon name="arrowRight" size={16} />
                    </a>
                  )}
                </div>
              ))}
            </section>
          )}
          <div className="workspace-criteria">
            {opportunity.detail.criteria.map((item) => (
              <section key={item.criterion} className="workspace-criterion">
                <div>
                  <h4>{criterionLabels[item.criterion] || item.criterion}</h4>
                  <span data-status={item.status}>
                    {statusLabels[item.status]}
                  </span>
                </div>
                <p>{item.explanation}</p>
                {item.quotes.map((quote) => (
                  <blockquote key={quote}>{quote}</blockquote>
                ))}
                {item.briefQuotes.length > 0 && (
                  <p className="workspace-brief-evidence">
                    Your brief: {item.briefQuotes.join(" · ")}
                  </p>
                )}
              </section>
            ))}
          </div>
        </section>
      )}

      {opportunity.reasons.length > 0 && (
        <section>
          <h4>Why it was found</h4>
          <ul>
            {opportunity.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}
      {opportunity.uncertainties.length > 0 && (
        <section>
          <h4>What needs checking</h4>
          <ul>
            {opportunity.uncertainties.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </section>
      )}
      {opportunity.availability && (
        <p className="workspace-run-note">
          {
            {
              available:
                "The employer’s posting was still published with the assessed details",
              closed:
                "The posting was unavailable or its application deadline had passed",
              changed:
                "The employer’s posting had changed; this assessment needs updating",
              unresolved:
                "We couldn’t confirm the posting’s current availability",
            }[opportunity.availability.status]
          }
          {" when checked at "}
          {new Date(opportunity.availability.checkedAt).toLocaleString(
            "en-GB",
            { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" },
          )}{" "}
          UTC.{" "}
          <a
            href={opportunity.availability.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Check source
          </a>
        </p>
      )}
    </div>
  );
}
