"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@repo/ui/components/icon";
import { previewOpportunities, type PreviewScout } from "./fixtures";
import { usePreview } from "./preview-context";
import { previewRoot } from "./preview-shell";
import { OpportunityCard } from "./opportunity-card";
import { SearchCoverage, SearchStatus } from "./search-status";

const scoutViews = ["Opportunities", "Search activity", "Your brief"] as const;

/** Connects a sample scout's discoveries, observable search activity and confirmed brief. */
export function ScoutDetail({ scout }: { scout: PreviewScout }) {
  const { scenario, paused, togglePaused, hidden } = usePreview();
  const [view, setView] =
    useState<(typeof scoutViews)[number]>("Opportunities");
  const isPaused = paused.includes(scout.id);
  const showResults = !["searching", "empty"].includes(scenario);
  const results = previewOpportunities.filter(
    (item) =>
      item.scoutId === scout.id && !hidden.includes(item.id) && showResults,
  );

  return (
    <>
      <Link className="dp-back" href={previewRoot}>
        <Icon name="arrowLeft" />
        Discoveries
      </Link>
      <header className="dp-page-heading dp-detail-heading">
        <div>
          <p className="dp-page-context">Your AI scout</p>
          <h1>{scout.name}</h1>
          <p>{scout.description}</p>
        </div>
        <button
          className="dp-button"
          type="button"
          aria-pressed={isPaused}
          onClick={() => togglePaused(scout.id)}
        >
          <Icon name={isPaused ? "compass" : "clock"} />
          {isPaused ? "Resume scout" : "Pause scout"}
        </button>
      </header>
      <SearchStatus paused={isPaused} />
      <div className="dp-content-grid">
        <section aria-label="Scout details">
          <div className="dp-view-switch" aria-label="Scout view">
            {scoutViews.map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={view === item}
                onClick={() => setView(item)}
              >
                {item}
              </button>
            ))}
          </div>
          {view === "Opportunities" && (
            <div className="dp-result-list">
              {results.map((item) => (
                <OpportunityCard key={item.id} opportunity={item} />
              ))}
              {results.length === 0 && (
                <div className="dp-empty">
                  <Icon name="search" size={30} />
                  <h2>
                    {scenario === "searching"
                      ? "Checking the first possibilities."
                      : "No suitable opportunities to show yet."}
                  </h2>
                  <p>
                    See what this scout has checked and where its search still
                    has gaps.
                  </p>
                  <button
                    type="button"
                    className="dp-button"
                    onClick={() => setView("Search activity")}
                  >
                    View search activity
                  </button>
                </div>
              )}
            </div>
          )}
          {view === "Search activity" && <ScoutActivity paused={isPaused} />}
          {view === "Your brief" && (
            <section className="dp-brief">
              <h2>What you want your scout to find</h2>
              <blockquote>{scout.brief}</blockquote>
              <h3>Your must-haves</h3>
              <ul className="dp-check-list">
                {scout.requirements.map((item) => (
                  <li key={item}>
                    <Icon name="check" />
                    {item}
                  </li>
                ))}
              </ul>
              <h3>Your preferences</h3>
              <ul className="dp-plain-list">
                {scout.preferences.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="dp-inline-note">
                <Icon name="shield" />A wider search doesn’t change these
                requirements. Missing details stay visible.
              </p>
            </section>
          )}
        </section>
        <aside className="dp-context-column">
          <section className="dp-alert-summary">
            <span className="dp-mini-compass">
              <Icon name="bell" size={22} />
            </span>
            <h2>Your alerts</h2>
            <p>
              {isPaused
                ? "Searches and new alerts are paused for this sample scout."
                : scout.alerts}
            </p>
            <p className="dp-muted">No emails are sent from this preview.</p>
          </section>
          <SearchCoverage paused={isPaused} />
        </aside>
      </div>
    </>
  );
}

/** Summarizes sample outcomes and unresolved work, rather than presenting internal agent traces. */
function ScoutActivity({ paused }: { paused: boolean }) {
  const { scenario } = usePreview();
  const searching = scenario === "searching";
  const empty = scenario === "empty";
  const interrupted = scenario === "interrupted";
  const rows = [
    {
      time: "10:42",
      title: searching
        ? "Looking for the first possibilities"
        : empty
          ? "No suitable matches from the pages checked"
          : "Promising opportunities reviewed",
      description: searching
        ? "Checking public web results against your confirmed brief."
        : empty
          ? "Your must-haves remain in place. Other sources and queries remain to be explored."
          : "Available details were compared with your brief. Missing information stays flagged for review.",
    },
    {
      time: "10:36",
      title: interrupted
        ? "A search provider didn’t respond"
        : "Some social coverage is incomplete",
      description: interrupted
        ? "The interrupted request is queued for another attempt. Earlier finds are preserved."
        : "Public posts can appear in search, but private and unindexed posts may be unavailable.",
    },
    {
      time: "10:30",
      title: "Search started from your brief",
      description:
        "Exploring relevant pages, company websites and public conversations. Previously found opportunities are checked for changes.",
    },
  ];

  return (
    <section className="dp-activity">
      <h2>What your scout has been doing</h2>
      <p className="dp-muted">Illustrative activity for this sample search.</p>
      {paused && (
        <p className="dp-inline-note">
          <Icon name="clock" />
          Paused now. The activity below happened before the pause.
        </p>
      )}
      <ol>
        {rows.map((row) => (
          <li key={row.time}>
            <time>{row.time}</time>
            <div>
              <h3>{row.title}</h3>
              <p>{row.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="dp-next-search">
        <Icon name="compass" size={23} />
        <div>
          <h3>{paused ? "Ready when you are" : "What happens next"}</h3>
          <p>
            {paused
              ? "Resume this scout to continue its searches and alerts."
              : "Explore more sources and search terms, revisit important gaps, and check for fresh posts."}
          </p>
        </div>
      </div>
    </section>
  );
}
