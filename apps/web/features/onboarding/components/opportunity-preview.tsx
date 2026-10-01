"use client";

import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import {
  opportunities,
  arrangementLabels,
  type ExampleOpportunity,
} from "../fixtures";
import type { ScoutDraft } from "../types";

/** A fictional result card with reversible local saving and explicit evidence gaps. */
function OpportunityCard({
  opportunity,
  saved,
  toggle,
}: {
  opportunity: ExampleOpportunity;
  saved: boolean;
  toggle: () => void;
}) {
  return (
    <article className="scout-opportunity">
      <div className="scout-opportunity-top">
        <span
          className={`scout-company-avatar scout-avatar-${opportunity.color}`}
        >
          {opportunity.initial}
        </span>
        <div>
          <span>{opportunity.company}</span>
          <h3>{opportunity.title}</h3>
        </div>
        <button
          className="scout-save-button"
          type="button"
          aria-label={`${saved ? "Unsave" : "Save"} example ${opportunity.title}`}
          aria-pressed={saved}
          onClick={toggle}
        >
          <Icon name="bookmark" fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <p>{opportunity.detail}</p>
      <div className="scout-opportunity-tags">
        <span>
          <Icon name="globe" size={13} />
          {arrangementLabels[opportunity.arrangement]}
        </span>
        {opportunity.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <div className="scout-opportunity-bottom">
        <strong>{opportunity.pay}</strong>
        <span>
          <Icon name="help" size={14} />
          {opportunity.eligibility}
        </span>
      </div>
    </article>
  );
}

/** Lets visitors filter and save illustrative opportunities without claiming live discovery or matching. */
export function OpportunityPreview({
  draft,
  guest,
  edit,
  continueSetup,
}: {
  draft: Pick<ScoutDraft, "category">;
  guest: boolean;
  edit?: () => void;
  continueSetup?: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "remote" | "saved">("all");
  const [saved, setSaved] = useState<string[]>([]);
  const categoryResults = opportunities.filter(
    (item) => item.category === draft.category,
  );
  const visible = categoryResults.filter(
    (item) =>
      filter === "all" ||
      (filter === "remote"
        ? item.arrangement === "remote"
        : saved.includes(item.id)),
  );

  /** Toggles only an in-memory example bookmark; it never changes a real opportunity record. */
  function toggleSave(id: string) {
    setSaved((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <section>
      <div className="scout-preview-title-row">
        <span className="scout-intro-pill">
          <Icon name="eye" size={14} />
          {guest ? "Guest exploration" : "Example preview"}
        </span>
        {edit && (
          <button type="button" className="scout-text-button" onClick={edit}>
            <Icon name="pencil" size={14} />
            Edit my brief
          </button>
        )}
      </div>
      <h1 className="scout-display" tabIndex={-1}>
        A first look at
        <br />
        what comes next.
      </h1>
      <p className="scout-lede">
        This is how your opportunities will come together — with the useful
        details and the unanswered questions.
      </p>
      <div className="scout-example-banner">
        <Icon name="eye" size={20} />
        <p>
          <strong>Illustrative opportunities</strong>These fictional examples
          haven’t been matched to your brief. No live search is running.
        </p>
      </div>
      <div className="scout-preview-toolbar">
        <div
          className="scout-filter-tabs"
          role="group"
          aria-label="Filter example opportunities"
        >
          {[
            ["all", "All examples"],
            ["remote", "Remote"],
            ["saved", `Saved (${saved.length})`],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value as typeof filter)}
            >
              {label}
            </button>
          ))}
        </div>
        <span>
          {visible.length} {visible.length === 1 ? "example" : "examples"}
        </span>
      </div>
      <div className="scout-opportunity-list">
        {visible.map((item) => (
          <OpportunityCard
            key={item.id}
            opportunity={item}
            saved={saved.includes(item.id)}
            toggle={() => toggleSave(item.id)}
          />
        ))}
        {visible.length === 0 && (
          <div className="scout-empty-state">
            <Icon name="bookmark" size={27} />
            <h3>Your shortlist starts here.</h3>
            <p>Save an example from “All examples” to try your shortlist.</p>
            <Button variant="secondary" onClick={() => setFilter("all")}>
              Browse all examples
            </Button>
          </div>
        )}
      </div>
      {guest && continueSetup && (
        <div className="scout-guest-next">
          <div>
            <strong>Like the shape of your scout?</strong>
            <p>Try the alert and account setup next.</p>
          </div>
          <Button onClick={continueSetup}>
            Continue setup
            <Icon name="arrowRight" size={17} />
          </Button>
        </div>
      )}
      <p className="scout-subtle">
        {edit && "Your draft stays in this browser. "}Example saves reset when
        you leave this screen.
      </p>
    </section>
  );
}
