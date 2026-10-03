"use client";

import Link from "next/link";
import { Icon } from "@repo/ui/components/icon";
import type { PreviewOpportunity } from "./fixtures";
import { usePreview } from "./preview-context";
import { previewRoot } from "./preview-shell";

/** Saves only a fictional opportunity in the temporary preview selection. */
export function SaveOpportunity({
  opportunity,
  compact = false,
}: {
  opportunity: PreviewOpportunity;
  compact?: boolean;
}) {
  const { saved, toggleSaved } = usePreview();
  const selected = saved.includes(opportunity.id);

  return (
    <button
      type="button"
      className={compact ? "dp-save-icon" : "dp-button"}
      aria-label={`${selected ? "Unsave" : "Save"} ${opportunity.title}`}
      aria-pressed={selected}
      onClick={() => toggleSaved(opportunity.id)}
    >
      <Icon
        name="bookmark"
        size={19}
        fill={selected ? "currentColor" : "none"}
      />
      {!compact && (selected ? "Saved" : "Save opportunity")}
    </button>
  );
}

/** Gives formal listings and informal requests equal visibility, while preserving their different evidence. */
export function OpportunityCard({
  opportunity,
}: {
  opportunity: PreviewOpportunity;
}) {
  const social = opportunity.sourceType === "Public post";

  return (
    <article
      className={`dp-opportunity ${social ? "dp-opportunity-social" : ""}`}
    >
      <div className="dp-opportunity-top">
        <span className="dp-source-line">
          <Icon name={social ? "globe" : "briefcase"} size={16} />
          {opportunity.source}
          <span aria-hidden="true">/</span>
          {opportunity.kind}
        </span>
        <span className="dp-found">{opportunity.found}</span>
      </div>
      <div className="dp-opportunity-heading">
        <span className={`dp-company-mark ${social ? "dp-person-mark" : ""}`}>
          {opportunity.initials}
        </span>
        <div>
          <p>{opportunity.author}</p>
          <h3>
            <Link href={`${previewRoot}/opportunities/${opportunity.id}`}>
              {opportunity.title}
            </Link>
          </h3>
        </div>
        <SaveOpportunity opportunity={opportunity} compact />
      </div>
      {social ? (
        <blockquote className="dp-post-excerpt">
          “{opportunity.quote}”
        </blockquote>
      ) : (
        <p className="dp-opportunity-summary">{opportunity.summary}</p>
      )}
      <div className="dp-opportunity-facts">
        <span>
          <Icon name="laptop" size={16} />
          {opportunity.location}
        </span>
        <span>{opportunity.compensation}</span>
      </div>
      <div className="dp-fit-note">
        <Icon name="sparkles" size={18} />
        <p>{opportunity.reason}</p>
      </div>
      <div className="dp-opportunity-bottom">
        <span className="dp-review-label">
          <span className="dp-status-dot is-caution" />
          Details to confirm
        </span>
        <Link
          className="dp-button dp-button-small"
          href={`${previewRoot}/opportunities/${opportunity.id}`}
        >
          Review opportunity
          <Icon name="arrowRight" size={16} />
        </Link>
      </div>
    </article>
  );
}
