"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@repo/ui/components/icon";
import {
  previewOpportunities,
  previewScouts,
  previewSearchStates,
} from "./fixtures";
import { usePreview } from "./preview-context";
import { OpportunityCard } from "./opportunity-card";
import { SearchCoverage, SearchStatus } from "./search-status";
import { previewRoot } from "./preview-shell";

const filters = [
  "All opportunities",
  "Jobs",
  "Client projects",
  "Contracts",
] as const;
type OpportunityFilter = (typeof filters)[number];

/** Keeps sample category filtering explicit instead of treating all work as job listings. */
function matchesCategory(kind: string, filter: OpportunityFilter): boolean {
  const kinds: Record<OpportunityFilter, string> = {
    "All opportunities": "",
    Jobs: "Job",
    "Client projects": "Client project",
    Contracts: "Contract",
  };
  return filter === "All opportunities" || kinds[filter] === kind;
}

/** Renders a results-first dashboard, with controllable empty, partial and interrupted sample states. */
export function Discoveries({ savedOnly = false }: { savedOnly?: boolean }) {
  const { scenario, saved, hidden, toggleHidden, paused } = usePreview();
  const [filter, setFilter] = useState<OpportunityFilter>("All opportunities");
  const showResults = savedOnly || !["searching", "empty"].includes(scenario);
  const available = previewOpportunities.filter(
    (opportunity) =>
      showResults &&
      !hidden.includes(opportunity.id) &&
      (!savedOnly || saved.includes(opportunity.id)),
  );
  const opportunities = available.filter((opportunity) =>
    matchesCategory(opportunity.kind, filter),
  );
  const allPaused = previewScouts.every((scout) => paused.includes(scout.id));

  return (
    <>
      <header className="dp-page-heading">
        <div>
          <h1>{savedOnly ? "Worth keeping." : "Your next opportunity."}</h1>
          <p>
            {savedOnly
              ? "The opportunities you want to come back to."
              : "Good work shows up in all sorts of places. Your scouts bring it together."}
          </p>
        </div>
        <span className="dp-heading-compass">
          <Icon name="compass" size={36} />
        </span>
      </header>
      {!savedOnly && <SearchStatus paused={allPaused} plural />}
      <div className="dp-content-grid">
        <section className="dp-results" aria-labelledby="results-title">
          <div className="dp-section-heading">
            <h2 id="results-title">
              {savedOnly ? "Saved opportunities" : "For you"}
              <span className="dp-count">{opportunities.length}</span>
            </h2>
            <span className="dp-muted">Sample results</span>
          </div>
          <div className="dp-filters" aria-label="Filter opportunities">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="dp-result-list" aria-live="polite">
            {opportunities.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
            {opportunities.length === 0 && (
              <EmptyDiscoveries
                savedOnly={savedOnly}
                filtered={
                  filter !== "All opportunities" && available.length > 0
                }
                onClear={() => setFilter("All opportunities")}
              />
            )}
          </div>
          {hidden.length > 0 && (
            <details className="dp-hidden-results">
              <summary>Hidden in this preview ({hidden.length})</summary>
              {previewOpportunities
                .filter((item) => hidden.includes(item.id))
                .map((item) => (
                  <div key={item.id}>
                    <span>{item.title}</span>
                    <button
                      className="dp-button dp-button-small"
                      type="button"
                      aria-label={`Restore ${item.title}`}
                      onClick={() => toggleHidden(item.id)}
                    >
                      Restore
                    </button>
                  </div>
                ))}
            </details>
          )}
          {opportunities.length > 0 && (
            <p className="dp-end-note">
              <Icon name="compass" size={18} />
              {allPaused
                ? "Earlier finds stay here while your scouts are paused."
                : "That’s everything in this sample. Your search can keep exploring."}
            </p>
          )}
        </section>
        <aside className="dp-context-column">
          <ScoutSummary />
          <SearchCoverage paused={allPaused} />
        </aside>
      </div>
    </>
  );
}

/** Offers a useful next action without presenting missing results as a completed search of the internet. */
function EmptyDiscoveries({
  savedOnly,
  filtered,
  onClear,
}: {
  savedOnly: boolean;
  filtered: boolean;
  onClear: () => void;
}) {
  const { scenario } = usePreview();
  let title = "No opportunities to show yet.";
  let description =
    "Your scout will keep checking. You can review its brief and see where it has searched.";

  if (savedOnly) {
    title = "Keep the possibilities you like.";
    description =
      "Save an opportunity from Discoveries and it will appear here.";
  }

  if (scenario === "searching" && !savedOnly) {
    title = "Your first finds are on their way.";
    description =
      "Promising results will appear after your scouts have checked the details. You can follow the search coverage alongside this view.";
  }

  if (filtered) {
    title = "Nothing in this category yet.";
    description =
      "Try all opportunities to see the other finds in this sample.";
  }

  return (
    <div className="dp-empty">
      <span className="dp-empty-symbol">
        <Icon name={savedOnly ? "bookmark" : "search"} size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {filtered ? (
        <button className="dp-button" type="button" onClick={onClear}>
          Show all opportunities
        </button>
      ) : (
        <Link
          className="dp-button"
          href={savedOnly ? previewRoot : `${previewRoot}/scouts/design-role`}
        >
          {savedOnly ? "Explore discoveries" : "View your scout"}
        </Link>
      )}
    </div>
  );
}

/** Keeps confirmed goals and scout status close to the results without burying them in settings. */
function ScoutSummary() {
  const { scenario, paused } = usePreview();

  return (
    <section className="dp-scout-summary" id="preview-scouts">
      <div className="dp-section-heading">
        <h2>Your scouts</h2>
        <span className="dp-count">{previewScouts.length}</span>
      </div>
      {previewScouts.map((scout) => (
        <Link
          className="dp-scout-summary-link"
          key={scout.id}
          href={`${previewRoot}/scouts/${scout.id}`}
        >
          <span className="dp-mini-compass">
            <Icon name="compass" size={22} />
          </span>
          <div>
            <h3>{scout.name}</h3>
            <p>{scout.description}</p>
            <span className="dp-scout-state">
              <span
                className={`dp-status-dot ${paused.includes(scout.id) ? "is-paused" : ""}`}
              />
              {paused.includes(scout.id)
                ? "Paused"
                : previewSearchStates[scenario].label}
            </span>
          </div>
          <Icon name="arrowRight" size={16} />
        </Link>
      ))}
      <p className="dp-scout-reassurance">
        <Icon name="shield" size={18} />
        Your must-haves stay yours.
      </p>
    </section>
  );
}
