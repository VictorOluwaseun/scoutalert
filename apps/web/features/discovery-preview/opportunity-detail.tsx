"use client";

import Link from "next/link";
import { Icon } from "@repo/ui/components/icon";
import { previewScouts, type PreviewOpportunity } from "./fixtures";
import { usePreview } from "./preview-context";
import { SaveOpportunity } from "./opportunity-card";
import { previewRoot } from "./preview-shell";

/** Presents the evidence and uncertainties needed to decide whether a sample opportunity is worth pursuing. */
export function OpportunityDetail({
  opportunity,
}: {
  opportunity: PreviewOpportunity;
}) {
  const { relevant, hidden, toggleRelevant, toggleHidden } = usePreview();
  const isRelevant = relevant.includes(opportunity.id);
  const isHidden = hidden.includes(opportunity.id);
  const scout = previewScouts.find((item) => item.id === opportunity.scoutId);

  return (
    <>
      <Link className="dp-back" href={previewRoot}>
        <Icon name="arrowLeft" />
        Discoveries
      </Link>
      <header className="dp-page-heading dp-detail-heading">
        <div>
          <p className="dp-source-line">
            <Icon name="globe" size={17} />
            {opportunity.source}
            <span aria-hidden="true">/</span>
            {opportunity.kind}
          </p>
          <h1>{opportunity.title}</h1>
          <p>{opportunity.author}</p>
        </div>
        <div className="dp-detail-actions">
          <a className="dp-button dp-button-primary" href="#source-evidence">
            Read sample source <Icon name="arrowRight" size={17} />
          </a>
          <SaveOpportunity opportunity={opportunity} />
        </div>
      </header>
      <div className="dp-detail-facts">
        <span>
          <Icon name="laptop" />
          {opportunity.location}
        </span>
        <span>
          <Icon name="briefcase" />
          {opportunity.compensation}
        </span>
        <span>
          <Icon name="clock" />
          {opportunity.found}
        </span>
        <span>
          <Icon name="eye" />
          {opportunity.checked}
        </span>
      </div>
      <div className="dp-content-grid dp-opportunity-grid">
        <div>
          <section className="dp-assessment">
            <span className="dp-mini-compass">
              <Icon name="sparkles" size={23} />
            </span>
            <h2>Why your scout brought this to you</h2>
            <p>{opportunity.reason}</p>
            <div className="dp-uncertainty">
              <h3>
                <Icon name="help" size={19} />
                What still needs checking
              </h3>
              <p>{opportunity.unknown}</p>
            </div>
            <p className="dp-muted">
              Worth reviewing. Not cleared for a verified-match alert.
            </p>
          </section>
          <section className="dp-evidence" aria-labelledby="evidence-heading">
            <div className="dp-section-heading">
              <h2 id="evidence-heading">The details behind the match</h2>
              <span className="dp-muted">Sample evidence</span>
            </div>
            <p>
              These are the passages your scout would use to support its
              assessment.
            </p>
            {opportunity.evidence.map((item) => (
              <div className="dp-evidence-row" key={item.label}>
                <h3>{item.label}</h3>
                <blockquote>“{item.quote}”</blockquote>
                <span>{opportunity.sourceType} · Fictional excerpt</span>
              </div>
            ))}
          </section>
          <section className="dp-source-evidence" id="source-evidence">
            <div className="dp-section-heading">
              <h2>
                The original{" "}
                {opportunity.sourceType === "Public post" ? "post" : "listing"}
              </h2>
              <span className="dp-source-label">{opportunity.source}</span>
            </div>
            <div className="dp-source-author">
              <span className="dp-company-mark">{opportunity.initials}</span>
              <div>
                <strong>{opportunity.author}</strong>
                <p>Fictional source for this preview</p>
              </div>
            </div>
            <blockquote>“{opportunity.quote}”</blockquote>
            <p className="dp-muted">
              In the connected experience, this would link to the original
              source with its discovery and verification times. This example has
              no live post or application link.
            </p>
          </section>
        </div>
        <aside className="dp-context-column">
          <section className="dp-next-step">
            <span className="dp-mini-compass">
              <Icon name="arrowRight" size={22} />
            </span>
            <h2>A useful next step</h2>
            <p>{opportunity.nextStep}</p>
            <a className="dp-button dp-button-primary" href="#source-evidence">
              Read sample source
              <Icon name="arrowRight" size={17} />
            </a>
          </section>
          <section className="dp-feedback">
            <h2>Is this the kind of work you want?</h2>
            <p>
              Your feedback should help this scout understand your preferences.
            </p>
            <div className="dp-feedback-actions">
              <button
                className="dp-button"
                type="button"
                aria-pressed={isRelevant}
                onClick={() => toggleRelevant(opportunity.id)}
              >
                <Icon name="check" />
                {isRelevant ? "Marked relevant" : "Relevant to me"}
              </button>
              <button
                className="dp-button"
                type="button"
                aria-pressed={isHidden}
                onClick={() => toggleHidden(opportunity.id)}
              >
                <Icon name={isHidden ? "eye" : "close"} />
                {isHidden ? "Restore opportunity" : "Hide opportunity"}
              </button>
            </div>
            <p className="dp-feedback-status" role="status">
              {isHidden
                ? "Hidden from the preview feed. You can restore it anytime."
                : isRelevant
                  ? "Marked relevant in this preview. Your real scouts are unchanged."
                  : "Try it here. Feedback stays in this preview."}
            </p>
          </section>
          {scout && (
            <Link
              className="dp-matched-scout"
              href={`${previewRoot}/scouts/${scout.id}`}
            >
              <Icon name="compass" size={24} />
              <span>
                <span>Found for</span>
                <strong>{scout.name}</strong>
              </span>
              <Icon name="arrowRight" size={17} />
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
