"use client";

import { useState } from "react";
import { Icon } from "@repo/ui/components/icon";
import { LeadCard } from "./lead-card";
import { excludedLead } from "./discovery-presentation";
import type { WebDiscoveryLead } from "./discovery-contracts";

const filters = [
  { value: "all", label: "All leads" },
  { value: "job_opening", label: "Jobs & contracts" },
  { value: "client_request", label: "Client requests" },
  { value: "needs_review", label: "Needs review" },
] as const;

type LeadFilter = (typeof filters)[number]["value"];

/** Filters the supplied recent results by presentation category without changing source classifications or fetching more data. */
function matchesFilter(lead: WebDiscoveryLead, filter: LeadFilter): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "needs_review") {
    return (
      !lead.review ||
      lead.review.scope === "search_excerpt" ||
      lead.review.label === "unclear"
    );
  }

  return lead.review?.label === filter;
}

/** Adds local category filters to server-provided leads while keeping excluded results available for inspection. */
export function LeadResults({ leads }: { leads: WebDiscoveryLead[] }) {
  const [filter, setFilter] = useState<LeadFilter>("all");
  const candidates = leads.filter((lead) => !excludedLead(lead));
  const excluded = leads.filter(excludedLead);
  const visible = candidates.filter((lead) => matchesFilter(lead, filter));

  return (
    <section className="web-results" aria-labelledby="web-leads-title">
      <div className="web-section-heading">
        <h2 id="web-leads-title">Leads to explore</h2>
        <span>
          {candidates.length} recent{" "}
          {candidates.length === 1 ? "lead" : "leads"}
        </span>
      </div>
      <div className="web-lead-filters" role="group" aria-label="Filter leads">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            aria-controls="web-lead-list"
            onClick={() => setFilter(item.value)}
          >
            {item.label}
            <span>
              {
                candidates.filter((lead) => matchesFilter(lead, item.value))
                  .length
              }
            </span>
          </button>
        ))}
      </div>
      <p className="web-results-count" role="status" aria-atomic="true">
        {visible.length} {visible.length === 1 ? "lead" : "leads"} shown
      </p>
      <div id="web-lead-list" className="web-lead-list">
        {visible.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
        {visible.length === 0 && (
          <div className="web-discovery-empty">
            <span className="web-empty-icon">
              <Icon name="search" size={28} />
            </span>
            <h3>
              {candidates.length === 0
                ? "No leads to explore yet"
                : "No leads in this category"}
            </h3>
            <p>
              {candidates.length === 0
                ? "New leads appear here as your scouts find them. Check search activity for their progress."
                : "Try another category to see more of your recent results."}
            </p>
            {filter !== "all" && (
              <button
                className="web-text-button"
                type="button"
                onClick={() => setFilter("all")}
              >
                Show all leads
              </button>
            )}
          </div>
        )}
      </div>
      {excluded.length > 0 && (
        <details className="web-filtered-results">
          <summary>
            <span>
              Other results <span className="web-count">{excluded.length}</span>
            </span>
            <Icon name="chevronDown" size={18} />
          </summary>
          <p>
            Offers, discussions, directories and closed postings. No current
            opening or client request was identified.
          </p>
          <div className="web-lead-list">
            {excluded.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        </details>
      )}
      <p className="web-results-note">
        Sources are checked periodically. Each result shows where it came from
        and when it was seen. Coverage varies by platform.
      </p>
    </section>
  );
}
